"""ColibriGrab acquisition adapter for PyFocus.

Only ColibriGrab controls the science camera; this module invokes the existing
ColibriGrab.exe CLI, waits for termination, and decodes its saved RCD files.
It deliberately does not control the telescope, dome, or camera via MaxIm.

Format verified against the user's previous Colibri RCD analysis code:
384-byte header, interleaved high/low gain, 12-bit packed, 2048 x 2048 each.
"""
from __future__ import annotations

import csv
import os
from pathlib import Path
import re
import subprocess
import time
import uuid
from typing import Callable, Optional

import numpy as np

RCD_HEADER_BYTES = 384
RCD_WIDTH = 2048
RCD_GAINS = 2
RCD_BIT_DEPTH = 12
RCD_DATA_BYTES = RCD_WIDTH * RCD_WIDTH * RCD_GAINS * RCD_BIT_DEPTH // 8
RCD_TOTAL_BYTES = RCD_HEADER_BYTES + RCD_DATA_BYTES
RCD_SATURATION = 4095.0


class GrabCancelled(RuntimeError):
    """A cancel/safety request interrupted an acquisition."""


def read_rcd_high_gain(path: Path) -> np.ndarray:
    """Read high-gain plane from a standard Colibri HDR RR 2x2 RCD file.

    Returns uint16, shape (2048, 2048), with native 12-bit pixel levels.
    Rejects truncated or unrecognized file size; never guesses image layout.
    """
    path = Path(path)
    if path.stat().st_size != RCD_TOTAL_BYTES:
        raise ValueError(
            f"Unexpected RCD size at {path}: got {path.stat().st_size:,} bytes, "
            f"expected {RCD_TOTAL_BYTES:,}. Check camera mode/binning/format."
        )
    with path.open("rb") as fh:
        fh.seek(RCD_HEADER_BYTES)
        packed = np.fromfile(fh, dtype=np.uint8, count=RCD_DATA_BYTES)
    if packed.size != RCD_DATA_BYTES:
        raise ValueError(f"Incomplete RCD read: {path}")
    # Each group of 3 bytes encodes 2 consecutive 12-bit values.
    triplets = packed.reshape(-1, 3).astype(np.uint16)
    pixels = np.empty(triplets.shape[0] * 2, dtype=np.uint16)
    pixels[0::2] = (triplets[:, 0] << 4) | (triplets[:, 1] >> 4)
    pixels[1::2] = ((triplets[:, 1] & 15) << 8) | triplets[:, 2]
    # Interleaved low/high rows: 0::2 low gain, 1::2 high gain.
    return pixels.reshape(RCD_GAINS * RCD_WIDTH, RCD_WIDTH)[1::2].copy()


def _natural_key(path: Path):
    return [int(s) if s.isdigit() else s.lower()
            for s in re.split(r"(\d+)", str(path.relative_to(path.anchor)))]


def _windows_process_is_running(image_name: str) -> bool:
    """Fail closed if Windows tasklist cannot prove camera isn't in use."""
    if os.name != 'nt':
        return False  # Offline development/tests are on non-Windows machines.
    result = subprocess.run(
        ["tasklist", "/FI", f"IMAGENAME eq {image_name}", "/FO", "CSV", "/NH"],
        capture_output=True, text=True, timeout=8, check=True,
        errors="replace",
    )
    rows = list(csv.reader(result.stdout.splitlines()))
    return any(row and row[0].lower() == image_name.lower() for row in rows)


def _terminate_process(proc: subprocess.Popen):
    if proc.poll() is not None:
        return
    if os.name == 'nt':
        # Kill subprocess tree in case the executable launches helper processes.
        subprocess.run(["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                       capture_output=True, timeout=10, check=False)
    if proc.poll() is None:
        proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)


class ColibriGrabCapture:
    def __init__(self, executable: str, output_root: str,
                 temperature: int = 0, timeout_s: float = 120.0,
                 kill_flipilot: bool = True):
        self.executable = Path(executable).expanduser().resolve()
        self.output_root = Path(output_root).expanduser().resolve()
        self.temperature = int(temperature)
        self.timeout_s = float(timeout_s)
        self.kill_flipilot = bool(kill_flipilot)
        self.run_id = time.strftime("%Y%m%d_%H%M%S", time.gmtime()) + "_" + uuid.uuid4().hex[:8]
        self.batch_number = 0
        if self.timeout_s <= 0:
            raise ValueError("Capture timeout must be positive")

    def capture_paths(self, position: int, frames: int, exposure_s: float,
                      keep_running: Callable[[], bool]) -> list[Path]:
        """One acquisition per focuser position, with unique output directory.

        All frames must exist, and the process must exit successfully. Caller
        performs RCD decoding and PSF measurement after camera release.
        """
        if not keep_running():
            raise GrabCancelled("Capture cancelled before startup")
        if not self.executable.is_file():
            raise FileNotFoundError(f"ColibriGrab executable not found: {self.executable}")
        frames = int(frames)
        if frames < 1 or frames > 1000:
            raise ValueError("Frames per batch must be in range 1..1000")
        exposure_ms = round(float(exposure_s) * 1000)
        if not (1 <= exposure_ms <= 10000) or abs(exposure_s * 1000 - exposure_ms) > 1e-5:
            raise ValueError("ColibriGrab exposure must be an integer number of milliseconds (1..10000 ms)")

        # Avoid launching a competing capture. ACP must ALSO respect this boundary.
        if _windows_process_is_running("ColibriGrab.exe"):
            raise RuntimeError("Another ColibriGrab.exe is already running; refusing concurrent camera access")
        for competing in ("MaxIm_DL.exe", "MaxIm.exe", "FocusMax.exe"):
            if _windows_process_is_running(competing):
                raise RuntimeError(f"Potential competing camera controller {competing} is running")

        self.batch_number += 1
        directory = self.output_root / self.run_id / f"batch_{self.batch_number:03d}_pos_{int(position)}"
        directory.mkdir(parents=True, exist_ok=False)
        prefix = f"AF_{self.run_id}_B{self.batch_number:03d}_P{int(position)}"
        command = [str(self.executable), "-n", str(frames), "-p", prefix,
                   "-e", str(exposure_ms), "-t", str(self.temperature),
                   "-f", "normal", "-l", "0", "-w", str(directory)]
        print("ColibriGrab command:", subprocess.list2cmdline(command), flush=True)
        logfile = directory / "capture_process.log"
        proc = None
        t0 = time.monotonic()
        # Keep handle open until capture is finished; no stdout PIPE deadlocks.
        with logfile.open('w', encoding='utf-8', errors='replace') as log:
            flags = getattr(subprocess, 'CREATE_NEW_PROCESS_GROUP', 0) if os.name == 'nt' else 0
            proc = subprocess.Popen(command, cwd=str(self.executable.parent),
                                    stdout=log, stderr=subprocess.STDOUT,
                                    creationflags=flags)
            last_fli_check = 0.0
            try:
                while proc.poll() is None:
                    if not keep_running():
                        raise GrabCancelled("Capture interrupted by cancellation/safety request")
                    if time.monotonic() - t0 > self.timeout_s:
                        raise TimeoutError(f"ColibriGrab exceeded {self.timeout_s:.1f}s capture timeout")
                    # Mirror RunColibri's FLIPilot watchdog (only when enabled).
                    if self.kill_flipilot and os.name == 'nt' and time.monotonic() - last_fli_check > 2.5:
                        last_fli_check = time.monotonic()
                        if _windows_process_is_running('FLIPilot.exe'):
                            subprocess.run(["taskkill", "/IM", "FLIPilot.exe", "/T", "/F"],
                                           capture_output=True, timeout=10, check=False)
                    time.sleep(0.1)
            except BaseException:
                _terminate_process(proc)
                raise
            rc = proc.wait()
        if not keep_running():
            raise GrabCancelled("Cancelled after ColibriGrab finished")
        if rc != 0:
            raise RuntimeError(f"ColibriGrab exited with status {rc}; see {logfile}")
        paths = sorted((p for p in directory.rglob('*')
                        if p.is_file() and p.suffix.lower() == '.rcd'), key=_natural_key)
        if len(paths) != frames:
            raise RuntimeError(f"ColibriGrab wrote {len(paths)} RCD files, expected {frames}; "
                               f"see {directory} and {logfile}")
        for p in paths:
            if p.stat().st_size != RCD_TOTAL_BYTES:
                raise RuntimeError(f"RCD file size mismatch: {p.name} is {p.stat().st_size:,} bytes; "
                                   f"expected {RCD_TOTAL_BYTES:,}")
        print(f"Verified {len(paths)} RCD files from batch {self.batch_number}", flush=True)
        return paths

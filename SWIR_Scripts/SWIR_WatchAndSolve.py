#!/usr/bin/env python3
"""
SWIR_WatchAndSolve.py

Runs on REDBIRD.

Watches D:\\SWIR_Pointing\\incoming for <id>.done.  For each completed FITS,
it reads the matching request from D:\\SWIR_Pointing\\requests\<id>.json,
plate-solves the FITS with local Astrometry.net under WSL, calculates the
offset from the requested J2000 target, and atomically writes:

    D:\\SWIR_Pointing\\results\<id>.json

This script NEVER controls ACP, ASCOM, the telescope, the dome, or PHD2.
"""

import argparse
import json
import math
import os
import re
import subprocess
import time
from pathlib import Path


# ----------------------------------------------------------------------
# REDBIRD PATHS
# ----------------------------------------------------------------------

SHARED_ROOT = Path(r"D:\SWIR_Pointing")
REQUEST_DIR = SHARED_ROOT / "requests"
INCOMING_DIR = SHARED_ROOT / "incoming"
RESULTS_DIR = SHARED_ROOT / "results"
SOLVES_DIR = SHARED_ROOT / "solves"


# ----------------------------------------------------------------------
# COORDINATE HELPERS
# ----------------------------------------------------------------------

def parse_ra_hms(value: str) -> float:
    parts = value.strip().split(":")
    if len(parts) != 3:
        raise ValueError(f"Invalid RA: {value}")

    h, m, s = map(float, parts)

    if not (0 <= h < 24 and 0 <= m < 60 and 0 <= s < 60):
        raise ValueError(f"Invalid RA: {value}")

    return 15.0 * (h + m / 60.0 + s / 3600.0)


def parse_dec_dms(value: str) -> float:
    text = value.strip()
    sign = -1.0 if text.startswith("-") else 1.0
    text = text.lstrip("+-")

    parts = text.split(":")
    if len(parts) != 3:
        raise ValueError(f"Invalid Dec: {value}")

    d, m, s = map(float, parts)

    if not (0 <= d <= 90 and 0 <= m < 60 and 0 <= s < 60):
        raise ValueError(f"Invalid Dec: {value}")

    result = sign * (d + m / 60.0 + s / 3600.0)

    if not (-90 <= result <= 90):
        raise ValueError(f"Invalid Dec: {value}")

    return result


def wrap_ra_delta_deg(delta: float) -> float:
    return (delta + 180.0) % 360.0 - 180.0


# ----------------------------------------------------------------------
# PATH CONVERSION FOR WSL
# ----------------------------------------------------------------------

def windows_to_wsl(path: Path) -> str:
    path = path.resolve()
    drive = path.drive.rstrip(":").lower()
    rest = str(path)[2:].replace("\\", "/")
    return f"/mnt/{drive}{rest}"


# ----------------------------------------------------------------------
# REQUEST / RESULT HELPERS
# ----------------------------------------------------------------------

def load_request(request_path: Path) -> dict:
    with request_path.open("r", encoding="utf-8") as f:
        request = json.load(f)

    request_id = str(request.get("id", "")).strip()

    if not request_id:
        raise ValueError(f"Request has no id: {request_path}")

    if request_path.stem != request_id:
        raise ValueError(
            f"Request filename/id mismatch: "
            f"{request_path.stem!r} != {request_id!r}"
        )

    if "target_ra_deg" in request and "target_dec_deg" in request:
        target_ra_deg = float(request["target_ra_deg"])
        target_dec_deg = float(request["target_dec_deg"])
    else:
        target_ra_deg = parse_ra_hms(str(request["target_ra"]))
        target_dec_deg = parse_dec_dms(str(request["target_dec"]))

    if not math.isfinite(target_ra_deg) or not math.isfinite(target_dec_deg):
        raise ValueError("Non-finite target coordinates")

    request["_target_ra_deg"] = target_ra_deg
    request["_target_dec_deg"] = target_dec_deg

    return request


def atomic_write_json(path: Path, payload: dict) -> None:
    temp = path.with_name(path.name + ".part")

    with temp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    os.replace(temp, path)


# ----------------------------------------------------------------------
# ASTROMETRY.NET OUTPUT PARSER
# ----------------------------------------------------------------------

def parse_field_center(output: str):
    pattern = re.compile(
        r"Field center:.*?"
        r"\(\s*([+-]?\d+(?:\.\d+)?)\s*,\s*"
        r"([+-]?\d+(?:\.\d+)?)\s*\)\s*deg",
        re.IGNORECASE,
    )

    match = pattern.search(output)

    if not match:
        return None

    return float(match.group(1)), float(match.group(2))


# ----------------------------------------------------------------------
# RUN ONE SOLVER ATTEMPT
# ----------------------------------------------------------------------

def run_solver(
    image_path: Path,
    work_dir: Path,
    target_ra_deg: float,
    target_dec_deg: float,
    scale_low: float,
    scale_high: float,
    radius_deg: float,
    cpu_limit: int,
    timeout: int,
    attempt_name: str,
):
    work_dir.mkdir(parents=True, exist_ok=True)

    solved_marker = work_dir / f"{image_path.stem}_{attempt_name}.solved"

    if solved_marker.exists():
        solved_marker.unlink()

    cmd = [
        "wsl",
        "solve-field",
        windows_to_wsl(image_path),
        "--no-plots",
        "--overwrite",
        "--scale-units", "arcsecperpix",
        "--scale-low", str(scale_low),
        "--scale-high", str(scale_high),
        "--ra", str(target_ra_deg),
        "--dec", str(target_dec_deg),
        "--radius", str(radius_deg),
        "--cpulimit", str(cpu_limit),
        "--downsample", "2",
        "--depth", "500",
        "--dir", windows_to_wsl(work_dir),
        "--solved", windows_to_wsl(solved_marker),
    ]

    print()
    print(f"--- Astrometry.net attempt: {attempt_name} ---")
    print(f"Image: {image_path}")
    print(
        f"Scale: {scale_low:.2f}-{scale_high:.2f} arcsec/pixel, "
        f"radius: {radius_deg:.2f} deg"
    )

    start = time.time()

    try:
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        elapsed = time.time() - start

    except subprocess.TimeoutExpired as exc:
        elapsed = time.time() - start
        return {
            "solved": False,
            "attempt": attempt_name,
            "reason": "timeout",
            "elapsed_s": elapsed,
            "stdout": exc.stdout or "",
            "stderr": exc.stderr or "",
        }

    output = (proc.stdout or "") + "\n" + (proc.stderr or "")

    log_file = work_dir / f"{attempt_name}.log"
    log_file.write_text(output, encoding="utf-8", errors="replace")

    solved = solved_marker.exists()

    result = {
        "solved": solved,
        "attempt": attempt_name,
        "returncode": proc.returncode,
        "elapsed_s": elapsed,
        "log_file": str(log_file),
    }

    if solved:
        center = parse_field_center(output)
        if center:
            result["center_ra_deg"] = center[0]
            result["center_dec_deg"] = center[1]

    return result


# ----------------------------------------------------------------------
# PROCESS ONE COMPLETED FITS
# ----------------------------------------------------------------------

def process_done_file(done_file: Path, args) -> bool:
    request_id = done_file.stem

    fits_file = INCOMING_DIR / f"{request_id}.fits"
    request_file = REQUEST_DIR / f"{request_id}.json"
    result_file = RESULTS_DIR / f"{request_id}.json"

    print()
    print("=" * 72)
    print(f"Completion marker detected: {done_file.name}")
    print(f"Request: {request_file}")
    print(f"FITS:    {fits_file}")
    print("=" * 72)

    if not fits_file.exists():
        print("ERROR: .done exists but FITS does not.")
        return False

    if not request_file.exists():
        print("ERROR: matching request JSON does not exist.")
        return False

    try:
        request = load_request(request_file)
    except Exception as exc:
        print(f"ERROR: invalid request: {exc}")
        return False

    target_ra_deg = float(request["_target_ra_deg"])
    target_dec_deg = float(request["_target_dec_deg"])

    work_dir = SOLVES_DIR / request_id
    work_dir.mkdir(parents=True, exist_ok=True)

    # First use the measured SWIR scale (~1.332 arcsec/pixel).
    result = run_solver(
        fits_file,
        work_dir,
        target_ra_deg,
        target_dec_deg,
        scale_low=1.28,
        scale_high=1.38,
        radius_deg=2.0,
        cpu_limit=args.cpu_limit,
        timeout=args.timeout,
        attempt_name="tight",
    )

    # Proven broader fallback.
    if not result["solved"]:
        print("Tight solve failed. Trying broader fallback...")

        result = run_solver(
            fits_file,
            work_dir,
            target_ra_deg,
            target_dec_deg,
            scale_low=1.20,
            scale_high=1.60,
            radius_deg=4.5,
            cpu_limit=args.cpu_limit,
            timeout=args.timeout,
            attempt_name="fallback",
        )

    final_result = {
        "id": request_id,
        "run_id": request.get("run_id"),
        "sequence": request.get("sequence"),
        "target_name": request.get("target_name"),
        "image": str(fits_file),
        "request": str(request_file),
        "target_ra": request.get("target_ra"),
        "target_dec": request.get("target_dec"),
        "target_ra_deg": target_ra_deg,
        "target_dec_deg": target_dec_deg,
        "command_ra_hours": request.get("command_ra_hours"),
        "command_dec_deg": request.get("command_dec_deg"),
        "exposure_ms": request.get("exposure_ms"),
        "gain_mode": request.get("gain_mode"),
        "solved": bool(result["solved"]),
        "solver_attempt": result["attempt"],
        "solver_elapsed_s": result.get("elapsed_s"),
        "solver_log": result.get("log_file"),
        "result_created_utc": time.strftime(
            "%Y-%m-%dT%H:%M:%SZ", time.gmtime()
        ),
    }

    if (
        result["solved"]
        and "center_ra_deg" in result
        and "center_dec_deg" in result
    ):
        center_ra_deg = float(result["center_ra_deg"])
        center_dec_deg = float(result["center_dec_deg"])

        dra_coord_deg = wrap_ra_delta_deg(
            target_ra_deg - center_ra_deg
        )
        ddec_deg = target_dec_deg - center_dec_deg

        # Physical RA displacement on the sky.
        dra_sky_arcsec = (
            dra_coord_deg
            * math.cos(math.radians(target_dec_deg))
            * 3600.0
        )

        ddec_arcsec = ddec_deg * 3600.0

        total_error_arcsec = math.hypot(
            dra_sky_arcsec,
            ddec_arcsec,
        )

        final_result.update(
            {
                "center_ra_deg": center_ra_deg,
                "center_dec_deg": center_dec_deg,
                "dra_coord_deg": dra_coord_deg,
                "ddec_deg": ddec_deg,
                "dra_sky_arcsec": dra_sky_arcsec,
                "ddec_arcsec": ddec_arcsec,
                "total_error_arcsec": total_error_arcsec,
            }
        )

        print()
        print("SOLVE SUCCESSFUL")
        print(f"Center RA : {center_ra_deg:.8f} deg")
        print(f"Center Dec: {center_dec_deg:+.8f} deg")
        print(f"RA sky correction : {dra_sky_arcsec:+.2f} arcsec")
        print(f"Dec correction    : {ddec_arcsec:+.2f} arcsec")
        print(f"Total error       : {total_error_arcsec:.2f} arcsec")

    elif result["solved"]:
        final_result["solved"] = False
        final_result["error"] = (
            "Astrometry.net reported a solution, "
            "but field center could not be parsed."
        )
        print("SOLVE FAILED: field center could not be parsed.")

    else:
        final_result["error"] = "No astrometric solution."
        print("SOLVE FAILED")

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    atomic_write_json(result_file, final_result)

    print()
    print(f"Result written to: {result_file}")

    processed_marker = (
        INCOMING_DIR / f"{request_id}.processed"
        if final_result["solved"]
        else INCOMING_DIR / f"{request_id}.failed"
    )

    if processed_marker.exists():
        processed_marker.unlink()

    os.replace(done_file, processed_marker)

    print(f"Marker renamed to: {processed_marker.name}")

    return bool(final_result["solved"])


# ----------------------------------------------------------------------
# WATCH LOOP
# ----------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Watch for completed SWIR FITS files and plate-solve them."
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process currently waiting files and exit.",
    )
    parser.add_argument(
        "--poll",
        type=float,
        default=0.5,
        help="Watcher polling interval in seconds.",
    )
    parser.add_argument(
        "--cpu-limit",
        type=int,
        default=180,
        help="Astrometry.net CPU limit per attempt.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=240,
        help="Hard timeout per solve attempt.",
    )
    args = parser.parse_args()

    REQUEST_DIR.mkdir(parents=True, exist_ok=True)
    INCOMING_DIR.mkdir(parents=True, exist_ok=True)
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    SOLVES_DIR.mkdir(parents=True, exist_ok=True)

    print("SWIR Watch-and-Solve")
    print("--------------------")
    print(f"Requests: {REQUEST_DIR}")
    print(f"Incoming: {INCOMING_DIR}")
    print(f"Results:  {RESULTS_DIR}")
    print()
    print("THIS PROGRAM DOES NOT CONTROL THE TELESCOPE.")
    print()

    while True:
        done_files = sorted(
            INCOMING_DIR.glob("*.done"),
            key=lambda p: p.stat().st_mtime,
        )

        for done_file in done_files:
            process_done_file(done_file, args)

        if args.once:
            break

        time.sleep(args.poll)


if __name__ == "__main__":
    main()

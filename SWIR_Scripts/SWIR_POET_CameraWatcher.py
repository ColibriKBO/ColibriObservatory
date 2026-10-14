#!/usr/bin/env python3
"""
SWIR_POET_CameraWatcher.py

Runs on the POET computer.

Watches:
    Z:\\requests\\*.json

For each new request:
    1. Read target/camera settings.
    2. Acquire one SWIR FITS using the student's camera-control code.
    3. Copy the completed FITS to Z:\incoming atomically.
    4. Create <request_id>.done.

The student's camera-control code belongs ONLY in
capture_with_student_code() below.

Until that function is implemented, the watcher deliberately fails safely
and writes <request_id>.camera_failed instead of creating a .done marker.
"""

import argparse
import json
import os
import shutil
import time
import traceback
from pathlib import Path


# ----------------------------------------------------------------------
# POET PATHS
# ----------------------------------------------------------------------

SHARED_ROOT = Path("Z:\\")
REQUEST_DIR = SHARED_ROOT / "requests"
INCOMING_DIR = SHARED_ROOT / "incoming"

# Camera should ideally write locally first, then we copy to the network.
LOCAL_CAPTURE_DIR = Path(
    r"C:\Users\User\Documents\Elginfield_SWIR_Automation\captures"
)

POLL_SECONDS = 0.5


# ----------------------------------------------------------------------
# OPTIONAL NON-CAMERA PIPELINE TEST
# ----------------------------------------------------------------------
#
# If you want to test the request/transfer/solve plumbing before the
# student's camera control is finished, set this to an existing FITS.
# Leave it as None for a real camera test.
#
SIMULATION_SOURCE_FITS = None
# Example:
# SIMULATION_SOURCE_FITS = Path(
#     r"C:\Users\User\Desktop\Oct 5 SWIR\NGC1245_96.fits"
# )


# ----------------------------------------------------------------------
# STUDENT CAMERA CONTROL PLACEHOLDER
# ----------------------------------------------------------------------

def capture_with_student_code(request: dict, output_fits: Path) -> None:
    """
    Acquire exactly ONE SWIR FITS and write it to output_fits.

    Expected request fields include:
        request["id"]
        request["target_name"]
        request["exposure_ms"]
        request["gain_mode"]

    ---------------------------------------------------------------
    STUDENT CAMERA CONTROL CODE GOES HERE
    ---------------------------------------------------------------

    The final implementation could, for example, call a command-line
    camera executable:

        subprocess.run([
            r"C:\\path\\to\\SWIRCapture.exe",
            "--exposure-ms", str(request["exposure_ms"]),
            "--gain", str(request["gain_mode"]),
            "--output", str(output_fits),
        ], check=True)

    Or this function can directly call the student's camera SDK wrapper.

    REQUIREMENT:
        When this function returns successfully, output_fits must exist
        and contain a completely written FITS image.
    """

    if SIMULATION_SOURCE_FITS is not None:
        source = Path(SIMULATION_SOURCE_FITS)
        if not source.exists():
            raise FileNotFoundError(
                f"Simulation FITS does not exist: {source}"
            )
        shutil.copy2(source, output_fits)
        return

    raise RuntimeError(
        "Student camera-control placeholder has not been implemented yet."
    )


# ----------------------------------------------------------------------
# FILE HELPERS
# ----------------------------------------------------------------------

def atomic_write_text(path: Path, text: str) -> None:
    temp = path.with_name(path.name + ".part")
    temp.write_text(text, encoding="utf-8")
    os.replace(temp, path)


def load_request(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as f:
        request = json.load(f)

    request_id = str(request.get("id", "")).strip()

    if not request_id:
        raise ValueError(f"Request has no valid id: {path}")

    if path.stem != request_id:
        raise ValueError(
            f"Request filename/id mismatch: {path.stem!r} != {request_id!r}"
        )

    exposure_ms = float(request["exposure_ms"])
    if exposure_ms <= 0:
        raise ValueError("exposure_ms must be positive")

    return request


# ----------------------------------------------------------------------
# PROCESS ONE CAMERA REQUEST
# ----------------------------------------------------------------------

def process_request(request_path: Path) -> bool:
    request = load_request(request_path)
    request_id = str(request["id"])

    complete_marker = REQUEST_DIR / f"{request_id}.camera_complete"
    failed_marker = REQUEST_DIR / f"{request_id}.camera_failed"

    final_network_fits = INCOMING_DIR / f"{request_id}.fits"
    temp_network_fits = INCOMING_DIR / f"{request_id}.fits.part"
    done_marker = INCOMING_DIR / f"{request_id}.done"

    # Already completed: do not capture twice.
    if (
        complete_marker.exists()
        or done_marker.exists()
        or final_network_fits.exists()
    ):
        return False

    # Clear an old failure marker only if the operator intentionally
    # re-runs the watcher with the same unique request.
    if failed_marker.exists():
        return False

    LOCAL_CAPTURE_DIR.mkdir(parents=True, exist_ok=True)
    INCOMING_DIR.mkdir(parents=True, exist_ok=True)

    local_fits = LOCAL_CAPTURE_DIR / f"{request_id}.fits"

    if local_fits.exists():
        local_fits.unlink()

    if temp_network_fits.exists():
        temp_network_fits.unlink()

    print()
    print("=" * 72)
    print(f"SWIR capture request: {request_id}")
    print(f"Target:   {request.get('target_name', '')}")
    print(f"Exposure: {request.get('exposure_ms')} ms")
    print(f"Gain:     {request.get('gain_mode')}")
    print(f"Local output: {local_fits}")
    print("=" * 72)

    try:
        # ----------------------------------------------------------
        # CAMERA ACQUISITION
        # ----------------------------------------------------------
        capture_with_student_code(request, local_fits)

        if not local_fits.exists():
            raise RuntimeError(
                "Camera function returned but output FITS was not created."
            )

        if local_fits.stat().st_size <= 0:
            raise RuntimeError("Camera produced an empty FITS file.")

        # ----------------------------------------------------------
        # ATOMIC TRANSFER TO REDBIRD SHARE
        # ----------------------------------------------------------
        print("Camera exposure complete.")
        print("Copying FITS to REDBIRD share...")

        shutil.copy2(local_fits, temp_network_fits)
        os.replace(temp_network_fits, final_network_fits)

        atomic_write_text(done_marker, "complete\n")
        atomic_write_text(
            complete_marker,
            f"complete {time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())}\n",
        )

        print(f"Transferred: {final_network_fits}")
        print(f"Created:     {done_marker}")
        print("SUCCESS")

        return True

    except Exception:
        error_text = traceback.format_exc()

        # Never create .done on a failed/incomplete exposure.
        if temp_network_fits.exists():
            try:
                temp_network_fits.unlink()
            except OSError:
                pass

        atomic_write_text(failed_marker, error_text)

        print("CAMERA REQUEST FAILED")
        print(error_text)
        print(f"Failure marker: {failed_marker}")

        return False


# ----------------------------------------------------------------------
# WATCH LOOP
# ----------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="POET SWIR camera request watcher."
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Process currently waiting requests and exit.",
    )
    parser.add_argument(
        "--poll",
        type=float,
        default=POLL_SECONDS,
        help="Polling interval in seconds.",
    )
    args = parser.parse_args()

    REQUEST_DIR.mkdir(parents=True, exist_ok=True)
    INCOMING_DIR.mkdir(parents=True, exist_ok=True)
    LOCAL_CAPTURE_DIR.mkdir(parents=True, exist_ok=True)

    print("SWIR POET Camera Watcher")
    print("------------------------")
    print(f"Requests: {REQUEST_DIR}")
    print(f"Incoming: {INCOMING_DIR}")
    print()

    while True:
        request_files = sorted(
            REQUEST_DIR.glob("*.json"),
            key=lambda p: p.stat().st_mtime,
        )

        for request_path in request_files:
            process_request(request_path)

        if args.once:
            break

        time.sleep(args.poll)


if __name__ == "__main__":
    main()

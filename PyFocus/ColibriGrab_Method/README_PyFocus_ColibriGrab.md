# PyFocus — ColibriGrab Option A (prototype)

Files:
- `PyFocus_ColibriGrab.py` — existing Qt GUI, ASCOM Seletek focuser control, PSF fits, focus sweep and JSON CLI; MaxIm camera acquisition removed.
- `ColibriGrabCapture.py` — launch existing ColibriGrab.exe and decode high-gain RCD frames.
- `RunColibri_Autofocus_Hook.js` — **illustrative** ACP polling/stop-file adapter. Requires your *current* RunColibri safety function and insertion between acquisitions.

## Installation

Place `PyFocus_ColibriGrab.py` and `ColibriGrabCapture.py` in the same `PyFocus` folder. Place your existing `PyFocus.ui` there for GUI mode. Keep the existing tested Seletek ASCOM driver installed; all the Python libraries used by your previous PyFocus are still required (`PyQt5`, `pyqtgraph`, `numpy`, `scipy`, `pywin32`, etc.). **Do not run MaxIm DL against the Colibri camera.**

The ColibriGrab executable defaults to `%USERPROFILE%\Documents\GitHub\ColibriGrab\ColibriGrab\ColibriGrab.exe`. You can override it with `--colibrigrab-exe`. PyFocus saves RCD batches under `D:\ColibriData\PyFocus\<run ID>\batch_...`. Files are deliberately retained for debugging. RCD frames are large (~12 MiB each): plan sufficient free disk space.

## First test (supervised, with shutter open on a suitable star field)

Ensure RunColibri isn't currently acquiring and no other camera controller (MaxIm DL, FocusMax) owns the camera. Point the telescope manually with ACP and verify tracking and dome safety before launching PyFocus. Starting values below are **not** calibrated for Seletek focus step range.

```bat
python PyFocus_ColibriGrab.py --autofocus --exposure 0.025 --binning 2 --step-size 50 --steps-each-side 3 --frames-per-position 3 --settle-time 1 --grab-temperature -10 --grab-timeout 120 --output-json "D:\tmp\pyfocus_result.json"
```

A focus scan acquires **one ColibriGrab batch per focuser position**. Each batch uses the same flags as science observations: `-n <frames> -p <unique_prefix> -e <integer milliseconds> -t <temperature> -f normal -l 0 -w <unique_dir>`. ColibriGrab exits and releases the camera before the RCD files are read. Both a successful exit and the correct number and size of RCD files are required. The same RCD high-gain row and 12-bit unpacking as existing Colibri reduction scripts is used. Sigma saturation filtering is 4095 raw ADU (not MaxIm's 65535 scale). Capture and model convergence failures yield exit code 1 and a failure JSON, not success.

`--frames-per-position 3` means three ColibriGrab RCD files in **one** launch at each position. If `--step-size 50 --steps-each-side 3`, seven positions and 21 files are generated (~250 MiB of RCD image bytes plus storage overhead). The initial physical scan range is `start ±150` Seletek steps, not a calibrated optimum. To set a different cooling target, update `--grab-temperature`, or set it as desired in the GUI settings implementation.

PyFocus's normal GUI starts with `python PyFocus_ColibriGrab.py -i` and the existing `PyFocus.ui` in the same folder. GUI Single Image and Stream modes launch ColibriGrab once per displayed frame: this will be much slower than MaxIm video-style preview. The autofocus sweep mode launches once per position, not per frame.

## Cancellation for RunColibri

Pass `--stop-file "D:\tmp\pyfocus_autofocus.stop"`. When RunColibri needs to cancel, create that file. PyFocus checks it between focuser actions and while the ColibriGrab process is active, forcibly terminating its child process tree on capture cancellation. It **cannot interrupt a blocked ASCOM COM call immediately**. A separate observatory emergency/dome safety mechanism is still required. The example JS helper shows a *nonblocking* WScript.Shell.Exec + polling scheme, not a complete safety-certified integration.

## Known limitations before unattended use

1. ColibriGrab command flags and RCD header format are sourced from earlier Colibri scripts/logs. Test on your actual ColibriGrab build. Existing 2x2 HDR Rolling Reset raw RCD mode is assumed. No MaxIm/FLI COM camera object is created.
2. The Seletek ASCOM `Absolute`, `MaxStep`, `IsMoving`, `Halt`, and `Move` behavior should be verified on all three telescope PCs. Existing moves assume absolutely addressed steps.
3. The focus scan finds the lowest **measured** median sigma, but does not fit a continuous parabola/V-curve, and doesn't take a post-return verification exposure. It fails when fewer than five positions succeed or the minimum lies at a scan boundary.
4. Backlash compensation requires real focuser characterization (`--backlash-steps`); default 0 intentionally makes no assumption.
5. No automated telescope slewing, sky field selection, pointing reacquisition, autonomous weather abort integration, or science workflow modification has been made. RunColibri must be modified only using its **current** script with confirmed weather/dome checks.
6. `--exposure` is **seconds** in Python; ColibriGrab `-e` expects integer milliseconds. Only integer-ms exposure values are permitted. ColibriGrab acquisition may have frame rate/hardware restrictions; verify on site.
7. The Python driver preflight checks running processes on Windows, but this does not constitute a shared cross-process lock with RunColibri. Scheduling must prevent overlapping captures. The helper requires monitoring for unsafe weather while Python runs, and an independent fail-safe if ACP itself is terminated.
8. If camera output folder format or file size differs from the referenced RCD reader, autofocus aborts rather than guessing at the pixel layout.
9. No full hardware/Windows/Qt GUI test has been performed in this environment. Offline testing used fake ColibriGrab and Seletek objects and synthetic RCD images.

## Validation performed here

- Python syntax compilation succeeded.
- High-gain raw 12-bit RCD decoding round-trip, including saturation at 4095, passed.
- Truncated RCD is rejected.
- Fake ColibriGrab executable flags, output discovery, frame size/count checks passed.
- Capture subprocess cancellation passed.
- Fake focuser 7-position autofocus convergence and safety-stop cancellation passed.
- A synthetic 2048x2048 RCD star field with input Gaussian sigma = 2 pixels yielded approximately 1.9998 pixels, with 20 accepted PSFs.

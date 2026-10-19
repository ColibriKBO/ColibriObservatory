"""Camera-only, supervised ColibriGrab test using RunColibri's WScript.Shell.Run.

This DOES acquire real images from the FLI camera; it does NOT connect to or
move the telescope, dome or Seletek focuser. Ensure the camera is free first.
"""
import argparse
from pathlib import Path
from ColibriGrabCapture import ColibriGrabCapture


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--frames', type=int, default=5)
    parser.add_argument('--exposure-ms', type=int, default=125)
    parser.add_argument('--temperature', type=int, default=-10)
    parser.add_argument('--timeout', type=float, default=120)
    parser.add_argument('--output-root', default=r'D:\ColibriData\PyFocus\wsh_test')
    parser.add_argument('--exe', default=str(Path.home() / 'Documents' / 'GitHub' / 'ColibriGrab' / 'ColibriGrab' / 'ColibriGrab.exe'))
    args = parser.parse_args()
    print('Camera-only test: no telescope/focuser commands. ColibriGrab must have exclusive camera access.', flush=True)
    grab = ColibriGrabCapture(args.exe, args.output_root, temperature=args.temperature,
                              timeout_s=args.timeout, kill_flipilot=False)
    images = grab.capture_paths(position=0, frames=args.frames,
                                exposure_s=args.exposure_ms / 1000,
                                keep_running=lambda: True)
    print('\nRCD folder:', images[0].parent)
    print('Check images with: python audit_batch.py "' + str(images[0].parent) + '"')


if __name__ == '__main__':
    main()

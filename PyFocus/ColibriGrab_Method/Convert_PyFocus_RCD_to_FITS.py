"""Offline PyFocus RCD -> ASTAP-compatible FITS batch converter.

Requires numpy and ColibriGrabCapture.py alongside this script. Does not use
camera, focuser, ASCOM, MaxIm or ColibriGrab.exe.
"""
from __future__ import annotations
import argparse
import csv
from pathlib import Path
import re
import shutil
import sys
import numpy as np

try:
    from ColibriGrabCapture import read_rcd_high_gain, RCD_TOTAL_BYTES
except ImportError as exc:
    raise SystemExit('Place this script beside ColibriGrabCapture.py and install numpy.') from exc

BATCH_PATTERN = re.compile(r'^batch_(\d+)_pos_(\d+)$', re.IGNORECASE)
FITS_BLOCK = 2880
FITS_IMAGE_BYTES = 2048 * 2048 * 2
FITS_SIZE = FITS_BLOCK + FITS_IMAGE_BYTES + (-FITS_IMAGE_BYTES % FITS_BLOCK)


def card(keyword, value=None, comment=None):
    if value is None:
        line = keyword
    elif isinstance(value, str):
        escaped = value.replace("'", "''")
        line = f"{keyword:<8}= '{escaped}'"
    elif isinstance(value, bool):
        line = f'{keyword:<8}= {"T" if value else "F":>20}'
    else:
        line = f'{keyword:<8}= {value:>20}'
    if comment:
        line += ' / ' + comment
    if len(line) > 80:
        raise ValueError(f'FITS header card too long: {line}')
    return line.ljust(80).encode('ascii')


def write_fits(path, pixels, batch, position, frame, rcd_name):
    if pixels.dtype != np.uint16 or pixels.shape != (2048, 2048):
        raise ValueError(f'Unexpected image array: {pixels.shape}, {pixels.dtype}')
    # FITS BITPIX=16 is SIGNED. BZERO=32768 stores uint16 0..65535
    # losslessly using signed big-endian data on disk.
    header = b''.join([
        card('SIMPLE', True), card('BITPIX', 16), card('NAXIS', 2),
        card('NAXIS1', 2048), card('NAXIS2', 2048),
        card('BSCALE', 1), card('BZERO', 32768),
        card('FOCUSPOS', position, 'Seletek absolute step position'),
        card('BATCHID', batch, 'PyFocus acquisition batch'),
        card('FRAMEIDX', frame, 'Frame within acquisition batch'),
        card('GAINPLN', 'HIGH', 'Colibri HDR RR 2x2 high-gain plane'),
        card('ORIGFILE', rcd_name),
        card('END'),
    ])
    header += b' ' * (-len(header) % FITS_BLOCK)
    signed_be = np.bitwise_xor(pixels, np.uint16(0x8000)).astype('>u2', copy=False)
    with path.open('xb') as fh:
        fh.write(header)
        fh.write(signed_be.tobytes(order='C'))
        fh.write(b'\0' * (-FITS_IMAGE_BYTES % FITS_BLOCK))
    if path.stat().st_size != FITS_SIZE:
        raise RuntimeError(f'Unexpected FITS file size: {path}')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('run_dir', type=Path, help='D:\\PyFocus\\20261021_073243_b3565537')
    ap.add_argument('--output', type=Path, default=None, help='Separate output folder (default: sibling folder ending _ASTAP_FITS)')
    ap.add_argument('--dry-run', action='store_true', help='Show files and estimated space without writing')
    args = ap.parse_args()
    run_dir = args.run_dir.expanduser().resolve()
    if not run_dir.is_dir():
        ap.error(f'Run directory does not exist: {run_dir}')
    output = (args.output or run_dir.with_name(run_dir.name + '_ASTAP_FITS')).expanduser().resolve()
    if output == run_dir or run_dir in output.parents:
        ap.error('Output must be outside the original RCD run directory')
    items = []
    for batch_dir in sorted(run_dir.iterdir()):
        if not batch_dir.is_dir():
            continue
        match = BATCH_PATTERN.fullmatch(batch_dir.name)
        if not match:
            continue
        batch, pos = map(int, match.groups())
        files = sorted(batch_dir.rglob('*.rcd'))
        for index, rcd in enumerate(files, 1):
            if rcd.stat().st_size != RCD_TOTAL_BYTES:
                raise SystemExit(f'Invalid RCD size: {rcd}')
            dest = output / f'batch_{batch:03d}_pos_{pos}_frame_{index:03d}.fits'
            items.append((batch, pos, index, rcd, dest))
    if not items:
        raise SystemExit('No RCD images found in batch_###_pos_##### folders.')
    if any(dest.exists() for *_, dest in items):
        raise SystemExit(f'One or more output FITS files already exist in {output}. '
                         'Nothing overwritten. Choose another --output directory.')
    print(f'Input:  {run_dir}\nOutput: {output}')
    print(f'Images: {len(items)} across {len(set(b for b, *_ in items))} batches')
    print(f'Estimated output: {len(items)*FITS_SIZE/1024**3:.2f} GiB')
    if args.dry_run:
        return
    output.mkdir(parents=True, exist_ok=True)
    space = shutil.disk_usage(output).free
    required = len(items) * FITS_SIZE + 64 * 1024**2
    if space < required:
        raise SystemExit(f'Insufficient free disk space: {space/1024**3:.2f} GiB; '
                         f'need {required/1024**3:.2f} GiB')
    manifest = output / 'focus_position_manifest.csv'
    if manifest.exists():
        raise SystemExit(f'Manifest already exists: {manifest}. Choose another output directory.')
    rows = []
    try:
        for n, (batch, pos, index, rcd, dest) in enumerate(items, 1):
            pixels = read_rcd_high_gain(rcd)
            write_fits(dest, pixels, batch, pos, index, rcd.name)
            rows.append((dest.name, batch, pos, index, str(rcd)))
            print(f'[{n}/{len(items)}] {dest.name}', flush=True)
        with manifest.open('x', newline='', encoding='utf-8') as fh:
            writer = csv.writer(fh)
            writer.writerow(['fits_filename', 'batch_number', 'focuser_position', 'frame_index', 'source_rcd'])
            writer.writerows(rows)
    except Exception:
        print('Conversion interrupted. Existing outputs were NOT overwritten. '
              'For a fresh run, choose a different output directory.', file=sys.stderr)
        raise
    print(f'Finished: {len(rows)} FITS images and manifest: {manifest}')

if __name__ == '__main__':
    main()

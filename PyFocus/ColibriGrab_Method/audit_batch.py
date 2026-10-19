"""Read-only raw-payload audit for Colibri 2048 x 2048 HDR RR 2x2 RCDs.

Usage: python Audit_Colibri_RCD_Raw.py "D:\\...\\batch_008_pos_50150"
Requires numpy. Does not access the camera, focuser, or ASCOM.

Examines original packed 12-bit file bytes before any image decoding.
The assumed RCD format is a 384-byte header and 4096 x 3072-byte
packed rows, alternating low/high gain rows (0::2 and 1::2).
"""
import argparse
from pathlib import Path
import numpy as np

HEADER = 384
WIDTH = 2048
GAIN_ROWS = 2 * WIDTH
PACKED_BYTES_PER_ROW = WIDTH * 12 // 8  # 3072
EXPECTED_SIZE = HEADER + GAIN_ROWS * PACKED_BYTES_PER_ROW


def spans(mask):
    """Return inclusive spans of consecutive True rows."""
    starts = np.flatnonzero(mask & ~np.r_[False, mask[:-1]])
    ends = np.flatnonzero(mask & ~np.r_[mask[1:], False])
    return list(zip(starts.tolist(), ends.tolist()))


def inspect(path):
    if path.stat().st_size != EXPECTED_SIZE:
        print(f"  SIZE MISMATCH: {path.stat().st_size:,} bytes, expected {EXPECTED_SIZE:,}")
        return
    payload = np.memmap(path, dtype=np.uint8, mode='r', offset=HEADER,
                        shape=(GAIN_ROWS, PACKED_BYTES_PER_ROW))
    for name, rows in (("even-packed rows (normally low gain)", payload[0::2]),
                       ("odd-packed rows (normally high gain)", payload[1::2])):
        # Any decoded pixel row that is all zero MUST have all packed bytes zero.
        blank = ~np.any(rows != 0, axis=1)
        all_spans = spans(blank)
        n_blanks = int(blank.sum())
        largest = max(all_spans, key=lambda v: v[1] - v[0], default=None)
        print(f"  {name}: {n_blanks}/2048 all-zero rows", end='')
        if largest is not None:
            print(f"; largest all-zero span rows {largest[0]}..{largest[1]}")
        else:
            print()
        print(f"    nonzero-byte fractions by quarter: "
              f"{[round(float(np.count_nonzero(q))/q.size, 4) for q in np.array_split(rows, 4, axis=0)]}")
    print("  Note: raw packed-byte zeros rule out a display-only artifact, but do not distinguish")
    print("        ColibriGrab/camera output from an incorrect assumed HDR row mapping.")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('batch_dir', type=Path)
    args = p.parse_args()
    files = sorted(args.batch_dir.glob('*.rcd'), key=lambda p: p.name)
    if not files:
        raise SystemExit(f"No RCD files found under {args.batch_dir}")
    for path in files:
        print(path.name)
        inspect(path)
        print()

if __name__ == '__main__':
    main()
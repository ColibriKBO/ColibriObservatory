"""
Converts field centroid coordinates in a scheduler CSV block from Gaia's
native epoch (J2016.0, ICRS) to J2000.0 (FK5), as required by the ACP
mount control system.

Gaia astrometry is published at epoch J2016.0 -- positions reflect proper
motion integrated to that epoch.  Telescope mounts and most planetarium
software expect equatorial coordinates referred to J2000.0.  Without
this conversion, field centres are offset from the mount's expectation by
the ~16-year precession (~13 arcminutes near the equator, varying with Dec).

Input (stdin or file path as argv[1]):
    The raw schedule block emitted by run_scheduler.py, including the
    === SCHEDULE BEGIN === / === SCHEDULE END === sentinels.
    All other lines (log output, blank lines) are passed through unchanged.

Output (stdout):
    Identical block with ra_deg and dec_deg columns replaced by J2000.0
    values; every other column and all non-schedule lines are untouched.

Usage:
    python gaia_to_j2000.py [schedule_file]
    python run_scheduler.py ... | python gaia_to_j2000.py
"""

import sys

from astropy.coordinates import SkyCoord, FK5
from astropy.time import Time
import astropy.units as u


_GAIA_FRAME  = FK5(equinox=Time('J2016.0'))
_J2000_FRAME = FK5(equinox=Time('J2000.0'))


def _convert_row(row):
    """Return a CSV row with ra_deg (col 1) and dec_deg (col 2) precessed to J2000.0."""
    cols = row.split(',')
    if len(cols) < 10:
        return row

    try:
        ra  = float(cols[1])
        dec = float(cols[2])
    except ValueError:
        return row

    c     = SkyCoord(ra=ra * u.deg, dec=dec * u.deg, frame=_GAIA_FRAME)
    c2000 = c.transform_to(_J2000_FRAME)

    cols[1] = '{:.6f}'.format(c2000.ra.deg)
    cols[2] = '{:.6f}'.format(c2000.dec.deg)
    return ','.join(cols)


def convert(text):
    """
    Walk *text* (the full scheduler output), converting coordinate columns
    inside the === SCHEDULE BEGIN === / END === block and leaving everything
    else verbatim.
    """
    lines = text.replace('\r', '').split('\n')
    out = []
    in_block   = False
    seen_header = False

    for line in lines:
        stripped = line.strip()

        if stripped == '=== SCHEDULE BEGIN ===':
            in_block    = True
            seen_header = False
            out.append(line)
            continue

        if stripped == '=== SCHEDULE END ===':
            in_block = False
            out.append(line)
            continue

        if not in_block or stripped == '':
            out.append(line)
            continue

        if not seen_header:
            seen_header = True
            out.append(line)   # header row: pass through unchanged
            continue

        out.append(_convert_row(stripped))

    return '\n'.join(out)


if __name__ == '__main__':
    if len(sys.argv) > 1:
        with open(sys.argv[1], 'r') as fh:
            raw = fh.read()
    else:
        raw = sys.stdin.read()

    sys.stdout.write(convert(raw))

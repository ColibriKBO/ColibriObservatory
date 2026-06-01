"""CLI entrypoint for the standalone Colibri scheduler.

RunColibri.js invokes this as ``python -u scheduler\\run_scheduler.py ...`` from
the ColibriObservatory-Dev directory. To make that work regardless of whether
the package is on ``sys.path``, this file inserts the parent directory of its
own location onto ``sys.path`` and imports the sibling modules via the
``scheduler`` package (so the package-relative ``from . import ...`` in
``scheduler.py``/``sky.py`` resolve). This means it runs both standalone
(``python scheduler/run_scheduler.py``) and as a module (``python -m
scheduler.run_scheduler``).

It divides the supplied [sunset, sunrise] JD window into hour-long blocks,
schedules the best field per block, collapses contiguous identical fields into
segments, and prints a machine-readable schedule between
``=== SCHEDULE BEGIN ===`` and ``=== SCHEDULE END ===`` markers. The CSV row
format is a hard contract consumed by RunColibri.js; do not change it without
updating the JS parser.
"""

from __future__ import annotations

import argparse
import math
import os
import sys

# Make the `scheduler` package importable when run as a plain script.
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_PARENT_DIR = os.path.dirname(_THIS_DIR)
if _PARENT_DIR not in sys.path:
    sys.path.insert(0, _PARENT_DIR)

import numpy as np  # noqa: E402
import astropy.units as u  # noqa: E402
from astropy.time import Time  # noqa: E402

from scheduler import sky as sky_module  # noqa: E402
from scheduler.config import SchedulerConfig  # noqa: E402
from scheduler.scheduler import Observatory  # noqa: E402

_DEFAULT_FIELDS = os.path.join(_THIS_DIR, "fields", "fields_13.3mag.json")
_DEFAULT_MODELS = os.path.join(_THIS_DIR, "sensitivity_models")


def _build_blocks(sunset_time, sunrise_time):
    """Split [sunset, sunrise] into hour-long blocks (+ a partial remainder).

    Mirrors Observatory.get_observation_periods, but uses the SUPPLIED bounds
    rather than computing its own twilight times.
    """
    hours = (sunrise_time - sunset_time).to(u.hour).value
    if hours <= 0:
        return []

    full_hours = int(math.floor(hours))
    partial = hours - full_hours

    starts = [sunset_time + i * u.hour for i in range(full_hours)]
    ends = [sunset_time + (i + 1) * u.hour for i in range(full_hours)]
    blocks = list(zip(starts, ends))

    if partial > 0:
        last_end = blocks[-1][1] if blocks else sunset_time
        blocks.append((last_end, last_end + partial * u.hour))

    return blocks


def _airmass_from_alt(alt_deg):
    """Plane-parallel airmass 1/cos(zenith) from an altitude in degrees."""
    zenith = 90.0 - float(alt_deg)
    cz = math.cos(math.radians(zenith))
    if cz <= 0:
        return float('nan')
    return 1.0 / cz


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Colibri full-night field scheduler.")
    parser.add_argument("--sunset-jd", type=float, required=True, help="Sunset (start) time as Julian Date.")
    parser.add_argument("--sunrise-jd", type=float, required=True, help="Sunrise (end) time as Julian Date.")
    parser.add_argument("--framerate", type=int, default=40, help="Camera framerate in Hz (default 40).")
    parser.add_argument("--extinction", type=float, default=0.0, help="Nominal atmospheric extinction (mag/airmass).")
    parser.add_argument("--fields", default=_DEFAULT_FIELDS, help="Path to the fields JSON.")
    parser.add_argument("--models", default=_DEFAULT_MODELS, help="Path to the sensitivity_models folder.")
    args = parser.parse_args(argv)

    if args.sunset_jd >= args.sunrise_jd:
        print(f"ERROR: sunset-jd ({args.sunset_jd}) must be < sunrise-jd ({args.sunrise_jd}).", file=sys.stderr)
        return 2

    try:
        sunset_time = Time(args.sunset_jd, format='jd')
        sunrise_time = Time(args.sunrise_jd, format='jd')
    except Exception as exc:
        print(f"ERROR: could not parse JD values: {exc}", file=sys.stderr)
        return 2

    try:
        config = SchedulerConfig(fps=args.framerate, sensitivity_model_loc=args.models)
    except Exception as exc:
        print(f"ERROR: could not build SchedulerConfig: {exc}", file=sys.stderr)
        return 2

    try:
        sky = sky_module.load_fields(args.fields)
    except Exception as exc:
        print(f"ERROR: could not load fields from {args.fields}: {exc}", file=sys.stderr)
        return 2

    try:
        obs = Observatory(config)
    except Exception as exc:
        print(f"ERROR: could not initialize Observatory (missing model?): {exc}", file=sys.stderr)
        return 2

    blocks = _build_blocks(sunset_time, sunrise_time)
    if not blocks:
        print("ERROR: empty observing window; no blocks to schedule.", file=sys.stderr)
        return 2

    # Per-block selection.
    selections = []  # list of (start_time, record-dict)
    for (start, end) in blocks:
        try:
            top_field, stats = obs.schedule_observation(
                sky, start, end, weather=args.extinction, framerate=args.framerate
            )
        except ValueError as exc:
            # No eligible field for this block: non-fatal, skip it.
            print(f"WARNING: skipping block starting JD {start.jd:.6f}: {exc}", file=sys.stderr)
            continue
        except Exception as exc:
            # A model/config error is fatal; surface it clearly.
            print(f"ERROR: scheduling failed for block JD {start.jd:.6f}: {exc}", file=sys.stderr)
            return 1

        field_id = int(stats['Field'])
        ra_deg, dec_deg = sky.centroids[field_id]

        # Azimuth from the field's AltAz at block start.
        try:
            altaz = obs.get_field_altaz(start, sky)
            az = float(altaz.az.deg[field_id])
        except Exception:
            az = 0.0

        alt = float(stats['Altitude'])
        airmass = stats.get('AIRMASS')
        if airmass is None or not np.isfinite(float(airmass)):
            airmass = _airmass_from_alt(alt)
        else:
            airmass = float(airmass)

        nstars = stats.get('Predicted Nstars > 5', stats.get('Nstars > 5', 0))

        record = {
            'name': "field" + str(field_id + 1),
            'field_id': field_id,
            'ra_deg': float(ra_deg),
            'dec_deg': float(dec_deg),
            'start_jd': float(start.jd),
            'alt': alt,
            'az': az,
            'ha': float(stats['Hour Angle']),
            'airmass': float(airmass),
            'score': float(stats['Observation Score']),
            'nstars': int(nstars),
        }
        selections.append((start, record))

    # Collapse contiguous identical fields into segments (keep earliest block's row).
    segments = []
    for (_start, rec) in selections:
        if segments and segments[-1]['field_id'] == rec['field_id']:
            continue
        segments.append(rec)

    # Emit the delimited, CSV-formatted schedule block.
    print("=== SCHEDULE BEGIN ===")
    print("name,ra_deg,dec_deg,start_jd,alt,az,ha,airmass,score,nstars")
    for rec in segments:
        print(
            f"{rec['name']},"
            f"{rec['ra_deg']:.6f},"
            f"{rec['dec_deg']:.6f},"
            f"{rec['start_jd']:.6f},"
            f"{rec['alt']:.2f},"
            f"{rec['az']:.2f},"
            f"{rec['ha']:.3f},"
            f"{rec['airmass']:.2f},"
            f"{rec['score']:.2f},"
            f"{rec['nstars']}"
        )
    print("=== SCHEDULE END ===")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

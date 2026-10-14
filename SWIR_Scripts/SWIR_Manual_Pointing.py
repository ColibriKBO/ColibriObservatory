#!/usr/bin/env python3
"""SWIR manual pointing aid for the Colibri array (Windows Python + WSL).

Reads ONE completed, two-dimensional FITS image from the POET/XCAP computer,
invokes an existing LOCAL Astrometry.net solve-field installation through WSL,
and PRINTS the correction the human can apply using the GTO control window.

This program NEVER connects to or commands the telescope, dome, ACP, PHD2,
XCAP, an ASCOM device, or any network service. It cannot move or sync anything.

Requirements on Redbird: Python with astropy (including numpy), WSL with
solve-field and the suitable LOCAL Astrometry.net index files installed.

Defaults are tuned for the tested POET SWIR setup: 1.2-1.6 arcsec/pixel,
2x downsampling, depth 500, and a 2-degree target-centered search radius.
"""

import argparse
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile


def ra_degrees(value: str) -> float:
    """RA as HH:MM:SS (hours) or decimal DEGREES (not decimal hours)."""
    value = value.strip()
    if ':' not in value:
        result = float(value)
        if not math.isfinite(result) or not 0 <= result < 360:
            raise ValueError('Decimal RA must be in degrees from 0 to <360.')
        return result
    fields = value.split(':')
    if len(fields) != 3:
        raise ValueError('Sexagesimal RA must be HH:MM:SS[.ss].')
    hh, mm, ss = map(float, fields)
    if not all(math.isfinite(v) for v in (hh, mm, ss)) or not (0 <= hh < 24 and 0 <= mm < 60 and 0 <= ss < 60):
        raise ValueError('Invalid HH:MM:SS right ascension.')
    return 15 * (hh + mm / 60 + ss / 3600)


def dec_degrees(value: str) -> float:
    """Dec as signed DD:MM:SS or decimal DEGREES."""
    value = value.strip()
    if ':' not in value:
        result = float(value)
        if not math.isfinite(result) or not -90 <= result <= 90:
            raise ValueError('Declination must lie between -90 and +90 degrees.')
        return result
    sign = -1 if value.startswith('-') else 1
    fields = value.lstrip('+-').split(':')
    if len(fields) != 3:
        raise ValueError('Sexagesimal Dec must be [+/-]DD:MM:SS[.ss].')
    dd, mm, ss = map(float, fields)
    if not all(math.isfinite(v) for v in (dd, mm, ss)) or not (0 <= dd <= 90 and 0 <= mm < 60 and 0 <= ss < 60):
        raise ValueError('Invalid declination DD:MM:SS.')
    result = sign * (dd + mm / 60 + ss / 3600)
    if not -90 <= result <= 90:
        raise ValueError('Declination must lie between -90 and +90 degrees.')
    return result


def _sexagesimal_from_seconds(seconds: float, precision: int = 2):
    # Round once BEFORE dividing, so 59.9999 correctly carries into minutes.
    scale = 10 ** precision
    ticks = round(abs(seconds) * scale)
    h, rem = divmod(ticks, 3600 * scale)
    m, rem = divmod(rem, 60 * scale)
    s = rem / scale
    return h, m, s


def ra_hms(ra_deg: float) -> str:
    hh, mm, ss = _sexagesimal_from_seconds((ra_deg % 360) * 240)
    return f'{hh % 24:02d}:{mm:02d}:{ss:05.2f}'


def dec_dms(dec_deg: float) -> str:
    dd, mm, ss = _sexagesimal_from_seconds(dec_deg * 3600)
    return f'{"-" if math.copysign(1, dec_deg) < 0 else "+"}{dd:02d}:{mm:02d}:{ss:05.2f}'


def ra_shift_hms(delta_ra_deg: float) -> str:
    hh, mm, ss = _sexagesimal_from_seconds(delta_ra_deg * 240)
    return f'{"-" if delta_ra_deg < 0 else "+"}{hh:02d}:{mm:02d}:{ss:05.2f}'


def dec_shift_dms(delta_dec_deg: float) -> str:
    dd, mm, ss = _sexagesimal_from_seconds(delta_dec_deg * 3600)
    return f'{"-" if delta_dec_deg < 0 else "+"}{dd:02d}:{mm:02d}:{ss:05.2f}'


def shortest_ra_difference(target_ra: float, image_ra: float) -> float:
    """Return target minus image RA coordinate, in DEGREES, [-180,180)."""
    return (target_ra - image_ra + 180) % 360 - 180


def sky_separation_deg(ra1: float, dec1: float, ra2: float, dec2: float) -> float:
    a, b = math.radians(dec1), math.radians(dec2)
    dra = math.radians(shortest_ra_difference(ra1, ra2))
    hav = math.sin((a - b) / 2) ** 2 + math.cos(a) * math.cos(b) * math.sin(dra / 2) ** 2
    return math.degrees(2 * math.asin(math.sqrt(max(0.0, min(1.0, hav)))))


def to_wsl_path(path: Path) -> str:
    """Matches the Windows-drive -> WSL technique in astrometry_correction.py."""
    text = str(path.resolve()).replace('\\', '/')
    if re.match(r'^[A-Za-z]:/', text):
        return '/mnt/' + text[0].lower() + text[2:]
    if os.name != 'nt' and text.startswith('/'):
        return text  # Useful when developing/testing from Linux; Windows is expected at the observatory.
    raise ValueError('Put the FITS on a LOCAL drive on Redbird (e.g. D:\\SWIR_Pointing\\image.fits). '
                     'UNC network paths are not supported by the WSL path helper.')


def _prepare_image(image_path: Path):
    from astropy.io import fits
    with fits.open(image_path, memmap=False) as hdul:
        data = hdul[0].data
        if data is None or data.ndim != 2:
            raise ValueError('The FITS primary HDU must contain ONE 2D image; export a single SWIR frame.')
        ny, nx = data.shape
        if nx < 20 or ny < 20:
            raise ValueError('Image is too small to plate-solve.')
    return nx, ny

def solve_image(image_path: Path, work_dir: Path, args, target_ra: float, target_dec: float):
    """Run local WSL solve-field, using the science target as a positional search hint."""
    from astropy.io import fits
    from astropy.wcs import WCS
    work_dir.mkdir(parents=True, exist_ok=True)
    solved_image = work_dir / 'swir_solution.new.fits'
    solved_marker = work_dir / 'swir_solution.solved'
    # The user-provided astrometry_correction.py already uses -D/-N and
    # extracts the WCS from the solved FITS header; preserve that approach.
    cmd = ['wsl', 'solve-field', '--no-plots', '--overwrite',
           '-D', to_wsl_path(work_dir), '-N', to_wsl_path(solved_image),
           '--solved', to_wsl_path(solved_marker),
           '-t', '2', '--cpulimit', str(args.cpu_limit),
           '--downsample', str(args.downsample),
           '--depth', str(args.depth)]
    if args.scale_low is not None:
        cmd.extend(['--scale-units', 'arcsecperpix',
                    '--scale-low', str(args.scale_low), '--scale-high', str(args.scale_high)])

    # The telescope has already been slewed near the science target, so this is
    # not an unknown-sky blind solve.  Restrict Astrometry.net to the expected
    # region to make sparse SWIR fields substantially easier/faster to solve.
    cmd.extend(['--ra', str(target_ra),
                '--dec', str(target_dec),
                '--radius', str(args.search_radius)])

    cmd.append(to_wsl_path(image_path))

    if args.verbose:
        print('Local solver command:', subprocess.list2cmdline(cmd), flush=True)
    try:
        run = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                             text=True, timeout=args.timeout, check=False)
    except FileNotFoundError as exc:
        raise RuntimeError('Cannot start WSL. Run this with Windows Python on Redbird; '
                           'verify WSL is installed.') from exc
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f'Local solve exceeded {args.timeout} seconds. '
                           'Try a clearer image, suitable indexes or the correct SWIR pixel scale.') from exc
    if args.verbose or run.returncode != 0 or not solved_marker.exists() or not solved_image.exists():
        print('Solver output (last 5000 chars):\n' + run.stdout[-5000:], flush=True)
    if run.returncode != 0 or not solved_marker.exists() or not solved_image.exists():
        raise RuntimeError('No successful local astrometric solution. NO pointing correction is available. '
                           'Check focus, detected stars, SWIR pixel scale and installed indexes.')
    with fits.open(solved_image) as hdul:
        header = hdul[0].header.copy()
    world = WCS(header).celestial
    if not world.has_celestial:
        raise RuntimeError('Solver output does not contain a celestial WCS. NO correction available.')
    return world

def print_report(image_path: Path, target_ra: float, target_dec: float,
                 solved_ra: float, solved_dec: float, nx: int, ny: int,
                 projected_xy, mount_ra, mount_dec, max_manual_deg: float) -> None:
    """Print a concise, operator-focused manual pointing report."""
    dra = shortest_ra_difference(target_ra, solved_ra)
    ddec = target_dec - solved_dec
    sep = sky_separation_deg(target_ra, target_dec, solved_ra, solved_dec)

    ra_sky_arcsec = dra * math.cos(math.radians(solved_dec)) * 3600
    dec_arcsec = ddec * 3600
    sep_arcsec = sep * 3600

    ra_direction = 'INCREASE RA' if dra > 0 else ('DECREASE RA' if dra < 0 else 'NO RA CHANGE')
    dec_direction = 'INCREASE DEC' if ddec > 0 else ('DECREASE DEC' if ddec < 0 else 'NO DEC CHANGE')

    print('\n' + '=' * 72)
    print('SWIR MANUAL POINTING')
    print('=' * 72)
    print('STATUS: SOLVED')
    print(f'Image:   {image_path.name}')
    print(f'Target:  RA {ra_hms(target_ra)}   Dec {dec_dms(target_dec)}')
    print(f'Solved:  RA {ra_hms(solved_ra)}   Dec {dec_dms(solved_dec)}')
    print(f'Error:   {sep_arcsec:.1f} arcsec  ({sep * 60:.2f} arcmin)')

    print('\nREQUIRED CORRECTION')
    print(f'  RA :  {ra_shift_hms(dra)}   {ra_direction}')
    print(f'        ({ra_sky_arcsec:+.1f} arcsec on sky at this declination)')
    print(f'  Dec:  {dec_shift_dms(ddec)}   {dec_direction}')
    print(f'        ({dec_arcsec:+.1f} arcsec on sky)')

    print('\n  IMPORTANT: RA HH:MM:SS is a coordinate change.')
    print('             It is NOT arcseconds and NOT button-hold time.')

    # Show target location in the solved frame in one compact line.
    if projected_xy is not None:
        tx, ty = projected_xy
        if math.isfinite(tx) and math.isfinite(ty):
            if 0 <= tx < nx and 0 <= ty < ny:
                print(f'\nTARGET IN IMAGE: INSIDE frame at x={tx:.1f}, y={ty:.1f}  ({nx} x {ny})')
            else:
                print(f'\nTARGET IN IMAGE: OUTSIDE frame  (projected x={tx:.1f}, y={ty:.1f})')

    if mount_ra is not None and mount_dec is not None:
        print('\nMANUAL GTO MOVE')
        print(f'  Current:  RA {ra_hms(mount_ra)}   Dec {dec_dms(mount_dec)}')

        if sep > max_manual_deg:
            print('  Aim for:  NOT SHOWN')
            print(f'  WARNING: pointing error is {sep:.2f} deg, above the '
                  f'{max_manual_deg:.2f} deg manual-move limit.')
            print('           Verify the solve and use a safe reacquisition procedure.')
        elif abs(solved_dec) > 85 or abs(target_dec) > 85:
            print('  Aim for:  NOT SHOWN')
            print('  WARNING: field is too close to the celestial pole for a simple')
            print('           RA/Dec differential nudge recommendation.')
        else:
            proposed_dec = mount_dec + ddec
            if -90 <= proposed_dec <= 90:
                print(f'  Aim for:  RA {ra_hms(mount_ra + dra)}   Dec {dec_dms(proposed_dec)}')
                print('\n  Nudge while watching the live GTO readout until it is near')
                print('  the Aim-for values, then capture a NEW FITS and solve again.')
            else:
                print('  Aim for:  NOT SHOWN')
                print('  WARNING: calculated Dec would fall outside [-90, +90] deg.')

    print('\nNo telescope commands were sent. No sync or pointing-model changes were made.')
    print('=' * 72)

def parse_args(argv=None):
    # argparse can mistake a negative sexagesimal value such as -19:30:00
    # for another option. Normalize these two known Dec arguments so users can
    # write either '--target-dec -19:30:00' or '--target-dec=-19:30:00'.
    if argv is None:
        argv = sys.argv[1:]
    else:
        argv = list(argv)

    for opt in ('--target-dec', '--mount-dec'):
        i = 0
        while i < len(argv) - 1:
            if argv[i] == opt and argv[i + 1].startswith('-') and ':' in argv[i + 1]:
                argv[i:i + 2] = [opt + '=' + argv[i + 1]]
            i += 1

    p = argparse.ArgumentParser(description='Solve a POET SWIR FITS locally and PRINT manual GTO corrections. '
                                            'Does not connect to any mount or camera.')
    p.add_argument('--image', type=Path, required=True, help='One finished 2D FITS saved/copied onto Redbird.')
    p.add_argument('--target-ra', required=True, help='Target HH:MM:SS (RA hours) or decimal DEGREES.')
    p.add_argument('--target-dec', required=True, help='Target [+/-]DD:MM:SS or decimal DEGREES.')
    p.add_argument('--mount-ra', help='OPTIONAL GTO readout RA recorded when the FITS was taken (HH:MM:SS or degrees).')
    p.add_argument('--mount-dec', help='OPTIONAL GTO readout Dec recorded when the FITS was taken (DD:MM:SS or degrees).')
    p.add_argument('--scale-low', type=float, default=1.2,
                   help='SWIR image scale lower bound, arcsec/pixel (default 1.2).')
    p.add_argument('--scale-high', type=float, default=1.6,
                   help='SWIR image scale upper bound, arcsec/pixel (default 1.6).')
    p.add_argument('--search-radius', type=float, default=2.0,
                   help='Astrometry.net search radius around the science target, in degrees (default 2).')
    p.add_argument('--downsample', type=int, default=2,
                   help='Astrometry.net image downsample factor (default 2; validated on POET SWIR data).')
    p.add_argument('--depth', type=int, default=500,
                   help='Number of brightness-ranked field objects Astrometry.net may use (default 500).')
    p.add_argument('--cpu-limit', type=int, default=300,
                   help='Local solver CPU time limit in seconds (default 300).')
    p.add_argument('--timeout', type=int, default=360,
                   help='Entire WSL subprocess wall timeout in seconds (default 360).')
    p.add_argument('--max-manual-deg', type=float, default=1.0,
                   help='Warn if total sky separation exceeds this many degrees (default 1).')
    p.add_argument('--work-dir', type=Path, help='OPTIONAL local work directory for debugging; solver files kept here.')
    p.add_argument('--verbose', action='store_true', help='Print detailed Astrometry.net solver diagnostics (troubleshooting only).')
    args = p.parse_args(argv)
    if (args.mount_ra is None) != (args.mount_dec is None):
        p.error('Supply BOTH --mount-ra and --mount-dec, or neither.')
    if (args.scale_low is None) != (args.scale_high is None):
        p.error('Supply BOTH --scale-low and --scale-high, or neither.')
    if args.scale_low is not None and not (0 < args.scale_low < args.scale_high):
        p.error('Pixel scale must satisfy 0 < --scale-low < --scale-high.')
    if not (0 < args.search_radius <= 180):
        p.error('--search-radius must be greater than 0 and no more than 180 degrees.')
    if args.downsample <= 0:
        p.error('--downsample must be a positive integer.')
    if args.depth <= 0:
        p.error('--depth must be a positive integer.')
    if args.cpu_limit <= 0 or args.timeout <= 0 or args.max_manual_deg <= 0:
        p.error('Timeouts and max-manual-deg must be positive.')
    return args


def main(argv=None) -> int:
    args = parse_args(argv)
    try:
        target_ra = ra_degrees(args.target_ra)
        target_dec = dec_degrees(args.target_dec)
        mount_ra = ra_degrees(args.mount_ra) if args.mount_ra is not None else None
        mount_dec = dec_degrees(args.mount_dec) if args.mount_dec is not None else None
        image_path = args.image.expanduser().resolve(strict=True)
        if image_path.suffix.lower() not in ('.fits', '.fit', '.fts'):
            raise ValueError('Expected an exported SWIR FITS file (.fits/.fit/.fts); no RCD conversion is needed.')
        nx, ny = _prepare_image(image_path)
        if args.scale_low is None:
            print('Note: no SWIR pixel scale supplied: local solver will search available scale indexes. '
                  'Do NOT reuse optical camera 2.2–2.6 arcsec/pixel unless measured for this SWIR setup.')
        if args.work_dir is None:
            with tempfile.TemporaryDirectory(prefix='swir_pointing_') as work:
                world = solve_image(image_path, Path(work), args, target_ra, target_dec)
        else:
            world = solve_image(image_path, args.work_dir.expanduser().resolve(), args, target_ra, target_dec)
        # Unlike the existing optical script, the center is taken from the ACTUAL
        # FITS dimensions (SWIR camera is not 2048x2048).
        center = world.pixel_to_world((nx - 1) / 2, (ny - 1) / 2).icrs
        from astropy.coordinates import SkyCoord
        import astropy.units as u
        target = SkyCoord(ra=target_ra * u.deg, dec=target_dec * u.deg, frame='icrs')
        px, py = world.world_to_pixel(target)
        print_report(image_path, target_ra, target_dec,
                     float(center.ra.deg), float(center.dec.deg),
                     nx, ny, (float(px), float(py)), mount_ra, mount_dec,
                     args.max_manual_deg)
        return 0
    except (OSError, ValueError, RuntimeError, ImportError) as exc:
        print('\nERROR:', exc, file=sys.stderr)
        print('NO VERIFIED PLATE SOLVE / NO POINTING INSTRUCTIONS. DO NOT MOVE BASED ON THIS RUN.',
              file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
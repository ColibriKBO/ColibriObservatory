"""ASTAP HFD measurement backend. No hardware access.

Uses ASTAP -extract to write a per-star CSV beside each FITS file.
The CSV contains x,y,hfd,snr,flux columns; median stellar HFD is the score.
"""
from pathlib import Path
import csv
import math
import subprocess
import time
import numpy as np
from Convert_PyFocus_RCD_to_FITS import write_fits
from ColibriGrabCapture import read_rcd_high_gain

DEFAULT_ASTAP = r'C:\Program Files\astap\astap.exe'


def read_astap_star_csv(csv_path, min_stars=15, min_snr=30):
    """Parse ASTAP -extract CSV, discarding malformed/nonstellar HFD rows."""
    csv_path = Path(csv_path)
    with csv_path.open('r', newline='', encoding='utf-8-sig', errors='replace') as fh:
        reader = csv.DictReader(fh)
        if not reader.fieldnames:
            raise ValueError(f'ASTAP CSV has no header: {csv_path}')
        reader.fieldnames = [name.strip().lower() for name in reader.fieldnames]
        if not {'x', 'y', 'hfd', 'snr', 'flux'}.issubset(reader.fieldnames):
            raise ValueError(f'Unexpected ASTAP CSV columns {reader.fieldnames}: {csv_path}')
        hfds = []
        hfd_star_xy = []
        for row in reader:
            try:
                hfd = float(row['hfd'])
                snr = float(row['snr'])
                flux = float(row['flux'])
                x = float(row['x'])
                y = float(row['y'])
            except (ValueError, TypeError, KeyError):
                continue
            if (all(map(math.isfinite, (hfd, snr, flux, x, y)))
                    and 0.5 <= hfd <= 100.0 and snr >= min_snr
                    and flux > 0 and 0 <= x < 2048 and 0 <= y < 2048):
                hfds.append(hfd)
                hfd_star_xy.append([x, y])
    if len(hfds) < min_stars:
        raise ValueError(f'Only {len(hfds)} valid ASTAP stars (need {min_stars}): {csv_path}')
    return {'hfd_px': float(np.median(hfds)), 'stars': len(hfds),
            'star_hfd_mad_px': float(np.median(np.abs(np.asarray(hfds) - np.median(hfds)))),
            'hfd_star_xy': hfd_star_xy}


def measure_rcd(rcd_path, batch, position, frame, astap_exe=DEFAULT_ASTAP,
                snr=30, min_stars=15, timeout_s=90, keep_running=lambda: True):
    rcd_path = Path(rcd_path)
    exe = Path(astap_exe)
    if not exe.is_file():
        raise FileNotFoundError(f'ASTAP not installed at {exe}')
    if not keep_running():
        raise RuntimeError('ASTAP analysis cancelled')
    fits_dir = rcd_path.parent / 'ASTAP_FITS'
    fits_dir.mkdir(exist_ok=True)
    fits = fits_dir / f'batch_{batch:03d}_pos_{position}_frame_{frame:03d}.fits'
    if fits.exists():
        raise FileExistsError(f'Refusing to overwrite existing FITS: {fits}')
    csv_path = fits.with_suffix('.csv')
    if csv_path.exists():
        raise FileExistsError(f'Refusing to use existing ASTAP CSV: {csv_path}')
    write_fits(fits, read_rcd_high_gain(rcd_path), batch, position, frame, rcd_path.name)
    start_wall = time.time()
    command = [str(exe), '-f', str(fits), '-extract', str(int(snr))]
    proc = subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                            cwd=str(exe.parent))
    start = time.monotonic()
    try:
        while proc.poll() is None:
            if not keep_running():
                proc.kill()
                proc.wait()
                raise RuntimeError('ASTAP analysis cancelled')
            if time.monotonic() - start > timeout_s:
                proc.kill()
                proc.wait()
                raise TimeoutError(f'ASTAP extraction timed out: {fits}')
            time.sleep(0.1)
        code = proc.wait()
    finally:
        if proc.poll() is None:
            proc.kill()
            proc.wait()
    if not keep_running():
        raise RuntimeError('ASTAP analysis cancelled')
    # ASTAP on Windows may return zero for its successful CLI extraction.
    # The output CSV, rather than the process code, is the authoritative result.
    if code != 0:
        raise RuntimeError(f'ASTAP extraction failed (exit code {code}): {fits}')
    if not csv_path.is_file() or csv_path.stat().st_size == 0:
        raise RuntimeError(f'ASTAP produced no star CSV: {csv_path}')
    if csv_path.stat().st_mtime < start_wall - 2:
        raise RuntimeError(f'ASTAP CSV timestamp is stale: {csv_path}')
    result = read_astap_star_csv(csv_path, min_stars=min_stars, min_snr=int(snr))
    return dict(result, fits=str(fits), rcd=str(rcd_path),
                astap_csv=str(csv_path), astap_exit_code=code)

def summarize_batch(measurements, minimum_valid=5):
    valid = [m for m in measurements if 'hfd_px' in m]
    if len(valid) < minimum_valid:
        raise ValueError(f'Only {len(valid)} valid ASTAP frames; need {minimum_valid}')
    h = np.asarray([m['hfd_px'] for m in valid], dtype=float)
    return {'hfd_px': float(np.median(h)), 'hfd_mad_px': float(np.median(abs(h-np.median(h)))),
            'valid_frames': len(valid), 'median_stars': float(np.median([m['stars'] for m in valid])),
            'frames': measurements}


def select_focus(rows, step):
    """
    Select a bracketed ASTAP HFD minimum.

    Uses the overall five-point curvature rather than requiring
    both individual wings to exceed a fixed HFD threshold.

    Never extrapolates outside the sampled region.
    """
    rows = sorted(rows, key=lambda r: r["position"])

    if len(rows) < 5:
        raise ValueError("At least five focus positions required")

    if step <= 0:
        raise ValueError("Focus step must be positive")

    positions = np.asarray(
        [r["position"] for r in rows], dtype=float
    )
    scores = np.asarray(
        [r["hfd_px"] for r in rows], dtype=float
    )
    mads = np.asarray(
        [r["hfd_mad_px"] for r in rows], dtype=float
    )

    if not (
        np.all(np.isfinite(positions))
        and np.all(np.isfinite(scores))
        and np.all(np.isfinite(mads))
    ):
        raise ValueError("Non-finite autofocus measurements")

    if np.any(mads < 0) or np.any(np.diff(positions) <= 0):
        raise ValueError("Invalid focus positions or HFD scatter")

    i = int(np.argmin(scores))

    if i < 2 or i > len(rows) - 3:
        raise ValueError(
            "Best focus is too close to scan edge; not bracketed"
        )

    window = slice(i - 2, i + 3)

    x = (positions[window] - positions[i]) / float(step)
    y = scores[window]

    a, b, c = np.polyfit(x, y, 2)

    if a <= 0:
        raise ValueError(
            "Focus curve does not have positive curvature"
        )

    vertex = -b / (2 * a)

    if abs(vertex) > 1.0:
        raise ValueError(
            "Fitted focus minimum is too far from the best sample"
        )

    fitted = np.polyval([a, b, c], x)
    residual = float(np.sqrt(np.mean((fitted - y) ** 2)))

    if residual > max(0.10, 0.20 * float(np.ptp(y))):
        raise ValueError(
            "Focus curve is too irregular for a reliable quadratic fit"
        )

    # Compare the fitted minimum against the mean of both outer
    # points, rather than demanding that each side independently
    # exceed a fixed 0.06-pixel threshold.
    fitted_minimum = float(np.polyval([a, b, c], vertex))
    outer_mean = float((y[0] + y[-1]) / 2.0)
    contrast = outer_mean - fitted_minimum

    # Retain a minimum measurable contrast, with a scatter-based
    # requirement using the three central batches.
    central_scatter = float(np.median(mads[i-1:i+2]))
    required_contrast = max(0.04, 2.0 * central_scatter)

    if contrast < required_contrast:
        raise ValueError(
            "Focus curve contrast is insufficient: "
            f"{contrast:.4f} px measured, "
            f"{required_contrast:.4f} px required"
        )

    target = float(positions[i] + vertex * step)

    # Additional safeguard: stay inside the local measured bracket.
    if not positions[i-1] <= target <= positions[i+1]:
        raise ValueError(
            "Fitted focus position lies outside the local bracket"
        )

    return {
        "position": int(round(target)),
        "best_sampled_position": int(positions[i]),
        "best_sampled_hfd_px": float(scores[i]),
        "method": "bounded local quadratic HFD fit",
        "fit_residual_px": residual,
        "fit_curvature": float(a),
        "fit_contrast_px": float(contrast),
        "required_contrast_px": float(required_contrast)
    }

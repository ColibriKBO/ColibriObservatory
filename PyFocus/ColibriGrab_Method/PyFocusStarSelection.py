"""Pure, no-hardware candidate ranking and field quality diagnostics for PyFocus.

Star detection still happens on raw RCD camera data in PyFocus_ColibriGrab.
This module keeps source-selection decisions deterministic and unit-testable.
"""
import numpy as np
from scipy.spatial import cKDTree


def field_region(x, y, width, height, center_fraction=0.55):
    """Return center or one of four detector quadrants (0 = left/top)."""
    if (abs(x - width / 2) <= width * center_fraction / 2
            and abs(y - height / 2) <= height * center_fraction / 2):
        return 'center'
    return ('upper' if y < height/2 else 'lower') + '_' + ('left' if x < width/2 else 'right')


def field_counts(points, shape):
    height, width = shape[:2]
    regions = ['center', 'upper_left', 'upper_right', 'lower_left', 'lower_right']
    counts = {name: 0 for name in regions}
    for x, y in np.asarray(points, dtype=float).reshape(-1, 2):
        if np.isfinite([x, y]).all():
            counts[field_region(x, y, width, height)] += 1
    return counts


def spatial_candidate_order(points, strengths, shape, limit=40,
                            minimum_distance=9.0, edge_margin=14):
    """Select isolated bright peaks from center plus all available field regions.

    Returns (ordered_indices, rejection_counts); never mutates the image.
    The central field is allowed ~40% of the budget, and the rest is balanced
    by round-robin allocation among the four outer quadrants. The ranking is
    repeated each frame UNTIL a persistent reference catalog is established.
    """
    pts = np.asarray(points, dtype=float).reshape(-1, 2)
    val = np.asarray(strengths, dtype=float).reshape(-1)
    if len(pts) != len(val):
        raise ValueError('points and strengths lengths differ')
    h, w = shape[:2]
    rejected = {'edge': 0, 'nonfinite': 0, 'crowded': 0, 'candidate_cap': 0}
    buckets = {k: [] for k in ['center', 'upper_left', 'upper_right', 'lower_left', 'lower_right']}
    for idx, ((x,y), strength) in enumerate(zip(pts, val)):
        if not np.isfinite([x,y,strength]).all() or strength <= 0:
            rejected['nonfinite'] += 1
        elif x < edge_margin or y < edge_margin or x >= w-edge_margin or y >= h-edge_margin:
            rejected['edge'] += 1
        else:
            buckets[field_region(x,y,w,h)].append((float(strength),int(idx)))
    for b in buckets.values():
        b.sort(key=lambda a:(-a[0],a[1]))
    # Interleave central and outer sources. Avoid an entire catalog of stars
    # from only one bright-but-aberrated quadrant.
    order = ['center', 'upper_left', 'upper_right', 'lower_left', 'lower_right']
    selected = []
    selected_points = []
    while len(selected) < limit and any(buckets.values()):
        for region in order:
            if not buckets[region]:
                continue
            _, idx = buckets[region].pop(0)
            xy = pts[idx]
            if selected_points and np.min(np.linalg.norm(np.asarray(selected_points)-xy, axis=1)) < minimum_distance:
                rejected['crowded'] += 1
            else:
                selected.append(idx)
                selected_points.append(xy)
            if len(selected) >= limit:
                break
    rejected['candidate_cap'] = sum(len(bucket) for bucket in buckets.values())
    return selected, rejected


def reliable_star_cohort(history, reference_stars, minimum=8, maximum=16,
                         detection_fraction=0.80, max_relative_mad=0.12):
    """Select persistent, quiet star IDs from repeated measurements (no hardware).

    Histories contain per-frame {reference_id: PSF_sigma}. Missing fits are
    excluded from estimation, never represented as artificial narrow stars.
    The ranking mildly favours center/left regions but can use any region.
    """
    if not history or not reference_stars:
        return [], {}
    n = len(history)
    summary = {}
    for sid, (x,y,reference_width) in enumerate(reference_stars):
        readings = [float(f[sid]) for f in history if sid in f and
                    np.isfinite(f[sid]) and f[sid] > 0]
        if not readings:
            continue
        med = float(np.median(readings))
        frac = len(readings)/n
        rel_mad = float(1.4826*np.median(np.abs(np.asarray(readings)-med))/max(med,1e-8))
        region = field_region(x,y,2048,2048)
        summary[sid] = {'fraction':round(frac,3), 'relative_mad':round(rel_mad,4),
                        'region':region, 'observed':len(readings)}
    # Avoid selecting highly inconsistent elongated stars merely because they
    # are bright. Loosen only when too few otherwise reliable stars are found.
    for frac_limit, mad_limit in ((detection_fraction,max_relative_mad),(.70,.16)):
        ok = [sid for sid, rec in summary.items()
              if rec['fraction'] >= frac_limit and rec['relative_mad'] <= mad_limit]
        if len(ok) >= minimum:
            break
    else:
        return [], summary
    def priority(sid):
        rec=summary[sid]
        # Favor long-lived stable sources; center/left get a small tie-breaking
        # preference, but no region is strictly banned.
        spatial = 0 if rec['region']=='center' else (0.01 if rec['region'].endswith('left') else 0.025)
        return (-(rec['fraction']),rec['relative_mad']+spatial,sid)
    ok.sort(key=priority)
    # Guarantee diversity among outer quadrants when sufficiently good sources
    # exist, while limiting their contribution to an unstable mixed-field score.
    chosen=[]
    for region in ('center','upper_left','lower_left','upper_right','lower_right'):
        group=[sid for sid in ok if summary[sid]['region']==region]
        chosen.extend(group[:3 if region=='center' else 2])
    chosen=list(dict.fromkeys(chosen))[:maximum]
    for sid in ok:
        if len(chosen)>=maximum: break
        if sid not in chosen: chosen.append(sid)
    return sorted(chosen), summary

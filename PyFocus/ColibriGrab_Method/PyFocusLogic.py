"""Pure analysis support for supervised PyFocus v3.

No camera, ASCOM, ACP or other hardware access occurs in this module.
"""
import numpy as np
from scipy.spatial import cKDTree


class StarCatalog:
    """Lock accepted reference PSFs and compare the same detector sources.

    Each source's width is scaled relative to its reference width, preventing a
    changing subset of intrinsically different PSFs from dominating the score.
    Large frame shifts or too few common stars invalidate the measurement.
    """
    def __init__(self, accepted_fits, min_stars=8, max_stars=25):
        # accepted_fits: (x, y, sigma) for a single unsaturated reference image.
        clean = []
        for x, y, width in accepted_fits:
            if np.isfinite([x, y, width]).all() and 0.30 <= width <= 8.0:
                if all(np.hypot(x - a[0], y - a[1]) >= 9 for a in clean):
                    clean.append((float(x), float(y), float(width)))
            if len(clean) >= max_stars:
                break
        if len(clean) < min_stars:
            raise ValueError('Need at least %d separated reference stars (got %d)' % (min_stars, len(clean)))
        self.stars = clean
        self.reference_scale = float(np.median([p[2] for p in clean]))
        self.shift = np.zeros(2, dtype=float)
        self.match_radius = 7.0
        self.min_stars = min_stars

    def choose_candidates(self, points):
        """Return candidate point coordinates in locked ID order (no new stars)."""
        points = np.asarray(points, dtype=float).reshape(-1, 2)
        if len(points) == 0:
            return [], []
        tree = cKDTree(points)
        used = set()
        candidates = []
        ids = []
        # Bright stars are well-spaced in the catalog; reject shared detections.
        for sid, (sx, sy, _) in enumerate(self.stars):
            ref = np.array((sx, sy)) + self.shift
            dist, indexes = tree.query(ref, k=min(6, len(points)), distance_upper_bound=self.match_radius)
            for d, k in zip(np.atleast_1d(dist), np.atleast_1d(indexes)):
                if np.isfinite(d) and int(k) < len(points) and int(k) not in used:
                    used.add(int(k))
                    candidates.append(points[int(k)].tolist())
                    ids.append(sid)
                    break
        return candidates, ids

    def match_fits(self, fits):
        """Associate fitted centroids with fixed star IDs and update bulk drift."""
        # fits entries (x,y,sigma) from PSF fitting; do not create new IDs.
        if not fits:
            return {}
        targets = np.asarray([[x, y] for x, y, _ in self.stars]) + self.shift
        tree = cKDTree(targets)
        used = set()
        matches = {}
        offsets = []
        for x, y, width in fits:
            if not np.isfinite([x, y, width]).all():
                continue
            distance, sid = tree.query([x, y], distance_upper_bound=self.match_radius)
            if np.isfinite(distance) and sid < len(self.stars) and sid not in used:
                sid = int(sid)
                used.add(sid)
                matches[sid] = float(width)
                offsets.append(np.array([x-self.stars[sid][0], y-self.stars[sid][1]]))
        # Drift correction is only trusted when multiple catalog sources agree.
        if len(offsets) >= 6:
            off = np.median(np.asarray(offsets), axis=0)
            dispersion = np.median(np.linalg.norm(np.asarray(offsets)-off, axis=1))
            if dispersion < 2.0 and np.linalg.norm(off) <= 15.0:
                self.shift = off
        return matches

    def normalized_score(self, matched_sigmas):
        if len(matched_sigmas) < 5:
            return None
        ratios = [float(w)/self.stars[int(i)][2] for i,w in matched_sigmas.items()
                  if 0 <= int(i) < len(self.stars) and np.isfinite(w) and w > 0]
        if len(ratios) < 5:
            return None
        return self.reference_scale * float(np.median(ratios))


def choose_bracketed_best(results, step):
    """Select sampled minimum; return None for missing both-side bracket."""
    valid = sorted((int(p), float(s)) for p,s in results.items()
                   if s is not None and np.isfinite(s))
    if len(valid) < 3:
        return None
    i = min(range(len(valid)), key=lambda j: valid[j][1])
    if i == 0 or i == len(valid)-1:
        return None
    if valid[i-1][0] != valid[i][0]-step or valid[i+1][0] != valid[i][0]+step:
        return None
    return valid[i][0]


def fitted_focus_vertex(positions, scores, max_deviation_from_best_steps=1.0):
    """Fit a local quadratic in unit-step coordinates, or return None.

    Requires positive curvature and a minimum in the measured interval and
    close to the best sampled position. No extrapolation or edge guesses.
    """
    p = np.asarray(positions, dtype=float)
    s = np.asarray(scores, dtype=float)
    if len(p) < 5 or not np.isfinite(s).all() or len(set(p)) != len(p):
        return None
    best_i = int(np.argmin(s))
    if best_i < 2 or best_i > len(p)-3:
        return None
    spacing = float(np.median(np.diff(np.sort(p))))
    if spacing <= 0:
        return None
    x = (p - p[best_i]) / spacing
    # Fit just the nearest five points to limit sensitivity to broad wings.
    take = slice(best_i-2, best_i+3)
    coeff = np.polyfit(x[take], s[take], 2)
    a,b,c = coeff
    if not np.isfinite(coeff).all() or a <= 0:
        return None
    vertex_step = -b/(2*a)
    if abs(vertex_step) > max_deviation_from_best_steps:
        return None
    pred = np.polyval(coeff, x[take])
    residual = float(np.sqrt(np.mean((s[take]-pred)**2)))
    full_spread = max(float(np.max(s[take])-np.min(s[take])), 1.e-6)
    if residual > max(0.015, 0.35 * full_spread):
        return None
    target = float(p[best_i] + vertex_step*spacing)
    return {"position": int(round(target)), "rms_residual_px": residual,
            "curvature":float(a), "vertex_steps_from_sample":float(vertex_step)}


def matched_cohort_score(row, reference_stars, star_ids, min_stars=8):
    """Score a batch against prescribed star IDs, without substituting new stars.

    This is intentionally pure analysis and independent of the camera/backend.
    """
    widths = row.get("per_star_median_sigma_px") or {}
    values = []
    references = [float(s[2]) for s in reference_stars]
    scale = float(np.median(references))
    for sid in star_ids:
        sid = int(sid)
        observed = widths.get(str(sid), widths.get(sid))
        if (observed is not None and 0 <= sid < len(references)
                and np.isfinite(observed) and float(observed) > 0
                and np.isfinite(references[sid]) and references[sid] > 0):
            values.append(float(observed)/references[sid])
    if len(values) < min_stars:
        raise ValueError('Only %d/%d common stars remain (require >=%d)'
                         % (len(values), len(star_ids), min_stars))
    return scale*float(np.median(values)), len(values)


def rescore_stable_cohort(rows, reference_stars, min_stars=8):
    """Compare exactly the same source IDs at all positions of a fine scan.

    Star medians are formed from repeated frames at each position. A source
    missing from ANY position cannot influence ANY of the scores. This avoids
    sample-composition changes masquerading as optical focus changes.
    """
    if len(rows) < 5:
        raise ValueError('At least five valid fine positions required')
    ids = None
    for row in rows:
        if row is None:
            raise ValueError('A fine position has no valid stellar measurements')
        widths = row.get('per_star_median_sigma_px') or {}
        found = {int(k) for k,v in widths.items()
                 if np.isfinite(v) and float(v)>0}
        ids = found if ids is None else ids.intersection(found)
    ids = sorted(i for i in ids if 0 <= i < len(reference_stars))
    if len(ids) < min_stars:
        raise ValueError('Only %d stars are shared by all %d positions (require >=%d)'
                         % (len(ids),len(rows),min_stars))
    scored = []
    for row in rows:
        score,n = matched_cohort_score(row,reference_stars,ids,min_stars=min_stars)
        scored.append(dict(row, sigma_px=score, stable_cohort_count=n,
                           stable_cohort_star_ids=ids,
                           score_method='median per-star ratios for identical stars'))
    return scored,ids


def compare_bidirectional_fine(forward_batches, reverse_batches, reference_stars,
                               fine_step, min_stars=8):
    """Rescore and compare two independent visits to the SAME fine positions.

    Scores are based on one star cohort shared by both complete passes; no
    replacement stars are introduced between visits. No hardware access.
    The focus optimum is NOT accepted here. Caller must also check curvature,
    focus response, and a separate final verification exposure.
    """
    if fine_step <= 0:
        raise ValueError('Fine step must be positive')
    def index_pass(rows, name):
        items = list(rows)
        by_pos = {int(r['position']):r for r in items if r is not None}
        if len(by_pos) != len(items) or len(by_pos) < 5:
            raise ValueError(f'{name} scan has missing or duplicate focus positions')
        return by_pos
    fwd = index_pass(forward_batches, 'Forward')
    rev = index_pass(reverse_batches, 'Reverse')
    if set(fwd) != set(rev):
        raise ValueError('Forward and reverse scans must cover identical focus positions')
    positions = sorted(fwd)
    if any(b-a != fine_step for a,b in zip(positions, positions[1:])):
        raise ValueError('Fine focus positions must be evenly spaced')
    # Single cohort shared by every position AND both visits, not merely a
    # cohort within each pass. A disappearing star must not skew the comparison.
    matched_rows, star_ids = rescore_stable_cohort(
        [fwd[p] for p in positions] + [rev[p] for p in positions],
        reference_stars, min_stars=min_stars)
    size = len(positions)
    forward = [dict(r, stage='fine_forward') for r in matched_rows[:size]]
    reverse = [dict(r, stage='fine_reverse') for r in matched_rows[size:]]
    # Region curves are diagnostic, NOT alternative authorization to move the
    # motor. Use the same common IDs for every region at every position.
    # Current Colibri acquisitions are 2x2 binned 2048x2048.
    from PyFocusStarSelection import field_region
    regions = ('center','upper_left','upper_right','lower_left','lower_right')
    regional_ids = {name:[sid for sid in star_ids
                          if field_region(reference_stars[sid][0],
                                          reference_stars[sid][1],2048,2048)==name]
                    for name in regions}
    reference_scale = float(np.median([s[2] for s in reference_stars]))
    def region_scores(row):
        widths = row['per_star_median_sigma_px']
        return {name:(reference_scale*float(np.median([
                widths[str(sid)]/reference_stars[sid][2] for sid in ids]))
                if len(ids)>=2 else None)
                for name,ids in regional_ids.items()}
    for row in forward + reverse:
        row['region_scores_px']=region_scores(row)
    combined = []
    for a,b in zip(forward,reverse):
        # Retain a matched per-star median for downstream diagnostics. The score
        # itself is the equal-weight average of two cohort scores, not a median
        # of changing star subsets or a raw median across all star measurements.
        widths = {str(sid):float((a['per_star_median_sigma_px'][str(sid)] +
                                  b['per_star_median_sigma_px'][str(sid)])/2)
                  for sid in star_ids}
        score = (float(a['sigma_px'])+float(b['sigma_px']))/2
        combined.append({
            'position':a['position'], 'sigma_px':score,
            'sigma_mad_px':max(float(a.get('sigma_mad_px',0)),
                               float(b.get('sigma_mad_px',0))),
            'median_matched_stars':float(len(star_ids)),
            'stable_cohort_count':len(star_ids),
            'stable_cohort_star_ids':star_ids,
            'per_star_median_sigma_px':widths,
            'stage':'fine_combined',
            'forward_score_px':float(a['sigma_px']),
            'reverse_score_px':float(b['sigma_px']),
            'pass_difference_px':float(b['sigma_px']-a['sigma_px']),
            'score_method':'equal-weight average of forward/reverse fixed-star-cohort scores',
            'region_scores_px':{
                region:(float((a['region_scores_px'][region] +
                               b['region_scores_px'][region])/2)
                        if a['region_scores_px'][region] is not None and
                        b['region_scores_px'][region] is not None else None)
                for region in regions},
        })
    fv = np.asarray([r['sigma_px'] for r in forward],float)
    rv = np.asarray([r['sigma_px'] for r in reverse],float)
    diffs = rv-fv
    median_score = float(np.median(np.concatenate([fv,rv])))
    typical_mad = float(np.median([max(float(a.get('sigma_mad_px',0)),
                                        float(b.get('sigma_mad_px',0)))
                                    for a,b in zip(forward,reverse)]))
    median_offset = float(np.median(diffs))
    offset_corrected_rms = float(np.sqrt(np.mean((diffs-median_offset)**2)))
    best_fwd = int(positions[int(np.argmin(fv))])
    best_rev = int(positions[int(np.argmin(rv))])
    max_systematic = max(0.04*median_score, 2.0*typical_mad)
    max_residual = max(0.03*median_score, 2.0*typical_mad)
    # Prefer conservative rejection to an unstable focus solution. The two
    # sweeps can disagree about scatter at one frame and still be diagnostic.
    agreement = {
        'forward_best_position':best_fwd,
        'reverse_best_position':best_rev,
        'best_separation_steps':int(abs(best_fwd-best_rev)//fine_step),
        'median_reverse_minus_forward_px':median_offset,
        'offset_corrected_rms_px':offset_corrected_rms,
        'median_frame_mad_px':typical_mad,
        'max_offset_px':max_systematic,
        'max_residual_px':max_residual,
        'same_best_region':bool(abs(best_fwd-best_rev)<=fine_step),
        'offset_ok':bool(abs(median_offset)<=max_systematic),
        'shape_ok':bool(offset_corrected_rms<=max_residual),
        'shared_star_count':len(star_ids),
        'positions_compared':len(positions),
        'region_star_counts':{k:len(v) for k,v in regional_ids.items()},
        'approach_direction':'increasing final motor approach on BOTH passes',
        'pass_order':'forward ascending, reverse descending',
    }
    agreement['passed'] = bool(agreement['same_best_region'] and
                               agreement['offset_ok'] and agreement['shape_ok'])
    return combined,forward,reverse,star_ids,agreement

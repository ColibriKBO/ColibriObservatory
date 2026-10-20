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

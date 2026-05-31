"""Minimal field loader for the standalone scheduler.

Replaces the KBO-entangled `Sky` class from
Colibri_Simulations/src/models/sky.py with a tiny loader that produces the
field table shape the trimmed `Observatory` scheduler expects:

- `.fields`: Dict[int, dict], keyed by integer field id 0..N-1. Each field
  carries numpy arrays under GaiaDR3Keys.LON/LAT/MAG and FieldDataKeys.ANGSIZE,
  plus float FieldDataKeys.ELON_REG/ELAT_REG (the field-centre ecliptic
  coordinates derived from the CENTROID RA/Dec).
- `.centroids`: the raw CENTROID list (RA, Dec in degrees) so callers can emit
  per-field pointing.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any, Dict, Tuple

import numpy as np

from . import constants


def _icrs_to_geocentric_ecliptic(ra_deg: float, dec_deg: float) -> Tuple[float, float]:
    """Convert ICRS (RA, Dec) to geocentric true ecliptic lon/lat in degrees."""
    from astropy import units as u
    from astropy.coordinates import GeocentricTrueEcliptic, SkyCoord

    coord = SkyCoord(ra=ra_deg * u.degree, dec=dec_deg * u.degree, frame="icrs")
    ecliptic_coord = coord.transform_to(GeocentricTrueEcliptic())
    return float(ecliptic_coord.lon.degree), float(ecliptic_coord.lat.degree)


def load_fields(fields_file_loc: str) -> SimpleNamespace:
    """Load the fields JSON artifact into a scheduler-ready namespace.

    Returns a `SimpleNamespace` with `.fields` (Dict[int, dict]) and
    `.centroids` (the raw CENTROID list).
    """
    with open(fields_file_loc, "r") as f:
        fields_dict = json.load(f)

    centroids = fields_dict[constants.FieldDataKeys.COORD_STR_REG]
    star_fields_data = fields_dict[constants.FieldDataKeys.STAR_STR_REG]
    star_fields_data = {int(k): v for k, v in star_fields_data.items()}

    lon_key = constants.GaiaDR3Keys.LON
    lat_key = constants.GaiaDR3Keys.LAT
    mag_key = constants.GaiaDR3Keys.MAG
    angsize_key = constants.FieldDataKeys.ANGSIZE
    gid_key = constants.GaiaDR3Keys.GID
    field_table_keys = [lon_key, lat_key, mag_key, angsize_key]

    fields: Dict[int, Dict[str, Any]] = {}
    for field_id, table in star_fields_data.items():
        field: Dict[str, Any] = {}
        for key in field_table_keys:
            field[key] = np.asarray(table[key])
        if gid_key in table:
            field[gid_key] = np.asarray(table[gid_key])

        centroid = _lookup_centroid(centroids, field_id)
        ra_deg = float(centroid[0])
        dec_deg = float(centroid[1])
        elon_reg, elat_reg = _icrs_to_geocentric_ecliptic(ra_deg, dec_deg)
        field[constants.FieldDataKeys.ELON_REG] = elon_reg
        field[constants.FieldDataKeys.ELAT_REG] = elat_reg

        fields[int(field_id)] = field

    return SimpleNamespace(fields=fields, centroids=centroids)


def _lookup_centroid(field_centroids: Any, field_id: int):
    """Return (ra_deg, dec_deg) centroid for a field id (dict- or list-keyed)."""
    if isinstance(field_centroids, dict):
        if str(field_id) in field_centroids:
            return field_centroids[str(field_id)]
        if field_id in field_centroids:
            return field_centroids[field_id]
        raise KeyError(
            f"No centroid for field_id={field_id}. "
            f"Centroid keys example: {list(field_centroids)[:5]}"
        )
    if isinstance(field_centroids, (list, tuple, np.ndarray)):
        if 0 <= int(field_id) < len(field_centroids):
            return field_centroids[int(field_id)]
        raise IndexError(
            f"field_id={field_id} out of range for centroid list (len={len(field_centroids)})."
        )
    raise TypeError(
        f"Unsupported centroid container type: {type(field_centroids)!r}. "
        "Expected dict or list/tuple/ndarray."
    )

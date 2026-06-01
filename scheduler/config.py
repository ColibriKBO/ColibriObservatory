"""Standalone scheduler configuration.

Exposes the attribute names the trimmed `Observatory`/`Telescope` read, with
values copied from Colibri_Simulations/config/shared_simulation_configs.py
(Elginfield site + default radius extinctions). Sim-only weather knobs
(biweekly_transparencies / atmospheric_extinctions) are intentionally dropped.
"""

from __future__ import annotations

import os

import numpy as np

# Default per-radius distortion extinctions (mag), copied from
# shared_simulation_configs._DEFAULT_RADIUS_EXTINCTIONS.
_DEFAULT_RADIUS_EXTINCTIONS = (0, 0, 0, 0.01, 0.03, 0.09, 0.20, 0.34, 0.55, 0.73)

# Camera field of view (degrees).
_FOV_X = 1.43
_FOV_Y = 1.43


class SchedulerConfig:
    """Site + instrument config for the standalone scheduler."""

    def __init__(
        self,
        *,
        fps: int = 40,
        sensitivity_model_loc: str | None = None,
        radius_extinctions=_DEFAULT_RADIUS_EXTINCTIONS,
    ):
        # Observatory parameters (Elginfield)
        self.latitude = 43.192954   # degrees
        self.longitude = -81.3158   # degrees
        self.height = 325           # meters

        # Scheduling parameters
        self.altitude_threshold = 10    # degrees, minimum altitude for observation
        self.twilight_alt = -12         # degrees, sun altitude at end of twilight
        self.snr_threshold = 5          # minimum SNR for a detection
        self.mas_limit = 0.100          # angular-size limit (arcsec) for "optimal" counts
        self.snr_visibility_floor = 5.0  # SNR floor below which a star is not visible

        # Camera / instrumentation parameters
        self.fov_x = float(_FOV_X)
        self.fov_y = float(_FOV_Y)
        self.radius_extinctions = list(radius_extinctions)
        self.fps = int(fps)
        self.exposure_time = 1.0 / float(fps)
        # Diagonal half-FoV radius (degrees): sqrt((fov_x/2)^2 + (fov_y/2)^2).
        self.max_radius = float(np.sqrt((self.fov_x / 2) ** 2 + (self.fov_y / 2) ** 2))

        if sensitivity_model_loc is None:
            sensitivity_model_loc = os.path.join(
                os.path.dirname(os.path.abspath(__file__)), "sensitivity_models"
            )
        self.sensitivity_model_loc = str(sensitivity_model_loc)

"""Observatory model: site + telescope + observation scheduling.

Trimmed standalone version of Colibri_Simulations/src/models/observatory.py.
Keeps only the scheduling surface (field visibility, atmospheric correction,
SNR prediction via the HDF5 temporal-SNR model, and the consolidated
velocity/SNR scheduling score). All KBO/collision/GPU/simulation machinery and
the random-weather helpers have been removed.

Vendored dependencies (`constants`, `helpers`, `noise_model`) live alongside
this module so it imports with no `src.` package on the path.
"""

from __future__ import annotations

import copy
import math
from pathlib import Path
from typing import Any, Dict, Mapping, MutableMapping, Optional, Tuple

import numpy as np
import astropy.units as u
from astropy.coordinates import (
    AltAz,
    EarthLocation,
    FK5,
    GeocentricTrueEcliptic,
    SkyCoord,
    get_body,
    get_sun,
)

from . import constants, helpers
from .noise_model import ColibriNoiseModel


class Observatory:
    """Observatory abstraction for field scheduling."""

    # Heuristic scheduling constants (kept local to avoid config churn)
    _MOON_EXCLUSION_DEG = 15.0
    _MAG_THRESHOLD = 13.3  # legacy limiting mag, retained for the star-count factor
    _SNR_VISIBILITY_THRESHOLD = 5.0
    _REFERENCE_NYQUIST_FRAMERATE = 40.0
    _SUPPORTED_SCHEDULING_FRAMERATES = frozenset({5, 10, 20, 30, 40})

    def __init__(self, config):
        """Create an Observatory for scheduling."""
        self.config = config
        self.location = EarthLocation(lat=config.latitude, lon=config.longitude, height=config.height)
        self.utc_offset = -5 * u.hour
        self.telescope = self.Telescope(self.config)

    @staticmethod
    def _filter_dict_arrays_inplace(table: MutableMapping[Any, Any], mask: np.ndarray) -> None:
        """Apply a boolean mask to all numpy-array values in `table` in-place."""
        for key, value in list(table.items()):
            if isinstance(value, np.ndarray):
                table[key] = value[mask]

    def _field_hour_angle(self, obstime, ecl_lon_deg: float, ecl_lat_deg: float) -> float:
        """Compute hour angle (hours) for a field centroid at `obstime`."""
        lst_hours = obstime.sidereal_time('mean', self.location.lon).value
        top_ecliptic = SkyCoord(ecl_lon_deg, ecl_lat_deg, frame='geocentrictrueecliptic', unit=(u.deg, u.deg))
        top_fk5 = top_ecliptic.transform_to(FK5)
        top_ra_hours = top_fk5.ra.deg / 15.0
        return round(lst_hours - top_ra_hours, 3)

    def _validate_scheduling_framerate(self, framerate: Optional[int]) -> float:
        """Validate and normalize the framerate used by scheduling."""
        if framerate is None:
            raise ValueError("`framerate` is required for scheduling score computation.")

        framerate_value = float(framerate)
        if framerate_value not in self._SUPPORTED_SCHEDULING_FRAMERATES:
            raise ValueError(
                f"Framerate {framerate} not supported. "
                f"Supported framerates are {sorted(self._SUPPORTED_SCHEDULING_FRAMERATES)}."
            )

        return framerate_value

    @staticmethod
    def _elongation_from_opposition_distance(distance_from_opposition_deg: float) -> float:
        """Map distance from opposition (deg) to physical solar elongation (deg)."""
        return 180.0 - abs(float(distance_from_opposition_deg))

    def _target_velocity_for_framerate(self, framerate: float) -> float:
        """Return target transverse velocity (m/s) associated with `framerate`."""
        v180 = abs(helpers.get_transverse_velocity(40, 180.0))
        return v180 * (float(framerate) / self._REFERENCE_NYQUIST_FRAMERATE)

    def _consolidated_scheduling_score(self, nstars: int, solar_elongation_deg: float, framerate: float) -> float:
        """Unified score for all framerates in distance-from-opposition space.

        Score model:
            S = N_* * v(e) * min(1, (v0 / v(e))^2)
        where:
            e  = 180 - |180 - solar_elongation|
            v0 = target velocity for the selected framerate.
        """
        if nstars <= 0:
            return 0.0

        opposition_distance = abs(float(solar_elongation_deg) - 180.0)
        effective_elongation = self._elongation_from_opposition_distance(opposition_distance)

        field_velocity = abs(helpers.get_transverse_velocity(40, effective_elongation))
        if field_velocity <= 0.0:
            return 0.0

        target_velocity = self._target_velocity_for_framerate(framerate) # velocity at which we can Nyquist sample the event (anchored to the 40 Hz / 180 deg case)
        velocity_factor = min(1.0, (target_velocity / field_velocity) ** 2) # detection efficiency factor given the field velocity and the Nyquist velocity for the framerate
        return float(nstars) * field_velocity * velocity_factor

    def _visible_field_mask(self, observation_start, observation_end, sky) -> Tuple[np.ndarray, np.ndarray]:
        """Return (mask, mean_altitudes_deg) for fields visible over an interval."""
        fields_altaz_start = self.get_field_altaz(observation_start, sky)
        fields_altaz_end = self.get_field_altaz(observation_end, sky)

        altitudes_start = fields_altaz_start.alt.deg
        altitudes_end = fields_altaz_end.alt.deg
        mean_altitudes = (altitudes_start + altitudes_end) / 2.0

        above_horizon_start = altitudes_start > self.config.altitude_threshold
        above_horizon_end = altitudes_end > self.config.altitude_threshold
        above_horizon = above_horizon_start & above_horizon_end

        moon_coord = get_body('moon', observation_start, location=self.location)
        moon_altaz = moon_coord.transform_to(AltAz(obstime=observation_start, location=self.location))
        moon_sep = fields_altaz_start.separation(moon_altaz).deg
        moon_distances = moon_sep > self._MOON_EXCLUSION_DEG

        return above_horizon & moon_distances, mean_altitudes

    def _score_field(self, field: MutableMapping[Any, Any], *, observation_start, framerate: Optional[int]) -> None:
        """Compute per-field diagnostic stats and `OBSERVATION_SCORE` in-place."""
        framerate = self._validate_scheduling_framerate(framerate)

        # SNR prediction (noise-free). Stored under both keys for backward compatibility.
        snr_pred = self.telescope.predict_SNR(field, framerate=framerate)
        field[constants.FieldDataKeys.SNR] = snr_pred  # legacy, not used anymore
        field[constants.FieldDataKeys.PREDICTED_SNR] = snr_pred

        field['COUNT_BELOW_MAG_THRESHOLD'] = int(np.sum(field[constants.GaiaDR3Keys.MAG] < self._MAG_THRESHOLD))
        field['COUNT_ABOVE_5'] = int(np.sum(field[constants.FieldDataKeys.SNR] > self._SNR_VISIBILITY_THRESHOLD))
        field['PREDICTED_COUNT_ABOVE_5'] = int(np.sum(field[constants.FieldDataKeys.PREDICTED_SNR] > self._SNR_VISIBILITY_THRESHOLD))

        degree_limit = self.config.mas_limit / 3600.0
        filtered_stars = np.where(field[constants.FieldDataKeys.ANGSIZE] < degree_limit)

        field['COUNT_ABOVE_OPTIMAL'] = int(
            np.sum(field[constants.FieldDataKeys.SNR][filtered_stars] > self.config.snr_threshold)
        )
        field['PREDICTED_COUNT_ABOVE_OPTIMAL'] = int(
            np.sum(field[constants.FieldDataKeys.PREDICTED_SNR][filtered_stars] > self.config.snr_threshold)
        )

        # Solar elongation (0-180 deg)
        field_ecl = SkyCoord(
            lon=field[constants.FieldDataKeys.ELON_REG] * u.deg,
            lat=field[constants.FieldDataKeys.ELAT_REG] * u.deg,
            frame=GeocentricTrueEcliptic(obstime=observation_start),
        )
        sun_ecl = get_sun(observation_start).transform_to(GeocentricTrueEcliptic(obstime=observation_start))
        field['SOLAR_ELONGATION'] = field_ecl.separation(sun_ecl).deg
        field['DISTANCE_FROM_OPPOSITION'] = abs(field['SOLAR_ELONGATION'] - 180.0)
        field['OBSERVATION_SCORE'] = self._consolidated_scheduling_score(
            field['COUNT_ABOVE_5'], # NOT the same as sim, which uses count below mag threshold. Count below mag threshold doesn't account for extinction due to airmass. We make that concession in the simulation to have a more tractable scheduler when comparing across sims.
            field['SOLAR_ELONGATION'],
            framerate,
        )

    class Telescope:
        """Instrument model for converting stellar magnitudes to SNR."""

        def __init__(self, config):
            """Initialize telescope instrumentation from config."""
            self.config = config
            self._noise_model = None
            self.load_model()

        def load_model(self):
            """Load the HDF5 temporal-SNR noise model.

            `config.sensitivity_model_loc` may be a folder containing
            `temporal_snr_models.h5`, or a direct path to that `.h5` file.
            """
            model_loc = str(self.config.sensitivity_model_loc)
            p = Path(model_loc)
            model_folder = str(p.parent if p.suffix.lower() == '.h5' else p)
            self._noise_model = ColibriNoiseModel(model_folder)

        def _cadence_ms(self, *, framerate: Optional[float] = None) -> float:
            """Return cadence (ms) for the noise-model bundle.

            Preference order: explicit `framerate`, then `config.fps`, then
            `config.exposure_time` (seconds).
            """
            if framerate is None:
                fps = getattr(self.config, 'fps', None)
                if fps is not None:
                    framerate = float(fps)
            if framerate is not None:
                if framerate <= 0:
                    raise ValueError(f"Invalid framerate: {framerate}")
                return 1000.0 / float(framerate)

            exposure_time = getattr(self.config, 'exposure_time', None)
            if exposure_time is not None:
                exposure_time = float(exposure_time)
                if exposure_time <= 0:
                    raise ValueError(f"Invalid exposure_time: {exposure_time}")
                return 1000.0 * exposure_time

            raise ValueError(
                "HDF5 noise models require cadence; provide `framerate=` or set "
                "`config.fps` (or `config.exposure_time`)."
            )

        def calculate_SNR(
            self,
            field: Mapping[Any, Any],
            add_noise: bool = True,
            framerate: Optional[float] = None,
        ) -> np.ndarray:
            """Calculate per-star SNR for a field using the HDF5 noise model."""
            snr_visibility_floor = float(getattr(self.config, 'snr_visibility_floor', 5.0))

            if self._noise_model is None:
                raise RuntimeError('HDF5 noise-model backend not initialized')

            airmass = float(field[constants.FieldDataKeys.AIRMASS_REG])
            gmags = field[constants.GaiaDR3Keys.MAG]
            cadence_ms = self._cadence_ms(framerate=framerate)

            if not add_noise:
                out = self._noise_model.predict(gmag=gmags, airmass=airmass, cadence_ms=cadence_ms, return_uncertainty=False)
                return np.asarray(out['temporal_snr'], dtype=float)

            out = self._noise_model.predict(gmag=gmags, airmass=airmass, cadence_ms=cadence_ms, return_uncertainty=True)
            snr_pred = np.asarray(out['temporal_snr'], dtype=float)
            snr_std = np.asarray(out['temporal_snr_std'], dtype=float)
            noise = np.random.normal(0.0, snr_std, size=snr_pred.shape)
            snr_noisy = np.clip(snr_pred + noise, 0.01, None)
            return np.where(snr_pred < snr_visibility_floor, 0.0, snr_noisy)

        def predict_SNR(self, field: Mapping[Any, Any], framerate: Optional[float] = None) -> np.ndarray:
            """Noise-free SNR prediction (used for scheduling)."""
            return self.calculate_SNR(field, add_noise=False, framerate=framerate)

    def schedule_observation(self, sky, observation_start, observation_end, weather, framerate=None):
        """Choose the best field to observe over a time interval.

        Selects among visible fields (altitude cut + Moon exclusion), applies
        atmospheric corrections, predicts SNR, computes heuristic scores, and
        returns the top field plus diagnostic stats.
        """

        fields = copy.deepcopy(sky.fields)

        visible_mask, mean_altitudes = self._visible_field_mask(observation_start, observation_end, sky)
        visible_fields = {key: fields[key] for key in fields if visible_mask[key]}

        if not visible_fields:
            raise ValueError("No visible fields found for this time window (altitude cut + Moon exclusion).")

        for key in visible_fields.keys():
            visible_fields[key][constants.FieldDataKeys.ALTITUDE_REG] = mean_altitudes[key]

        corrected_visible_fields: Dict[Any, MutableMapping[Any, Any]] = {}
        for field_key in visible_fields:
            corrected_visible_fields[field_key] = self.correct_field(
                visible_fields[field_key], weather, mean_altitudes[field_key]
            )

        for field_key in corrected_visible_fields:
            self._score_field(corrected_visible_fields[field_key], observation_start=observation_start, framerate=framerate)

        # Find the field with the maximum OBSERVATION_SCORE, treating score==0 as excluded.
        eligible_keys = [
            k
            for k, f in corrected_visible_fields.items()
            if float(f.get('OBSERVATION_SCORE', 0.0)) > 0.0
        ]

        if not eligible_keys:
            # Failure diagnostics: show stats for the *visible* fields (altitude cut + Moon exclusion).
            visible_keys = list(corrected_visible_fields.keys())
            max_fields_to_print = 60

            def _safe_float(value: Any) -> float:
                try:
                    return float(value)
                except Exception:
                    return float('nan')

            def _min_med_max(arr: np.ndarray) -> str:
                finite = arr[np.isfinite(arr)]
                if finite.size == 0:
                    return 'n/a'
                return f"{np.min(finite):.2f}/{np.median(finite):.2f}/{np.max(finite):.2f}"

            scores = np.array([
                _safe_float(corrected_visible_fields[k].get('OBSERVATION_SCORE', 0.0)) for k in visible_keys
            ])
            elongs = np.array([
                _safe_float(corrected_visible_fields[k].get('SOLAR_ELONGATION', float('nan'))) for k in visible_keys
            ])
            alts = np.array([
                _safe_float(corrected_visible_fields[k].get(constants.FieldDataKeys.ALTITUDE_REG, float('nan')))
                for k in visible_keys
            ])

            header = (
                "[schedule_observation] No eligible fields (OBSERVATION_SCORE > 0). "
                f"time={getattr(observation_start, 'iso', observation_start)}, framerate={framerate}, "
                f"visible_fields={len(visible_keys)}, altitude_threshold={float(self.config.altitude_threshold):g}, "
                f"moon_exclusion_deg={self._MOON_EXCLUSION_DEG:g}"
            )
            summary = (
                f"  solar_elong(min/med/max)={_min_med_max(elongs)}  "
                f"alt(mean,min/med/max)={_min_med_max(alts)}  "
                f"score(min/med/max)={_min_med_max(scores)}"
            )
            print(header)
            print(summary)
            print("  Visible fields (post-correction/scoring):")
            print("    key  alt_deg  solar_elong_deg  score  Nmag<thresh  N>SNR5  N>optimal")

            sorted_keys = sorted(
                visible_keys,
                key=lambda k: _safe_float(corrected_visible_fields[k].get('SOLAR_ELONGATION', float('nan'))),
            )

            truncated = False
            if len(sorted_keys) > max_fields_to_print:
                truncated = True
                sorted_keys = sorted_keys[:max_fields_to_print]

            for k in sorted_keys:
                f = corrected_visible_fields[k]
                alt = _safe_float(f.get(constants.FieldDataKeys.ALTITUDE_REG, float('nan')))
                elong = _safe_float(f.get('SOLAR_ELONGATION', float('nan')))
                score = _safe_float(f.get('OBSERVATION_SCORE', 0.0))
                nmag = f.get('COUNT_BELOW_MAG_THRESHOLD', 'n/a')
                n5 = f.get('COUNT_ABOVE_5', 'n/a')
                nopt = f.get('COUNT_ABOVE_OPTIMAL', 'n/a')
                print(f"    {k:>3}  {alt:>7.2f}  {elong:>14.2f}  {score:>5.2f}  {str(nmag):>10}  {str(n5):>6}  {str(nopt):>9}")

            if truncated:
                print(f"    ... (truncated; printed first {max_fields_to_print} of {len(visible_keys)} visible fields)")

            raise ValueError(
                "No fields with sufficient observation score found (all visible fields have OBSERVATION_SCORE <= 0). "
                "See printed visible-field diagnostics above."
            )

        top_field_key = max(eligible_keys, key=lambda k: corrected_visible_fields[k]['OBSERVATION_SCORE'])
        top_field = corrected_visible_fields[top_field_key]

        visible_stars_mask = top_field[constants.FieldDataKeys.SNR] > self._SNR_VISIBILITY_THRESHOLD
        self._filter_dict_arrays_inplace(top_field, visible_stars_mask)

        top_ecl_lon = float(top_field[constants.FieldDataKeys.ELON_REG])
        top_ecl_lat = float(top_field[constants.FieldDataKeys.ELAT_REG])
        top_ha = self._field_hour_angle(observation_start, top_ecl_lon, top_ecl_lat)

        top_field_stats = {
            'Time': observation_start,
            'Field': top_field_key,
            'Nstars > 5': top_field['COUNT_ABOVE_5'],
            'Predicted Nstars > 5': top_field['PREDICTED_COUNT_ABOVE_5'],
            'Nstars > Optimal SNR': top_field['COUNT_ABOVE_OPTIMAL'],
            'Predicted Nstars > Optimal SNR': top_field['PREDICTED_COUNT_ABOVE_OPTIMAL'],
            'Altitude': top_field[constants.FieldDataKeys.ALTITUDE_REG],
            'Hour Angle': top_ha,
            'Extinction': weather,
            'Observation Score': top_field['OBSERVATION_SCORE'],
            'Solar Elongation': top_field['SOLAR_ELONGATION'],
            'AIRMASS': top_field.get(constants.FieldDataKeys.AIRMASS_REG),
        }

        return top_field, top_field_stats

    def get_observable_hours(self, date):
        """Return the observable hours and (sunset, sunrise) for a given date."""
        delta_midnight = np.linspace(-12, 12, 1000) * u.hour
        times = date + delta_midnight - self.utc_offset + 1
        frame = AltAz(obstime=times, location=self.location)

        sun_altaz = get_sun(times).transform_to(frame)
        sun_altitudes = sun_altaz.alt

        twilight_altitude = self.config.twilight_alt * u.deg
        sunset_idx = np.where(sun_altitudes < twilight_altitude)[0][0]
        sunrise_idx = np.where(sun_altitudes < twilight_altitude)[0][-1]
        sunset_time = times[sunset_idx]
        sunrise_time = times[sunrise_idx]
        hours_per_night = (sunrise_time - sunset_time).to(u.hour).value
        return hours_per_night, sunset_time, sunrise_time

    def get_observation_periods(self, date):
        """Split the night into observation periods (hour chunks + remainder)."""
        hours_per_night, sunset_time, sunrise_time = self.get_observable_hours(date)
        full_hours = math.floor(hours_per_night)
        partial_hours = hours_per_night - full_hours
        observation_periods = list(range(full_hours))

        observation_start = [sunset_time + period * u.hour for period in observation_periods]
        observation_end = [sunset_time + (period + 1) * u.hour for period in observation_periods]
        observation_periods = list(zip(observation_start, observation_end))

        if partial_hours > 0:
            observation_periods.append((observation_periods[-1][1], observation_periods[-1][1] + partial_hours * u.hour))

        return observation_periods

    def get_field_altaz(self, time, sky):
        """Return AltAz coordinates for each field centroid at `time`."""
        elons = [sky.fields[key][constants.FieldDataKeys.ELON_REG] for key in sky.fields]
        elats = [sky.fields[key][constants.FieldDataKeys.ELAT_REG] for key in sky.fields]
        coords = SkyCoord(elons, elats, frame='geocentrictrueecliptic', unit=(u.deg, u.deg))

        altaz = coords.transform_to(AltAz(obstime=time, location=self.location))
        return altaz

    def correct_field(self, field, weather, altitude):
        """Correct field magnitudes for atmospheric extinction and distortion."""
        corrected_field = field.copy()

        # zenith angle
        corrected_field[constants.FieldDataKeys.ZENITH_REG] = 90. - altitude

        # airmass and atmospheric extinction
        corrected_field[constants.FieldDataKeys.AIRMASS_REG] = 1 / np.cos(np.radians(corrected_field[constants.FieldDataKeys.ZENITH_REG]))
        corrected_field[constants.GaiaDR3Keys.MAG] += weather * corrected_field[constants.FieldDataKeys.AIRMASS_REG]

        # distortion extinction
        field_centroid_lon = corrected_field[constants.FieldDataKeys.ELON_REG]
        field_centroid_lat = corrected_field[constants.FieldDataKeys.ELAT_REG]

        star_lons = corrected_field[constants.GaiaDR3Keys.LON]
        star_lats = corrected_field[constants.GaiaDR3Keys.LAT]

        star_lat_distances = star_lats - field_centroid_lat
        star_lon_distances = (star_lons - field_centroid_lon) * math.cos(math.radians(field_centroid_lat))

        star_total_distances = np.sqrt((star_lat_distances ** 2) + (star_lon_distances ** 2))

        radii = np.linspace(0, self.config.max_radius, 11)[1:]  # evenly spaced radii
        radius_extinctions_differences = [round(self.config.radius_extinctions[x] - self.config.radius_extinctions[x - 1], 2) for x in range(1, 10)]

        stellar_extinctions = np.zeros(len(star_total_distances))
        for j in range(len(radii) - 1):
            stellar_extinctions[star_total_distances > radii[j]] += radius_extinctions_differences[j]

        corrected_field[constants.GaiaDR3Keys.MAG] += stellar_extinctions

        return corrected_field

"""Observatory model: site + telescope + observation scheduling.

This module defines :class:`~src.models.observatory.Observatory`, which:

- Stores site and instrument parameters (via the passed `config`).
- Schedules the best field to observe over a time window.
- Simulates observing a field and returns occultation events.

Notes
-----
- The public API of :class:`Observatory` is used by the simulation driver.
    Refactors here aim to preserve behaviour while improving readability.
- This file intentionally avoids introducing new package structure; many
    scripts run from repo root and rely on `import src...`.
"""

from __future__ import annotations

import copy
import math
import os
import pickle
from pathlib import Path
from typing import Any, Dict, Iterable, Mapping, MutableMapping, Optional, Sequence, Tuple

import numpy as np
import astropy.units as u
from astropy.coordinates import (
        AltAz,
        CartesianDifferential,
        CartesianRepresentation,
        EarthLocation,
        FK5,
        GeocentricMeanEcliptic,
        GeocentricTrueEcliptic,
        SkyCoord,
        get_body_barycentric_posvel,
        get_moon,
        get_sun,
)


class Observatory:
    """Observatory abstraction for the simulation.

    Parameters
    ----------
    config
        An `ObservatoryConfig` instance (see config modules). Required fields used
        here include lat/lon/height, extinction/distortion params, and the
        sensitivity model path.

    Attributes
    ----------
    use_gpu_collisions
        Runtime toggle to enable the optional GPU collision workflow.
    """

    # Heuristic scheduling constants (kept local to avoid config churn)
    _MOON_EXCLUSION_DEG = 15.0
    _MAG_THRESHOLD = 13.3 # set as limiting mag for the 20 hz operating mode, no longer used because we have the SNR model
    _SNR_VISIBILITY_THRESHOLD = 5.0
    _REFERENCE_NYQUIST_FRAMERATE = 40.0
    _SUPPORTED_SCHEDULING_FRAMERATES = frozenset({5, 10, 20, 30, 40})

    def __init__(self, config):
        """Create an Observatory for a simulation run."""
        self.config = config
        self.location = EarthLocation(lat=config.latitude, lon=config.longitude, height=config.height)
        self.utc_offset = -5 * u.hour
        self.telescope = self.Telescope(self.config)

        # Runtime flags/logging for optional GPU collision workflow
        self.use_gpu_collisions = False
        self._gpu_collision_log_once = False
        self._gpu_collision_fallback_log_once = False
    @staticmethod
    def _filter_dict_arrays_inplace(table: MutableMapping[Any, Any], mask: np.ndarray) -> None:
        """Apply a boolean mask to all numpy-array values in `table` in-place."""
        for key, value in list(table.items()):
            if isinstance(value, np.ndarray):
                table[key] = value[mask]


    def _log_once(self, attr_name: str, message: str) -> None:
        """Print `message` once per instance, keyed by `attr_name`."""
        if not getattr(self, attr_name, False):
            setattr(self, attr_name, True)
            print(message)


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

        target_velocity = self._target_velocity_for_framerate(framerate)
        velocity_factor = min(1.0, (target_velocity / field_velocity) ** 2)
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

        moon_coord = get_moon(observation_start, location=self.location)
        moon_altaz = moon_coord.transform_to(AltAz(obstime=observation_start, location=self.location))
        moon_sep = fields_altaz_start.separation(moon_altaz).deg
        moon_distances = moon_sep > self._MOON_EXCLUSION_DEG

        return above_horizon & moon_distances, mean_altitudes


    def _score_field(self, field: MutableMapping[Any, Any], *, observation_start, framerate: Optional[int]) -> None:
        """Compute per-field diagnostic stats and `OBSERVATION_SCORE` in-place."""
        framerate = self._validate_scheduling_framerate(framerate)

        # SNR prediction (noise-free). Stored under both keys for backward compatibility.
        snr_pred = self.telescope.predict_SNR(field, framerate=framerate)
        field[constants.FieldDataKeys.SNR] = snr_pred #TODO legacy, not used anymore
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
            field['COUNT_BELOW_MAG_THRESHOLD'],
            field['SOLAR_ELONGATION'],
            framerate,
        )

    class Telescope:
        """Instrument model for converting stellar magnitudes to SNR."""

        def __init__(self, config):
            """Initialize telescope instrumentation from config."""
            self.config = config
            # Backends:
            # - legacy pickle SNR models: `sensitivity_model/models/<fps>/snr_model.pkl`
            # - new HDF5 noise-property bundle: `sensitivity_model_new/*.h5`
            self._snr_backend: str = 'h5'  # 'pickle' | 'h5'
            self.SNR_model = None
            self._noise_model = None
            self.SNR_model = self.load_model()


        def load_model(self):
            """Load either the legacy pickled SNR model or the new HDF5 noise models.

            `config.sensitivity_model_loc` may be:
            - path to a legacy `snr_model.pkl`, or
            - a folder containing `temporal_snr_models.h5`, `skew_models.h5`,
              `kurtosis_models.h5`, and `power_law_models.h5`, or
            - a path to any one of those `.h5` files.
            """
            model_loc = str(self.config.sensitivity_model_loc)
            if model_loc.lower().endswith('.pkl'):
                self._snr_backend = 'pickle'
                with open(model_loc, 'rb') as file:
                    return pickle.load(file)

            # HDF5 bundle (new noise models)
            self._snr_backend = 'h5'
            # Accept either a folder or a direct .h5 path
            p = Path(model_loc)
            model_folder = str(p.parent if p.suffix.lower() == '.h5' else p)

            from src.sso_detection.noiseModel import ColibriNoiseModel

            self._noise_model = ColibriNoiseModel(model_folder)
            return None


        def _cadence_ms(self, *, framerate: Optional[float] = None) -> float:
            """Return cadence (ms) for the noise-model bundle.

            Preference order:
            1) explicit `framerate`
            2) `config.fps`
            3) `config.exposure_time` (seconds)
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
                "HDF5 noise models require cadence; provide `framerate=` or set `config.fps` (or `config.exposure_time`)."
            )
            

        @staticmethod
        def _piecewise_linear(x: np.ndarray, x0: float, y0: float, k1: float, k2: float) -> np.ndarray:
            """Piecewise-linear response used by the empirical SNR model."""
            return np.piecewise(x, [x < x0], [lambda x: y0, lambda x: y0 + k2 * (x - x0)])


        def calculate_SNR(
            self,
            field: Mapping[Any, Any],
            add_noise: bool = True,
            framerate: Optional[float] = None,
        ) -> np.ndarray:
            """Calculate per-star SNR for a field.

            Parameters
            ----------
            field
                Field dict containing at minimum `AIRMASS_REG` and Gaia magnitudes.
            add_noise
                When True, add Gaussian noise based on model residuals.
            """

            snr_visibility_floor = float(getattr(self.config, 'snr_visibility_floor', 5.0))
            
            # New backend: HDF5 noise-property bundle
            if self._snr_backend == 'h5':
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

            # Legacy backend: pickled piecewise SNR model
            airmass = field[constants.FieldDataKeys.AIRMASS_REG]
            gmags = field[constants.GaiaDR3Keys.MAG]

            models = self.SNR_model['models']
            std_devs_flat = self.SNR_model['std_devs_flat']
            std_devs_linear = self.SNR_model['std_devs_linear']
            
            airmass_values = np.array(list(models.keys()))
            params_values = np.array([models[a][0] for a in airmass_values])
            std_devs_flat_values = np.array([std_devs_flat[a] for a in airmass_values])
            std_devs_linear_values = np.array([std_devs_linear[a] for a in airmass_values])

            try:
                interpolated_params = [
                    interp1d(airmass_values, params_values[:, i], kind='linear')(airmass)
                    for i in range(params_values.shape[1])
                ]
            except Exception:
                return np.zeros_like(gmags)
                
            snr_pred = self._piecewise_linear(gmags, *interpolated_params)

            if not add_noise:
                return snr_pred

            snr = np.array(snr_pred, copy=True)

            if np.any(gmags < interpolated_params[0]):
                std_dev = interp1d(airmass_values, std_devs_flat_values, kind='linear')(airmass)
            else:
                std_dev = interp1d(airmass_values, std_devs_linear_values, kind='linear')(airmass)
            noise = np.random.normal(0, std_dev, size=snr.shape)
            snr = np.clip(snr + noise, 0.01, None)

            return np.where(snr_pred < snr_visibility_floor, 0.0, snr)
    

        def predict_SNR(self, field: Mapping[Any, Any], framerate: Optional[float] = None) -> np.ndarray:
            """Noise-free SNR prediction (used for scheduling)."""
            return self.calculate_SNR(field, add_noise=False, framerate=framerate)


    def schedule_observation(self, sky, observation_start, observation_end, weather, framerate=None):
        """Choose the best field to observe over a time interval.

        This selects among visible fields (altitude cut + Moon exclusion), applies
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
            # This prints a compact per-field summary to the log, then raises.

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

            # Sort by solar elongation for readability in logs.
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
                # print(f"    {k:>3}  {alt:>7.2f}  {elong:>14.2f}  {score:>5.2f}  {str(n5):>6}  {str(nopt):>9}")

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
        }

        return top_field, top_field_stats



    def get_observable_hours(self, date):
        """Return the observable hours and (sunset, sunrise) for a given date."""
        delta_midnight = np.linspace(-12, 12, 1000) * u.hour
        times = date + delta_midnight - self.utc_offset + 1
        frame = AltAz(obstime=times, location=self.location)

        # Get the Sun's position
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

        # Convert to AltAz frame
        altaz = coords.transform_to(AltAz(obstime=time, location=self.location))
        return altaz
    

    def _observe_field_gpu(self, field, kbos, time):
        """GPU collision workflow with CPU-equivalent verification.

        Uses the GPU for coarse AABB candidate generation, then applies the
        same Shapely verification/context path used by the CPU workflow so
        outputs match exactly for reproducibility.
        """
        import src.collisions_gpu as coll_gpu

        kbo_bounds = coll_gpu.gpu_vectorize_kbos(kbos, verbose=False)
        star_bounds, star_indices = coll_gpu.gpu_add_geometry(
            field,
            x=constants.GaiaDR3Keys.LON,
            y=constants.GaiaDR3Keys.LAT,
            d=constants.FieldDataKeys.ANGSIZE,
            verbose=False,
        )

        star_ids, kbo_ids = coll_gpu.gpu_candidate_collisions(
            star_bounds,
            kbo_bounds,
            star_indices=star_indices,
            report_timings=False,
        )

        if len(star_ids) == 0:
            return None

        # Ensure stellar geometry exists for Shapely verification.
        field = coll.add_geometry(
            field,
            x=constants.GaiaDR3Keys.LON,
            y=constants.GaiaDR3Keys.LAT,
            d=constants.FieldDataKeys.ANGSIZE,
        )

        # Build the canonical events structure expected by verify/include_context.
        # CPU path gets this from locate_collisions(); here we mirror it directly.
        events = coll._new_events_dict()
        events[coll.starID] = [int(x) for x in star_ids]
        events[coll.kboID] = [int(x) for x in kbo_ids]
        events[coll.colltype] = [coll.AREA_COARSE for _ in range(len(star_ids))]

        # CPU flow initializes these in vectorize_kbos_coarse before calling
        # vectorize_kbos_shapely. In GPU flow we skip coarse CPU vectorization,
        # so initialize them here to avoid KeyError on first assignment.
        n_kbos = int(kbos[constants.KBODataKeys.NOBJ])
        if coll.startcoords not in kbos:
            kbos[coll.startcoords] = [None for _ in range(n_kbos)]
        if coll.recpol not in kbos:
            kbos[coll.recpol] = [None for _ in range(n_kbos)]
        if coll.endcoords not in kbos:
            kbos[coll.endcoords] = [None for _ in range(n_kbos)]

        shapely_kbos = coll.vectorize_kbos_shapely(kbos, events)
        verified_events = coll.verify_detections(field, shapely_kbos, events)

        if len(verified_events[coll.starID]) == 0:
            return None

        print(f"Verified {len(verified_events[coll.starID])} occultations at time {time.iso}")
        return coll.include_context(shapely_kbos, field, verified_events, time)


    def _observe_field_cpu(self, field, kbos, time):
        """CPU workflow: R-tree coarse candidates + Shapely verification."""
        kbo_collisional_model = coll.vectorize_kbos_coarse(kbos)
        events = coll.locate_collisions(field, kbo_collisional_model)

        if len(events[coll.starID]) == 0:
            return None

        shapely_kbos = coll.vectorize_kbos_shapely(kbos, events)
        verified_events = coll.verify_detections(field, shapely_kbos, events)

        if len(verified_events[coll.starID]) == 0:
            return None

        print(f"Verified {len(verified_events[coll.starID])} occultations at time {time.iso}")
        return coll.include_context(shapely_kbos, field, verified_events, time)


    def _observe_field_compare(self, field, kbos, time):
        """Run BOTH CPU and GPU collision workflows and log any differences.

        Returns the CPU result (the reference implementation).
        """
        import src.collisions_gpu as coll_gpu

        # --- GPU AABB candidates ---
        kbo_bounds_gpu = coll_gpu.gpu_vectorize_kbos(kbos, verbose=False)
        star_bounds_gpu, star_indices_gpu = coll_gpu.gpu_add_geometry(
            field,
            x=constants.GaiaDR3Keys.LON,
            y=constants.GaiaDR3Keys.LAT,
            d=constants.FieldDataKeys.ANGSIZE,
            verbose=False,
        )
        gpu_star_ids, gpu_kbo_ids = coll_gpu.gpu_candidate_collisions(
            star_bounds_gpu, kbo_bounds_gpu,
            star_indices=star_indices_gpu,
            report_timings=False,
        )
        gpu_aabb_pairs = set(zip([int(x) for x in gpu_star_ids],
                                 [int(x) for x in gpu_kbo_ids]))

        # Optional array dump for offline replay/debugging.
        # Disabled by default to keep compare-mode logs focused on diffs.
        dump_arrays = os.environ.get("COLIBRI_COMPARE_DUMP_ARRAYS", "0") == "1"
        if dump_arrays:
            _sb = star_bounds_gpu.get() if hasattr(star_bounds_gpu, 'get') else np.asarray(star_bounds_gpu)
            _kb = kbo_bounds_gpu.get() if hasattr(kbo_bounds_gpu, 'get') else np.asarray(kbo_bounds_gpu)
            _si = star_indices_gpu.get() if hasattr(star_indices_gpu, 'get') else np.asarray(star_indices_gpu)
            np.savez_compressed('/tmp/_compare_arrays.npz',
                                star_bounds=_sb, kbo_bounds=_kb, star_indices=_si)
            print(f"[COMPARE] Saved arrays: stars={_sb.shape} kbos={_kb.shape} indices={_si.shape}")

        # --- CPU AABB candidates ---
        kbo_collisional_model = coll.vectorize_kbos_coarse(kbos)
        cpu_events = coll.locate_collisions(field, kbo_collisional_model)
        cpu_aabb_pairs = set(zip(cpu_events[coll.starID], cpu_events[coll.kboID]))

        # --- Compare AABB stages ---
        only_cpu_aabb = cpu_aabb_pairs - gpu_aabb_pairs
        only_gpu_aabb = gpu_aabb_pairs - cpu_aabb_pairs
        if only_cpu_aabb or only_gpu_aabb:
            print(f"[COMPARE] AABB DIFF at {time.iso}: "
                  f"CPU={len(cpu_aabb_pairs)} GPU={len(gpu_aabb_pairs)} "
                  f"only_cpu={len(only_cpu_aabb)} only_gpu={len(only_gpu_aabb)}")

            import cupy as _cp
            # Dump detailed bounds for every differing pair
            cpu_star_bounds = field.get(coll.starbounds, [])
            cpu_kbo_bounds = kbo_collisional_model.get(coll.kpathbounds, [])
            gpu_sb_host = star_bounds_gpu.get() if hasattr(star_bounds_gpu, 'get') else np.asarray(star_bounds_gpu)
            gpu_kb_host = kbo_bounds_gpu.get() if hasattr(kbo_bounds_gpu, 'get') else np.asarray(kbo_bounds_gpu)
            gpu_si_host = star_indices_gpu.get() if hasattr(star_indices_gpu, 'get') else np.asarray(star_indices_gpu)

            # Build reverse map: original_star_idx -> gpu_dense_idx
            orig_to_dense = {int(gpu_si_host[i]): i for i in range(len(gpu_si_host))}

            for s, k in sorted(only_cpu_aabb):
                print(f"  AABB only-CPU: star={s} kbo={k}")
                # CPU bounds for this star/kbo
                if s < len(cpu_star_bounds):
                    sb = cpu_star_bounds[s]
                    print(f"    CPU star bounds: ({sb[0]:.20e}, {sb[1]:.20e}, {sb[2]:.20e}, {sb[3]:.20e})")
                if k < len(cpu_kbo_bounds):
                    kb = cpu_kbo_bounds[k]
                    print(f"    CPU kbo  bounds: ({kb[0]:.20e}, {kb[1]:.20e}, {kb[2]:.20e}, {kb[3]:.20e})")
                # GPU bounds for same star
                dense_idx = orig_to_dense.get(s, None)
                if dense_idx is not None:
                    gsb = gpu_sb_host[dense_idx]
                    print(f"    GPU star bounds: ({gsb[0]:.20e}, {gsb[1]:.20e}, {gsb[2]:.20e}, {gsb[3]:.20e})")
                    print(f"    GPU star dense_idx={dense_idx}  original_idx={s}")
                else:
                    print(f"    GPU: star {s} NOT in valid_indices (filtered out!)")
                if k < len(gpu_kb_host):
                    gkb = gpu_kb_host[k]
                    print(f"    GPU kbo  bounds: ({gkb[0]:.20e}, {gkb[1]:.20e}, {gkb[2]:.20e}, {gkb[3]:.20e})")
                # Check AABB overlap manually
                if s < len(cpu_star_bounds) and k < len(cpu_kbo_bounds):
                    sb = cpu_star_bounds[s]
                    kb = cpu_kbo_bounds[k]
                    overlap = (kb[2] >= sb[0] and kb[0] <= sb[2] and
                               kb[3] >= sb[1] and kb[1] <= sb[3])
                    print(f"    CPU manual AABB overlap: {overlap}")
                if dense_idx is not None and k < len(gpu_kb_host):
                    gsb = gpu_sb_host[dense_idx]
                    gkb = gpu_kb_host[k]
                    overlap = (gkb[2] >= gsb[0] and gkb[0] <= gsb[2] and
                               gkb[3] >= gsb[1] and gkb[1] <= gsb[3])
                    print(f"    GPU manual AABB overlap: {overlap}")
                    # Check margins
                    x_gap = max(gkb[0] - gsb[2], gsb[0] - gkb[2])
                    y_gap = max(gkb[1] - gsb[3], gsb[1] - gkb[3])
                    print(f"    x_gap={x_gap:.20e}  y_gap={y_gap:.20e}")

            for s, k in sorted(only_gpu_aabb)[:5]:
                print(f"  AABB only-GPU: star={s} kbo={k}")

        # --- GPU verification ---
        gpu_result = None
        if len(gpu_star_ids) > 0:
            gpu_result = coll.include_context_from_pairs(
                kbos, field, gpu_star_ids, gpu_kbo_ids, time
            )
        gpu_verified = set()
        if gpu_result is not None:
            gpu_verified = set(zip(gpu_result[coll.starID], gpu_result[coll.kboID]))

        # --- CPU verification ---
        cpu_result = None
        if len(cpu_events[coll.starID]) > 0:
            shapely_kbos = coll.vectorize_kbos_shapely(kbos, cpu_events)
            verified_events = coll.verify_detections(field, shapely_kbos, cpu_events)
            if len(verified_events[coll.starID]) > 0:
                cpu_result = coll.include_context(shapely_kbos, field, verified_events, time)
        cpu_verified = set()
        if cpu_result is not None:
            cpu_verified = set(zip(cpu_result[coll.starID], cpu_result[coll.kboID]))

        # --- Compare verified results ---
        only_cpu_ver = cpu_verified - gpu_verified
        only_gpu_ver = gpu_verified - cpu_verified
        if only_cpu_ver or only_gpu_ver:
            print(f"[COMPARE] VERIFIED DIFF at {time.iso}: "
                  f"CPU={len(cpu_verified)} GPU={len(gpu_verified)} "
                  f"only_cpu={len(only_cpu_ver)} only_gpu={len(only_gpu_ver)}")
            for s, k in sorted(only_cpu_ver):
                print(f"  VERIFIED only-CPU: star={s} kbo={k}")
            for s, k in sorted(only_gpu_ver):
                print(f"  VERIFIED only-GPU: star={s} kbo={k}")

        return cpu_result


    def observe_field(self, field, observation_length, kbos, time):
        """Observe a field for a given duration and return occultations.

        Parameters
        ----------
        field
            Field/star table dict.
        observation_length
            Observation duration in hours.
        kbos
            KBO table dict.
        time
            Observation start time (astropy Time).

        Returns
        -------
        dict | None
            Occultations dict (see :mod:`src.collisions`) or None if no events.
        """

        # Optional GPU collision workflow:
        # - Uses GPU bounds + candidate pair extraction
        # - Applies the same Shapely verification as CPU for exact parity
        use_gpu_collisions = bool(getattr(self, 'use_gpu_collisions', False))
        compare_gpu_cpu = bool(getattr(self, 'compare_gpu_cpu', False))

        if not use_gpu_collisions or compare_gpu_cpu:
            field = coll.add_geometry(
                field,
                x=constants.GaiaDR3Keys.LON,
                y=constants.GaiaDR3Keys.LAT,
                d=constants.FieldDataKeys.ANGSIZE,
            )

        kbos[constants.KBODataKeys.PATHS], kbos[constants.KBODataKeys.PM_TOTAL] = self.calculate_kbo_paths(
            kbos, time, observation_length * 3600
        )


        # Uses vector information to construct data for the collision model

        if compare_gpu_cpu:
            return self._observe_field_compare(field, kbos, time)

        if use_gpu_collisions:
            try:
                self._log_once(
                    '_gpu_collision_log_once',
                    "[Collisions] Using GPU collision workflow (GPU AABB candidates + CPU-equivalent Shapely verify)",
                )
                return self._observe_field_gpu(field, kbos, time)
            except Exception as e:
                self._log_once(
                    '_gpu_collision_fallback_log_once',
                    f"[Collisions] GPU workflow FAILED; falling back to CPU+Shapely. Error: {e}",
                )

        return self._observe_field_cpu(field, kbos, time)

    def correct_field(self, field, weather, altitude):
        """Correct field magnitudes for atmospheric extinction and distortion."""
        corrected_field = field.copy()

        # add the zenith angle as a key to the visible fields for each field
        corrected_field[constants.FieldDataKeys.ZENITH_REG] = 90. - altitude


        # calculate airmass and apply atmospheric extinction
        corrected_field[constants.FieldDataKeys.AIRMASS_REG] = 1 / np.cos(np.radians(corrected_field[constants.FieldDataKeys.ZENITH_REG])) # secant of the zenith angle
        corrected_field[constants.GaiaDR3Keys.MAG] += weather * corrected_field[constants.FieldDataKeys.AIRMASS_REG]

        # apply the distortion  extinction
        field_centroid_lon = corrected_field[constants.FieldDataKeys.ELON_REG]
        field_centroid_lat = corrected_field[constants.FieldDataKeys.ELAT_REG]

        star_lons = corrected_field[constants.GaiaDR3Keys.LON]
        star_lats = corrected_field[constants.GaiaDR3Keys.LAT]

        star_lat_distances = star_lats - field_centroid_lat
        star_lon_distances = (star_lons - field_centroid_lon) * math.cos(math.radians(field_centroid_lat))

        star_total_distances = np.sqrt((star_lat_distances ** 2) + (star_lon_distances ** 2))

        radii = np.linspace(0, self.config.max_radius, 11)[1:]  # other radii are evenly spaced
        radius_extinctions_differences = [round(self.config.radius_extinctions[x] - self.config.radius_extinctions[x - 1], 2) for x in range(1, 10)]

        stellar_extinctions = np.zeros(len(star_total_distances))
        for j in range(len(radii) - 1):
            stellar_extinctions[star_total_distances > radii[j]] += radius_extinctions_differences[j]
        
        corrected_field[constants.GaiaDR3Keys.MAG] += stellar_extinctions

        return corrected_field
    
    
    def heliocentric_to_geocentric_ecliptic_proper_motion(self, x_helio, y_helio, z_helio, 
                                                     vx_helio, vy_helio, vz_helio, 
                                                     obs_time):
        """
        Convert heliocentric position and velocity to geocentric ecliptic coordinates
        and calculate apparent proper motion including Earth's reflex motion.
        
        Parameters:
        -----------
        x_helio, y_helio, z_helio : float
            Heliocentric position in AU (float/array) or an Astropy Quantity.
        vx_helio, vy_helio, vz_helio : float
            Heliocentric velocity components. If passed as plain floats/arrays,
            they are interpreted as km/s (matching how the KBO tables are typically
            stored). Astropy Quantities are also accepted.
        obs_time : astropy.time.Time
            Observation time
            
        Returns:
        --------
        pm_elon : float
            Proper motion in ecliptic longitude * cos(lat) (arcmin/hour)
        pm_elat : float
            Proper motion in ecliptic latitude (arcmin/hour)
        pm_total : float
            Total proper motion magnitude (arcmin/hour)
        """

        def _as_quantity(value, default_unit):
            """Convert `value` to an Astropy Quantity with `default_unit` if needed."""
            return value if hasattr(value, 'unit') else (value * default_unit)
        
        # Get Earth's and Sun's barycentric positions and velocities in ICRS frame
        earth_pos_icrs, earth_vel_icrs = get_body_barycentric_posvel('earth', obs_time)
        sun_pos_icrs, sun_vel_icrs = get_body_barycentric_posvel('sun', obs_time)

        # Convert positions to heliocentric by subtracting Sun's position
        earth_helio_icrs = earth_pos_icrs - sun_pos_icrs
        earth_helio_vel_icrs = earth_vel_icrs - sun_vel_icrs

        # Transform Earth's heliocentric position and velocity together
        earth_helio_icrs_full = CartesianRepresentation(earth_helio_icrs.x, earth_helio_icrs.y, earth_helio_icrs.z)
        earth_helio_vel_icrs_full = CartesianDifferential(earth_helio_vel_icrs.x, earth_helio_vel_icrs.y, earth_helio_vel_icrs.z)
        earth_helio_icrs_coord = SkyCoord(earth_helio_icrs_full.with_differentials(earth_helio_vel_icrs_full), frame='icrs', obstime=obs_time)
        earth_helio_ecl = earth_helio_icrs_coord.transform_to('heliocentrictrueecliptic')

        # Extract Earth's position and velocity in heliocentric ecliptic frame
        earth_helio_pos_ecl = earth_helio_ecl.cartesian
        earth_helio_vel_ecl = earth_helio_ecl.velocity

        # Convert to geocentric position (subtract Earth's heliocentric position)
        xq = _as_quantity(x_helio, u.AU)
        yq = _as_quantity(y_helio, u.AU)
        zq = _as_quantity(z_helio, u.AU)
        geocentric_pos_x = xq.to(u.AU) - earth_helio_pos_ecl.x
        geocentric_pos_y = yq.to(u.AU) - earth_helio_pos_ecl.y
        geocentric_pos_z = zq.to(u.AU) - earth_helio_pos_ecl.z

        # Convert to geocentric velocity (subtract Earth's heliocentric velocity).
        # `earth_helio_vel_ecl` is typically in AU/day; convert to match the KBO velocity units.
        vxq = _as_quantity(vx_helio, u.km / u.s)
        vyq = _as_quantity(vy_helio, u.km / u.s)
        vzq = _as_quantity(vz_helio, u.km / u.s)

        earth_vx = earth_helio_vel_ecl.d_x.to(vxq.unit)
        earth_vy = earth_helio_vel_ecl.d_y.to(vyq.unit)
        earth_vz = earth_helio_vel_ecl.d_z.to(vzq.unit)

        geocentric_vel_x = vxq - earth_vx
        geocentric_vel_y = vyq - earth_vy
        geocentric_vel_z = vzq - earth_vz

        # Create geocentric coordinate
        geocentric_pos = CartesianRepresentation(x=geocentric_pos_x, 
                                                y=geocentric_pos_y, 
                                                z=geocentric_pos_z)
        geocentric_vel = CartesianDifferential(d_x=geocentric_vel_x,
                                            d_y=geocentric_vel_y,
                                            d_z=geocentric_vel_z)
        
        # Create SkyCoord in geocentric ecliptic frame
        geocentric_coord = SkyCoord(
            geocentric_pos.with_differentials(geocentric_vel),
            frame=GeocentricMeanEcliptic,
            equinox='J2000',
            obstime=obs_time
        )
        
        # Extract position
        elon = geocentric_coord.lon.to(u.deg).value
        elat = geocentric_coord.lat.to(u.deg).value
        
        # Extract proper motion components and convert to arcmin/hour.
        # Depending on Astropy version/frames, proper motion might be exposed
        # directly or only through attached differentials.
        if hasattr(geocentric_coord, 'pm_lon_coslat') and hasattr(geocentric_coord, 'pm_lat'):
            pm_elon = geocentric_coord.pm_lon_coslat.to(u.arcmin / u.hour).value
            pm_elat = geocentric_coord.pm_lat.to(u.arcmin / u.hour).value
        else:
            differentials = geocentric_coord.data.differentials
            if not differentials:
                raise RuntimeError("No velocity differentials available to compute proper motion")
            # Differential keys can vary; grab the first.
            vel_diff = next(iter(differentials.values()))
            pm_elon = vel_diff.d_lon_coslat.to(u.arcmin / u.hour).value
            pm_elat = vel_diff.d_lat.to(u.arcmin / u.hour).value
        
        # Calculate total apparent proper motion (no radial component, just the transverse angular velocity)
        pm_total = np.sqrt(pm_elon**2 + pm_elat**2)

        # Return Earth's position and velocity in the heliocentric ecliptic frame
        earth_helio_pos = earth_helio_pos_ecl
        earth_helio_vel = earth_helio_vel_ecl
        
        return pm_elon, pm_elat, pm_total
    
    def calculate_kbo_paths(self, kbos, date, dt=1, *, axis_aligned: bool = True):
        """Compute apparent KBO motion paths over `dt` seconds.

        Parameters
        ----------
        axis_aligned
            When True (default), project the total proper motion onto ecliptic longitude
            and set the latitude component to zero. This preserves swept path length and
            matches the default collision workflow assumptions. When False, return the
            true (d_lon, d_lat) path.

        Returns
        -------
        (paths, pm_total)
            - `paths` is an (N, 2) array of (d_lon_deg, d_lat_deg) over `dt`.
            - `pm_total` is total proper motion in arcmin/hour.
        """
        # KBO heliocentric coordinates
        x = kbos['x_ecl'] # in AU
        y = kbos['y_ecl']
        z = kbos['z_ecl']
        vx = kbos['vx_ecl']
        vy = kbos['vy_ecl']
        vz = kbos['vz_ecl']

        # Get proper motions in arcmin/hour
        pm_elon, pm_elat, pm_total = self.heliocentric_to_geocentric_ecliptic_proper_motion(
            x, y, z,
            vx, vy, vz,
            date
        )

        # Proper motion is returned in arcmin/hour. Convert to degrees/second and
        # multiply by dt (seconds) to get motion over dt.
        deg_per_sec = 1.0 / (60.0 * 3600.0)

        if axis_aligned:
            sign = np.sign(pm_elon)
            sign = np.where(sign == 0, 1.0, sign)
            elon_path = (sign * pm_total) * deg_per_sec * dt
            elat_path = np.zeros_like(elon_path)
        else:
            elon_path = pm_elon * deg_per_sec * dt
            elat_path = pm_elat * deg_per_sec * dt

        kbo_path = np.column_stack((elon_path, elat_path))
        return kbo_path, pm_total  # pm_total in arcmin/hour


    def get_fortnight(self, date):
        """
        Given a date (astropy Time or datetime), return the fortnight (biweek) number of the year (1-26).
        """
        if hasattr(date, 'datetime'):
            dt = date.datetime
        else:
            dt = date

        day_of_year = dt.timetuple().tm_yday
        fortnight = ((day_of_year - 1) // 14) + 1
        return min(fortnight, 26)
    

    def get_transparency_extinction(self, date):
        """Generate a random atmospheric extinction for the given date."""
        fortnight_index = self.get_fortnight(date) - 1

        weights = self.config.biweekly_transparencies[fortnight_index]
        polaris_extinction = np.random.choice(self.config.atmospheric_extinctions, p=weights)  # weighted choice of extinction

        if polaris_extinction == "cloudy":
            return np.inf

        else:
            # divide by the airmass corresponding to altitude of polaris (43 degrees)
            polaris_extinction = float(polaris_extinction)
            zenith = 90 - self.config.latitude
            airmass = 1 / np.cos(np.radians(zenith))
            atmospheric_extinction = polaris_extinction / airmass
            
            return atmospheric_extinction
    

        

        




    
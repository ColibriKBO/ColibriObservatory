"""Trimmed Colibri noise model for the standalone scheduler.

Derived from Colibri_Simulations/src/sso_detection/noiseModel.py. This version
loads ONLY the temporal-SNR HDF5 model (the only model shipped with the
scheduler) and drops the skew/kurtosis/power-law loaders and the
matplotlib-backed light-curve generator.
"""

from __future__ import annotations

import warnings
from typing import Any, Dict, Tuple

import h5py
import numpy as np

__all__ = ["ColibriNoiseModel"]


def _cadence_key(cadence_ms: float) -> str:
    """Convert cadence in ms to the model key format (e.g. '25ms')."""

    return f"{int(cadence_ms)}ms"


def _as_1d_array(x: float | np.ndarray) -> Tuple[np.ndarray, bool]:
    """Convert input to a 1D array and return (array, was_scalar)."""

    arr = np.asarray(x)
    scalar_input = arr.ndim == 0
    if scalar_input:
        arr = arr[np.newaxis]
    return arr, scalar_input


def _maybe_scalar(arr: np.ndarray, scalar_input: bool) -> float | np.ndarray:
    """Return a scalar if input was scalar, else return the array."""

    return arr[0] if scalar_input else arr


def _nearest_log_airmass(available_airmasses: list[float], target_airmass: float) -> float:
    """Choose the nearest available airmass in log-space."""

    log_airmasses = np.log(available_airmasses)
    log_target = np.log(target_airmass)
    distances = np.abs(log_airmasses - log_target)
    return available_airmasses[int(np.argmin(distances))]


class ColibriNoiseModel:
    """Predictor for Colibri temporal-SNR noise properties.

    Loads only the temporal-SNR HDF5 model. Only the 40 Hz (25 ms cadence)
    model is shipped today; requesting another cadence raises a clear error.
    """

    def __init__(self, model_folder_path: str):
        """Initialize the noise model by loading the temporal-SNR HDF5 file.

        Args:
            model_folder_path: Path to folder containing temporal_snr_models.h5.
        """
        self.model_folder = model_folder_path

        snr_file = f"{model_folder_path}/temporal_snr_models.h5"
        self.snr_models, self.snr_metadata = self._load_temporal_snr_models(snr_file)

    def predict(
        self,
        gmag: float | np.ndarray,
        airmass: float,
        cadence_ms: float,
        return_uncertainty: bool = False,
    ) -> Dict[str, np.ndarray | float]:
        """Predict temporal SNR for given observation parameters.

        Args:
            gmag: G magnitude (scalar or array-like).
            airmass: Airmass value.
            cadence_ms: Imaging cadence in milliseconds.
            return_uncertainty: If True, also return the standard deviation.

        Returns:
            Dictionary with key "temporal_snr" (and "temporal_snr_std" when
            `return_uncertainty` is True).
        """
        results: Dict[str, np.ndarray | float] = {}

        if return_uncertainty:
            snr, snr_std = self._predict_temporal_snr(gmag, airmass, cadence_ms, return_uncertainty=True)
            results['temporal_snr'] = snr
            results['temporal_snr_std'] = snr_std
        else:
            results['temporal_snr'] = self._predict_temporal_snr(gmag, airmass, cadence_ms)

        return results

    # Internal methods
    def _load_temporal_snr_models(self, input_file: str) -> tuple[Dict[str, Any], Dict[str, Any]]:
        models_dict: Dict[str, Any] = {}
        metadata_dict: Dict[str, Any] = {}

        with h5py.File(input_file, 'r') as f:
            # Load metadata
            metadata = f['metadata']
            for key in metadata.attrs:
                metadata_dict[key] = metadata.attrs[key]

            # Load G magnitude thresholds
            gmag_thresholds = {}
            threshold_group = f['gmag_thresholds']
            for cadence in threshold_group.attrs:
                gmag_thresholds[cadence] = threshold_group.attrs[cadence]
            metadata_dict['gmag_thresholds'] = gmag_thresholds

            # Load models
            models = f['models']
            for cadence in models.keys():
                models_dict[cadence] = {}
                cadence_group = models[cadence]

                for airmass_key in cadence_group.keys():
                    airmass_group = cadence_group[airmass_key]
                    airmass = airmass_group.attrs['airmass']

                    models_dict[cadence][airmass] = {
                        'parameters': {
                            'snr_flat': airmass_group['parameters'].attrs['snr_flat'],
                            'break_mag': airmass_group['parameters'].attrs['break_mag'],
                            'slope': airmass_group['parameters'].attrs['slope'],
                            'std_fraction': airmass_group['parameters'].attrs['std_fraction'],
                            'abs_std': airmass_group['parameters'].attrs['abs_std']
                        }
                    }

        return models_dict, metadata_dict

    def _predict_temporal_snr(
        self,
        gmag: float | np.ndarray,
        airmass: float,
        cadence_ms: float,
        return_uncertainty: bool = False,
    ) -> tuple[np.ndarray | float, np.ndarray | float] | np.ndarray | float:
        cadence = _cadence_key(cadence_ms)
        gmag_arr, scalar_input = _as_1d_array(gmag)

        if cadence not in self.snr_models:
            raise ValueError(
                f"no temporal-SNR model for cadence {int(cadence_ms)} ms "
                f"(available cadences: {sorted(self.snr_models.keys())})."
            )

        available_airmasses = sorted(list(self.snr_models[cadence].keys()))

        if len(available_airmasses) == 1:
            closest_airmass = available_airmasses[0]
            params = self.snr_models[cadence][closest_airmass]['parameters']
            predicted_snr = self._calculate_piecewise_snr(gmag_arr, params)
            if return_uncertainty:
                snr_std = self._calculate_std_values(predicted_snr, params)
                return (_maybe_scalar(predicted_snr, scalar_input), _maybe_scalar(snr_std, scalar_input))
            else:
                return _maybe_scalar(predicted_snr, scalar_input)

        elif airmass <= available_airmasses[0]:
            closest_airmass = available_airmasses[0]
            params = self.snr_models[cadence][closest_airmass]['parameters']
            predicted_snr = self._calculate_piecewise_snr(gmag_arr, params)
            if return_uncertainty:
                snr_std = self._calculate_std_values(predicted_snr, params)
                return (_maybe_scalar(predicted_snr, scalar_input), _maybe_scalar(snr_std, scalar_input))
            else:
                return _maybe_scalar(predicted_snr, scalar_input)

        elif airmass > available_airmasses[-1]:
            warnings.warn(
                f"Airmass {airmass:.2f} exceeds the maximum modelled airmass "
                f"({available_airmasses[-1]:.2f}). Returning SNR=1 (100% noise) "
                "to avoid overestimating sensitivity at high airmass.",
                RuntimeWarning,
                stacklevel=2,
            )
            predicted_snr = np.ones_like(gmag_arr)
            if return_uncertainty:
                snr_std = np.zeros_like(gmag_arr)
                return (_maybe_scalar(predicted_snr, scalar_input), _maybe_scalar(snr_std, scalar_input))
            else:
                return _maybe_scalar(predicted_snr, scalar_input)

        else:
            # Log-linear interpolation
            log_airmasses = np.log(available_airmasses)
            log_target_airmass = np.log(airmass)

            param_names = ['snr_flat', 'break_mag', 'slope', 'std_fraction', 'abs_std']
            param_values = {name: [] for name in param_names}

            for am in available_airmasses:
                params = self.snr_models[cadence][am]['parameters']
                for name in param_names:
                    param_values[name].append(params[name])

            interpolated_params = {}
            for name in param_names:
                interpolated_params[name] = np.interp(log_target_airmass, log_airmasses, param_values[name])

            predicted_snr = self._calculate_piecewise_snr(gmag_arr, interpolated_params)

            if return_uncertainty:
                snr_std = self._calculate_std_values(predicted_snr, interpolated_params)
                return (_maybe_scalar(predicted_snr, scalar_input), _maybe_scalar(snr_std, scalar_input))
            else:
                return _maybe_scalar(predicted_snr, scalar_input)

    # Helper functions
    def _calculate_piecewise_snr(self, gmag: np.ndarray, params: Dict[str, float]) -> np.ndarray:
        snr_flat = params['snr_flat']
        break_mag = params['break_mag']
        slope = params['slope']
        raw_snr = np.where(gmag <= break_mag, snr_flat, snr_flat + slope * (gmag - break_mag))
        return np.maximum(raw_snr, 0.01)  # Floor at minimum detectable SNR

    def _calculate_std_values(self, predicted_snr: np.ndarray, params: Dict[str, float]) -> np.ndarray:
        std_fraction = params['std_fraction']
        abs_std = params['abs_std']
        return np.maximum(predicted_snr * std_fraction, abs_std)

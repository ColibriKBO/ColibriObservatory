import time, sys
import argparse
import numpy as np
import numba as nb
import pyqtgraph as pg
import threading
import queue
import csv
import json
from collections import Counter

pg.setConfigOptions(imageAxisOrder='row-major')

import imageio
import scipy.optimize as opt
import scipy.ndimage as ndimage
import scipy.ndimage.filters as filters

import matplotlib.pyplot as plt

from pathlib import Path
import win32com.client
import pythoncom
from ColibriGrabCapture import (ColibriGrabCapture, read_rcd_high_gain,
                                RCD_SATURATION, GrabCancelled)
from PyFocusLogic import (StarCatalog, choose_bracketed_best, fitted_focus_vertex,
                               rescore_stable_cohort, matched_cohort_score)
from PyFocusStarSelection import spatial_candidate_order, field_counts, field_region, reliable_star_cohort

#from alpaca.telescope import *
#from alpaca.camera import *
#from alpaca.focuser import *
#from alpaca.exceptions import *


#################### PYQT5 LIBRARY/PACKAGE IMPORTS ####################

from PyQt5 import QtWidgets, uic, QtGui, QtCore
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *
from PyQt5.QtGui import *

DEFAULT_FOCUSER_DRIVER_ID = "SeletekFocuser.Focuser"

class AutofocusCancelled(Exception):
    """Raised when an autofocus run was cancelled before completion."""

class AutofocusNotConverged(Exception):
    """Recoverable focus-measurement failure; restore the starting position."""

class AutofocusVerificationFailed(Exception):
    """Focus was selected, but an independent final image check failed."""


class ASCOMFocuserController:
    def __init__(self, driver_id=None):
        self.driver_id = driver_id
        self.focuser = None
        self._connection_property = None

    def connect(self):
        if self.focuser is not None:
            if self.is_connected():
                return
            self.disconnect()

        if not self.driver_id:
            chooser = win32com.client.Dispatch("ASCOM.Utilities.Chooser")
            chooser.DeviceType = "Focuser"
            self.driver_id = chooser.Choose(None)

        if not self.driver_id:
            raise RuntimeError("No ASCOM focuser driver selected.")

        print(f"Opening focuser driver: {self.driver_id}")
        self.focuser = win32com.client.Dispatch(self.driver_id)
        try:
            interface_version = int(self.focuser.InterfaceVersion)
            # GreenBird Seletek reports ASCOM focuser InterfaceVersion 1:
            # it exposes Link, NOT writable Connected. Driver explicitly
            # remains disconnected until Link=True is assigned.
            self._connection_property = (
                "Link" if interface_version == 1 else "Connected"
            )
            print(f"Connecting focuser via {self._connection_property}=True "
                  f"(ASCOM version {interface_version})")
            setattr(self.focuser, self._connection_property, True)
            # The Seletek V1 driver can report Link=False immediately after
            # setting it to True. In GreenBird's interactive diagnostic,
            # Link=True and Position were available after a two-second wait.
            # Do not reject the connection on the very first read.
            deadline = time.monotonic() + 10.0
            pos = None
            last_error = None
            reported_link = False
            while time.monotonic() < deadline:
                try:
                    reported_link = bool(getattr(self.focuser, self._connection_property))
                    if reported_link:
                        pos = self.position
                        break
                except Exception as error:
                    last_error = error
                time.sleep(0.25)
            if pos is None:
                reason = f" Last driver error: {last_error}" if last_error else ""
                raise RuntimeError(
                    f"Focuser did not become ready within 10 seconds "
                    f"({self._connection_property}={reported_link}).{reason}"
                )
            print(f"Focuser link confirmed; position={pos}")
            if not bool(self.focuser.Absolute):
                raise RuntimeError(
                    "The ASCOM focuser reports relative movement. "
                    "PyFocus currently requires an absolute-position focuser."
                )
            max_step = int(self.focuser.MaxStep)
            if not (0 <= pos <= max_step):
                raise RuntimeError(f"Invalid focuser position: {pos} (MaxStep={max_step})")
            # Verify motion feedback is readable before future move commands.
            _ = bool(self.focuser.IsMoving)
        except Exception:
            self.disconnect()
            raise

        print(f"Focuser connected: {self.driver_id}; pos={pos}; "
              f"MaxStep={max_step}")

    def disconnect(self):
        # Must run on the same COM-initialized worker thread as connect().
        if self.focuser is not None and self._connection_property is not None:
            try:
                setattr(self.focuser, self._connection_property, False)
            except Exception as error:
                print(f"WARNING: focuser disconnect failed: {error}")
        self.focuser = None
        self._connection_property = None

    def is_connected(self):
        if self.focuser is None:
            return False

        try:
            _ = self.position
            return True
        except Exception:
            return False

    @property
    def position(self):
        if self.focuser is None:
            raise RuntimeError("Focuser COM object has not been opened.")

        return int(self.focuser.Position)

    def move_to(self, target_position, keep_running_callback=None, timeout_s=120, tolerance=2):
        """Command and verify an ABSOLUTE move; never assume success on bad feedback."""
        if self.focuser is None:
            self.connect()

        target_position = int(target_position)
        max_step = int(self.focuser.MaxStep)
        if not 0 <= target_position <= max_step:
            raise ValueError(f"Target {target_position} outside focuser limits 0..{max_step}")

        if keep_running_callback is not None and not keep_running_callback():
            raise AutofocusCancelled("Cancelled before focuser move")

        if bool(self.focuser.IsMoving):
            raise RuntimeError("Focuser is already moving; refusing another move")

        print(f"Moving focuser to {target_position}")
        self.focuser.Move(target_position)
        deadline = time.monotonic() + float(timeout_s)
        try:
            while True:
                if keep_running_callback is not None and not keep_running_callback():
                    raise AutofocusCancelled("Cancelled during focuser move")
                if not bool(self.focuser.IsMoving):
                    break
                if time.monotonic() >= deadline:
                    raise TimeoutError(f"Focuser failed to stop within {timeout_s}s")
                time.sleep(0.25)
        except (AutofocusCancelled, TimeoutError):
            try:
                self.focuser.Halt()
            except Exception as halt_error:
                print(f"WARNING: focuser Halt was unavailable: {halt_error}")
            raise

        actual = self.position
        if abs(actual - target_position) > tolerance:
            raise RuntimeError(
                f"Focuser stopped at {actual}; target was {target_position} "
                    f"(tolerance {tolerance} steps)"
            )
        print(f"Verified focuser position: {actual}")
        return actual

class FocusThread(QtCore.QThread):
    updateFocusFrame = QtCore.pyqtSignal(object)
    updatePlot = QtCore.pyqtSignal(float, float, float, object)

    # New: autofocus curve signals
    updateAutofocusPlot = QtCore.pyqtSignal(int, float)
    updateBestFocus = QtCore.pyqtSignal(int, float)
    updateAutofocusStage = QtCore.pyqtSignal(str)
    updateAutofocusStart = QtCore.pyqtSignal(int)

    updateStatus = QtCore.pyqtSignal(object)
    updateStarOverlay = QtCore.pyqtSignal(object, object, object, object)
    updateFocuserPosition = QtCore.pyqtSignal(object)
    sessionFinished = QtCore.pyqtSignal()
    autofocusResult = QtCore.pyqtSignal(object)

    def __init__(self, parent=None, settings=None):
        super(FocusThread,self).__init__(parent)
        self.threadactive = True
        # Persistent worker state
        self.shutdown_requested = False
        self.session_active = False
        self.command_event = threading.Event()
        self.focus_command_queue = queue.Queue()

        # Protect settings that may be changed by the GUI while this thread runs.
        self.settings_lock = threading.Lock()
        
        if settings is None:
            settings = {}
        
        self.capture_mode = settings.get("capture_mode", "Stream")

        # ColibriGrab / RCD capture settings
        self.exposure = float(settings.get("exposure", 0.025))
        self.gain = float(settings.get("gain", 25.0))
        self.filter_number = int(settings.get("filter_number", 0))
        self.light_frame = bool(settings.get("light_frame", True))
        self.colibrigrab_exe = settings.get(
            "colibrigrab_exe",
            str(Path.home() / "Documents" / "GitHub" / "ColibriGrab" / "ColibriGrab" / "ColibriGrab.exe")
        )
        self.grab_output_root = settings.get("grab_output_root", r"D:\ColibriData\PyFocus")
        self.grab_temperature = int(settings.get("grab_temperature", -10))
        self.grab_timeout = float(settings.get("grab_timeout", 120.0))
        self.kill_flipilot = bool(settings.get("kill_flipilot", True))
        self.stop_file = settings.get("stop_file", None)
        self.grabber = None

        # Camera/binning settings
        self.bin_x = int(settings.get("bin_x", 2))
        self.bin_y = int(settings.get("bin_y", 2))

        # Display settings
        self.max_display_size = int(settings.get("max_display_size", 300))

        # Star detection / fitting settings
        self.neighborhood_size = int(settings.get("neighborhood_size", 25))
        # Noise-adaptive 4-sigma screening remains active; lower old 30-ADU floor.
        self.intensity_threshold = float(settings.get("intensity_threshold", 18))
        self.segment_radius = int(settings.get("segment_radius", 25))
        # Allow real off-axis elongation; true single-pixel artifacts still fail width checks.
        self.roundness_threshold = float(settings.get("roundness_threshold", 0.35))
        self.max_feature_ratio = float(settings.get("max_feature_ratio", 0.8))

        # Autofocus settings
        self.af_step_size = int(settings.get("af_step_size", 25))
        self.af_steps_each_side = int(settings.get("af_steps_each_side", 3))
        self.af_frames_per_position = int(settings.get("af_frames_per_position", 7))
        self.af_settle_time = float(settings.get("af_settle_time", 1.0))
        # Set only after a real backlash measurement; 0 means no compensation.
        self.af_backlash_steps = int(settings.get("af_backlash_steps", 0))
        # Conservative defaults; tune only after an on-sky focus curve is available.
        self.af_min_contrast = float(settings.get("af_min_contrast", 0.01))
        self.af_verify_tolerance = float(settings.get("af_verify_tolerance", 0.25))
        self.focuser_driver_id = settings.get("focuser_driver_id", None)
        self.af_coarse_multiplier = int(settings.get("af_coarse_multiplier", 3))
        self.af_max_excursion = int(settings.get("af_max_excursion", 900))
        self.af_catalog = None
        self.af_tracking_active = False
        # Stream mode now locks the *same* sources across frames. This is a
        # separate catalog from autofocus and cannot affect an AF run.
        self.stream_catalog = None
        self.stream_recent_matches = []
        self.stream_cohort_history = []
        self.stream_quality_summary = {}
        self.stream_cohort_ids = None
        self.stream_low_match_streak = 0
        self.stream_frame_index = 0
        self.stream_diagnostic_path = None
        self.stream_score_min_fraction = 0.75
        self.max_fit_candidates = int(settings.get("max_fit_candidates", 40))

        # Optional persistent focuser connection.
        # Used for displaying focuser position in Single Image / Stream,
        # and for moving during Autofocus.
        self.focuser_controller = None
        self.focuser_available = False

        self.current_focuser_position = None
        self.current_testing_position = None
        self.current_best_position = None
        self._next_focuser_retry_at = 0.0

    @QtCore.pyqtSlot()
    def run(self):
        pythoncom.CoInitialize()
        try:
            while not self.shutdown_requested:
                self.command_event.wait()
                self.command_event.clear()
                if self.shutdown_requested:
                    break
                self.processFocusCommands()
                if not self.session_active:
                    continue
                try:
                    if self.capture_mode == "Single Image":
                        self.measureFocusMetric()
                        self.processFocusCommands()
                    elif self.capture_mode == "Stream":
                        while self.session_active and not self.shutdown_requested:
                            self.processFocusCommands()
                            self.measureFocusMetric()
                            self.processFocusCommands()
                    elif self.capture_mode == "Autofocus":
                        self.runAutofocus()
                except Exception as error:
                    print(f"ERROR in focus worker session: {error}")
                    self.updateStatus.emit(self.makeAFStatus(f"Focus session failed: {error}"))
                    if self.capture_mode == "Autofocus":
                        self.autofocusResult.emit({"success": False, "error": str(error)})
                finally:
                    # No camera COM objects: each ColibriGrab child process exits
                    # before capture_paths returns or raises.
                    self.session_active = False
                    self.sessionFinished.emit()
        finally:
            if self.focuser_controller is not None:
                self.focuser_controller.disconnect()
                self.focuser_controller = None
            pythoncom.CoUninitialize()

    def _isAutofocusActive(self):
        return (self.threadactive and self.session_active and
                not self.shutdown_requested and
                not (self.stop_file and Path(self.stop_file).exists()))

    def _getGrabber(self):
        if self.grabber is None:
            self.grabber = ColibriGrabCapture(
                executable=self.colibrigrab_exe,
                output_root=self.grab_output_root,
                temperature=self.grab_temperature,
                timeout_s=self.grab_timeout,
                kill_flipilot=self.kill_flipilot,
            )
        return self.grabber

    def _captureBatch(self, frames):
        if self.bin_x != 2 or self.bin_y != 2:
            raise ValueError("ColibriGrab RCD decoder requires HDR RR 2x2 mode/binning")
        if not self.light_frame:
            raise ValueError("Focus measurements require light images; ColibriGrab normal mode only")
        return self._getGrabber().capture_paths(
            position=self.current_testing_position if self.current_testing_position is not None
                     else (self.current_focuser_position or 0),
            frames=frames, exposure_s=self.exposure,
            keep_running=self._isAutofocusActive,
        )

    def startSession(self, settings):
        """
        Start a Single Image, Stream, or Autofocus operation without terminating
        the persistent worker afterward.
        """

        self.updateCaptureSettings(settings)
        self.stream_catalog = None
        self.stream_recent_matches = []
        self.stream_cohort_history = []
        self.stream_quality_summary = {}
        self.stream_cohort_ids = None
        self.stream_low_match_streak = 0
        self.stream_frame_index = 0
        self.stream_diagnostic_path = None
        self.stream_score_min_fraction = 0.75
        self.threadactive = True
        self.session_active = True
        self.command_event.set()


    def stopSession(self):
        """
        Stop the current operation but keep the Colibri/Seletek worker alive.
        """

        self.threadactive = False
        self.session_active = False


    def shutdown(self):
        """
        Stop the current operation and terminate the persistent worker.
        """

        self.threadactive = False
        self.session_active = False
        self.shutdown_requested = True
        self.command_event.set()

        # Do not access/release a worker-owned COM interface from the GUI thread.
        # The worker releases it in run() finally after it has stopped.
        self.wait()

    
    def getFocuserPositionSafe(self, force=False):
        """
        Return current focuser position if available.

        Retry unsuccessful automatic reads at most every 15 seconds while
        streaming. Explicit Refresh and manual move requests bypass that limit.
        """
        if not force and time.monotonic() < self._next_focuser_retry_at:
            return None

        try:
            if self.focuser_controller is None:
                self.focuser_controller = ASCOMFocuserController(
                    self.focuser_driver_id
                )

            if self.focuser_controller.focuser is None:
                self.focuser_controller.connect()

                # Preserve selected driver ID after the chooser is used once.
                self.focuser_driver_id = self.focuser_controller.driver_id

            try:
                position = self.focuser_controller.position

            except Exception as first_error:
                print(
                    "Focuser position read failed once; reopening driver. "
                    f"Details: {first_error}"
                )

                self.focuser_controller.disconnect()
                self.focuser_controller.connect()
                self.focuser_driver_id = self.focuser_controller.driver_id
                position = self.focuser_controller.position

            self.current_focuser_position = int(position)
            self.focuser_available = True
            self._next_focuser_retry_at = 0.0
            self.updateFocuserPosition.emit(self.current_focuser_position)

        except Exception as e:
            self._next_focuser_retry_at = time.monotonic() + 15.0
            print(f"Could not read focuser position: {e}. "
                  "Automatic retry suppressed for 15 seconds; "
                  "Refresh can retry immediately.")
            self.current_focuser_position = None
            self.focuser_available = False
            self.updateFocuserPosition.emit(None)

        return self.current_focuser_position
    
    def requestFocusJog(self, delta):
        """
        Request a relative focuser move.

        Positive delta increases focuser position.
        Negative delta decreases focuser position.
        """

        if self.capture_mode == "Autofocus" and self.session_active:
            print("Manual focuser jog rejected during active autofocus.")
            return
        self.focus_command_queue.put(("relative", int(delta)))
        self.command_event.set()


    def requestFocusMoveTo(self, target_position):
        """
        Request an absolute focuser move.
        """

        if self.capture_mode == "Autofocus" and self.session_active:
            print("Manual focuser move rejected during active autofocus.")
            return
        self.focus_command_queue.put(("absolute", int(target_position)))
        self.command_event.set()


    def requestFocuserRefresh(self):
        """
        Request a focuser position refresh.
        """

        if self.capture_mode == "Autofocus" and self.session_active:
            print("Manual focuser refresh rejected during active autofocus.")
            return
        self.focus_command_queue.put(("refresh", None))
        self.command_event.set()


    def processFocusCommands(self):
        """
        Process pending manual focuser commands inside FocusThread.

        This keeps all Seletek/ASCOM COM calls in the worker thread.
        """

        while True:
            try:
                command, value = self.focus_command_queue.get_nowait()
            except queue.Empty:
                break

            # Do not allow manual moves during an active autofocus sweep.
            if self.capture_mode == "Autofocus" and self.session_active:
                print("Ignoring manual focuser command while Autofocus is active.")
                continue

            current_position = self.getFocuserPositionSafe(force=True)

            if current_position is None:
                print("Cannot move focuser: current position is unavailable.")
                self.updateFocuserPosition.emit(None)
                continue

            if command == "refresh":
                print(f"Focuser position refreshed: {current_position}")
                self.updateFocuserPosition.emit(current_position)
                continue

            if command == "relative":
                target_position = int(current_position) + int(value)

            elif command == "absolute":
                target_position = int(value)

            else:
                print(f"Unknown focuser command: {command}")
                continue

            print(
                f"Requesting focuser move: "
                f"{current_position} -> {target_position}"
            )

            try:
                if self.focuser_controller is None:
                    self.focuser_controller = ASCOMFocuserController(
                        self.focuser_driver_id
                    )

                if self.focuser_controller.focuser is None:
                    self.focuser_controller.connect()

                self.focuser_controller.move_to(
                    target_position,
                    keep_running_callback=lambda: not self.shutdown_requested
                )

                new_position = self.getFocuserPositionSafe()
                self.updateFocuserPosition.emit(new_position)

            except Exception as e:
                print(f"Focuser move failed: {e}")
                self.updateFocuserPosition.emit(None)
        
    def updateCaptureSettings(self, settings):
        """
        Update camera and autofocus settings while the worker thread remains alive.

        The next exposure uses the new values. An exposure already underway keeps
        the settings with which it started.
        """

        with self.settings_lock:
            self.capture_mode = settings.get("capture_mode", self.capture_mode)
            self.exposure = float(settings.get("exposure", self.exposure))

            self.bin_x = int(settings.get("bin_x", self.bin_x))
            self.bin_y = int(settings.get("bin_y", self.bin_y))

            self.filter_number = int(
                settings.get("filter_number", self.filter_number)
            )
            self.light_frame = bool(
                settings.get("light_frame", self.light_frame)
            )

            self.af_step_size = int(
                settings.get("af_step_size", self.af_step_size)
            )
            self.af_steps_each_side = int(
                settings.get("af_steps_each_side", self.af_steps_each_side)
            )
            self.af_frames_per_position = int(
                settings.get(
                    "af_frames_per_position",
                    self.af_frames_per_position
                )
            )
            self.af_settle_time = float(
                settings.get("af_settle_time", self.af_settle_time)
            )
            self.af_backlash_steps = int(
                settings.get("af_backlash_steps", self.af_backlash_steps)
            )
            self.af_min_contrast = float(settings.get("af_min_contrast", self.af_min_contrast))
            self.af_verify_tolerance = float(settings.get("af_verify_tolerance", self.af_verify_tolerance))
            self.af_coarse_multiplier = int(settings.get("af_coarse_multiplier", self.af_coarse_multiplier))
            self.af_max_excursion = int(settings.get("af_max_excursion", self.af_max_excursion))
            new_exe = settings.get("colibrigrab_exe", self.colibrigrab_exe)
            new_root = settings.get("grab_output_root", self.grab_output_root)
            new_temp = int(settings.get("grab_temperature", self.grab_temperature))
            new_timeout = float(settings.get("grab_timeout", self.grab_timeout))
            new_watchdog = bool(settings.get("kill_flipilot", self.kill_flipilot))
            if (new_exe, new_root, new_temp, new_timeout, new_watchdog) != (
                    self.colibrigrab_exe, self.grab_output_root, self.grab_temperature,
                    self.grab_timeout, self.kill_flipilot):
                self.grabber = None
            self.colibrigrab_exe = new_exe
            self.grab_output_root = new_root
            self.grab_temperature = new_temp
            self.grab_timeout = new_timeout
            self.kill_flipilot = new_watchdog
            self.stop_file = settings.get("stop_file", self.stop_file)

    def makeAFStatus(self, state, **changes):
        status = {
            "state": str(state), "mean": 0., "std": 0., "min": 0., "max": 0.,
            "detected_peaks": 0, "valid_fits": 0,
            "sigma_x": None, "sigma_y": None, "sigma_avg": None,
            "exposure": self.exposure,
            "binning": f"{self.bin_x}x{self.bin_y}",
            "capture_mode": self.capture_mode,
            "focuser_position": self.current_focuser_position,
            "testing_position": self.current_testing_position,
            "best_position": self.current_best_position,
        }
        status.update(changes)
        return status

    def _checkAutofocusActive(self):
        if not self._isAutofocusActive():
            raise AutofocusCancelled("Autofocus session cancelled or stop-file requested")

    def _autofocusSettle(self):
        deadline = time.monotonic() + self.af_settle_time
        while time.monotonic() < deadline:
            self._checkAutofocusActive()
            time.sleep(min(0.1, max(0., deadline - time.monotonic())))

    def _approachFocusFromBelow(self, target, travel, max_step, focuser):
        """Approach a position in the positive-step direction, every time.

        This improves consistency but does NOT prove that unknown backlash is
        completely taken up. The travel distance is a conservative working
        allowance, not a measured backlash calibration.
        """
        preload = int(target) - int(travel)
        if preload < 0 or target > max_step:
            raise ValueError(
                f"Cannot approach {target} from below by {travel} steps "
                f"within focuser range 0..{max_step}"
            )
        self._checkAutofocusActive()
        focuser.move_to(preload, keep_running_callback=self._isAutofocusActive)
        self._checkAutofocusActive()
        focuser.move_to(target, keep_running_callback=self._isAutofocusActive)
        self.current_focuser_position = int(focuser.position)
        self.updateFocuserPosition.emit(self.current_focuser_position)

    def _measureFocusBatch(self, position, frames, min_valid_frames):
        """One ColibriGrab batch, measuring only locked star IDs when available."""
        paths = self._captureBatch(frames)    # unchanged working acquisition path
        measurements, star_counts, common_counts = [], [], []
        per_star_widths = {}
        frame_diagnostics = []
        batch_started_utc_epoch = time.time()
        for index, image_path in enumerate(paths):
            self._checkAutofocusActive()
            self.updateStatus.emit(self.makeAFStatus(
                f"Autofocus: {position}, frame {index+1}/{frames}"))
            metric = self.measureFocusMetric(image_path=image_path)
            self._checkAutofocusActive()
            locked = (metric or {}).get("locked_star_sigmas", {})
            score = (self.af_catalog.normalized_score(locked)
                     if self.af_catalog is not None else None)
            frame_diagnostics.append({
                "frame_index": index + 1,
                "rcd_filename": Path(image_path).name,
                "analysis_utc_epoch": time.time(),
                "score_px": float(score) if score is not None and np.isfinite(score) else None,
                "valid_fits": int((metric or {}).get("valid_fits", 0)),
                "matched_star_count": len(locked),
                "per_star_sigma_px": {str(k): float(v) for k, v in locked.items()},
                "image_mean_adu": float(metric["mean"]) if metric is not None else None,
                "image_std_adu": float(metric["std"]) if metric is not None else None,
                "fit_rejections": (metric or {}).get("fit_rejections", {}),
                "candidate_rejections": (metric or {}).get("candidate_rejections", {}),
                "field_counts": (metric or {}).get("field_counts", {}),
                "region_psf_scores_px": (metric or {}).get("region_psf_scores_px", {}),
                "fit_diagnostics": (metric or {}).get("fit_diagnostics", []),
            })
            if score is not None and np.isfinite(score):
                measurements.append(float(score))
                star_counts.append(int(metric.get("valid_fits", 0)))
                common_counts.append(len(locked))
                for star_id, width in locked.items():
                    per_star_widths.setdefault(int(star_id), []).append(float(width))
        if len(measurements) < min_valid_frames:
            print(f"Position {position}: only {len(measurements)}/{frames} valid locked-star "
                  "frames; rejecting position")
            if hasattr(self, 'af_rejected_batches'):
                self.af_rejected_batches.append({
                    'position':int(position), 'reason':'insufficient_valid_frames',
                    'valid_frames':len(measurements), 'required_frames':int(min_valid_frames),
                    'frame_diagnostics':frame_diagnostics})
            return None
        # At a given position, require each contributor to be fitted in at
        # least 70% of the requested frames. Intermittent outliers should not
        # quietly enter the cross-position stable-star cohort.
        required_per_star = max(2, int(np.ceil(frames * 0.70)))
        reliable = {sid:widths for sid,widths in per_star_widths.items()
                    if len(widths) >= required_per_star}
        if len(reliable) < 8:
            print(f"Position {position}: only {len(reliable)} stars present in "
                  f">={required_per_star}/{frames} frames; rejecting position")
            if hasattr(self, 'af_rejected_batches'):
                self.af_rejected_batches.append({
                    'position':int(position),'reason':'insufficient_reliable_stars',
                    'valid_frames':len(measurements), 'reliable_star_count':len(reliable),
                    'required_frames_per_star':int(required_per_star),
                    'frame_diagnostics':frame_diagnostics})
            return None
        # Reject intrinsically unstable fits from contributing to cross-position
        # AF score, but never reduce a usable field below eight reliable stars.
        quality_reliable = {sid:w for sid,w in reliable.items()
            if float(1.4826*np.median(np.abs(np.asarray(w)-np.median(w))) /
                     max(np.median(w),1.e-8)) <= 0.16}
        if len(quality_reliable) >= 8:
            reliable = quality_reliable
        per_star_widths = reliable
        median_score = float(np.median(measurements))
        median_abs_deviation = float(np.median(np.abs(np.asarray(measurements) - median_score)))
        return {
            "position": int(position),
            "batch_started_utc_epoch": batch_started_utc_epoch,
            "batch_finished_utc_epoch": time.time(),
            "frame_diagnostics": frame_diagnostics,
            "sigma_px": median_score,
            "sigma_mad_px": median_abs_deviation,
            "valid_frames": len(measurements),
            "requested_frames": int(frames),
            "median_valid_stars": float(np.median(star_counts)),
            "median_matched_stars": float(np.median(common_counts)),
            "measurement": "median per-star width ratio, scaled to reference sigma",
            "matched_star_ids": sorted(per_star_widths),
            "per_star_median_sigma_px": {str(k):float(np.median(v))
                                         for k,v in per_star_widths.items()},
            "per_star_valid_frames": {str(k):len(v)
                                      for k,v in per_star_widths.items()},
            "per_star_mad_sigma_px": {str(k):float(np.median(np.abs(np.asarray(v)-np.median(v))))
                                     for k,v in per_star_widths.items()},
        }

    def _moveFocusForScan(self, target, last_position, approach_steps, max_step, focuser):
        """Always approach a measured point from below; limit travel in caller."""
        self._checkAutofocusActive()
        if target < 0 or target > max_step:
            raise AutofocusNotConverged(f"Focuser target {target} out of travel 0..{max_step}")
        if target == last_position:
            # Initial reference requires no movement, and no redundant slew
            # is needed if the focuser is already at this exact position.
            pass
        elif last_position is None or target < last_position:
            self._approachFocusFromBelow(target, approach_steps, max_step, focuser)
        else:
            focuser.move_to(int(target), keep_running_callback=self._isAutofocusActive)
        self.current_focuser_position = int(focuser.position)
        self.updateFocuserPosition.emit(self.current_focuser_position)
        self.current_testing_position = int(target)
        self._autofocusSettle()
        self._checkAutofocusActive()
        return int(focuser.position)

    def _validateFocusResponse(self, positions, results, best_pos, best_score):
        """Conservative multi-position check that PSF width responds to focus.

        Reject flat/jagged minima potentially produced by detector features or
        unstable seeing. This DOES NOT identify individual hot pixels, and is
        not a replacement for good stars or a future bad-pixel calibration.
        Thresholds are provisional until calibrated against real focus curves.
        """
        by_position = {int(r["position"]): r for r in results}
        best_index = positions.index(best_pos)
        # Need the two immediately adjacent positions on BOTH sides to establish
        # a trend; a single-point dip is insufficient evidence for focus.
        if best_index < 2 or best_index > len(positions) - 3:
            raise AutofocusNotConverged(
                f"Focus response inconclusive: apparent minimum {best_pos} is "
                "fewer than two scan steps from an edge"
            )

        best_result = by_position[best_pos]
        best_mad = max(0.0, float(best_result.get("sigma_mad_px", 0.0)))
        diagnostics = {"best_position": best_pos, "sides": {}}
        # Require a clear rise in stellar width two steps away from the minimum,
        # and do not accept a major downward reversal as we move farther out.
        # A noise-dependent floor guards against flat curves with jitter.
        for label, sign in (("lower_focus", -1), ("higher_focus", +1)):
            near_pos = positions[best_index + sign]
            far_pos = positions[best_index + 2 * sign]
            if near_pos not in by_position or far_pos not in by_position:
                raise AutofocusNotConverged(
                    f"Focus response inconclusive: missing valid {label} "
                    f"samples at {near_pos} or {far_pos}"
                )
            near = by_position[near_pos]
            far = by_position[far_pos]
            near_sigma = float(near["sigma_px"])
            far_sigma = float(far["sigma_px"])
            near_mad = max(0.0, float(near.get("sigma_mad_px", 0.0)))
            far_mad = max(0.0, float(far.get("sigma_mad_px", 0.0)))

            # With 3-5 frames MAD is only a rough noise estimate, so use both
            # a relative minimum (3%) and a scatter-dependent minimum.
            required_far_rise = max(
                0.03 * best_score,
                2.0 * (best_mad + far_mad),
            )
            if far_sigma - best_score < required_far_rise:
                raise AutofocusNotConverged(
                    f"Focus response inconclusive on {label}: sigma at "
                    f"{far_pos}={far_sigma:.4f} is not sufficiently broader "
                    f"than best {best_score:.4f} "
                    f"(required rise {required_far_rise:.4f} px)"
                )

            # If the farther sample becomes markedly SHARPER than the nearer
            # sample, the curve is jagged rather than a convincing bowl.
            allowed_reversal = 0.015 * best_score
            if far_sigma + allowed_reversal < near_sigma:
                raise AutofocusNotConverged(
                    f"Focus response inconsistent on {label}: sigma "
                    f"{near_pos}={near_sigma:.4f} falls to "
                    f"{far_pos}={far_sigma:.4f} farther from the minimum"
                )
            # Also require near-neighbor improvement to exceed sample scatter,
            # not merely the pre-existing 1% relative contrast threshold.
            # A smooth minimum between encoder steps can make its closest
            # neighbor nearly indistinguishable from the best sample. The
            # farther-point rise and quadratic-fit checks carry more weight.
            required_near_rise = max(
                0.003 * best_score,
                0.5 * (best_mad + near_mad),
            )
            if near_sigma - best_score < required_near_rise:
                raise AutofocusNotConverged(
                    f"Focus response indistinguishable from noise on {label}: "
                    f"neighbor rise {near_sigma - best_score:.4f} px; "
                    f"required {required_near_rise:.4f} px"
                )
            diagnostics["sides"][label] = {
                "near_position": int(near_pos),
                "far_position": int(far_pos),
                "near_sigma_px": near_sigma,
                "far_sigma_px": far_sigma,
                "far_rise_px": far_sigma - best_score,
                "required_far_rise_px": required_far_rise,
                "near_rise_px": near_sigma - best_score,
                "required_near_rise_px": required_near_rise,
            }
        print(
            "Focus response validated: PSF width increases on both sides "
            "of the measured minimum"
        )
        return diagnostics

    def _compareRepeatBatches(self, initial, repeated, label):
        """Compare two visits to the SAME focus position with common star IDs.

        Only diagnostic statistics. Caller decides if unstable seeing warrants
        rejection. Both measurements are rescored with the same reference IDs.
        """
        if initial is None or repeated is None or self.af_catalog is None:
            raise AutofocusNotConverged(f"{label} repeat lacks valid stellar batches")
        initial_ids = {int(i) for i in initial.get("per_star_median_sigma_px", {})}
        repeat_ids = {int(i) for i in repeated.get("per_star_median_sigma_px", {})}
        common_ids = sorted(initial_ids & repeat_ids)
        first_score, n1 = matched_cohort_score(
            initial, self.af_catalog.stars, common_ids, min_stars=8)
        repeat_score, n2 = matched_cohort_score(
            repeated, self.af_catalog.stars, common_ids, min_stars=8)
        drift = abs(repeat_score - first_score)
        allowance = max(0.04 * first_score,
                        3.0 * (float(initial.get("sigma_mad_px", 0.0)) +
                               float(repeated.get("sigma_mad_px", 0.0))))
        return {
            "label": str(label), "position": int(initial["position"]),
            "original_score_px": float(first_score),
            "repeated_score_px": float(repeat_score),
            "absolute_change_px": float(drift),
            "relative_change_percent": float(100 * drift / first_score),
            "allowed_change_px": float(allowance),
            "matched_cohort_stars": min(n1, n2),
            "shared_star_ids": common_ids,
            "original_batch_started_utc_epoch": initial.get("batch_started_utc_epoch"),
            "repeat_batch_started_utc_epoch": repeated.get("batch_started_utc_epoch"),
            "passed": bool(drift <= allowance),
            "repeated_batch": repeated,
        }

    def _saveAutofocusDiagnostics(self, result, stable_fine_rows):
        """Save small read-only analysis files: no raw RCD image data or hardware I/O.

        The GUI needs these particularly on failure, because full RCD batches
        are too large to share and a console transcript omits per-star values.
        """
        import csv
        import json
        try:
            root = self._getGrabber().output_root / self._getGrabber().run_id
            root.mkdir(parents=True, exist_ok=True)
            identifier = time.strftime('%Y%m%d_%H%M%S', time.gmtime())
            json_path = root / f'autofocus_diagnostics_{identifier}.json'
            csv_path = root / f'autofocus_curve_{identifier}.csv'
            summary = dict(result)
            summary['stable_cohort_fine_positions'] = list(stable_fine_rows)
            json_path.write_text(json.dumps(summary, indent=2, default=float), encoding='utf-8')
            coarse = [r for r in result.get('positions', [])
                      if str(r.get('stage','')).startswith('coarse')]
            fine = list(stable_fine_rows)
            if not fine:
                fine = [r for r in result.get('positions',[])
                        if str(r.get('stage','')).startswith('fine')]
            with csv_path.open('w', newline='', encoding='utf-8') as fh:
                writer = csv.writer(fh)
                writer.writerow(['stage','focuser_position','normalized_width_px',
                                 'frame_mad_px','matched_stars','stable_cohort_stars'])
                for stage, values in (('coarse', coarse),('fine', fine)):
                    for r in sorted(values,key=lambda t:int(t['position'])):
                        writer.writerow([stage,r['position'],r.get('sigma_px'),
                                         r.get('sigma_mad_px'),r.get('median_matched_stars'),
                                         r.get('stable_cohort_count','')])
            result['diagnostics_json'] = str(json_path)
            result['diagnostics_csv'] = str(csv_path)
            print('Autofocus diagnostics saved: ' + str(json_path))
            print('Autofocus focus curve saved: ' + str(csv_path))
        except Exception as exc:
            # Failed disk logging must never cause new focuser movements.
            print('WARNING: Could not save autofocus diagnostics: ' + str(exc))

    def runAutofocus(self):
        """Bounded coarse search and fine refinement using fixed reference stars.

        If the initial focus is so poor that no stars can be fitted anywhere in
        the bounded range, abort safely. This is not a blind full-travel finder.
        """
        print("Starting v3.5.1 spatial-star/fit-diagnostic autofocus sweep.")
        self.current_testing_position = None
        self.current_best_position = None
        self.af_catalog = None
        self.af_tracking_active = True
        self.af_rejected_batches = []
        start_pos, best_pos, best_score, verification = None, None, None, None
        results, coarse_results, fine_results = [], {}, {}
        response_diagnostics, fitted_vertex = None, None
        repeatability = None
        coarse_repeatability = None
        fine_cohort_ids = []
        fine_rows = []
        approach_steps = None
        try:
            self._checkAutofocusActive()
            if self.focuser_controller is None:
                self.focuser_controller = ASCOMFocuserController(self.focuser_driver_id)
            focuser = self.focuser_controller
            focuser.connect()
            start_pos = int(focuser.position)
            self.current_focuser_position = start_pos
            self.updateAutofocusStart.emit(start_pos)
            self.updateFocuserPosition.emit(start_pos)
            fine_step = int(self.af_step_size)
            side = int(self.af_steps_each_side)
            frames = int(self.af_frames_per_position)
            backlash = int(self.af_backlash_steps)
            coarse_mult = int(self.af_coarse_multiplier)
            max_excursion = int(self.af_max_excursion)
            if fine_step <= 0 or side < 2 or frames < 2 or backlash < 0:
                raise ValueError("Requires positive focus step, >=2 steps each side, >=2 frames")
            if coarse_mult < 2 or max_excursion < side*fine_step*coarse_mult:
                raise ValueError("Coarse multiplier >=2 and max travel must cover the initial coarse sweep")
            coarse_step = fine_step * coarse_mult
            approach_steps = max(coarse_step, backlash)
            max_step = int(focuser.focuser.MaxStep)
            # Include the negative-direction preload in the excursion budget.
            lower_limit = max(approach_steps, start_pos - max_excursion + approach_steps)
            upper_limit = min(max_step, start_pos + max_excursion)
            if lower_limit >= start_pos or upper_limit <= start_pos:
                raise AutofocusNotConverged("Not enough safe focuser travel around starting position")
            if start_pos - side*coarse_step < lower_limit or start_pos + side*coarse_step > upper_limit:
                raise AutofocusNotConverged(
                    f"Coarse sweep needs {start_pos-side*coarse_step}.."
                    f"{start_pos+side*coarse_step}, safe limits {lower_limit}..{upper_limit}")
            # Reject batches where a minority of frames alone have usable PSFs.
            min_valid_frames = max(2, int(np.ceil(frames * 0.70)))
            last_pos = start_pos
            print(f"Reference start={start_pos}; coarse step={coarse_step}; fine step={fine_step}; "
                  f"maximum excursion +/-{max_excursion}, safe range={lower_limit}..{upper_limit}")

            def measure_at(position, storage, phase):
                nonlocal last_pos
                position = int(position)
                if position < lower_limit or position > upper_limit:
                    raise AutofocusNotConverged(f"{phase} target {position} outside safe autofocus range")
                if position in storage:
                    return storage[position]
                self.updateStatus.emit(self.makeAFStatus(f"{phase}: focus {position}"))
                last_pos = self._moveFocusForScan(position, last_pos, approach_steps, max_step, focuser)
                result = self._measureFocusBatch(position, frames, min_valid_frames)
                storage[position] = result
                if result is not None:
                    results.append(dict(result, stage=phase))
                    self.updateAutofocusPlot.emit(position, result["sigma_px"])
                    print(f"{phase} {position}: normalized sigma={result['sigma_px']:.4f} "
                          f"MAD={result['sigma_mad_px']:.4f}, "
                          f"matched stars={result['median_matched_stars']:.0f}")
                return result

            self.updateAutofocusStage.emit("Coarse search")
            # Build the reference at the current focus before moving. If it is
            # unusable, the bounded coarse probes may discover reference stars.
            measure_at(start_pos, coarse_results, "coarse")
            base_positions = sorted(set(start_pos + j*coarse_step for j in range(-side,side+1)))
            if self.af_catalog is None:
                # Discover a usable reference symmetrically, nearest first.
                discovery = sorted((p for p in base_positions if p != start_pos),
                                   key=lambda p:(abs(p-start_pos),p))
                for p in discovery:
                    measure_at(p,coarse_results,"reference discovery")
                    if self.af_catalog is not None:
                        break
                if self.af_catalog is None:
                    raise AutofocusNotConverged(
                        "No reference field with >=8 valid separated PSFs in initial coarse sweep; "
                        "manual approximate focusing required")
            print(f"Locked reference catalog: {len(self.af_catalog.stars)} sources")
            # Previously invalid images may now be remeasured with the catalog.
            for p in base_positions:
                if p in coarse_results and coarse_results[p] is None:
                    del coarse_results[p]
                measure_at(p,coarse_results,"coarse")

            # Extend only toward a sampled minimum at a scan edge, bounded by
            # hard limits and a maximum total acquisition count.
            max_coarse_samples = max(len(base_positions), 15)
            while True:
                usable = {p:r["sigma_px"] for p,r in coarse_results.items() if r is not None}
                if len(usable) < 5:
                    raise AutofocusNotConverged("Too few valid coarse measurements with matched stars")
                samples = sorted(usable)
                best_coarse_pos = min(usable, key=usable.get)
                if best_coarse_pos != samples[0] and best_coarse_pos != samples[-1]:
                    # A bracket exists. Fine scan and physical validation decide success.
                    break
                if len(coarse_results) >= max_coarse_samples:
                    raise AutofocusNotConverged("Coarse focus minimum not bracketed within acquisition limit")
                side_sign = -1 if best_coarse_pos == samples[0] else +1
                next_pos = best_coarse_pos + side_sign*coarse_step
                if next_pos < lower_limit or next_pos > upper_limit:
                    raise AutofocusNotConverged("Coarse focus minimum outside allowed travel; restore start")
                if next_pos in coarse_results:
                    raise AutofocusNotConverged("Coarse search cannot extend past invalid samples")
                # A weak edge improvement is not evidence for limitless travel.
                prev_pos = best_coarse_pos - side_sign*coarse_step
                if prev_pos in usable:
                    improvement = usable[prev_pos] - usable[best_coarse_pos]
                    short_threshold = max(
                        0.005 * usable[best_coarse_pos],
                        1.5 * float(coarse_results[best_coarse_pos]["sigma_mad_px"]))
                    if improvement < short_threshold:
                        # A near-flat *last* interval can mask a real longer
                        # decreasing trend. Permit one more bounded probe only
                        # if the preceding interval was improving and the
                        # two-interval decrease exceeds the observed batch
                        # scatter. This does NOT accept focus at the edge.
                        lookback_pos = prev_pos - side_sign * coarse_step
                        supported = False
                        if lookback_pos in usable:
                            lookback_gain = usable[lookback_pos] - usable[best_coarse_pos]
                            trend_threshold = max(
                                0.02 * usable[best_coarse_pos],
                                2.0 * float(np.hypot(
                                    coarse_results[lookback_pos]["sigma_mad_px"],
                                    coarse_results[best_coarse_pos]["sigma_mad_px"])))
                            supported = (usable[lookback_pos] > usable[prev_pos]
                                         and lookback_gain >= trend_threshold)
                        if not supported:
                            raise AutofocusNotConverged(
                                "Coarse edge trend too weak to justify wider search")
                        print(
                            f"Coarse last step inconclusive ({improvement:.4f} < "
                            f"{short_threshold:.4f}), but preceding two-step "
                            f"trend supports one bounded confirmation at {next_pos}")
                print(f"Coarse minimum at boundary {best_coarse_pos}; extending to {next_pos}")
                measure_at(next_pos, coarse_results, "coarse extended")

            print(f"Coarse focus bracketed near {best_coarse_pos}; running coarse repeat check")
            self.updateStatus.emit(self.makeAFStatus(
                f"Diagnostic: repeat coarse focus position {best_coarse_pos}"))
            last_pos = self._moveFocusForScan(
                best_coarse_pos, last_pos, approach_steps, max_step, focuser)
            coarse_repeated = self._measureFocusBatch(
                best_coarse_pos, frames, min_valid_frames)
            if coarse_results[best_coarse_pos] is not None and coarse_repeated is not None:
                try:
                    coarse_repeatability = self._compareRepeatBatches(
                        coarse_results[best_coarse_pos], coarse_repeated,
                        "coarse_best_revisited_before_fine")
                    print(f"Coarse repeat at {best_coarse_pos}: "
                          f"{coarse_repeatability['original_score_px']:.4f} -> "
                          f"{coarse_repeatability['repeated_score_px']:.4f} "
                          f"({coarse_repeatability['relative_change_percent']:.1f}% change)")
                except ValueError as exc:
                    coarse_repeatability = {"position": best_coarse_pos,
                                            "error": str(exc), "passed": False}
            else:
                coarse_repeatability = {"position": best_coarse_pos,
                                        "error": "Insufficient stars in repeat", "passed": False}
            # Coarse repeat drift is diagnostic only; it must not cause an
            # unsafe response or make us skip the independent fine assessment.
            self.updateAutofocusStage.emit("Fine refinement")
            fine_positions = [best_coarse_pos + j*fine_step for j in range(-side,side+1)]
            for p in fine_positions:
                measure_at(p, fine_results, "fine")

            # Evaluate a common set of stars at EVERY fine position, not just
            # whichever 18..23 sources happened to be available in each frame.
            # If the minimum sits near a fine-scan edge, extend only in that
            # direction, subject to the same hard motor limits and an additional
            # six-sample cap. Reject rather than extrapolate from an edge.
            max_extra_fine_positions = 6
            added_fine_positions = 0
            while True:
                if any(fine_results.get(p) is None for p in fine_positions):
                    raise AutofocusNotConverged(
                        "One or more fine-scan positions lack reliable matched-star images")
                try:
                    fine_rows, fine_cohort_ids = rescore_stable_cohort(
                        [fine_results[p] for p in fine_positions], self.af_catalog.stars,
                        min_stars=8)
                except ValueError as cohort_error:
                    raise AutofocusNotConverged(
                        "Cannot compare the same stars over the fine sweep: " + str(cohort_error))
                best_row = min(fine_rows, key=lambda r:r["sigma_px"])
                sample_best = int(best_row["position"])
                best_index = fine_positions.index(sample_best)
                if 2 <= best_index <= len(fine_positions) - 3:
                    break
                if added_fine_positions >= max_extra_fine_positions:
                    raise AutofocusNotConverged(
                        "Fine minimum remains near a boundary after six extensions")
                direction = -1 if best_index < 2 else 1
                next_pos = (fine_positions[0] - fine_step if direction < 0
                            else fine_positions[-1] + fine_step)
                if not lower_limit <= next_pos <= upper_limit:
                    raise AutofocusNotConverged(
                        "Fine minimum remains near a boundary; travel limit reached")
                print(f"Fine best sampled at {sample_best} near sweep edge; "
                      f"extending to {next_pos} (extra {added_fine_positions+1}/6)")
                self.updateStatus.emit(self.makeAFStatus(
                    f"Fine search extending to {next_pos} (within safety limits)"))
                measure_at(next_pos, fine_results, "fine extended")
                if direction < 0:
                    fine_positions.insert(0, next_pos)
                else:
                    fine_positions.append(next_pos)
                added_fine_positions += 1

            # Replot the final stable-cohort scores. The interim curve was a
            # quick per-image score, not identical-star aggregate measurements.
            self.updateAutofocusStage.emit("Fine refinement — common-star scores")
            for row in fine_rows:
                self.updateAutofocusPlot.emit(int(row["position"]), float(row["sigma_px"]))
            print(f"Fine stable cohort: {len(fine_cohort_ids)} shared stars "
                  f"at {len(fine_rows)} positions; best sampled={sample_best}")
            best_score = float(best_row["sigma_px"])
            # Critical v3.3 change: collect repeatability even if the curve is
            # jagged and will fail the response validator. Never write a focus
            # success based solely on the apparent best point.
            # Revisit a previously measured point at the END of the fine scan.
            # This detects seeing/time-dependent measurement changes without
            # declaring an apparent one-frame improvement to be a focus fix.
            print(f"Repeating focus measurement at {sample_best} to test stability")
            self.updateStatus.emit(self.makeAFStatus(
                f"Checking repeatability at {sample_best}"))
            last_pos = self._moveFocusForScan(
                sample_best, last_pos, approach_steps, max_step, focuser)
            repeated = self._measureFocusBatch(sample_best, frames, min_valid_frames)
            if repeated is None:
                raise AutofocusNotConverged("Repeatability test produced too few matched stars")
            try:
                repeated_score, repeated_count = matched_cohort_score(
                    repeated, self.af_catalog.stars, fine_cohort_ids, min_stars=8)
            except ValueError as exc:
                raise AutofocusNotConverged("Repeatability check lost stable stars: " + str(exc))
            original = next(r for r in fine_rows if r["position"] == sample_best)
            try:
                repeatability = self._compareRepeatBatches(
                    original, repeated, "fine_best_revisited_before_curve_validation")
            except ValueError as exc:
                raise AutofocusNotConverged("Fine repeat could not match stars: " + str(exc))
            repeatability["stable_fine_cohort_score_px"] = float(original["sigma_px"])
            repeatability["revisit_stable_fine_cohort_score_px"] = float(repeated_score)
            repeatability["stable_fine_cohort_count"] = repeated_count
            stable_drift = abs(float(original["sigma_px"]) - float(repeated_score))
            stable_allowance = max(
                0.04 * float(original["sigma_px"]),
                3.0 * (float(original.get("sigma_mad_px", 0.0)) +
                       float(repeated.get("sigma_mad_px", 0.0))))
            repeatability["stable_cohort_absolute_change_px"] = stable_drift
            repeatability["stable_cohort_allowed_change_px"] = stable_allowance
            repeatability["stable_cohort_passed"] = stable_drift <= stable_allowance
            repeatability["passed"] = (repeatability["passed"] and
                                       repeatability["stable_cohort_passed"])
            print(f"Fine repeat at {sample_best}: "
                  f"{repeatability['original_score_px']:.4f} -> "
                  f"{repeatability['repeated_score_px']:.4f} "
                  f"(max change {repeatability['allowed_change_px']:.4f})")
            if not repeatability["passed"]:
                raise AutofocusNotConverged(
                    f"Focus score drifted at unchanged position {sample_best}: "
                    f"difference={repeatability['absolute_change_px']:.4f}, "
                    f"allowed={repeatability['allowed_change_px']:.4f}")
            response_diagnostics = self._validateFocusResponse(
                fine_positions, fine_rows, sample_best, best_score)
            fitted_vertex = fitted_focus_vertex(fine_positions,
                                                 [r["sigma_px"] for r in fine_rows])
            if fitted_vertex is None:
                raise AutofocusNotConverged(
                    "Stable-star fine curve not sufficiently parabolic to interpolate")
            best_pos = int(fitted_vertex["position"])
            self.current_best_position = best_pos
            self.current_testing_position = None
            if not lower_limit <= best_pos <= upper_limit:
                raise AutofocusNotConverged("Interpolated best focus outside safe travel")

            print(f"Fine quadratic vertex={best_pos}, best sampled={sample_best}; verifying")
            self.updateStatus.emit(self.makeAFStatus(f"Verifying interpolated focus {best_pos}"))
            self._approachFocusFromBelow(best_pos, approach_steps, max_step, focuser)
            last_pos = int(focuser.position)
            self._autofocusSettle()
            verification = self._measureFocusBatch(best_pos, frames, min_valid_frames)
            if verification is None:
                raise AutofocusVerificationFailed("Final check lacked enough locked-star measurements")
            # Final verification must also use the same fine-scan star cohort.
            try:
                verified_score, verified_count = matched_cohort_score(
                    verification, self.af_catalog.stars, fine_cohort_ids, min_stars=8)
            except ValueError as exc:
                raise AutofocusVerificationFailed(
                    "Final verification lost common reference stars: " + str(exc))
            verification["stable_cohort_score_px"] = verified_score
            verification["stable_cohort_star_count"] = verified_count
            if verified_score > best_score*(1+self.af_verify_tolerance):
                raise AutofocusVerificationFailed(
                    f"Verification sigma {verified_score:.4f} differs from "
                    f"best sampled sigma {best_score:.4f} beyond tolerance")
            self._checkAutofocusActive()
            self.current_focuser_position = int(focuser.position)
            self.updateFocuserPosition.emit(self.current_focuser_position)
            self.updateBestFocus.emit(best_pos, best_score)
            result = {
                "success": True, "best_position": best_pos,
                "best_sampled_position": sample_best,
                "best_sigma_px": best_score,
                "start_position": start_pos,
                "verification": verification,
                "coarse_positions": [r for r in results if r['stage'].startswith('coarse')],
                "fine_positions": fine_rows,
                "positions": results,
                "rejected_batches":self.af_rejected_batches,
                "reference_star_count":len(self.af_catalog.stars),
                "reference_stars": [{"id":i,"x":q[0],"y":q[1],"sigma_px":q[2]}
                                    for i,q in enumerate(self.af_catalog.stars)],
                "focus_response":response_diagnostics,
                "quadratic_fit": fitted_vertex,
                "stable_fine_star_ids": fine_cohort_ids,
                "stable_fine_star_count": len(fine_cohort_ids),
                "fine_extensions": added_fine_positions,
                "repeatability": repeatability,
                "coarse_repeatability": coarse_repeatability,
                "diagnostic_version": "v3.5.1",
                "approach_direction":"increasing_position",
                "approach_steps": approach_steps,
                "camera_backend":"ColibriGrab",
                "rcd_output_root": str(self._getGrabber().output_root / self._getGrabber().run_id),
            }
            self._saveAutofocusDiagnostics(result, fine_rows)
            self.autofocusResult.emit(result)
            return result
        except Exception as error:
            cancelled = isinstance(error, (AutofocusCancelled, GrabCancelled))
            restoration = "not attempted"
            if (isinstance(error,(AutofocusNotConverged, AutofocusVerificationFailed))
                    and start_pos is not None and self._isAutofocusActive()):
                try:
                    self._approachFocusFromBelow(start_pos, approach_steps,
                                                 int(self.focuser_controller.focuser.MaxStep),
                                                 self.focuser_controller)
                    self.current_focuser_position = int(self.focuser_controller.position)
                    self.updateFocuserPosition.emit(self.current_focuser_position)
                    restoration = "returned to starting position"
                except Exception as recovery_error:
                    restoration = f"restore failed: {recovery_error}"
            elif isinstance(error,(AutofocusNotConverged, AutofocusVerificationFailed)):
                restoration = "not attempted (stopped or unsafe)"
            # Final status must not advertise the last scanned point as the
            # current target after a confirmed restoration to the start.
            self.current_testing_position = None
            self.current_best_position = None
            message = f"Autofocus {'cancelled' if cancelled else 'failed'}: {error} ({restoration})"
            print(message)
            self.updateStatus.emit(self.makeAFStatus(message))
            result = {"success":False,"cancelled":cancelled,"error":str(error),
                      "start_position":start_pos,"last_position":self.current_focuser_position,
                      "chosen_position":best_pos,"restoration":restoration,
                      "positions":results,"verification":verification,
                      "rejected_batches":self.af_rejected_batches,
                      "repeatability":repeatability,
                      "coarse_repeatability":coarse_repeatability,
                      "diagnostic_version":"v3.5.1",
                      "reference_stars": ([{"id":i,"x":q[0],"y":q[1],"sigma_px":q[2]}
                                          for i,q in enumerate(self.af_catalog.stars)]
                                          if self.af_catalog is not None else []),
                      "fine_positions":fine_rows,
                      "stable_fine_star_ids":fine_cohort_ids,
                      "camera_backend":"ColibriGrab"}
            self._saveAutofocusDiagnostics(result, fine_rows)
            self.autofocusResult.emit(result)
            return result
        finally:
            self.af_tracking_active = False
            self.af_catalog = None
            self.current_testing_position = None
            while True:
                try:
                    self.focus_command_queue.get_nowait()
                except queue.Empty:
                    break
            self.threadactive = False

    def _streamDropout(self):
        """Allow recovery after a cloud, field change, or persistent tracking loss."""
        if self.capture_mode != 'Stream' or self.stream_catalog is None:
            return
        self.stream_low_match_streak += 1
        if self.stream_low_match_streak >= 6:
            print('Stream reference stars missing for six frames; reacquiring catalog')
            self.stream_catalog = None
            self.stream_cohort_ids = None
            self.stream_recent_matches = []
            self.stream_low_match_streak = 0

    def _logStreamFrame(self, record):
        """Append a small stationary/stream focus measurement; never interrupt imaging."""
        if self.capture_mode != "Stream":
            return
        try:
            if self.stream_diagnostic_path is None:
                grab = self._getGrabber()
                run_dir = Path(grab.output_root) / grab.run_id
                run_dir.mkdir(parents=True, exist_ok=True)
                self.stream_diagnostic_path = run_dir / 'stream_star_diagnostics_v35.csv'
            fields = ['frame', 'utc_epoch', 'focuser_position', 'matched_stars',
                      'accepted_psfs', 'detected_peaks', 'psf_score_px',
                      'field_counts_json', 'region_scores_json', 'rejections_json',
                      'fit_details_json', 'star_widths_json', 'reference_stars_json',
                      'stable_cohort_ids_json', 'star_quality_json', 'cohort_present']
            path = self.stream_diagnostic_path
            is_new = not path.exists()
            with path.open('a', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=fields)
                if is_new:
                    writer.writeheader()
                writer.writerow({key:record.get(key) for key in fields})
        except Exception as exc:
            # Disk write failure must not affect camera/focuser behavior.
            if self.stream_frame_index <= 2:
                print(f'WARNING: stream CSV unavailable: {exc}')

    def measureFocusMetric(self, image_path=None):
        """
        Read one ColibriGrab high-gain RCD image, detect stars, fit PSFs, update GUI,
        and return a dictionary containing the focus metric.

        Returns:
            dict if a valid focus metric was measured.
            None if the image was captured but no usable focus metric was found.
        """

        try:
            if image_path is None:
                # GUI Single Image / Stream: capture one frame on demand.
                image_path = self._captureBatch(1)[0]
            nda = read_rcd_high_gain(image_path)
        except (GrabCancelled, TimeoutError):
            raise
        except Exception as e:
            print(f"ERROR acquiring/reading ColibriGrab RCD: {e}")
            return None

        # Display latest image in GUI
        self.updateFocusFrame.emit(nda)
        if self.capture_mode == 'Stream':
            self.stream_frame_index += 1

        # Basic image statistics
        global_mean = np.mean(nda)
        global_stddev = np.std(nda)

        print(f"Image mean = {global_mean} +/- {global_stddev}")

        # Convert to float for analysis
        data = nda.astype(np.float32)

        # Apply a small mean filter to reduce pixel-scale noise.
        fx = 2
        fy = 2
        data = ndimage.convolve(data, weights=np.full((fx, fy), 1.0 / 4.0))

        # Robust background/noise estimate for peak detection.
        finite = data[np.isfinite(data)]

        if finite.size == 0:
            print("No finite pixels found.")
            return None

        median = np.median(finite)
        mad = np.median(np.abs(finite - median))
        robust_sigma = 1.4826 * mad

        if robust_sigma <= 0:
            robust_sigma = np.std(finite)

        # Use a sigma-based threshold instead of only the fixed intensity threshold.
        # This prevents closed-dome noise/hot pixels from being counted as thousands of stars.
        sigma_threshold = 4.0
        intensity_threshold = max(self.intensity_threshold, sigma_threshold * robust_sigma)
        peak_floor = median + sigma_threshold * robust_sigma

        focuser_position = self.getFocuserPositionSafe()

        print(
            f"Background median={median:.1f}, "
            f"robust sigma={robust_sigma:.1f}, "
            f"peak floor={peak_floor:.1f}"
        )

        basic_status = {
            "state": "Image captured. Searching for stars...",
            "mean": global_mean,
            "std": global_stddev,
            "min": np.nanmin(nda),
            "max": np.nanmax(nda),
            "detected_peaks": 0,
            "valid_fits": 0,
            "sigma_x": None,
            "sigma_y": None,
            "sigma_avg": None,
            "exposure": self.exposure,
            "gain": self.gain,
            "binning": f"{self.bin_x}x{self.bin_y}",
            "capture_mode": self.capture_mode,
            "focuser_position": focuser_position,
            "testing_position": self.current_testing_position,
            "best_position": self.current_best_position,
        }

        self.updateStatus.emit(basic_status)

        # Keep approximately the same angular detection footprint at each binning.
        bin_factor = max(1, int(max(self.bin_x, self.bin_y)))

        neighborhood_size = max(
            5,
            int(round(self.neighborhood_size / bin_factor))
        )

        data_max = ndimage.maximum_filter(data, neighborhood_size)
        maxima = (data == data_max)

        # Reject local maxima that are not bright enough above the background.
        maxima[data < peak_floor] = 0

        # RCD high-gain pixels are raw 12-bit values (maximum 4095).
        sensor_saturation = RCD_SATURATION
        saturation_cut = 0.98 * sensor_saturation

        # Use the raw image, not the smoothed detection image, to identify
        # saturated pixels. Dilate the mask so we reject candidates adjacent
        # to a saturated core as well.
        saturated_mask = nda >= saturation_cut
        saturated_mask = ndimage.maximum_filter(
            saturated_mask.astype(np.uint8),
            size=3
        ) > 0

        maxima[saturated_mask] = 0

        data_min = ndimage.minimum_filter(data, neighborhood_size + 10)
        diff = ((data_max - data_min) > intensity_threshold)
        maxima[diff == 0] = 0

        # Mask out image edges to avoid partial stars/noisy borders.
        border = 5
        maxima[:border, :] = 0
        maxima[-border:, :] = 0
        maxima[:, :border] = 0
        maxima[:, -border:] = 0

        # Find and label local maxima.
        labeled, num_objects = ndimage.label(maxima)

        if num_objects == 0:
            print("No stars found.")
            self._streamDropout()
            self._logStreamFrame({
                'frame':self.stream_frame_index,'utc_epoch':time.time(),
                'focuser_position':focuser_position,'matched_stars':0,
                'accepted_psfs':0,'detected_peaks':0,'psf_score_px':None,
                'rejections_json':json.dumps({'no_detected_peaks':1})})
            self.updateStarOverlay.emit([], [], [], [])

            no_star_status = basic_status.copy()
            no_star_status["state"] = "Image captured, but no stars were found."
            self.updateStatus.emit(no_star_status)

            return None

        # Find centres of mass for each detected peak.
        xy = np.array(ndimage.center_of_mass(data, labeled, range(1, num_objects + 1)))

        if xy.size == 0:
            print("No star centers found.")
            self._streamDropout()
            self.updateStarOverlay.emit([], [], [], [])

            no_center_status = basic_status.copy()
            no_center_status["state"] = "Image captured, but no star centers were found."
            no_center_status["detected_peaks"] = num_objects
            self.updateStatus.emit(no_center_status)

            return None

        # Unpack coordinates.
        y, x = np.hsplit(xy, 2)

        all_points = np.column_stack((x.flatten(), y.flatten()))
        # A locked catalog is used in both AF and Stream, but they are never
        # shared. A disappearing star is *not* replaced by an unrelated peak.
        catalog = self.af_catalog if self.af_tracking_active else (
            self.stream_catalog if self.capture_mode == "Stream" else None)
        if catalog is not None:
            chosen, _ids = catalog.choose_candidates(all_points)
            candidate_points = np.asarray(chosen, dtype=float).reshape(-1, 2)
            selection_rejections = {'catalog_not_found': len(catalog.stars)-len(chosen)}
        else:
            # Consider bright, isolated peaks from center + all quadrants.
            # The candidate budget is applied *before* expensive Gaussian fitting.
            peaks = np.asarray([
                max(0., float(nda[int(round(py)),int(round(px))]) - float(median))
                if 0 <= int(round(py)) < nda.shape[0] and 0 <= int(round(px)) < nda.shape[1]
                else 0. for px, py in all_points], dtype=float)
            indices, selection_rejections = spatial_candidate_order(
                all_points, peaks, nda.shape,
                limit=max(8, self.max_fit_candidates),
                edge_margin=max(14,int(np.ceil(self.segment_radius/2)))
            )
            candidate_points = all_points[indices]
        # Locked stars must always be attempted. For a new field, start with
        # 28 distributed targets and only spend the remaining fitting budget
        # if rejects leave <25 reliable Gaussian fits.
        locked_selection = catalog is not None
        initial = len(candidate_points) if locked_selection else min(28,len(candidate_points))
        attempted_points = candidate_points[:initial].copy()
        x = attempted_points[:,0].reshape(-1,1)
        y = attempted_points[:,1].reshape(-1,1)
        (x2, y2, amplitude, intensity, sigma_y_fitted, sigma_x_fitted,
         fit_records) = self.fitPSF(nda, global_mean, x, y, return_diagnostics=True)
        if not locked_selection and len(x2)<25 and len(candidate_points)>initial:
            reserve = candidate_points[initial:]
            second = self.fitPSF(nda, global_mean,
                                 reserve[:,0].reshape(-1,1),reserve[:,1].reshape(-1,1),
                                 return_diagnostics=True)
            x2 += second[0]; y2 += second[1]; amplitude += second[2]
            intensity += second[3]; sigma_y_fitted += second[4]
            sigma_x_fitted += second[5]; fit_records += second[6]
            attempted_points = np.concatenate((attempted_points,reserve),axis=0)
            print(f'Backfilled {len(reserve)} reserve stars after initial fit rejections')
        candidate_points = attempted_points
        fit_rejections = dict(Counter(rec['reason'] for rec in fit_records
                                      if rec['reason'] != 'accepted'))

        # Send star locations to the GUI overlay.
        # Candidate points are the stars selected for fitting.
        # Fitted points are stars that passed the PSF fit filters.
        if len(x2) > 0:
            fitted_points = np.column_stack((np.asarray(x2), np.asarray(y2)))
        else:
            fitted_points = np.empty((0, 2))

        # Match accepted Gaussian centroids to a *persistent* reference ID.
        # Reference catalogs are seeded by a distributed candidate pool, not
        # by the arbitrary brightest ten stars.
        fits = [(float(xx),float(yy),(float(sx)+float(sy))/2.0)
                for xx,yy,sx,sy in zip(x2,y2,sigma_x_fitted,sigma_y_fitted)]
        locked_star_sigmas = {}
        stream_star_sigmas = {}
        if self.af_tracking_active:
            if self.af_catalog is None and len(fits) >= 8:
                try:
                    self.af_catalog = StarCatalog(fits,min_stars=8,max_stars=25)
                    print(f"Established fixed AF catalog: {len(self.af_catalog.stars)} stars")
                except ValueError as exc:
                    print(f"Reference catalog not yet available: {exc}")
            if self.af_catalog is not None:
                locked_star_sigmas = self.af_catalog.match_fits(fits)
        elif self.capture_mode == "Stream":
            if self.stream_catalog is None and len(fits) >= 8:
                try:
                    self.stream_catalog = StarCatalog(fits,min_stars=8,max_stars=25)
                    self.stream_cohort_ids = None
                    self.stream_recent_matches = []
                    self.stream_cohort_history = []
                    self.stream_quality_summary = {}
                    self.stream_low_match_streak = 0
                    print(f"Established stream catalog: {len(self.stream_catalog.stars)} stars")
                except ValueError:
                    pass
            if self.stream_catalog is not None:
                stream_star_sigmas = self.stream_catalog.match_fits(fits)
                self.stream_cohort_history.append(dict(stream_star_sigmas))
                self.stream_cohort_history = self.stream_cohort_history[-24:]
                self.stream_recent_matches.append(set(stream_star_sigmas))
                self.stream_recent_matches = self.stream_recent_matches[-24:]
                if self.stream_cohort_ids is None and len(self.stream_cohort_history)>=20:
                    cohort,summary = reliable_star_cohort(
                        self.stream_cohort_history,self.stream_catalog.stars)
                    self.stream_quality_summary = summary
                    if len(cohort)>=8:
                        self.stream_cohort_ids = cohort
                        print(f'Locked quality-screened Stream cohort: {len(cohort)} '
                              'stars using 20-frame repeatability history')
                if len(stream_star_sigmas) < 6:
                    self._streamDropout()  # severe *whole-field* tracking failure only
                else:
                    self.stream_low_match_streak = 0
        # Always keep accepted/detected reference positions visible, even when
        # their Gaussian fits fail intermittently. Red crosses are *rejected
        # fits*; grey circles are reference stars (not a successful fit).
        rejected_points = [(rec['x'],rec['y']) for rec in fit_records
                           if rec['reason'] != 'accepted']
        active_catalog = self.af_catalog if self.af_tracking_active else (
            self.stream_catalog if self.capture_mode=='Stream' else None)
        reference_points = ([] if active_catalog is None else
            [(rx+active_catalog.shift[0],ry+active_catalog.shift[1])
             for rx,ry,_ in active_catalog.stars])
        self.updateStarOverlay.emit(candidate_points, fitted_points,
                                    rejected_points,reference_points)
        region_counts = field_counts(fitted_points, nda.shape)
        selected_region_counts = field_counts(candidate_points, nda.shape)
        field_scores = {}
        for xx,yy,sx,sy in zip(x2,y2,sigma_x_fitted,sigma_y_fitted):
            region = field_region(xx,yy,nda.shape[1],nda.shape[0])
            field_scores.setdefault(region,[]).append((float(sx)+float(sy))/2)
        field_scores = {k:round(float(np.median(v)),5) for k,v in field_scores.items()}
        print(f"Fit accepted: {len(fits)}/{len(candidate_points)}; rejection counts={fit_rejections}; "
              f"spatial PSFs={region_counts}")

        print(f"Detected peaks: {num_objects}")
        print(f"Valid PSF fits: {len(sigma_x_fitted)}")

        min_valid_fits = 5

        if len(sigma_x_fitted) < min_valid_fits or len(sigma_y_fitted) < min_valid_fits:
            print(f"Not enough valid PSF fits: {len(sigma_x_fitted)} / {min_valid_fits}")

            no_fit_status = basic_status.copy()
            no_fit_status["state"] = (
                f"Not enough valid PSF fits "
                f"({len(sigma_x_fitted)}/{min_valid_fits})."
            )
            no_fit_status["detected_peaks"] = num_objects
            no_fit_status["valid_fits"] = len(sigma_x_fitted)
            no_fit_status.update(fit_rejections=fit_rejections,
                                 candidate_rejections=selection_rejections,
                                 attempted_candidates=len(candidate_points),
                                 matched_stars=len(stream_star_sigmas),
                                 field_counts=region_counts,
                                 region_psf_scores_px=field_scores,
                                 fit_diagnostics=fit_records)
            self.updateStatus.emit(no_fit_status)
            self._logStreamFrame({
                'frame':self.stream_frame_index,'utc_epoch':time.time(),
                'focuser_position':focuser_position,
                'matched_stars':len(stream_star_sigmas),
                'accepted_psfs':len(fits),'detected_peaks':num_objects,
                'psf_score_px':None,'field_counts_json':json.dumps(region_counts),
                'region_scores_json':json.dumps(field_scores),
                'rejections_json':json.dumps(fit_rejections),
                'fit_details_json':json.dumps(fit_records),
                'star_widths_json':json.dumps({str(k):v for k,v in stream_star_sigmas.items()}),
                'reference_stars_json':json.dumps(self.stream_catalog.stars if self.stream_catalog else []),
                'stable_cohort_ids_json':json.dumps(self.stream_cohort_ids or []),
                'star_quality_json':json.dumps(self.stream_quality_summary),
                'cohort_present':cohort_present if 'cohort_present' in locals() else 0})

            return None

        # Use mean for now, matching current behaviour.
        # Later this can be changed to median for more robustness.
        sigmax = float(np.median(sigma_x_fitted))
        sigmay = float(np.median(sigma_y_fitted))
        sigmaav = (sigmax + sigmay) / 2.0
        stream_score_valid = True
        cohort_present = 0
        if self.capture_mode == 'Stream':
            stream_score_valid = False
            if self.stream_catalog is not None and self.stream_cohort_ids:
                # A missing fit is explicitly excluded, never replaced by an
                # arbitrary different star. Use per-star reference ratios to
                # limit composition bias if a few locked stars temporarily fail.
                present = {sid:stream_star_sigmas[sid]
                           for sid in self.stream_cohort_ids if sid in stream_star_sigmas}
                cohort_present = len(present)
                required = max(8,int(np.ceil(len(self.stream_cohort_ids)*self.stream_score_min_fraction)))
                if cohort_present>=required:
                    score = self.stream_catalog.normalized_score(present)
                    if score is not None and np.isfinite(score):
                        sigmaav = float(score)
                        stream_score_valid = True
            if not stream_score_valid:
                sigmaav = None

        status = {
            "state": "Valid focus measurement.",
            "mean": global_mean,
            "std": global_stddev,
            "min": np.nanmin(nda),
            "max": np.nanmax(nda),
            "detected_peaks": num_objects,
            "valid_fits": len(sigma_x_fitted),
            "sigma_x": sigmax,
            "sigma_y": sigmay,
            "sigma_avg": sigmaav,
            "exposure": self.exposure,
            "gain": self.gain,
            "binning": f"{self.bin_x}x{self.bin_y}",
            "capture_mode": self.capture_mode,
            "focuser_position": focuser_position,
            "testing_position": self.current_testing_position,
            "best_position": self.current_best_position,
            "attempted_candidates": len(candidate_points),
            "fit_rejections": fit_rejections,
            "candidate_rejections": selection_rejections,
            "fit_diagnostics": fit_records,
            "field_counts": region_counts,
            "region_psf_scores_px": field_scores,
            "selected_field_counts": selected_region_counts,
            "matched_stars": len(locked_star_sigmas) if self.af_tracking_active
                             else len(stream_star_sigmas),
            "stream_cohort_size": len(self.stream_cohort_ids or []),
            "stream_cohort_present": cohort_present,
            "stream_quality_summary": self.stream_quality_summary if self.capture_mode=='Stream' else {},
            "reference_count": len(self.af_catalog.stars) if self.af_tracking_active and self.af_catalog
                               else (len(self.stream_catalog.stars) if self.capture_mode == 'Stream' and self.stream_catalog else 0),
        }

        if self.capture_mode == 'Stream' and not stream_score_valid:
            status['state'] = ('Screening 20-frame stable star cohort' if self.stream_catalog is not None and self.stream_cohort_ids is None else 'Too few reliable cohort stars this frame')
        self.updateStatus.emit(status)
        if sigmaav is not None:
            self.updatePlot.emit(
                float(sigmax),float(sigmay),float(sigmaav),focuser_position
            )

        if self.af_tracking_active:
            status["locked_star_sigmas"] = locked_star_sigmas
        if self.capture_mode == 'Stream':
            self._logStreamFrame({
                'frame':self.stream_frame_index,'utc_epoch':time.time(),
                'focuser_position':focuser_position,
                'matched_stars':len(stream_star_sigmas),
                'accepted_psfs':len(fits),'detected_peaks':num_objects,
                'psf_score_px':sigmaav,
                'field_counts_json':json.dumps(region_counts),
                'region_scores_json':json.dumps(field_scores),
                'rejections_json':json.dumps(fit_rejections),
                'fit_details_json':json.dumps(fit_records),
                'star_widths_json':json.dumps({str(k):v for k,v in stream_star_sigmas.items()}),
                'reference_stars_json':json.dumps(self.stream_catalog.stars if self.stream_catalog else []),
                'stable_cohort_ids_json':json.dumps(self.stream_cohort_ids or []),
                'star_quality_json':json.dumps(self.stream_quality_summary),
                'cohort_present':cohort_present if 'cohort_present' in locals() else 0})
        return status
    

    def stop(self):
        self.stopSession()

    def twoDGaussian(self, params, amplitude, xo, yo, sigma_x, sigma_y, theta, offset):
        """ Defines a 2D Gaussian distribution. 
        
        Arguments:
            params: [tuple of floats] 
                - (x, y) independant variables, 
                - saturation: [int] Value at which saturation occurs
            amplitude: [float] amplitude of the PSF
            xo: [float] PSF center, X component
            yo: [float] PSF center, Y component
            sigma_x: [float] standard deviation X component
            sigma_y: [float] standard deviation Y component
            theta: [float] PSF rotation in radians
            offset: [float] PSF offset from the 0 (i.e. the "elevation" of the PSF)

        Return:
            g: [ndarray] values of the given Gaussian at (x, y) coordinates

        """

        x, y, saturation = params

        if isinstance(saturation, np.ndarray):
            saturation = saturation[0, 0]
        
        xo = float(xo)
        yo = float(yo)

        a = (np.cos(theta)**2)/(2*sigma_x**2) + (np.sin(theta)**2)/(2*sigma_y**2)
        b = -(np.sin(2*theta))/(4*sigma_x**2) + (np.sin(2*theta))/(4*sigma_y**2)
        c = (np.sin(theta)**2)/(2*sigma_x**2) + (np.cos(theta)**2)/(2*sigma_y**2)
        g = offset + amplitude*np.exp(-(a*((x - xo)**2) + 2*b*(x - xo)*(y - yo) + c*((y - yo)**2)))

        # Limit values to saturation level
        g[g > saturation] = saturation

        return g.ravel()

    def fitPSF(self, imarray, avepixel_mean, x2, y2, return_diagnostics=False):
        """Fit isolated candidate PSFs, recording a reason for every rejection.

        Retains the existing 2D Gaussian backend and six-array API for callers
        that do not request diagnostics. No camera/focuser operations here.
        """
        bin_factor = max(1, int(max(self.bin_x, self.bin_y)))
        segment_radius = max(8, int(round(self.segment_radius / bin_factor)))
        min_valid_sigma = max(0.30, 0.70 / bin_factor)
        accepted = [[], [], [], [], [], []]
        reports = []
        h, w = imarray.shape
        for yy, xx in zip(np.asarray(y2).flatten(), np.asarray(x2).flatten()):
            x, y = float(xx),float(yy)
            diagnostic = {'x':round(x,2), 'y':round(y,2), 'reason':'pending'}
            def fail(why, **extra):
                diagnostic.update(reason=why, **extra)
                reports.append(diagnostic)
            if not np.isfinite([x,y]).all():
                fail('invalid_candidate')
                continue
            # Reject incomplete PSF windows instead of fitting clipped wings.
            x0, x1 = int(x)-segment_radius, int(x)+segment_radius+1
            y0, y1 = int(y)-segment_radius, int(y)+segment_radius+1
            if x0<0 or y0<0 or x1>w or y1>h:
                fail('edge')
                continue
            patch = np.asarray(imarray[y0:y1,x0:x1],dtype=float)
            if patch.size < 16 or not np.isfinite(patch).all():
                fail('invalid_pixels')
                continue
            if float(np.max(patch)) >= RCD_SATURATION*0.98:
                fail('saturated')
                continue
            # Estimate noise in the *outer annulus*, so the star itself does
            # not artificially raise the threshold used to judge its SNR.
            yi,xi = np.indices(patch.shape)
            py,px = int(round(y))-y0,int(round(x))-x0
            r = np.hypot(yi-py,xi-px)
            sky = patch[(r>=5) & (r<=segment_radius-1)]
            if sky.size<20: sky=patch.flatten()
            bg = float(np.median(sky))
            noise = float(1.4826*np.median(np.abs(sky-bg)))
            if noise<=0: noise = float(np.std(sky))
            if noise<=0 or not np.isfinite(noise):
                fail('noise_unavailable')
                continue
            peak_idx = np.unravel_index(np.argmax(patch),patch.shape)
            peak = float(patch[peak_idx])
            peak_snr = (peak-bg)/noise
            diagnostic['peak_snr'] = round(peak_snr,2)
            if not np.isfinite(peak_snr) or peak_snr < 8:
                fail('low_snr')
                continue
            guess = (max(peak-bg,1.),float(peak_idx[0]),float(peak_idx[1]),
                     max(.8,1.2/bin_factor),max(.8,1.2/bin_factor),0.,bg)
            saturation = np.full(patch.shape,RCD_SATURATION,dtype=np.float32)
            lower=(0.,0.,0.,.20,.20,-np.pi/2,-np.inf)
            upper=(np.inf,float(patch.shape[0]-1),float(patch.shape[1]-1),
                   8.,8.,np.pi/2,np.inf)
            try:
                popt,_ = opt.curve_fit(
                    self.twoDGaussian,(yi,xi,saturation),patch.ravel(),
                    p0=guess,bounds=(lower,upper),maxfev=1000)
            except (RuntimeError,ValueError,FloatingPointError,OverflowError,TypeError):
                fail('fit_failed')
                continue
            amp,yo,xo,sy,sx,theta,offset = [float(v) for v in popt]
            if not np.isfinite(popt).all() or amp<=0:
                fail('invalid_fit')
                continue
            if min(sx,sy)<min_valid_sigma or max(sx,sy)>8.:
                fail('width_out_of_range',sigma_x=round(sx,2),sigma_y=round(sy,2))
                continue
            if np.hypot((x0+xo)-x,(y0+yo)-y)>4.0:
                fail('fit_shifted_to_neighbor')
                continue
            roundness = min(sy/sx,sx/sy)
            if roundness < self.roundness_threshold:
                fail('elongated',axis_ratio=round(roundness,2))
                continue
            if 4*sx*sy/segment_radius**2>self.max_feature_ratio:
                fail('too_extended')
                continue
            # Crop the fitted PSF to ±3 sigma, with exclusive upper bounds.
            cy0=max(0,int(np.floor(yo-3*sy)))
            cy1=min(patch.shape[0],int(np.ceil(yo+3*sy))+1)
            cx0=max(0,int(np.floor(xo-3*sx)))
            cx1=min(patch.shape[1],int(np.ceil(xo+3*sx))+1)
            if cy1<=cy0 or cx1<=cx0:
                fail('empty_flux_aperture')
                continue
            intensity = float(np.sum(patch[cy0:cy1,cx0:cx1]-offset))
            if not np.isfinite(intensity) or intensity<=0:
                fail('nonpositive_flux')
                continue
            for output, val in zip(accepted,(x0+xo,y0+yo,amp,intensity,sy,sx)):
                output.append(float(val))
            diagnostic.update(reason='accepted',sigma_x=round(sx,3),
                              sigma_y=round(sy,3),axis_ratio=round(roundness,3))
            reports.append(diagnostic)
        result=tuple(accepted)
        return (*result,reports) if return_diagnostics else result


class Ui(QtWidgets.QMainWindow):

    # emit_stop = QtCore.pyqtSignal(int)

    def __init__(self, *args, **kwargs):

        # call inherited classes __init__ method
        super(Ui, self).__init__(*args, **kwargs)    
        
        # Load the .ui file
        ui_path = Path(__file__).resolve().with_name("PyFocus.ui")
        if not ui_path.exists():
            raise FileNotFoundError(f"PyFocus.ui is required for interactive mode: {ui_path}")
        uic.loadUi(str(ui_path), self)
                
        self.title = "PyFocus Automated Focusing v3.5.1"

        # Detach widgets loaded from PyFocus.ui before replacing the central widget.
        # Otherwise setCentralWidget() may delete the old central widget and its children.
        self.Plot.setParent(None)
        self.Exposure_spinbox.setParent(None)
        self.Binning_spinbox.setParent(None)
        self.Zoom_slider.setParent(None)
        self.Start_button.setParent(None)
        self.Stop_button.setParent(None)


        # Make the GUI large enough for manual focusing.
        self.setWindowTitle("PyFocus Automated Focusing — v3.5.1")

        screen = QtWidgets.QApplication.primaryScreen().availableGeometry()

        target_width = min(1850, screen.width() - 40)
        target_height = min(1020, screen.height() - 40)

        self.resize(target_width, target_height)
        self.setMinimumSize(
            min(1600, target_width),
            min(900, target_height)
        )

        self.move(
            screen.x() + 20,
            screen.y() + 20
        )
        

        self.setStyleSheet("""
            QMainWindow {
                background-color: #101418;
            }

            QWidget {
                font-family: Segoe UI, Arial, sans-serif;
                font-size: 11pt;
            }

            QGroupBox {
                font-weight: bold;
                border: 1px solid #2c3440;
                border-radius: 10px;
                margin-top: 14px;
                padding: 10px;
                background-color: #171d24;
                color: #e8edf3;
                font-size: 11pt;
            }

            QGroupBox::title {
                subcontrol-origin: margin;
                left: 12px;
                padding: 0 6px;
                color: #d7e3f4;
            }

            QLabel {
                color: #d7dee8;
                font-size: 11pt;
            }

            QPushButton {
                background-color: #243044;
                border: 1px solid #3b4a63;
                border-radius: 7px;
                padding: 8px 13px;
                min-height: 24px;
                font-size: 11pt;
                font-weight: bold;
                color: #e8edf3;
            }

            QPushButton:hover {
                background-color: #2e3b53;
            }

            QPushButton:pressed {
                background-color: #1d2636;
            }

            QPushButton:checked {
                background-color: #2f6fed;
                color: white;
                border: 1px solid #5b8cff;
            }

            QPushButton#runButton {
                background-color: #2f6fed;
                color: white;
                border: 1px solid #5b8cff;
            }
                     
            QPushButton#runButton:hover {
                background-color: #4f86ff;
                border: 1px solid #9bb8ff;
            }

            QPushButton#runButton:pressed {
                background-color: #1747a6;
                border: 1px solid #9bb8ff;
                padding-top: 9px;
                padding-left: 12px;
                padding-bottom: 5px;
                padding-right: 10px;
            }
                     
            QPushButton#runButton:checked {
                background-color: #1f9d55;
                border: 1px solid #58d68d;
                color: white;
            }

            QPushButton#clearButton {
                background-color: #293241;
                color: #d7dee8;
            }
                     
            QPushButton#clearButton:hover {
                background-color: #3a4658;
                border: 1px solid #52627a;
            }

            QPushButton#clearButton:pressed {
                background-color: #1b2433;
                border: 1px solid #52627a;
                padding-top: 9px;
                padding-left: 12px;
                padding-bottom: 5px;
                padding-right: 10px;
            }

            QPushButton#exitButton {
                background-color: #3a2428;
                border: 1px solid #71404a;
                color: #ffd7dc;
            }
                     
            QPushButton#exitButton:hover {
                background-color: #5a2d35;
                border: 1px solid #a95a66;
            }

            QPushButton#exitButton:pressed {
                background-color: #2a1519;
                border: 1px solid #a95a66;
                padding-top: 9px;
                padding-left: 12px;
                padding-bottom: 5px;
                padding-right: 10px;
            }

            QSpinBox, QDoubleSpinBox, QComboBox {
                background-color: #0f141a;
                border: 1px solid #3b4a63;
                border-radius: 5px;
                padding: 5px;
                min-height: 24px;
                font-size: 11pt;
                color: #e8edf3;
            }

            QSpinBox:disabled, QDoubleSpinBox:disabled, QComboBox:disabled {
                color: #697586;
                background-color: #171d24;
                border: 1px solid #293241;
            }

            QLabel:disabled {
                color: #697586;
            }

            QSlider::groove:horizontal {
                border: 1px solid #3b4a63;
                height: 6px;
                background: #0f141a;
                border-radius: 3px;
            }

            QSlider::handle:horizontal {
                background: #5b8cff;
                border: 1px solid #8fb0ff;
                width: 14px;
                margin: -5px 0;
                border-radius: 7px;
            }

            QSlider::groove:horizontal:disabled {
                background: #171d24;
                border: 1px solid #293241;
            }

            QSlider::handle:horizontal:disabled {
                background: #697586;
                border: 1px solid #697586;
            }
        """)

        # Build a new two-column central layout.
        central = QtWidgets.QWidget(self)
        self.setCentralWidget(central)

        main_layout = QtWidgets.QVBoxLayout(central)
        main_layout.setContentsMargins(8, 8, 8, 8)
        main_layout.setSpacing(8)

        top_layout = QtWidgets.QHBoxLayout()
        top_layout.setSpacing(8)

        bottom_controls_layout = QtWidgets.QHBoxLayout()
        bottom_controls_layout.setContentsMargins(0, 0, 0, 0)
        bottom_controls_layout.setSpacing(8)

        main_layout.addLayout(top_layout, stretch=10)
        main_layout.addLayout(bottom_controls_layout, stretch=0)

        left_column = QtWidgets.QVBoxLayout()
        right_column = QtWidgets.QVBoxLayout()

        top_layout.addLayout(left_column, stretch=5)
        top_layout.addLayout(right_column, stretch=5)

        # ---------------- Left column: live image ----------------
        image_group = QtWidgets.QGroupBox("Live Colibri RCD View")
        image_layout = QtWidgets.QVBoxLayout()

        self.focus_imagewidget = pg.ImageView()
        self.focus_imagewidget.ui.histogram.hide()
        self.focus_imagewidget.ui.roiBtn.hide()
        self.focus_imagewidget.ui.menuBtn.hide()
        self.focus_imagewidget.setMinimumSize(480, 480)

        self.last_raw_img = None
        self.last_display_img = None
        self.display_block = 1
        self.global_min = None
        self.global_max = None

        # Star overlays:
        # Yellow X = detected candidate stars
        # Green circle = stars with valid PSF fits
        self.candidate_scatter = pg.ScatterPlotItem(
            size=9,
            pen=pg.mkPen('y', width=2),
            brush=None,
            symbol='x'
        )

        self.fitted_scatter = pg.ScatterPlotItem(
            size=11,
            pen=pg.mkPen('g', width=2),
            brush=None,
            symbol='o'
        )

        image_view = self.focus_imagewidget.getView()
        # Neutral outlines persist at catalog coordinates even if a fit fails.
        self.reference_scatter = pg.ScatterPlotItem(
            size=15, pen=pg.mkPen('#9aa4b2',width=1), brush=None, symbol='o')
        self.rejected_scatter = pg.ScatterPlotItem(
            size=10, pen=pg.mkPen('#ff6b6b',width=2), brush=None, symbol='x')
        image_view.addItem(self.reference_scatter)
        image_view.addItem(self.candidate_scatter)
        image_view.addItem(self.rejected_scatter)
        image_view.addItem(self.fitted_scatter)

        # Cursor statistics over the image view
        self.image_proxy = pg.SignalProxy(
            self.focus_imagewidget.getView().scene().sigMouseMoved,
            rateLimit=30,
            slot=self.updateCursorStats
        )

        self.Zoom_slider.setRange(1, 9)
        self.Zoom_slider.setValue(1)
        self.Zoom_slider.valueChanged.connect(self.applyImageZoom)

        image_layout.addWidget(self.focus_imagewidget)

        self.cursor_stats_label = QtWidgets.QLabel(
            "Cursor: --   Pixel: --   Local mean/std: --   Local min/max: --   SNR: --"
        )
        self.cursor_stats_label.setWordWrap(True)
        self.cursor_stats_label.setStyleSheet("""
            QLabel {
                color: #f4f7fb;
                background-color: #182033;
                border: 1px solid #303b52;
                border-radius: 6px;
                padding: 8px;
                font-family: Consolas, Courier New, monospace;
                font-size: 12pt;
            }
        """)


        image_layout.addWidget(self.cursor_stats_label)

        image_group.setLayout(image_layout)
        left_column.addWidget(image_group)

        # ---------------- Right column: plot ----------------
        plot_group = QtWidgets.QGroupBox("Focus Trend")
        plot_layout = QtWidgets.QVBoxLayout()
        # Plot selector buttons
        plot_selector_layout = QtWidgets.QHBoxLayout()

        self.LiveTrend_button = QtWidgets.QPushButton("Live Trend")
        self.AFCurve_button = QtWidgets.QPushButton("Focus Curve")

        self.LiveTrend_button.setCheckable(True)
        self.AFCurve_button.setCheckable(True)

        self.LiveTrend_button.setChecked(True)
        self.LiveTrend_button.setMaximumHeight(34)
        self.AFCurve_button.setMaximumHeight(34)

        plot_selector_layout.addWidget(self.LiveTrend_button)
        plot_selector_layout.addWidget(self.AFCurve_button)

        plot_layout.addLayout(plot_selector_layout)

        # Stacked plot area
        self.PlotStack = QtWidgets.QStackedWidget()

        # Existing plot from .ui: live focus trend
        self.LiveTrendPage = QtWidgets.QWidget()
        live_layout = QtWidgets.QVBoxLayout(self.LiveTrendPage)
        live_layout.setContentsMargins(0, 0, 0, 0)
        live_layout.addWidget(self.Plot)

        # New autofocus curve plot
        self.AFPlot = pg.PlotWidget()
        self.AFPlot.setBackground("k")

        self.AutofocusPage = QtWidgets.QWidget()
        af_layout = QtWidgets.QVBoxLayout(self.AutofocusPage)
        af_layout.setContentsMargins(0, 0, 0, 0)
        af_layout.addWidget(self.AFPlot)

        self.PlotStack.addWidget(self.LiveTrendPage)
        self.PlotStack.addWidget(self.AutofocusPage)

        plot_layout.addWidget(self.PlotStack)

        # Autofocus state is kept separate from the live rolling PSF chart.
        # 'Best sampled' is NOT a validated focus and must be labelled as such.
        self._af_focuser_now = None
        self._af_start_position = None
        self._af_best_sampled = None
        self._af_result_state = "Not verified"
        self._active_af_stage = "Waiting"
        self.af_position_summary_label = QtWidgets.QLabel()
        self.af_position_summary_label.setWordWrap(True)
        self.af_position_summary_label.setStyleSheet("""
            QLabel {
                color: #f0f4fa;
                background-color: #202b3d;
                border: 1px solid #36475d;
                border-radius: 5px;
                padding: 6px;
                font-family: Consolas, Courier New, monospace;
                font-size: 10pt;
                font-weight: bold;
            }
        """)
        plot_layout.addWidget(self.af_position_summary_label)
        self.refreshAutofocusSummary()

        self.focus_guidance_label = QtWidgets.QLabel(
            "Focus guidance: waiting for valid focus measurements."
        )
        self.focus_guidance_label.setMaximumHeight(52)
        self.focus_guidance_label.setStyleSheet("""
            QLabel {
                color: #f4f7fb;
                background-color: #182033;
                border: 1px solid #303b52;
                border-radius: 6px;
                padding: 5px;
                font-family: Consolas, Courier New, monospace;
                font-size: 9pt;
                font-weight: bold;
            }
        """)

        plot_layout.addWidget(self.focus_guidance_label)
        plot_group.setLayout(plot_layout)

        # Let Qt size the plot naturally instead of forcing an impossible minimum.
        plot_group.setMinimumHeight(500)
        self.PlotStack.setMinimumHeight(350)
        self.Plot.setMinimumHeight(320)
        self.AFPlot.setMinimumHeight(320)

        plot_group.setSizePolicy(
            QtWidgets.QSizePolicy.Expanding,
            QtWidgets.QSizePolicy.Expanding
        )

        self.Plot.setSizePolicy(
            QtWidgets.QSizePolicy.Expanding,
            QtWidgets.QSizePolicy.Expanding
        )

        self.AFPlot.setSizePolicy(
            QtWidgets.QSizePolicy.Expanding,
            QtWidgets.QSizePolicy.Expanding
        )

        right_column.addWidget(plot_group, stretch=10)

        ##### Button triggers
        self.Start_button.setCheckable(True)
        self.Start_button.clicked.connect(self.startFocus)
        self.Stop_button.clicked.connect(self.stopFocus)

        self.LiveTrend_button.clicked.connect(self.showLiveTrendPlot)
        self.AFCurve_button.clicked.connect(self.showAutofocusPlot)

        # self.JogNorth_button.clicked.connect(self.jogScope)
        # self.JogSouth_button.clicked.connect(self.jogScope)
        # self.JogEast_button.clicked.connect(self.jogScope)
        # self.JogWest_button.clicked.connect(self.jogScope)

        self.max_plot_points = 60
        self.frame_number = 0

        self.Sx = []
        self.Sy = []
        self.Syy = []
        self.Sav = []
        self.Smed = []

        # Configure the live focus metric plot
        labelStyle = {'color': '#FFFFFF', 'font-size': '9pt'}

        self.Plot.setLabel('left', 'PSF width', units='px', **labelStyle)
        self.Plot.setLabel('bottom', 'Frame number', **labelStyle)

        # Give the live plot enough room for x-axis ticks and the x-axis label.
        live_plot_item = self.Plot.getPlotItem()
        live_plot_item.getAxis('bottom').setHeight(72)
        live_plot_item.getAxis('left').setWidth(64)
        live_plot_item.layout.setContentsMargins(8, 8, 14, 34)

        # Give the focus-curve plot enough room too.
        af_plot_item = self.AFPlot.getPlotItem()
        af_plot_item.getAxis('bottom').setHeight(72)
        af_plot_item.getAxis('left').setWidth(78)
        af_plot_item.layout.setContentsMargins(8, 8, 14, 34)

        self.Plot.showGrid(x=True, y=True, alpha=0.3)
        self.Plot.addLegend(offset=(5, 5))

        self.x_line = self.Plot.plot(
            self.Sx, self.Sy,
            pen=pg.mkPen(color='r'),
            name='Sigma X'
        )

        self.y_line = self.Plot.plot(
            self.Sx, self.Syy,
            pen=pg.mkPen(color='g'),
            name='Sigma Y'
        )

        self.av_line = self.Plot.plot(
            self.Sx, self.Sav,
            pen=pg.mkPen(color='b'),
            name='Current avg sigma'
        )

        # Hide the noisy component lines by default.
        # They are still calculated and shown in the metrics panel.
        self.x_line.hide()
        self.y_line.hide()

        # Main line to watch while manually focusing.
        self.med_line = self.Plot.plot(
            [],
            [],
            pen=pg.mkPen(color='w', width=3),
            name='7-frame median sigma'
        )
        # Autofocus curve data
        self.AFPositions = []
        self.AFScores = []

        self.focus_curve_by_position = {}

        self.best_live_score = None
        self.best_live_position = None
        self.last_live_score = None

        self.AFPlot.setLabel(
            "left",
            "Median PSF width",
            units="px",
            color="#FFFFFF"
        )

        self.AFPlot.setLabel(
            "bottom",
            "Focuser position",
            color="#FFFFFF"
        )

        self.AFPlot.showGrid(x=True, y=True, alpha=0.3)
        self.AFPlot.addLegend(offset=(5, 5))

        self.af_curve_line = self.AFPlot.plot(
            [],
            [],
            pen=pg.mkPen(color='c', width=2),
            symbol='o',
            symbolSize=7,
            symbolBrush='c',
            name='Median average sigma'
        )

        self.best_focus_line = pg.InfiniteLine(
            angle=90,
            movable=False,
            pen=pg.mkPen(color='m', width=2, style=QtCore.Qt.DashLine)
        )

        self.AFPlot.addItem(self.best_focus_line)
        self.best_focus_line.hide()

        # ---------------- Right column: status / metrics ----------------
        status_group = QtWidgets.QGroupBox("Current Focus Metrics")
        status_layout = QtWidgets.QVBoxLayout()

        self.status_label = QtWidgets.QLabel()
        self.status_label.setWordWrap(True)
        self.status_label.setStyleSheet("""
            QLabel {
                color: white;
                background-color: #202020;
                border: 1px solid #555555;
                padding: 6px;
                font-size: 8pt;
            }
        """)
        self.status_label.setText("No Stars detected...Focus metrics will appear here.")

        status_layout.addWidget(self.status_label)
        status_group.setLayout(status_layout)
        status_group.setMinimumHeight(165)
        status_group.setMaximumHeight(215)
        status_group.setSizePolicy(
            QtWidgets.QSizePolicy.Expanding,
            QtWidgets.QSizePolicy.Fixed
        )

        bottom_controls_layout.addWidget(status_group, stretch=2)

        # ---------------- Right column: capture settings ----------------
        self.settings_group = QtWidgets.QGroupBox("Capture Settings")
        settings_group = self.settings_group
        settings_layout = QtWidgets.QGridLayout()
        settings_layout.setContentsMargins(10, 10, 10, 10)
        settings_layout.setHorizontalSpacing(14)
        settings_layout.setVerticalSpacing(10)

        settings_layout.setColumnStretch(0, 0)
        settings_layout.setColumnStretch(1, 3)
        settings_layout.setColumnStretch(2, 0)
        settings_layout.setColumnStretch(3, 2)

        def make_settings_label(text):
            label = QtWidgets.QLabel(text)
            label.setAlignment(QtCore.Qt.AlignRight | QtCore.Qt.AlignVCenter)
            return label

        self.CaptureMode_combo = QtWidgets.QComboBox()
        self.CaptureMode_combo.addItems(["Single Image", "Stream", "Autofocus"])
        self.CaptureMode_combo.currentTextChanged.connect(self.onCaptureModeChanged)

        self.Gain_note_label = QtWidgets.QLabel("ColibriGrab high gain (12-bit)")
        self.Gain_note_label.setWordWrap(True)
        self.Exposure_spinbox.setDecimals(3)
        self.Exposure_spinbox.setSingleStep(0.005)
        self.Exposure_spinbox.setRange(0.001, 10.000)
        self.Exposure_spinbox.setValue(0.025)
        self.Binning_spinbox.setRange(2, 2)
        self.Binning_spinbox.setValue(2)
        self.Binning_spinbox.setEnabled(False)

        settings_layout.addWidget(make_settings_label("Capture mode:"), 0, 0)
        settings_layout.addWidget(self.CaptureMode_combo, 0, 1)

        settings_layout.addWidget(make_settings_label("Exposure (s):"), 0, 2)
        settings_layout.addWidget(self.Exposure_spinbox, 0, 3)

        settings_layout.addWidget(make_settings_label("Camera:"), 1, 0)
        settings_layout.addWidget(self.Gain_note_label, 1, 1)

        settings_layout.addWidget(make_settings_label("Binning:"), 1, 2)
        settings_layout.addWidget(self.Binning_spinbox, 1, 3)

        settings_layout.addWidget(make_settings_label("Image zoom:"), 2, 0)
        settings_layout.addWidget(self.Zoom_slider, 2, 1, 1, 3)
        self.AFStep_spin = QtWidgets.QSpinBox()
        self.AFStep_spin.setRange(1, 10000)
        self.AFStep_spin.setValue(50)

        self.AFStepsEachSide_spin = QtWidgets.QSpinBox()
        self.AFStepsEachSide_spin.setRange(1, 10)
        self.AFStepsEachSide_spin.setValue(3)

        self.AFFramesPerPosition_spin = QtWidgets.QSpinBox()
        self.AFFramesPerPosition_spin.setRange(1, 10)
        self.AFFramesPerPosition_spin.setValue(7)

        self.AFSettleTime_spin = QtWidgets.QDoubleSpinBox()
        self.AFSettleTime_spin.setRange(0.0, 30.0)
        self.AFSettleTime_spin.setDecimals(1)
        self.AFSettleTime_spin.setValue(1.0)

        self.AFCoarseMultiplier_spin = QtWidgets.QSpinBox()
        self.AFCoarseMultiplier_spin.setRange(2, 8)
        self.AFCoarseMultiplier_spin.setValue(3)
        self.AFMaxExcursion_spin = QtWidgets.QSpinBox()
        self.AFMaxExcursion_spin.setRange(100, 10000)
        self.AFMaxExcursion_spin.setSingleStep(100)
        self.AFMaxExcursion_spin.setValue(900)
        self.AFCoarseMultiplier_label = QtWidgets.QLabel("Coarse step multiplier:")
        self.AFMaxExcursion_label = QtWidgets.QLabel("Max travel from start:")

        self.AFStep_label = QtWidgets.QLabel("AF step size:")
        self.AFStepsEachSide_label = QtWidgets.QLabel("AF steps each side:")
        self.AFFramesPerPosition_label = QtWidgets.QLabel("AF frames/position:")
        self.AFSettleTime_label = QtWidgets.QLabel("AF settle time (s):")

        settings_layout.addWidget(self.AFStep_label, 3, 0)
        settings_layout.addWidget(self.AFStep_spin, 3, 1)

        settings_layout.addWidget(self.AFStepsEachSide_label, 3, 2)
        settings_layout.addWidget(self.AFStepsEachSide_spin, 3, 3)

        settings_layout.addWidget(self.AFFramesPerPosition_label, 4, 0)
        settings_layout.addWidget(self.AFFramesPerPosition_spin, 4, 1)

        settings_layout.addWidget(self.AFSettleTime_label, 4, 2)
        settings_layout.addWidget(self.AFSettleTime_spin, 4, 3)
        settings_layout.addWidget(self.AFCoarseMultiplier_label, 5, 0)
        settings_layout.addWidget(self.AFCoarseMultiplier_spin, 5, 1)
        settings_layout.addWidget(self.AFMaxExcursion_label, 5, 2)
        settings_layout.addWidget(self.AFMaxExcursion_spin, 5, 3)

        self.autofocus_controls = [
            self.AFStep_label,
            self.AFStep_spin,
            self.AFStepsEachSide_label,
            self.AFStepsEachSide_spin,
            self.AFFramesPerPosition_label,
            self.AFFramesPerPosition_spin,
            self.AFSettleTime_label,
            self.AFSettleTime_spin,
            self.AFCoarseMultiplier_label,
            self.AFCoarseMultiplier_spin,
            self.AFMaxExcursion_label,
            self.AFMaxExcursion_spin,
        ]

        self.Exposure_spinbox.valueChanged.connect(
            self.updateWorkerSettings
        )
        self.Binning_spinbox.valueChanged.connect(
            self.updateWorkerSettings
        )
        self.CaptureMode_combo.currentTextChanged.connect(
            self.updateWorkerSettings
        )

        self.AFStep_spin.valueChanged.connect(
            self.updateWorkerSettings
        )
        self.AFStepsEachSide_spin.valueChanged.connect(
            self.updateWorkerSettings
        )
        self.AFFramesPerPosition_spin.valueChanged.connect(
            self.updateWorkerSettings
        )
        self.AFSettleTime_spin.valueChanged.connect(
            self.updateWorkerSettings
        )
        self.AFCoarseMultiplier_spin.valueChanged.connect(self.updateWorkerSettings)
        self.AFMaxExcursion_spin.valueChanged.connect(self.updateWorkerSettings)

        self.plot_update_stride = 2

        self.updateAutofocusControls(self.CaptureMode_combo.currentText())
        
        settings_group.setLayout(settings_layout)
        settings_group.setMinimumHeight(150)
        settings_group.setMaximumHeight(235)
        settings_group.setSizePolicy(
            QtWidgets.QSizePolicy.Expanding,
            QtWidgets.QSizePolicy.Fixed
        )

        bottom_controls_layout.addWidget(settings_group, stretch=3)
        
        # ---------------- Right column: focuser controls ----------------
        focuser_group = QtWidgets.QGroupBox("Focuser Control")
        focuser_layout = QtWidgets.QGridLayout()
        focuser_layout.setContentsMargins(8, 8, 8, 8)
        focuser_layout.setHorizontalSpacing(8)
        focuser_layout.setVerticalSpacing(6)

        focuser_layout.setColumnStretch(0, 0)
        focuser_layout.setColumnStretch(1, 2)
        focuser_layout.setColumnStretch(2, 1)
        focuser_layout.setColumnStretch(3, 1)

        self.FocuserPosition_label = QtWidgets.QLabel("Position: --")
        self.FocuserPosition_label.setStyleSheet("""
            QLabel {
                color: #f4f7fb;
                background-color: #182033;
                border: 1px solid #303b52;
                border-radius: 5px;
                padding: 5px;
                font-family: Consolas, Courier New, monospace;
                font-size: 10pt;
                font-weight: bold;
            }
        """)

        self.FocusStep_spin = QtWidgets.QSpinBox()
        self.FocusStep_spin.setRange(1, 10000)
        self.FocusStep_spin.setValue(50)
        self.FocusStep_spin.setSingleStep(10)

        self.FocusMinus_button = QtWidgets.QPushButton("Move -")
        self.FocusPlus_button = QtWidgets.QPushButton("Move +")
        self.FocusRefresh_button = QtWidgets.QPushButton("Refresh")

        self.FocusTarget_spin = QtWidgets.QSpinBox()
        self.FocusTarget_spin.setRange(0, 1000000)
        self.FocusTarget_spin.setValue(50500)
        self.FocusTarget_spin.setSingleStep(50)

        self.FocusGo_button = QtWidgets.QPushButton("Go To")

        self.FocusMinus_button.clicked.connect(
            lambda: self.requestFocusJog(-self.FocusStep_spin.value())
        )
        self.FocusPlus_button.clicked.connect(
            lambda: self.requestFocusJog(self.FocusStep_spin.value())
        )
        self.FocusGo_button.clicked.connect(self.requestFocusMoveTo)
        self.FocusRefresh_button.clicked.connect(self.requestFocuserRefresh)

        focuser_layout.addWidget(self.FocuserPosition_label, 0, 0, 1, 4)

        focuser_layout.addWidget(QtWidgets.QLabel("Step:"), 1, 0)
        focuser_layout.addWidget(self.FocusStep_spin, 1, 1)
        focuser_layout.addWidget(self.FocusMinus_button, 1, 2)
        focuser_layout.addWidget(self.FocusPlus_button, 1, 3)

        focuser_layout.addWidget(QtWidgets.QLabel("Target:"), 2, 0)
        focuser_layout.addWidget(self.FocusTarget_spin, 2, 1)
        focuser_layout.addWidget(self.FocusGo_button, 2, 2)
        focuser_layout.addWidget(self.FocusRefresh_button, 2, 3)

        focuser_group.setLayout(focuser_layout)
        focuser_group.setMinimumHeight(145)
        focuser_group.setMaximumHeight(175)
        focuser_group.setSizePolicy(
            QtWidgets.QSizePolicy.Expanding,
            QtWidgets.QSizePolicy.Fixed
        )

        bottom_controls_layout.addWidget(focuser_group, stretch=2)

        # ---------------- Right column: buttons ----------------
        button_group = QtWidgets.QGroupBox("Controls")
        button_layout = QtWidgets.QVBoxLayout()
        button_layout.setContentsMargins(8, 8, 8, 8)
        button_layout.setSpacing(6)

        self.Clear_button = QtWidgets.QPushButton("Clear Display")
        self.Clear_button.clicked.connect(self.clearDisplay)

        button_layout.addWidget(self.Start_button)
        button_layout.addWidget(self.Clear_button)
        button_layout.addWidget(self.Stop_button)

        self.Start_button.setObjectName("runButton")
        self.Clear_button.setObjectName("clearButton")
        self.Stop_button.setObjectName("exitButton")

        button_group.setLayout(button_layout)
        button_group.setMinimumHeight(145)
        button_group.setMaximumHeight(175)
        button_group.setMaximumWidth(230)
        button_group.setSizePolicy(
            QtWidgets.QSizePolicy.Maximum,
            QtWidgets.QSizePolicy.Fixed
        )

        bottom_controls_layout.addWidget(button_group, stretch=0)

        self.thread = None
        self.createPersistentWorker()
        self.showMaximized()

    def getFocusSettings(self):
        binning = self.Binning_spinbox.value()
        zoom = self.Zoom_slider.value()
        max_display_size = 100 + zoom * 50

        return {
            "capture_mode": self.CaptureMode_combo.currentText(),
            "exposure": self.Exposure_spinbox.value(),
            "bin_x": binning,
            "bin_y": binning,
            "filter_number": 0,
            "max_display_size": max_display_size,
            "intensity_threshold": 30,
            "colibrigrab_exe": str(Path.home() / "Documents" / "GitHub" / "ColibriGrab" / "ColibriGrab" / "ColibriGrab.exe"),
            "grab_output_root": r"D:\PyFocus",
            "grab_temperature": -10,
            "grab_timeout": 120.0,
            "kill_flipilot": True,
            "light_frame": True,
            "af_step_size": self.AFStep_spin.value(),
            "af_steps_each_side": self.AFStepsEachSide_spin.value(),
            "af_frames_per_position": self.AFFramesPerPosition_spin.value(),
            "af_settle_time": self.AFSettleTime_spin.value(),
            "af_coarse_multiplier": self.AFCoarseMultiplier_spin.value(),
            "af_max_excursion": self.AFMaxExcursion_spin.value(),
            "focuser_driver_id": DEFAULT_FOCUSER_DRIVER_ID,
        }
    
    def updateWorkerSettings(self):
        """
        Send the current GUI settings to the persistent worker.

        If an exposure is already underway, the new values begin with the next
        exposure.
        """

        if self.thread is None:
            return

        self.thread.updateCaptureSettings(self.getFocusSettings())
    
    def clearMeasurementPlotsOnly(self):
        """
        Clear focus measurement plots without wiping the latest image display.
        Used when switching modes.
        """

        self.frame_number = 0

        self.Sx = []
        self.Sy = []
        self.Syy = []
        self.Sav = []
        self.Smed = []

        self.x_line.setData([], [])
        self.y_line.setData([], [])
        self.av_line.setData([], [])
        self.med_line.setData([], [])

        self.AFPositions = []
        self.AFScores = []

        self.af_curve_line.setData([], [])
        self.best_focus_line.hide()

        self.focus_curve_by_position = {}

        self.best_live_score = None
        self.best_live_position = None
        self.last_live_score = None

        self.focus_guidance_label.setText(
            "Focus guidance: waiting for valid focus measurements."
        )

    def onCaptureModeChanged(self, mode):
        """
        When changing modes, reset measurement plots so Single Image,
        Stream, and Autofocus do not mix measurements.
        """

        self.updateAutofocusControls(mode)
        self.clearMeasurementPlotsOnly()
        self._af_start_position = None
        self._af_best_sampled = None
        self._af_result_state = "Not verified"
        self._active_af_stage = "Waiting"
        self.refreshAutofocusSummary()

        if mode == "Autofocus":
            self.showAutofocusPlot()
        else:
            self.showLiveTrendPlot()
    
    def onFocusSessionFinished(self):
        """
        Reset the Run button after a capture sequence finishes naturally.

        This is mainly needed for Single Image and Autofocus modes, where the
        thread stops by itself. Stream mode usually stops when the user toggles
        Run off manually.
        """

        self.Start_button.blockSignals(True)
        self.Start_button.setChecked(False)
        self.Start_button.blockSignals(False)

        self.Start_button.setText("Start")
        self.CaptureMode_combo.setEnabled(True)
        self.setManualFocusControlsEnabled(True)
        print("Focus thread finished.")

    def showLiveTrendPlot(self):
        self.PlotStack.setCurrentWidget(self.LiveTrendPage)

        self.LiveTrend_button.blockSignals(True)
        self.AFCurve_button.blockSignals(True)

        self.LiveTrend_button.setChecked(True)
        self.AFCurve_button.setChecked(False)

        self.LiveTrend_button.blockSignals(False)
        self.AFCurve_button.blockSignals(False)


    def showAutofocusPlot(self):
        self.PlotStack.setCurrentWidget(self.AutofocusPage)

        self.LiveTrend_button.blockSignals(True)
        self.AFCurve_button.blockSignals(True)

        self.LiveTrend_button.setChecked(False)
        self.AFCurve_button.setChecked(True)

        self.LiveTrend_button.blockSignals(False)
        self.AFCurve_button.blockSignals(False)

    def refreshAutofocusSummary(self):
        """Always separate motor position, tentative sample and verified focus."""
        def fmt(value):
            return "--" if value is None else str(int(value))

        stage = getattr(self, "_active_af_stage", "Waiting")
        state = getattr(self, "_af_result_state", "Not verified")
        sampled = getattr(self, "_af_best_sampled", None)
        if sampled is None:
            best_text = "--"
        else:
            best_text = f"{fmt(sampled[0])} ({sampled[1]:.3f})"
        self.af_position_summary_label.setText(
            f"FOCUSER NOW: {fmt(self._af_focuser_now)}   |   "
            f"START: {fmt(self._af_start_position)}   |   "
            f"BEST SAMPLED (unverified): {best_text}\n"
            f"STAGE: {stage}   |   RESULT: {state}"
        )

    def updateAutofocusStart(self, position):
        self._af_start_position = int(position)
        self._af_focuser_now = int(position)
        self._af_result_state = "Searching (no verified focus)"
        self.refreshAutofocusSummary()

    def onAutofocusResult(self, result):
        """Keep a final, explicit result visible after worker stops."""
        if bool(result.get("success")):
            position = result.get("best_position")
            self._af_result_state = f"VERIFIED FOCUS @ {position}"
            if position is not None:
                self.updateFocuserPositionLabel(position)
        else:
            reason = str(result.get("restoration", "not confirmed"))
            if reason == "returned to starting position":
                self._af_result_state = "FAILED; restored to start"
                # Move verified by worker; refresh GUI after return.
                position = result.get("last_position")
                if position is not None:
                    self.updateFocuserPositionLabel(position)
            else:
                self._af_result_state = f"FAILED; {reason}"
            # The smallest sample is not a verified best focus after failure.
        self.refreshAutofocusSummary()

    def updateAutofocusStage(self, stage):
        """Display one focus-search phase at a time; preserve data in JSON."""
        previous_stage = getattr(self, "_active_af_stage", "Waiting")
        self._active_af_stage = str(stage)
        self._af_best_sampled = None  # new phase, do not mix coarse and fine minima
        self.refreshAutofocusSummary()
        self.AFPositions = []
        self.AFScores = []
        self.af_curve_line.setData([], [])
        self.best_focus_line.hide()
        self.AFPlot.getPlotItem().setTitle(str(stage))
        if previous_stage == "Coarse search" and str(stage) == "Fine refinement":
            guidance = ("Coarse scan complete; now showing FINE positions only. "
                        "Coarse data retained in run results.")
        elif str(stage) == "Fine refinement — common-star scores":
            guidance = ("Replotting fine curve using only the SAME stars at every "
                        "position. Original measurements saved in diagnostics.")
        else:
            guidance = str(stage) + ": acquiring fixed-star normalized PSF measurements"
        self.focus_guidance_label.setText(guidance)

    def updateAutofocusPlot(self, focuser_position, median_sigma):
        self.AFPositions.append(int(focuser_position))
        self.AFScores.append(float(median_sigma))
        best_index = int(np.argmin(self.AFScores))
        self._af_best_sampled = (self.AFPositions[best_index], self.AFScores[best_index])
        self.refreshAutofocusSummary()
        self.focus_guidance_label.setText(
            f"{getattr(self, '_active_af_stage', 'Autofocus')}: "
            f"latest {float(median_sigma):.3f} px @ {int(focuser_position)} | "
            f"best sampled {self.AFScores[best_index]:.3f} px @ "
            f"{self.AFPositions[best_index]} | fixed-star normalized width"
        )

        # Sort by focuser position so the curve is visually sane.
        ordered = sorted(zip(self.AFPositions, self.AFScores), key=lambda item: item[0])

        positions = [item[0] for item in ordered]
        scores = [item[1] for item in ordered]

        self.af_curve_line.setData(positions, scores)

        if len(positions) >= 2:
            xmin = min(positions)
            xmax = max(positions)
            xpad = max(1, 0.05 * (xmax - xmin))

            self.AFPlot.setXRange(
                xmin - xpad,
                xmax + xpad,
                padding=0
            )

        if len(scores) > 0:
            ymin = min(scores)
            ymax = max(scores)

            if ymax > ymin:
                ypad = 0.1 * (ymax - ymin)
            else:
                ypad = max(0.1, abs(ymin) * 0.05)

            self.AFPlot.setYRange(
                ymin - ypad,
                ymax + ypad,
                padding=0
            )


    def updateBestFocusMarker(self, best_position, best_score):
        self.best_focus_line.setPos(int(best_position))
        self.best_focus_line.show()

    def createPersistentWorker(self):
        settings = self.getFocusSettings()

        self.thread = FocusThread(self, settings=settings)
        self.thread.updateFocusFrame.connect(self.updateFocusFrame)
        self.thread.updatePlot.connect(self.updatePlot)
        self.thread.updateStatus.connect(self.updateStatus)
        self.thread.updateStarOverlay.connect(self.updateStarOverlay)
        self.thread.sessionFinished.connect(self.onFocusSessionFinished)
        self.thread.updateAutofocusPlot.connect(self.updateAutofocusPlot)
        self.thread.updateAutofocusStage.connect(self.updateAutofocusStage)
        self.thread.updateAutofocusStart.connect(self.updateAutofocusStart)
        self.thread.autofocusResult.connect(self.onAutofocusResult)
        self.thread.updateBestFocus.connect(self.updateBestFocusMarker)
        self.thread.updateFocuserPosition.connect(self.updateFocuserPositionLabel)

        self.thread.start()

    def startthread(self):
        self.thread.start()

    def killthread(self):
        self.thread.stop()
        # print('Say what?')

    def clearDisplay(self):
        print("Clearing PyFocus display.")

        self.clearMeasurementPlotsOnly()

        self.candidate_scatter.setData([])
        self.fitted_scatter.setData([])
        self.reference_scatter.setData([])
        self.rejected_scatter.setData([])

        # Clear image display
        blank_image = np.zeros((100, 100), dtype=np.float32)
        self.focus_imagewidget.setImage(
            blank_image,
            levels=(0, 1),
            autoLevels=False,
            autoRange=True
        )

        # Reset status panel
        self.status_label.setText(
            "No image loaded.\n"
            "Focus metrics will appear here after capture."
        )
        self.global_min = None
        self.global_max = None

        self.last_raw_img = None
        self.last_display_img = None
        self.cursor_stats_label.setText(
            "Cursor: --   Pixel: --\n"
            "Local statistics: --\n"
            "Global Min/Max: -- / --"
        )

    def plot(self, hour, temperature):
        labelStyle = {'color': '#FFF', 'font-size': '12px', 'padding': '0px'}
        self.Plot.plot(hour, temperature)
        self.Plot.setLabel('left', 'PSF (px)', **labelStyle)
        # self.Plot.enableAutoRange()
        # self.Plot.setAutoVisible(y=True)
        self.Plot.autoRange(padding=0)

    def updateFocusCurvePoint(self, focuser_position, focus_score):
        """
        Update the Focus Curve plot using focuser position as x-axis.

        Multiple measurements at the same focuser position are combined using
        the median so the curve is not dominated by one noisy frame.
        """

        if focuser_position not in self.focus_curve_by_position:
            self.focus_curve_by_position[focuser_position] = []

        self.focus_curve_by_position[focuser_position].append(float(focus_score))

        positions = sorted(self.focus_curve_by_position.keys())
        scores = [
            float(np.median(self.focus_curve_by_position[pos]))
            for pos in positions
        ]

        self.af_curve_line.setData(positions, scores)

        if len(positions) >= 2:
            xmin = min(positions)
            xmax = max(positions)
            xpad = max(1, 0.05 * (xmax - xmin))

            self.AFPlot.setXRange(
                xmin - xpad,
                xmax + xpad,
                padding=0
            )

        if len(scores) > 0:
            ymin = min(scores)
            ymax = max(scores)

            if ymax > ymin:
                ypad = 0.1 * (ymax - ymin)
            else:
                ypad = max(0.1, abs(ymin) * 0.05)

            self.AFPlot.setYRange(
                ymin - ypad,
                ymax + ypad,
                padding=0
            )

            best_index = int(np.argmin(scores))
            best_position = positions[best_index]

            self.best_focus_line.setPos(best_position)
            self.best_focus_line.show()

    def updatePlot(self, sigmax, sigmay, average, focuser_position=None):
        self.frame_number += 1

        self.Sx.append(self.frame_number)
        self.Sy.append(sigmax)
        self.Syy.append(sigmay)
        self.Sav.append(average)
        median_window = 7
        rolling_median = float(np.median(self.Sav[-median_window:]))
        self.Smed.append(rolling_median)

        if len(self.Sx) > self.max_plot_points:
            self.Sx = self.Sx[-self.max_plot_points:]
            self.Sy = self.Sy[-self.max_plot_points:]
            self.Syy = self.Syy[-self.max_plot_points:]
            self.Sav = self.Sav[-self.max_plot_points:]
            self.Smed = self.Smed[-self.max_plot_points:]

        # Keep the live trend, but make Average the main thing.
        self.x_line.setData(self.Sx, self.Sy)
        self.y_line.setData(self.Sx, self.Syy)
        self.av_line.setData(self.Sx, self.Sav)
        self.med_line.setData(self.Sx, self.Smed)

        if len(self.Sx) >= 2:
            self.Plot.setXRange(
                self.Sx[0],
                self.Sx[-1],
                padding=0.05
            )

        # Scale the graph mostly around the values we actually care about.
        # This prevents Sigma X/Y spikes from making the useful trend unreadable.
        all_y = self.Sav[-30:] + self.Smed[-30:]

        if len(all_y) > 0:
            ymin = min(all_y)
            ymax = max(all_y)

            if ymax > ymin:
                pad = max(0.08, 0.25 * (ymax - ymin))
            else:
                pad = 0.08

            self.Plot.setYRange(
                ymin - pad,
                ymax + pad,
                padding=0
            )

        # Also update the Focus Curve if we know the focuser position.
        if focuser_position is not None and self.CaptureMode_combo.currentText() != "Autofocus":
            self.updateFocusCurvePoint(
                int(focuser_position),
                float(average)
            )

        # Guidance text.
        raw_score = float(average)
        score = float(np.median(self.Sav[-7:]))
        position_text = "--" if focuser_position is None else str(int(focuser_position))

        if self.best_live_score is None or score < self.best_live_score:
            self.best_live_score = score
            self.best_live_position = focuser_position
            verdict = "NEW BEST"
        else:
            delta_from_best = score - self.best_live_score

            if delta_from_best <= 0.05:
                verdict = "NEAR BEST"
            else:
                verdict = f"WORSE than best by +{delta_from_best:.3f} px"

        if self.last_live_score is None:
            change_text = "Change from previous: --"
        else:
            delta = score - self.last_live_score

            if abs(delta) <= 0.03:
                change_text = f"Change from previous: stable ({delta:+.3f} px)"
            elif delta < 0:
                change_text = f"Change from previous: BETTER ({delta:+.3f} px)"
            else:
                change_text = f"Change from previous: WORSE ({delta:+.3f} px)"

        self.last_live_score = score

        if self.best_live_position is None:
            best_position_text = "--"
        else:
            best_position_text = str(int(self.best_live_position))

        

        if self.CaptureMode_combo.currentText() == "Autofocus":
            # The live rolling median mixes frames from DIFFERENT focus
            # positions. Only the stage-specific matched-star curve is
            # meaningful for autofocus selection.
            return
        self.focus_guidance_label.setText(
            f"Current average sigma: {raw_score:.3f} px   |   "
            f"7-frame median sigma: {score:.3f} px   |   "
            f"Best: {self.best_live_score:.3f} px @ {best_position_text}\n"
            f"{verdict}   |   {change_text}"
        )

    def updateAutofocusControls(self, mode):
        """
        Show autofocus-only settings only when Autofocus mode is selected.

        In Stream / Single Image mode, hide them entirely so the plot has more
        vertical room.
        """

        autofocus_enabled = (mode == "Autofocus")
        if hasattr(self, "af_position_summary_label"):
            self.af_position_summary_label.setVisible(autofocus_enabled)

        for widget in self.autofocus_controls:
            widget.setVisible(autofocus_enabled)
            widget.setEnabled(autofocus_enabled)

        if hasattr(self, "settings_group"):
            if autofocus_enabled:
                self.settings_group.setMinimumHeight(205)
                self.settings_group.setMaximumHeight(255)
            else:
                self.settings_group.setMinimumHeight(150)
                self.settings_group.setMaximumHeight(185)
    
    def updateStatus(self, status):
        sigma_x = status.get("sigma_x")
        sigma_y = status.get("sigma_y")
        sigma_avg = status.get("sigma_avg")

        def fmt_sigma(value):
            return "--" if value is None else f"{float(value):.3f}"
        sigma_text = (
            f"Sigma X: {fmt_sigma(sigma_x)} px   "
            f"Sigma Y: {fmt_sigma(sigma_y)} px   "
            f"Average: {fmt_sigma(sigma_avg)} px"
        )

        focuser_position = status.get("focuser_position")
        testing_position = status.get("testing_position")
        best_position = status.get("best_position")

        if focuser_position is None:
            focuser_text = "Focuser position: --"
        else:
            focuser_text = f"Focuser position: {focuser_position}"

        if testing_position is not None:
            focuser_text += f"   Testing: {testing_position}"

        if best_position is not None:
            focuser_text += f"   Best: {best_position}"

        text = (
            f"Mode: {status.get('capture_mode', 'Unknown')} | "
            f"Status: {status.get('state', 'Running')}\n"
            f"{focuser_text}\n"
            f"Exp: {status['exposure']:.3f}s | "
            "ColibriGrab: high gain 12-bit | "
            f"Bin: {status['binning']}\n"
            f"Mean/Std: {status['mean']:.1f} / {status['std']:.1f} | "
            f"Min/Max: {status['min']:.0f} / {status['max']:.0f}\n"
            f"Peaks: {status['detected_peaks']} | "
            f"Attempted: {status.get('attempted_candidates', 0)} | "
            f"Accepted PSFs: {status['valid_fits']}\n"
            f"{sigma_text}"
        )
        rejections = status.get('fit_rejections') or {}
        if rejections:
            top = ', '.join(f'{k}={v}' for k,v in
                            sorted(rejections.items(), key=lambda item:-item[1])[:4])
            text += '\nRejected: ' + top
        if status.get('reference_count'):
            text += (f"\nLocked stars: {status.get('matched_stars', 0)}/"
                     f"{status['reference_count']} (stable {status.get('stream_cohort_present', 0)}/{status.get('stream_cohort_size', 0)}) | field: "
                     + ', '.join(f'{k}={v}' for k,v in
                                 (status.get('field_counts') or {}).items() if v))

        self.status_label.setText(text)

    def connectDevices(self):
        try:
            print('Using ColibriGrab.exe for image capture (12-bit HDR RR 2x2 RCD).')
            print('No MaxIm/FLI camera COM connection is opened by PyFocus.')
        except Exception as e:
            print(f'ERROR:  {str(e)}')

    # Mount slews intentionally belong to the existing ACP/RunColibri
    # orchestrator, not this autofocus process.

    def requestFocusJog(self, delta):
        if self.thread is None:
            return

        print(f"GUI requested focuser jog: {delta:+d}")
        self.thread.requestFocusJog(int(delta))


    def requestFocusMoveTo(self):
        if self.thread is None:
            return

        target_position = int(self.FocusTarget_spin.value())
        print(f"GUI requested focuser move to: {target_position}")
        self.thread.requestFocusMoveTo(target_position)


    def requestFocuserRefresh(self):
        if self.thread is None:
            return

        print("GUI requested focuser position refresh.")
        self.thread.requestFocuserRefresh()


    def updateFocuserPositionLabel(self, position):
        if position is None:
            self.FocuserPosition_label.setText("Position: unavailable")
            self._af_focuser_now = None
            self.refreshAutofocusSummary()
            return

        position = int(position)
        self._af_focuser_now = position
        self.refreshAutofocusSummary()
        self.FocuserPosition_label.setText(f"Position: {position}")

        # Keep the target box synced to the real position.
        self.FocusTarget_spin.blockSignals(True)
        self.FocusTarget_spin.setValue(position)
        self.FocusTarget_spin.blockSignals(False)

    def setManualFocusControlsEnabled(self, enabled):
        for name in ("FocusMinus_button", "FocusPlus_button", "FocusGo_button",
                "FocusRefresh_button", "FocusStep_spin", "FocusTarget_spin"):
            getattr(self, name).setEnabled(enabled)

    def startFocus(self):
        if self.thread is None:
            return

        if self.Start_button.isChecked():
            if self.CaptureMode_combo.currentText() == "Autofocus":
                self.clearMeasurementPlotsOnly()
                self._af_start_position = None
                self._af_best_sampled = None
                self._af_result_state = "Starting (not verified)"
                self._active_af_stage = "Preparing"
                self.refreshAutofocusSummary()
            self.CaptureMode_combo.setEnabled(False)
            self.Start_button.setText("Running...")
            self.connectDevices()

            settings = self.getFocusSettings()
            self.setManualFocusControlsEnabled(settings["capture_mode"] != "Autofocus")
            self.thread.startSession(settings)

        else:
            self.Start_button.setText("Stopping...")
            self.thread.stopSession()

    def closeEvent(self, event):
        if self.thread is not None and self.thread.isRunning():
            self.thread.shutdown()
        super().closeEvent(event)

    def stopFocus(self):
        print("Exit button pressed.")

        # Stop the focus/capture thread if it is running.
        if self.thread is not None and self.thread.isRunning():
            self.thread.shutdown()

        # Close the GUI window.
        self.close()
    # def grabImage(self,x,y,sizex,sizey, exposure):
    #   C.StartX = x
    #   C.StartY = y
    #   C.NumX = sizex
    #   C.NumY = sizey
    #   print('here')
    #   C.StartExposure(exposure, True)
    #   while not C.ImageReady:
    #       time.sleep(0.5)
    #       print(f'{C.PercentCompleted}% complete')
    #   print('finished')

    #   img = C.ImageArray
    #   imginfo = C.ImageArrayInfo
    #   if imginfo.ImageElementType == ImageArrayElementTypes.Int32:
    #       if C.MaxADU <= 65535:
    #           imgDataType = np.uint16 # Required for BZERO & BSCALE to be written
    #       else:
    #           imgDataType = np.int32
    #   elif imginfo.ImageElementType == ImageArrayElementTypes.Double:
    #       imgDataType = np.float64
    #   #
    #   # Make a numpy array of he correct shape for astropy.io.fits
    #   #
    #   if imginfo.Rank == 2:
    #       nda = np.array(img, dtype=imgDataType).transpose()
    #   else:
    #       nda = np.array(img, dtype=imgDataType).transpose(2,1,0)

    #   print(np.shape(nda))

    #   # self.updateFocusFrame(nda)

    #   return nda

    def applyImageZoom(self):
        """
        Apply view zoom to the current displayed image.

        This changes the pyqtgraph view range immediately, similar to using the
        mouse wheel, without waiting for a new camera exposure.
        """

        if self.last_display_img is None:
            return

        height, width = self.last_display_img.shape

        zoom = max(1, self.Zoom_slider.value())

        # Slider value 1 = full image.
        # Slider value 9 = zoomed in by roughly 9x.
        view_width = width / zoom
        view_height = height / zoom

        center_x = width / 2.0
        center_y = height / 2.0

        x_min = center_x - view_width / 2.0
        x_max = center_x + view_width / 2.0
        y_min = center_y - view_height / 2.0
        y_max = center_y + view_height / 2.0

        view = self.focus_imagewidget.getView()
        view.setRange(
            xRange=(x_min, x_max),
            yRange=(y_min, y_max),
            padding=0
        )
        
    def updateCursorStats(self, event):
        """
        Update the cursor statistics readout below the FITS image.

        The displayed image may be downsampled relative to the raw camera image.
        Mouse coordinates are converted back into raw-image coordinates using
        self.display_block.
        """

        if self.last_raw_img is None or self.last_display_img is None:
            return

        # SignalProxy passes arguments as a tuple.
        pos = event[0]

        view = self.focus_imagewidget.getView()

        if not view.sceneBoundingRect().contains(pos):
            return

        # getView() already returns the ViewBox, so call mapSceneToView directly.
        mouse_point = view.mapSceneToView(pos)

        display_x = int(round(mouse_point.x()))
        display_y = int(round(mouse_point.y()))

        display_height, display_width = self.last_display_img.shape

        if (
            display_x < 0 or display_x >= display_width or
            display_y < 0 or display_y >= display_height
        ):
            return

        block = max(1, int(getattr(self, "display_block", 1)))

        raw_x = int(display_x * block)
        raw_y = int(display_y * block)

        raw_height, raw_width = self.last_raw_img.shape

        if (
            raw_x < 0 or raw_x >= raw_width or
            raw_y < 0 or raw_y >= raw_height
        ):
            return

        pixel_value = float(self.last_raw_img[raw_y, raw_x])

        # Local statistics window around the cursor.
        radius = 5

        y0 = max(0, raw_y - radius)
        y1 = min(raw_height, raw_y + radius + 1)
        x0 = max(0, raw_x - radius)
        x1 = min(raw_width, raw_x + radius + 1)

        region = self.last_raw_img[y0:y1, x0:x1]
        region = region[np.isfinite(region)]

        if region.size == 0:
            return

        local_mean = float(np.mean(region))
        local_median = float(np.median(region))
        local_std = float(np.std(region))
        local_min = float(np.min(region))
        local_max = float(np.max(region))

        if local_std > 0:
            snr = (pixel_value - local_median) / local_std
        else:
            snr = 0.0

        if self.global_min is None or self.global_max is None:
            global_range_text = "-- / --"
        else:
            global_range_text = (
                f"{self.global_min:.0f} / {self.global_max:.0f}"
            )

        self.cursor_stats_label.setText(
            f"Cursor raw: x={raw_x}, y={raw_y}   "
            f"Pixel={pixel_value:.1f} ADU\n"
            f"Local mean={local_mean:.1f}   "
            f"median={local_median:.1f}   "
            f"std={local_std:.1f}   "
            f"Local Min/Max={local_min:.0f} / {local_max:.0f}   "
            f"SNR~{snr:.1f}\n"
            f"Global Min/Max={global_range_text}"
        )
    
    def updateStarOverlay(self, candidate_points, fitted_points, rejected_points, reference_points):
        """
        Update star markers on top of the displayed image.

        Coordinates from the focus thread are in raw-image pixels.
        The displayed image is downsampled by self.display_block, so we scale
        the marker positions to match the preview image.
        """

        block = max(1, int(getattr(self, "display_block", 1)))

        def make_spots(points, size):
            arr = np.asarray(points, dtype=float)

            if arr.size == 0:
                return []

            arr = arr.reshape(-1, 2)

            spots = []
            for px, py in arr:
                display_x = (float(px) + 0.5) / block - 0.5
                display_y = (float(py) + 0.5) / block - 0.5
                
                spots.append({
                    "pos": (display_x, display_y),
                    "size": size,
                })

            return spots

        self.candidate_scatter.setData(make_spots(candidate_points, 9))
        self.fitted_scatter.setData(make_spots(fitted_points, 11))
        self.rejected_scatter.setData(make_spots(rejected_points, 10))
        self.reference_scatter.setData(make_spots(reference_points, 15))

    def updateFocusFrame(self, image):
        """
        Update the live focus image displayed in the GUI.

        This function only changes the display version of the image. The focus
        measurement still uses the original raw image in the focus thread.

        The image is block-averaged for display so that a large FITS frame is not
        squeezed directly into the small GUI window, which can create ugly
        row/column aliasing artifacts.
        """
        
        img = np.asarray(image, dtype=np.float32)
        self.last_raw_img = img

        bright_y, bright_x = np.unravel_index(
            np.nanargmax(img),
            img.shape
        )

        bin_x = max(1, self.Binning_spinbox.value())
        bin_y = max(1, self.Binning_spinbox.value())

        sensor_x0 = bright_x * bin_x
        sensor_x1 = sensor_x0 + bin_x - 1
        sensor_y0 = bright_y * bin_y
        sensor_y1 = sensor_y0 + bin_y - 1

        print(
            f"Brightest raw pixel: "
            f"x={bright_x}, y={bright_y}, value={img[bright_y, bright_x]:.1f}"
        )

        print(
            f"Approx unbinned sensor region: "
            f"x={sensor_x0}-{sensor_x1}, y={sensor_y0}-{sensor_y1}"
        )

        # Whole-frame values. These remain fixed until the next image arrives.
        finite_raw = img[np.isfinite(img)]

        if finite_raw.size > 0:
            self.global_min = float(np.min(finite_raw))
            self.global_max = float(np.max(finite_raw))
        else:
            self.global_min = None
            self.global_max = None

        # Make a display-only copy.
        display_img = img.copy()

        # Fixed display downsample size.
        # The slider now controls view zoom, not downsample resolution.
        max_display_size = 600
        height, width = display_img.shape

        block = max(1, int(max(height, width) / max_display_size))
        self.display_block = block

        if block > 1:
            new_height = height // block
            new_width = width // block

            display_img = display_img[:new_height * block, :new_width * block]
            display_img = display_img.reshape(new_height, block, new_width, block).mean(axis=(1, 3))

        finite = display_img[np.isfinite(display_img)]

        if finite.size == 0:
            self.focus_imagewidget.setImage(display_img)
            return

        median = np.nanmedian(finite)
        std = np.nanstd(finite)

        # Display stretch only.
        low = median - 1.0 * std
        high = median + 8.0 * std

        if high <= low:
            high = low + 1

        self.last_display_img = display_img

        self.focus_imagewidget.setImage(
            display_img,
            levels=(low, high),
            autoLevels=False,
            autoRange=False
        )

        self.last_display_img = display_img

        # Only apply zoom/range manually, instead of forcing pyqtgraph to autorange every frame.
        self.applyImageZoom()

        print("Raw Min:", np.nanmin(img))
        print("Raw Max:", np.nanmax(img))
        print("Display shape:", display_img.shape)
        print("Display low/high:", low, high)
        # self.focus_imagewidget.setImage(image)
        # self.focus_imagewidget.autoRange()

    # def readxbytes(fid, numbytes):
    #   for i in range(1):
    #       data = fid.read(numbytes)
    #       if not data:
    #           break
    #   return data

    # @nb.njit(nb.uint16[::1](nb.uint8[::1]),fastmath=True,parallel=True)
    # def nb_read_data(data_chunk):
    #   """data_chunk is a contigous 1D array of uint8 data)
    #   eg.data_chunk = np.frombuffer(data_chunk, dtype=np.uint8)"""
    #   #ensure that the data_chunk has the right length

    #   assert np.mod(data_chunk.shape[0],3)==0

    #   out=np.empty(data_chunk.shape[0]//3*2,dtype=np.uint16)
    #   image1 = np.empty((2048,2048),dtype=np.uint16)
    #   image2 = np.empty((2048,2048),dtype=np.uint16)

    #   for i in nb.prange(data_chunk.shape[0]//3):
    #       fst_uint8=np.uint16(data_chunk[i*3])
    #       mid_uint8=np.uint16(data_chunk[i*3+1])
    #       lst_uint8=np.uint16(data_chunk[i*3+2])

    #       out[i*2] =   (fst_uint8 << 4) + (mid_uint8 >> 4)
    #       out[i*2+1] = ((mid_uint8 % 16) << 8) + lst_uint8

    #   return out

    # def split_images(self,data,pix_h,pix_v,gain):
    #   interimg = np.reshape(data, [2*pix_v,pix_h])

    #   if gain == 'low':
    #       image = interimg[::2]
    #   else:
    #       image = interimg[1::2]

    #   return image

def main():
    print("Starting PyFocus GUI...")
    app = QtWidgets.QApplication(sys.argv)
    window = Ui()
    sys.exit(app.exec_())


def headless_autofocus(args):
    """Run without QWidget or PyFocus.ui; suitable for an ACP subprocess."""
    import json
    app = QtCore.QCoreApplication([sys.argv[0]])
    if args.output_json:
        # Never leave a previous successful result when a new run crashes.
        Path(args.output_json).resolve().unlink(missing_ok=True)
    settings = {
        "capture_mode": "Autofocus",
        "focuser_driver_id": args.focuser_driver,
        "exposure": args.exposure,
        "colibrigrab_exe": args.colibrigrab_exe or str(Path.home() / "Documents" / "GitHub" / "ColibriGrab" / "ColibriGrab" / "ColibriGrab.exe"),
        "grab_output_root": args.grab_output_root,
        "grab_temperature": args.grab_temperature,
        "grab_timeout": args.grab_timeout,
        "kill_flipilot": not args.no_flipilot_watchdog,
        "stop_file": args.stop_file,
        "bin_x": args.binning, "bin_y": args.binning,
        "af_step_size": args.step_size,
        "af_steps_each_side": args.steps_each_side,
        "af_frames_per_position": args.frames_per_position,
        "af_settle_time": args.settle_time,
        "af_backlash_steps": args.backlash_steps,
        "af_min_contrast": args.min_focus_contrast,
        "af_verify_tolerance": args.verify_tolerance,
        "af_coarse_multiplier": args.coarse_multiplier,
        "af_max_excursion": args.max_excursion,
    }
    if args.stop_file and Path(args.stop_file).exists():
        print(f"ERROR: Stop file already exists: {args.stop_file}")
        return 1
    worker = FocusThread(settings=settings)
    result = {"success":False, "error":"No autofocus completion result"}

    def on_status(state):
        print(state.get("state", "Autofocus running"), flush=True)

    def on_result(data):
        result.clear()
        result.update(data)

    worker.updateStatus.connect(on_status)
    worker.autofocusResult.connect(on_result)
    worker.sessionFinished.connect(app.quit)
    worker.start()
    worker.startSession(settings)
    try:
        app.exec_()
    finally:
        worker.shutdown()
    if args.output_json:
        p = Path(args.output_json).resolve()
        p.parent.mkdir(parents=True,exist_ok=True)
        tmp = p.with_suffix(p.suffix + ".tmp")
        tmp.write_text(json.dumps(result,indent=2),encoding="utf-8")
        tmp.replace(p)
    print("AUTOFOCUS_RESULT",json.dumps(result),flush=True)
    return 0 if result.get("success",False) else 1

if __name__ == '__main__':
    arg_parser = argparse.ArgumentParser(description="PyFocus GUI and ColibriGrab autonomous focuser sweep")
    group = arg_parser.add_mutually_exclusive_group()
    group.add_argument('-i', '--interactive', action='store_true', help='Launch PyFocus GUI')
    group.add_argument('--autofocus', action='store_true', help='Run autofocus headlessly')
    arg_parser.add_argument('--exposure', type=float, default=0.025,
        help='Per-frame exposure in seconds; ColibriGrab -e uses integer milliseconds')
    arg_parser.add_argument('--binning', type=int, choices=[2], default=2,
        help='RCD reader currently supports HDR RR 2x2 only')
    arg_parser.add_argument('--colibrigrab-exe', help='Full path to ColibriGrab.exe')
    arg_parser.add_argument('--grab-output-root', default=r'D:\ColibriData\PyFocus',
        help='Dedicated capture folder separate from science observations')
    arg_parser.add_argument('--grab-temperature', type=int, default=-10,
        help='Value of ColibriGrab -t as used in local RunColibri')
    arg_parser.add_argument('--grab-timeout', type=float, default=120.0,
        help='Maximum seconds for ONE ColibriGrab batch')
    arg_parser.add_argument('--no-flipilot-watchdog', action='store_true',
        help='Disable RunColibri-style FLIPilot termination during grab')
    arg_parser.add_argument('--stop-file',
        help='Optional ACP safety cancellation flag: file existence cancels current run')
    arg_parser.add_argument('--step-size', type=int, default=50)
    arg_parser.add_argument('--steps-each-side', type=int, default=3)
    arg_parser.add_argument('--frames-per-position', type=int, default=7)
    arg_parser.add_argument('--coarse-multiplier', type=int, default=3,
        help='Coarse scan step = multiplier * fine step; default 3')
    arg_parser.add_argument('--max-excursion', type=int, default=900,
        help='Maximum focus travel in steps from starting position, default 900')
    arg_parser.add_argument('--settle-time', type=float, default=1.0)
    arg_parser.add_argument('--backlash-steps', type=int, default=0,
        help='Measured backlash correction; 0 disables final-approach compensation')
    arg_parser.add_argument('--min-focus-contrast', type=float, default=0.01,
        help='Minimum relative difference from each adjacent scan position (default 0.01 = 1%%)')
    arg_parser.add_argument('--verify-tolerance', type=float, default=0.25,
        help='Maximum increase in final PSF sigma versus scan minimum (default 0.25 = 25%%)')
    arg_parser.add_argument('--focuser-driver',default=DEFAULT_FOCUSER_DRIVER_ID)
    arg_parser.add_argument('--output-json',help='Write atomic JSON result for RunColibri')
    args = arg_parser.parse_args()
    if args.autofocus:
        sys.exit(headless_autofocus(args))
    elif args.interactive:
        main()
    else:
        arg_parser.print_help()

import time, sys
import argparse
import numpy as np
import numba as nb
import pyqtgraph as pg
#pg.setConfigOptions(imageAxisOrder='row-major')

import imageio
import scipy.optimize as opt
import scipy.ndimage as ndimage
import scipy.ndimage.filters as filters

import matplotlib.pyplot as plt

from pathlib import Path
import win32com.client
import pythoncom
from astropy.io import fits

#from alpaca.telescope import *
#from alpaca.camera import *
#from alpaca.focuser import *
#from alpaca.exceptions import *


#################### PYQT5 LIBRARY/PACKAGE IMPORTS ####################

from PyQt5 import QtWidgets, uic, QtGui, QtCore
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *
from PyQt5.QtGui import *

class ASCOMFocuserController:
	def __init__(self, driver_id=None):
		self.driver_id = driver_id
		self.focuser = None

	def connect(self):
		if not self.driver_id:
			chooser = win32com.client.Dispatch("ASCOM.Utilities.Chooser")
			chooser.DeviceType = "Focuser"
			self.driver_id = chooser.Choose(None)

		if not self.driver_id:
			raise RuntimeError("No ASCOM focuser driver selected.")

		self.focuser = win32com.client.Dispatch(self.driver_id)
		self.focuser.Connected = True

		if not self.focuser.Connected:
			raise RuntimeError("Could not connect to ASCOM focuser.")

		print(f"Connected to focuser: {self.driver_id}")
		print(f"Current focuser position: {self.position}")

	def disconnect(self):
		if self.focuser is not None:
			try:
				self.focuser.Connected = False
			except Exception:
				pass

	def is_connected(self):
		return self.focuser is not None and self.focuser.Connected

	@property
	def position(self):
		return int(self.focuser.Position)

	def move_to(self, target_position, keep_running_callback=None):
		target_position = int(target_position)

		print(f"Moving focuser to {target_position}")
		self.focuser.Move(target_position)

		while self.focuser.IsMoving:
			if keep_running_callback is not None and not keep_running_callback():
				print("Autofocus cancelled while focuser was moving.")
				break

			time.sleep(0.25)

		print(f"Focuser position: {self.position}")

class FocusThread(QtCore.QThread):
	# grabImage = QtCore.pyqtSignal(int,int,int,int,float)
	updateFocusFrame = QtCore.pyqtSignal(object)
	updatePlot = QtCore.pyqtSignal(float,float,float)
	updateStatus = QtCore.pyqtSignal(object)
	updateStarOverlay = QtCore.pyqtSignal(object, object)

	def __init__(self, parent=None, settings=None):
		super(FocusThread,self).__init__(parent)
		self.threadactive = True
		
		if settings is None:
			settings = {}
		
		self.capture_mode = settings.get("capture_mode", "Stream")

		# MaxIM / FITS capture settings
		self.exposure = float(settings.get("exposure", 0.1))
		self.gain = float(settings.get("gain", 25.0))
		self.filter_number = int(settings.get("filter_number", 0))
		self.light_frame = bool(settings.get("light_frame", True))
		self.temp_fits_path = settings.get("temp_fits_path", r"D:\tmp\pyfocus_latest.fit")
		self.maxim_camera = None

		# Camera/binning settings
		self.bin_x = int(settings.get("bin_x", 2))
		self.bin_y = int(settings.get("bin_y", 2))

		# Display settings
		self.max_display_size = int(settings.get("max_display_size", 300))

		# Star detection / fitting settings
		self.neighborhood_size = int(settings.get("neighborhood_size", 25))
		self.intensity_threshold = float(settings.get("intensity_threshold", 30))
		self.segment_radius = int(settings.get("segment_radius", 25))
		self.roundness_threshold = float(settings.get("roundness_threshold", 0.5))
		self.max_feature_ratio = float(settings.get("max_feature_ratio", 0.8))

		# Autofocus settings
		self.af_step_size = int(settings.get("af_step_size", 25))
		self.af_steps_each_side = int(settings.get("af_steps_each_side", 3))
		self.af_frames_per_position = int(settings.get("af_frames_per_position", 3))
		self.af_settle_time = float(settings.get("af_settle_time", 1.0))
		self.focuser_driver_id = settings.get("focuser_driver_id", None)

	@QtCore.pyqtSlot()
	def run(self):
		"""
		Main focus thread entry point.

		Depending on capture_mode, this either:
		- takes one focus measurement,
		- streams focus measurements continuously,
		- or runs the autofocus sweep routine.
		"""

		pythoncom.CoInitialize()

		try:
			if self.capture_mode == "Autofocus":
				self.runAutofocus()

			elif self.capture_mode == "Single Image":
				self.measureFocusMetric()
				self.threadactive = False

			else:
				# Stream mode
				while self.threadactive:
					self.measureFocusMetric()

		finally:
			self.maxim_camera = None
			pythoncom.CoUninitialize()

	def runAutofocus(self):
		"""
		Run a simple autofocus sweep.

		The routine:
		1. Connects to the ASCOM/Seletek focuser.
		2. Reads the current focuser position.
		3. Tests positions around the current position.
		4. Takes several focus measurements at each position.
		5. Uses the median Average sigma as the score for each position.
		6. Moves the focuser to the position with the lowest score.
		"""

		print("Starting autofocus sweep.")

		focuser = ASCOMFocuserController(self.focuser_driver_id)

		try:
			focuser.connect()

			start_pos = focuser.position
			print(f"Starting focuser position: {start_pos}")

			offsets = range(-self.af_steps_each_side, self.af_steps_each_side + 1)

			test_positions = [
				start_pos + offset * self.af_step_size
				for offset in offsets
			]

			results = []

			for pos in test_positions:
				if not self.threadactive:
					print("Autofocus cancelled.")
					break

				move_status = {
					"state": f"Autofocus: moving to position {pos}",
					"mean": 0,
					"std": 0,
					"min": 0,
					"max": 0,
					"detected_peaks": 0,
					"valid_fits": 0,
					"sigma_x": None,
					"sigma_y": None,
					"sigma_avg": None,
					"exposure": self.exposure,
					"binning": f"{self.bin_x}x{self.bin_y}",
					"capture_mode": self.capture_mode,
				}

				self.updateStatus.emit(move_status)

				focuser.move_to(
					pos,
					keep_running_callback=lambda: self.threadactive
				)

				time.sleep(self.af_settle_time)

				position_metrics = []

				for frame_index in range(self.af_frames_per_position):
					if not self.threadactive:
						break

					measure_status = move_status.copy()
					measure_status["state"] = (
						f"Autofocus: measuring position {pos} "
						f"({frame_index + 1}/{self.af_frames_per_position})"
					)
					self.updateStatus.emit(measure_status)

					metric = self.measureFocusMetric()

					if metric is not None:
						position_metrics.append(metric["sigma_avg"])

				if len(position_metrics) == 0:
					print(f"Position {pos}: no valid focus measurements.")
					continue

				score = float(np.median(position_metrics))
				results.append((pos, score))

				print(f"Position {pos}: median average sigma = {score:.4f}")

			if len(results) == 0:
				print("Autofocus failed: no valid focus measurements.")

				fail_status = {
					"state": "Autofocus failed: no valid focus measurements.",
					"mean": 0,
					"std": 0,
					"min": 0,
					"max": 0,
					"detected_peaks": 0,
					"valid_fits": 0,
					"sigma_x": None,
					"sigma_y": None,
					"sigma_avg": None,
					"exposure": self.exposure,
					"binning": f"{self.bin_x}x{self.bin_y}",
					"capture_mode": self.capture_mode,
				}

				self.updateStatus.emit(fail_status)
				return

			best_pos, best_score = min(results, key=lambda item: item[1])

			print("Autofocus results:")
			for pos, score in results:
				print(f"  Position {pos}: {score:.4f}")

			print(f"Best focus position: {best_pos}, score = {best_score:.4f}")

			done_status = {
				"state": f"Autofocus complete. Moving to best position {best_pos}.",
				"mean": 0,
				"std": 0,
				"min": 0,
				"max": 0,
				"detected_peaks": 0,
				"valid_fits": 0,
				"sigma_x": None,
				"sigma_y": None,
				"sigma_avg": best_score,
				"exposure": self.exposure,
				"binning": f"{self.bin_x}x{self.bin_y}",
				"capture_mode": self.capture_mode,
			}

			self.updateStatus.emit(done_status)

			focuser.move_to(
				best_pos,
				keep_running_callback=lambda: self.threadactive
			)

			final_status = done_status.copy()
			final_status["state"] = (
				f"Autofocus finished. Best position: {best_pos}, "
				f"score: {best_score:.3f}"
			)
			self.updateStatus.emit(final_status)

			print("Autofocus sweep finished.")

		finally:
			focuser.disconnect()
			self.threadactive = False

	def measureFocusMetric(self):
		"""
		Capture one image, display it, detect stars, fit PSFs, update the GUI,
		and return a dictionary containing the focus metric.

		Returns:
			dict if a valid focus metric was measured.
			None if the image was captured but no usable focus metric was found.
		"""

		try:
			nda = self.captureMaxIMFits()

			if nda is None:
				return None

		except Exception as e:
			print(f"ERROR capturing MaxIM FITS image: {str(e)}")
			time.sleep(1.0)
			return None

		# Display latest image in GUI
		self.updateFocusFrame.emit(nda)

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
		sigma_threshold = 8.0
		intensity_threshold = max(self.intensity_threshold, sigma_threshold * robust_sigma)
		peak_floor = median + sigma_threshold * robust_sigma

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
		}

		self.updateStatus.emit(basic_status)

		# Locate local maxima that may correspond to stars.
		neighborhood_size = self.neighborhood_size

		data_max = ndimage.maximum_filter(data, neighborhood_size)
		maxima = (data == data_max)

		# Reject local maxima that are not bright enough above the background.
		maxima[data < peak_floor] = 0

		# Reject saturated/hot-pixel-like peaks.
		# A saturated point cannot give a reliable focus measurement.
		saturation_level = np.nanmax(nda)
		saturation_cut = 0.98 * saturation_level
		maxima[data >= saturation_cut] = 0

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

			self.updateStarOverlay.emit([], [])

			no_star_status = basic_status.copy()
			no_star_status["state"] = "Image captured, but no stars were found."
			self.updateStatus.emit(no_star_status)

			return None

		# Find centres of mass for each detected peak.
		xy = np.array(ndimage.center_of_mass(data, labeled, range(1, num_objects + 1)))

		if xy.size == 0:
			print("No star centers found.")

			self.updateStarOverlay.emit([], [])

			no_center_status = basic_status.copy()
			no_center_status["state"] = "Image captured, but no star centers were found."
			no_center_status["detected_peaks"] = num_objects
			self.updateStatus.emit(no_center_status)

			return None

		# Unpack coordinates.
		y, x = np.hsplit(xy, 2)

		# Limit PSF fitting to brightest N candidates to improve speed.
		if self.capture_mode == "Autofocus":
			max_candidates = 20
		else:
			max_candidates = 10

		if len(x) > max_candidates:
			peak_values = []

			for yy, xx in zip(y.flatten(), x.flatten()):
				iy = int(round(yy))
				ix = int(round(xx))

				if 0 <= iy < nda.shape[0] and 0 <= ix < nda.shape[1]:
					peak_values.append(nda[iy, ix])
				else:
					peak_values.append(0)

			peak_values = np.array(peak_values)
			best_indices = np.argsort(peak_values)[-max_candidates:]

			x = x[best_indices]
			y = y[best_indices]

			print(f"Limited PSF fitting to {max_candidates} candidates.")

		x2, y2, amplitude, intensity, sigma_y_fitted, sigma_x_fitted = self.fitPSF(
			nda, global_mean, x, y
		)

		# Send star locations to the GUI overlay.
		# Candidate points are the stars selected for fitting.
		# Fitted points are stars that passed the PSF fit filters.
		candidate_points = np.column_stack((x.flatten(), y.flatten()))

		if len(x2) > 0:
			fitted_points = np.column_stack((np.asarray(x2), np.asarray(y2)))
		else:
			fitted_points = np.empty((0, 2))

		self.updateStarOverlay.emit(candidate_points, fitted_points)

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
			self.updateStatus.emit(no_fit_status)

			return None

		# Use mean for now, matching current behaviour.
		# Later this can be changed to median for more robustness.
		sigmax = np.mean(sigma_x_fitted)
		sigmay = np.mean(sigma_y_fitted)
		sigmaav = (sigmax + sigmay) / 2.0

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
		}

		self.updateStatus.emit(status)
		self.updatePlot.emit(float(sigmax), float(sigmay), float(sigmaav))

		return status
	
	def captureMaxIMFits(self):
		"""
		Capture one FITS image through MaxIM DL and return it as a NumPy array.
		"""

		output_path = Path(self.temp_fits_path)
		output_path.parent.mkdir(parents=True, exist_ok=True)

		# Connect to MaxIM only once.
		if self.maxim_camera is None:
			self.maxim_camera = win32com.client.Dispatch("MaxIm.CCDCamera")
			self.maxim_camera.LinkEnabled = True

			if not self.maxim_camera.LinkEnabled:
				raise RuntimeError("Could not connect to camera through MaxIM DL.")

		cam = self.maxim_camera
		cam.BinX = int(self.bin_x)
		cam.BinY = int(self.bin_y)

		# Some MaxIM versions accept filter number as a third argument,
		# some only need exposure and light/dark flag.
		try:
			cam.Expose(float(self.exposure), int(self.light_frame), int(self.filter_number))
		except TypeError:
			cam.Expose(float(self.exposure), int(self.light_frame))

		while not cam.ImageReady:
			if not self.threadactive:
				return None
			time.sleep(0.1)

		image = np.array(cam.ImageArray, dtype=np.float32)
		image = image.T

		# If FITS has extra dimensions, keep first image plane
		while image.ndim > 2:
			image = image[0]

		image = np.asarray(image, dtype=np.float32)

		return image

	def stop(self):
		self.threadactive = False
		self.wait()

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

	def fitPSF(self, imarray, avepixel_mean, x2, y2):

		# The following variables are in the config file
		segment_radius = self.segment_radius
		roundness_threshold = self.roundness_threshold
		max_feature_ratio = self.max_feature_ratio
		
		#segment_radius = 25
		#roundness_threshold = 0.5
		#max_feature_ratio = 0.8

		x_fitted = []
		y_fitted = []
		amplitude_fitted = []
		intensity_fitted = []
		sigma_y_fitted = []
		sigma_x_fitted = []

		# Set the initial guess
		initial_guess = (30.0, segment_radius, segment_radius, 1.0, 1.0, 0.0, avepixel_mean)

		# Loop over all stars
		for star in zip(list(y2), list(x2)):

			y, x = star

			y_min = y - segment_radius
			y_max = y + segment_radius
			x_min = x - segment_radius
			x_max = x + segment_radius

			if y_min < 0:
				y_min = np.array([0])
			if y_max > np.shape(imarray)[0]:
				y_max = np.array(np.shape(imarray)[0])
			if x_min < 0:
				x_min = np.array([0])
				# print(x_min)
			if x_max > np.shape(imarray)[1]:
				x_max = np.array(np.shape(imarray[1]))

			# # Check for NaN
			# if np.any(np.isnan([x_min, x_max, y_min, y_max])):
			# 	continue
			
			x_min = int(x_min)
			x_max = int(x_max)
			y_min = int(y_min)
			y_max = int(y_max)

			# Extract an image segment around each star
			star_seg = imarray[y_min:y_max,x_min:x_max]

			# Create x and y indices
			y_ind, x_ind = np.indices(star_seg.shape)

			# Estimate saturation level from image type
			saturation = (2**(8*star_seg.itemsize) - 1)*np.ones_like(y_ind)

			# Fit PSF to star
			try:
				popt, pcov = opt.curve_fit(self.twoDGaussian, (y_ind, x_ind, saturation), star_seg.ravel(), \
					p0=initial_guess, maxfev=200)

			except RuntimeError:
				continue

			# Unpack fitted gaussian parameters
			amplitude, yo, xo, sigma_y, sigma_x, theta, offset = popt

			# Reject invalid or suspicious fit values.
			if not np.isfinite([amplitude, xo, yo, sigma_x, sigma_y, offset]).all():
				continue

			# Reject negative or tiny amplitudes.
			if amplitude <= 0:
				continue

			# Reject hot-pixel-like fits that are too narrow.
			if sigma_x < 0.7 or sigma_y < 0.7:
				continue

			# Reject very broad artifacts.
			if sigma_x > 8.0 or sigma_y > 8.0:
				continue

			# Estimate local background/noise from this star segment.
			finite_seg = star_seg[np.isfinite(star_seg)]

			if finite_seg.size < 10:
				continue

			local_median = np.median(finite_seg)
			local_mad = np.median(np.abs(finite_seg - local_median))
			local_sigma = 1.4826 * local_mad

			if local_sigma <= 0:
				local_sigma = np.std(finite_seg)

			if local_sigma <= 0:
				continue

			# Peak SNR estimate for this candidate.
			# This is not formal photometric SNR; it is a practical rejection test.
			peak_value = np.nanmax(star_seg)
			peak_snr = (peak_value - local_median) / local_sigma

			if peak_snr < 8.0:
				continue

			# Filter hot pixels
			if min(sigma_y/sigma_x, sigma_x/sigma_y) < roundness_threshold:
				# Skip if pixel is hot
				continue

			# Reject if it's too large
			if (4*sigma_x*sigma_y/segment_radius**2 > max_feature_ratio):
				continue

			# Crop segment to 3 sigma around star
			crop_y_min = int(yo - 3*sigma_y) + 1
			if crop_y_min < 0: crop_y_min = 70

			crop_y_max = int(yo + 3*sigma_y) + 1
			if crop_y_max >= star_seg.shape[0]: crop_y_max = star_seg.shape[0] - 1

			crop_x_min = int(xo - 3*sigma_x) + 1
			if crop_x_min < 0: crop_x_min = 0

			crop_x_max = int(xo + 3*sigma_x) + 1
			if crop_x_max >= star_seg.shape[1]: crop_x_max = star_seg.shape[1] -1

			# Set fixed size if segment is too small
			if (y_max - y_min) < 3:
				crop_y_min = int(yo - 2)
				crop_y_max = int(yo + 2)
			if (x_max - x_min) < 3:
				crop_x_min = int(xo - 2)
				crop_x_max = int(xo + 2)

			star_seg_crop = star_seg[crop_y_min:crop_y_max,crop_x_min:crop_x_max]

			# Skip is shape is too small
			if (star_seg_crop.shape[0] == 0) or (star_seg_crop.shape[1] == 0):
				continue

			bg_corrected = offset

			# Subtract background
			intensity = np.sum(star_seg_crop - bg_corrected)

			# Skip if 0 intensity
			if intensity <=0:
				continue

			# Add stars to the final list
			x_fitted.append(x_min + xo)
			y_fitted.append(y_min + yo)
			amplitude_fitted.append(amplitude)
			intensity_fitted.append(intensity)
			sigma_y_fitted.append(sigma_y)
			sigma_x_fitted.append(sigma_x)

		return x_fitted, y_fitted, amplitude_fitted, intensity_fitted, sigma_y_fitted, sigma_x_fitted


class Ui(QtWidgets.QMainWindow):

	# emit_stop = QtCore.pyqtSignal(int)

	def __init__(self, *args, **kwargs):

		# call inherited classes __init__ method
		super(Ui, self).__init__(*args, **kwargs)    
		
		# Load the .ui file
		uic.loadUi('PyFocus.ui', self)                
		self.title = "PyFocus Automated Focusing"

		# Detach widgets loaded from PyFocus.ui before replacing the central widget.
		# Otherwise setCentralWidget() may delete the old central widget and its children.
		self.Plot.setParent(None)
		self.Exposure_spinbox.setParent(None)
		self.Binning_spinbox.setParent(None)
		self.Zoom_slider.setParent(None)
		self.Start_button.setParent(None)
		self.Stop_button.setParent(None)


		# Make the GUI wider for a two-column layout.
		self.setWindowTitle("PyFocus Automated Focusing")
		self.resize(1250, 800)
		self.setMinimumSize(1100, 700)
		

		self.setStyleSheet("""
			QMainWindow {
				background-color: #f4f5f7;
			}

			QGroupBox {
				font-weight: bold;
				border: 1px solid #c7ccd4;
				border-radius: 8px;
				margin-top: 10px;
				padding: 8px;
				background-color: #ffffff;
			}

			QGroupBox::title {
				subcontrol-origin: margin;
				left: 10px;
				padding: 0 4px;
				color: #1f2a44;
			}

			QLabel {
				color: #1f2a44;
				font-size: 9pt;
			}

			QPushButton {
				background-color: #e9edf5;
				border: 1px solid #aeb7c7;
				border-radius: 6px;
				padding: 6px 10px;
				font-weight: bold;
				color: #1f2a44;
			}

			QPushButton:hover {
				background-color: #dce5f5;
			}

			QPushButton:pressed {
				background-color: #cbd8ec;
			}

			QPushButton:checked {
				background-color: #2f6fed;
				color: white;
				border: 1px solid #2457bd;
			}

			QSpinBox, QDoubleSpinBox, QComboBox {
				background-color: white;
				border: 1px solid #aeb7c7;
				border-radius: 4px;
				padding: 3px;
				color: #1f2a44;
			}

			QSlider::groove:horizontal {
				border: 1px solid #aeb7c7;
				height: 6px;
				background: #e9edf5;
				border-radius: 3px;
			}

			QSlider::handle:horizontal {
				background: #2f6fed;
				border: 1px solid #2457bd;
				width: 14px;
				margin: -5px 0;
				border-radius: 7px;
			}

			QLabel:disabled {
				color: #a8afbd;
			}

			QSpinBox:disabled, QDoubleSpinBox:disabled, QComboBox:disabled {
				color: #9aa3b2;
				background-color: #eef1f5;
				border: 1px solid #d0d5dd;
			}

			QSlider:disabled {
				color: #9aa3b2;
			}

			QSlider::groove:horizontal:disabled {
				background: #eef1f5;
				border: 1px solid #d0d5dd;
			}

			QSlider::handle:horizontal:disabled {
				background: #b8c0cc;
				border: 1px solid #a8afbd;
			}
		""")

		# Build a new two-column central layout.
		central = QtWidgets.QWidget(self)
		self.setCentralWidget(central)

		main_layout = QtWidgets.QHBoxLayout(central)
		main_layout.setContentsMargins(8, 8, 8, 8)
		main_layout.setSpacing(8)

		left_column = QtWidgets.QVBoxLayout()
		right_column = QtWidgets.QVBoxLayout()

		main_layout.addLayout(left_column, stretch=4)
		main_layout.addLayout(right_column, stretch=2)

		# ---------------- Left column: live image ----------------
		image_group = QtWidgets.QGroupBox("Live FITS Image")
		image_layout = QtWidgets.QVBoxLayout()

		self.focus_imagewidget = pg.ImageView()
		self.focus_imagewidget.ui.histogram.hide()
		self.focus_imagewidget.ui.roiBtn.hide()
		self.focus_imagewidget.ui.menuBtn.hide()
		self.focus_imagewidget.setMinimumSize(650, 650)

		self.last_raw_img = None
		self.last_display_img = None
		self.display_block = 1

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
		image_view.addItem(self.candidate_scatter)
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
		plot_group = QtWidgets.QGroupBox("Focus Metric")
		plot_layout = QtWidgets.QVBoxLayout()
		plot_layout.addWidget(self.Plot)
		plot_group.setLayout(plot_layout)

		right_column.addWidget(plot_group, stretch=2)

		##### Button triggers
		self.Start_button.clicked.connect(self.startFocus)
		self.Stop_button.clicked.connect(self.stopFocus)

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

		# Configure the live focus metric plot
		labelStyle = {'color': '#FFFFFF', 'font-size': '9pt'}

		self.Plot.setLabel('left', 'PSF width', units='px', **labelStyle)
		self.Plot.setLabel('bottom', 'Focus measurement frame number', **labelStyle)
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
			name='Average'
		)
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
				padding: 8px;
				font-size: 9pt;
			}
		""")
		self.status_label.setText("No Stars detected...Focus metrics will appear here.")

		status_layout.addWidget(self.status_label)
		status_group.setLayout(status_layout)

		right_column.addWidget(status_group, stretch=1)

		# ---------------- Right column: capture settings ----------------
		settings_group = QtWidgets.QGroupBox("Capture Settings")
		settings_layout = QtWidgets.QFormLayout()

		self.CaptureMode_combo = QtWidgets.QComboBox()
		self.CaptureMode_combo.addItems(["Single Image", "Stream", "Autofocus"])
		self.CaptureMode_combo.currentTextChanged.connect(self.updateAutofocusControls)

		self.Gain_note_label = QtWidgets.QLabel("Set manually in the ASCOM Gain and Offset window.")
		self.Gain_note_label.setWordWrap(True)

		settings_layout.addRow("Capture mode:", self.CaptureMode_combo)
		settings_layout.addRow("Exposure (s):", self.Exposure_spinbox)
		settings_layout.addRow("Gain:", self.Gain_note_label)
		settings_layout.addRow("Binning:", self.Binning_spinbox)
		settings_layout.addRow("Image zoom:", self.Zoom_slider)
		self.AFStep_spin = QtWidgets.QSpinBox()
		self.AFStep_spin.setRange(1, 10000)
		self.AFStep_spin.setValue(50)

		self.AFStepsEachSide_spin = QtWidgets.QSpinBox()
		self.AFStepsEachSide_spin.setRange(1, 10)
		self.AFStepsEachSide_spin.setValue(3)

		self.AFFramesPerPosition_spin = QtWidgets.QSpinBox()
		self.AFFramesPerPosition_spin.setRange(1, 10)
		self.AFFramesPerPosition_spin.setValue(3)

		self.AFSettleTime_spin = QtWidgets.QDoubleSpinBox()
		self.AFSettleTime_spin.setRange(0.0, 30.0)
		self.AFSettleTime_spin.setDecimals(1)
		self.AFSettleTime_spin.setValue(1.0)

		self.AFStep_label = QtWidgets.QLabel("AF step size:")
		self.AFStepsEachSide_label = QtWidgets.QLabel("AF steps each side:")
		self.AFFramesPerPosition_label = QtWidgets.QLabel("AF frames/position:")
		self.AFSettleTime_label = QtWidgets.QLabel("AF settle time (s):")

		settings_layout.addRow(self.AFStep_label, self.AFStep_spin)
		settings_layout.addRow(self.AFStepsEachSide_label, self.AFStepsEachSide_spin)
		settings_layout.addRow(self.AFFramesPerPosition_label, self.AFFramesPerPosition_spin)
		settings_layout.addRow(self.AFSettleTime_label, self.AFSettleTime_spin)

		self.autofocus_controls = [
			self.AFStep_label,
			self.AFStep_spin,
			self.AFStepsEachSide_label,
			self.AFStepsEachSide_spin,
			self.AFFramesPerPosition_label,
			self.AFFramesPerPosition_spin,
			self.AFSettleTime_label,
			self.AFSettleTime_spin,
		]

		self.plot_update_stride = 2

		self.updateAutofocusControls(self.CaptureMode_combo.currentText())
		
		settings_group.setLayout(settings_layout)
		right_column.addWidget(settings_group)

		# ---------------- Right column: buttons ----------------
		button_group = QtWidgets.QGroupBox("Controls")
		button_layout = QtWidgets.QHBoxLayout()

		self.Clear_button = QtWidgets.QPushButton("Clear Display")
		self.Clear_button.clicked.connect(self.clearDisplay)

		button_layout.addWidget(self.Start_button)
		button_layout.addWidget(self.Clear_button)
		button_layout.addWidget(self.Stop_button)

		button_group.setLayout(button_layout)
		right_column.addWidget(button_group)

		self.thread = FocusThread(self)
		self.show()

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
			"temp_fits_path": r"D:\tmp\pyfocus_latest.fit",
			"light_frame": True,
			"af_step_size": self.AFStep_spin.value(),
			"af_steps_each_side": self.AFStepsEachSide_spin.value(),
			"af_frames_per_position": self.AFFramesPerPosition_spin.value(),
			"af_settle_time": self.AFSettleTime_spin.value(),
			"focuser_driver_id": None,
		}

	def watchthread(self, worker):
		settings = self.getFocusSettings()

		self.thread = worker(self, settings=settings)
		self.thread.updateFocusFrame.connect(self.updateFocusFrame)
		self.thread.updatePlot.connect(self.updatePlot)
		self.thread.updateStatus.connect(self.updateStatus)
		self.thread.updateStarOverlay.connect(self.updateStarOverlay)

	def startthread(self):
		self.thread.start()

	def killthread(self):
		self.thread.stop()
		# print('Say what?')

	def clearDisplay(self):
		print("Clearing PyFocus display.")

		# Clear plot data
		self.frame_number = 0
		self.Sx = []
		self.Sy = []
		self.Syy = []
		self.Sav = []

		self.x_line.setData(self.Sx, self.Sy)
		self.y_line.setData(self.Sx, self.Syy)
		self.av_line.setData(self.Sx, self.Sav)
		self.candidate_scatter.setData([])
		self.fitted_scatter.setData([])

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

		self.last_raw_img = None
		self.last_display_img = None
		self.cursor_stats_label.setText(
			"Cursor: --   Pixel: --   Local mean/std: --   Local min/max: --   SNR: --"
		)

	def plot(self, hour, temperature):
		labelStyle = {'color': '#FFF', 'font-size': '12px', 'padding': '0px'}
		self.Plot.plot(hour, temperature)
		self.Plot.setLabel('left', 'PSF (px)', **labelStyle)
		# self.Plot.enableAutoRange()
		# self.Plot.setAutoVisible(y=True)
		self.Plot.autoRange(padding=0)

	def updatePlot(self, sigmax, sigmay, average):

		self.frame_number += 1

		self.Sx.append(self.frame_number)
		self.Sy.append(sigmax)
		self.Syy.append(sigmay)
		self.Sav.append(average)

		if len(self.Sx) > self.max_plot_points:
			self.Sx = self.Sx[-self.max_plot_points:]
			self.Sy = self.Sy[-self.max_plot_points:]
			self.Syy = self.Syy[-self.max_plot_points:]
			self.Sav = self.Sav[-self.max_plot_points:]

		# Only redraw plot every N valid measurements.
		if self.frame_number % self.plot_update_stride != 0:
			return

		if len(self.Sx) >= 2:
			self.Plot.setXRange(self.Sx[0], self.Sx[-1], padding=0.05)

		#self.Plot.enableAutoRange(axis='y', enable=True)

		all_y = self.Sy + self.Syy + self.Sav
		if len(all_y) > 0:
			ymin = min(all_y)
			ymax = max(all_y)
			if ymax > ymin:
				pad = 0.1 * (ymax - ymin)
				self.Plot.setYRange(ymin - pad, ymax + pad, padding=0)

	def updateAutofocusControls(self, mode):
		"""
		Enable autofocus-only settings only when Autofocus mode is selected.
		"""

		autofocus_enabled = (mode == "Autofocus")

		for widget in self.autofocus_controls:
			widget.setEnabled(autofocus_enabled)
	
	def updateStatus(self, status):
		sigma_x = status.get("sigma_x")
		sigma_y = status.get("sigma_y")
		sigma_avg = status.get("sigma_avg")

		if sigma_avg is None:
			sigma_text = "Sigma X: -- px   Sigma Y: -- px   Average: -- px"
		else:
			sigma_text = (
				f"Sigma X: {sigma_x:.3f} px   "
				f"Sigma Y: {sigma_y:.3f} px   "
				f"Average: {sigma_avg:.3f} px"
			)

		text = (
			f"Mode: {status.get('capture_mode', 'Unknown')}\n"
			f"Status: {status.get('state', 'Running')}\n"
			f"Exposure: {status['exposure']:.3f} s   "
			f"Gain: {status.get('gain', 0):.2f}   "
			f"Binning: {status['binning']}\n"
			f"Mean: {status['mean']:.1f} ± {status['std']:.1f}   "
			f"Min/Max: {status['min']:.0f} / {status['max']:.0f}\n"
			f"Detected peaks: {status['detected_peaks']}   "
			f"Valid PSF fits: {status['valid_fits']}\n"
			f"{sigma_text}"
		)

		self.status_label.setText(text)

	def connectDevices(self):
		try:
			print('Using MaxIM DL for image capture...')
			print('Camera connection will be handled by MaxIM in FocusThread.')
		except Exception as e:
			print(f'ERROR:  {str(e)}')

	def changeFocus(step,dir):
		# Adjust focus
		currPos = F.Position
		if dir == 'in':
			F.Position = currPos + step
		elif dir == 'out':
			F.Position = currPos - step

	def slewToAltAz(alt,az):
		T.SlewToAltAz()

	def startFocus(self):
		# self.connectDevices()

		# self.watchthread(FocusThread)
		# self.startthread()

		# print(self.Start_button.isChecked())
		if self.Start_button.isChecked():
			self.connectDevices()
			self.watchthread(FocusThread)
			self.startthread()

		    # print(self.ctrl)
		    # self.ctrl['break'] = False
		    # self.start()
		else:
		    self.killthread()

	def stopFocus(self):
		print("Exit button pressed.")

		# Stop the focus/capture thread if it is running.
		if self.thread is not None and self.thread.isRunning():
			self.thread.stop()

		# Close the GUI window.
		self.close()
	# def grabImage(self,x,y,sizex,sizey, exposure):
	# 	C.StartX = x
	# 	C.StartY = y
	# 	C.NumX = sizex
	# 	C.NumY = sizey
	# 	print('here')
	# 	C.StartExposure(exposure, True)
	# 	while not C.ImageReady:
	# 		time.sleep(0.5)
	# 		print(f'{C.PercentCompleted}% complete')
	# 	print('finished')

	# 	img = C.ImageArray
	# 	imginfo = C.ImageArrayInfo
	# 	if imginfo.ImageElementType == ImageArrayElementTypes.Int32:
	# 		if C.MaxADU <= 65535:
	# 			imgDataType = np.uint16 # Required for BZERO & BSCALE to be written
	# 		else:
	# 			imgDataType = np.int32
	# 	elif imginfo.ImageElementType == ImageArrayElementTypes.Double:
	# 		imgDataType = np.float64
	# 	#
	# 	# Make a numpy array of he correct shape for astropy.io.fits
	# 	#
	# 	if imginfo.Rank == 2:
	# 		nda = np.array(img, dtype=imgDataType).transpose()
	# 	else:
	# 		nda = np.array(img, dtype=imgDataType).transpose(2,1,0)

	# 	print(np.shape(nda))

	# 	# self.updateFocusFrame(nda)

	# 	return nda

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

		self.cursor_stats_label.setText(
			f"Cursor raw: x={raw_x}, y={raw_y}   "
			f"Pixel={pixel_value:.1f} ADU   "
			f"Mean={local_mean:.1f}   "
			f"Median={local_median:.1f}   "
			f"Std={local_std:.1f}   "
			f"Min/Max={local_min:.0f}/{local_max:.0f}   "
			f"SNR~{snr:.1f}"
		)
	
	def updateStarOverlay(self, candidate_points, fitted_points):
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
				spots.append({
					"pos": (float(px) / block, float(py) / block),
					"size": size,
				})

			return spots

		self.candidate_scatter.setData(make_spots(candidate_points, 9))
		self.fitted_scatter.setData(make_spots(fitted_points, 11))

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
	# 	for i in range(1):
	# 		data = fid.read(numbytes)
	# 		if not data:
	# 			break
	# 	return data

	# @nb.njit(nb.uint16[::1](nb.uint8[::1]),fastmath=True,parallel=True)
	# def nb_read_data(data_chunk):
	# 	"""data_chunk is a contigous 1D array of uint8 data)
	# 	eg.data_chunk = np.frombuffer(data_chunk, dtype=np.uint8)"""
	# 	#ensure that the data_chunk has the right length

	# 	assert np.mod(data_chunk.shape[0],3)==0

	# 	out=np.empty(data_chunk.shape[0]//3*2,dtype=np.uint16)
	# 	image1 = np.empty((2048,2048),dtype=np.uint16)
	# 	image2 = np.empty((2048,2048),dtype=np.uint16)

	# 	for i in nb.prange(data_chunk.shape[0]//3):
	# 		fst_uint8=np.uint16(data_chunk[i*3])
	# 		mid_uint8=np.uint16(data_chunk[i*3+1])
	# 		lst_uint8=np.uint16(data_chunk[i*3+2])

	# 		out[i*2] =   (fst_uint8 << 4) + (mid_uint8 >> 4)
	# 		out[i*2+1] = ((mid_uint8 % 16) << 8) + lst_uint8

	# 	return out

	# def split_images(self,data,pix_h,pix_v,gain):
	# 	interimg = np.reshape(data, [2*pix_v,pix_h])

	# 	if gain == 'low':
	# 		image = interimg[::2]
	# 	else:
	# 		image = interimg[1::2]

	# 	return image

def main():
	print("Starting PyFocus GUI...")
	app = QtWidgets.QApplication(sys.argv) # create instance of QtWidgets.QApplication
	print("Finished initializing PyFocus GUI...")
	window = Ui()                          # create instance of class
	app.exec_()                            # start the application

#T = Telescope('localhost:11111', 0) # Local Omni Simulator
#C = Camera('localhost:11111', 0)
#F = Focuser('localhost:11111', 0)

if __name__ == '__main__':
	arg_parser = argparse.ArgumentParser(description="""

		""",
		formatter_class=argparse.RawTextHelpFormatter)

	arg_parser.add_argument('-i', '--interactive', help='Interactive mode', action='store_true')

	cml_args = arg_parser.parse_args()

	if cml_args.interactive is True:
		main()
	else:
		print('non-interactive mode')
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

class FocusThread(QtCore.QThread):
	# grabImage = QtCore.pyqtSignal(int,int,int,int,float)
	updateFocusFrame = QtCore.pyqtSignal(object)
	updatePlot = QtCore.pyqtSignal(float,float,float)
	updateStatus = QtCore.pyqtSignal(object)

	def __init__(self, parent=None, settings=None):
		super(FocusThread,self).__init__(parent)
		self.threadactive = True
		
		if settings is None:
			settings = {}
		
		self.capture_mode = settings.get("capture_mode", "Stream")

		# MaxIM / FITS capture settings
		self.exposure = float(settings.get("exposure", 0.1))
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

	@QtCore.pyqtSlot()
	def run(self):
		"""
		Main focus-monitoring loop.

		This runs in a background Qt thread. Each loop captures one FITS image
		through MaxIM DL, displays it in the GUI, detects star-like peaks,
		fits Gaussian PSFs to valid stars, and sends the average fitted sigma
		values to the live plot.
		"""

		pythoncom.CoInitialize()

		try:
			while self.threadactive:
				try:
					nda = self.captureMaxIMFits()

					if nda is None:
						continue

				except Exception as e:
					print(f"ERROR capturing MaxIM FITS image: {str(e)}")
					time.sleep(1.0)
					continue

				self.updateFocusFrame.emit(nda)

				global_mean = np.mean(nda)
				global_stddev = np.std(nda)
				self.newtxt = 'Image mean = ' + str(global_mean) + ' +/- ' + str(global_stddev)

				print(self.newtxt)

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
					"binning": f"{self.bin_x}x{self.bin_y}",
					"capture_mode": self.capture_mode,
				}

				self.updateStatus.emit(basic_status)

				data = nda.astype(np.float32)

				# Apply a small mean filter to reduce pixel-scale noise.
				fx = 2
				fy = 2
				data = ndimage.convolve(data, weights=np.full((fx, fy), 1.0 / 4.0))

				# Locate local maxima that may correspond to stars.
				#neighborhood_size = 25
				#intensity_threshold = 30
				neighborhood_size = self.neighborhood_size
				intensity_threshold = self.intensity_threshold

				data_max = ndimage.maximum_filter(data, neighborhood_size)
				maxima = (data == data_max)

				data_min = ndimage.minimum_filter(data, neighborhood_size + 10)
				diff = ((data_max - data_min) > intensity_threshold)
				maxima[diff == 0] = 0

				# Mask out the edge of the image to avoid fitting partial stars/noisy borders.
				border = 5
				maxima[:border, :] = 0
				maxima[-border:, :] = 0
				maxima[:, :border] = 0
				maxima[:, -border:] = 0

				# Find and label the maxima.
				labeled, num_objects = ndimage.label(maxima)

				if num_objects == 0:
					print("No stars found.")

					no_star_status = basic_status.copy()
					no_star_status["state"] = "Image captured, but no stars were found."
					self.updateStatus.emit(no_star_status)

					if self.capture_mode == "Single Image":
						self.threadactive = False
						break

					continue

				# Find centres of mass for each detected peak.
				xy = np.array(ndimage.center_of_mass(data, labeled, range(1, num_objects + 1)))

				if xy.size == 0:
					print("No star centers found.")

					no_center_status = basic_status.copy()
					no_center_status["state"] = "Image captured, but no star centers were found."
					no_center_status["detected_peaks"] = num_objects
					self.updateStatus.emit(no_center_status)

					if self.capture_mode == "Single Image":
						self.threadactive = False
						break

					continue

				# Unpack coordinates.
				y, x = np.hsplit(xy, 2)

				x2, y2, amplitude, intensity, sigma_y_fitted, sigma_x_fitted = self.fitPSF(
					nda, global_mean, x, y
				)

				print(f"Detected peaks: {num_objects}")
				print(f"Valid PSF fits: {len(sigma_x_fitted)}")

				if len(sigma_x_fitted) == 0 or len(sigma_y_fitted) == 0:
					print("No valid PSF fits.")

					no_fit_status = basic_status.copy()
					no_fit_status["state"] = "Stars detected, but no valid PSF fits."
					no_fit_status["detected_peaks"] = num_objects
					no_fit_status["valid_fits"] = 0
					self.updateStatus.emit(no_fit_status)

					if self.capture_mode == "Single Image":
						self.threadactive = False
						break

					continue

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
					"binning": f"{self.bin_x}x{self.bin_y}",
					"capture_mode": self.capture_mode,
				}

				self.updateStatus.emit(status)
				self.updatePlot.emit(float(sigmax), float(sigmay), float(sigmaav))

				if self.capture_mode == "Single Image":
					print("Single Image mode complete. Stopping capture loop.")
					self.threadactive = False
					break

				continue

				if xy.size == 0:
					print("No star centers found.")

				if self.capture_mode == "Single Image":
					self.threadactive = False
					break

				continue

				# Unpack coordinates.
				y, x = np.hsplit(xy, 2)

				x2, y2, amplitude, intensity, sigma_y_fitted, sigma_x_fitted = self.fitPSF(
					nda, global_mean, x, y
				)

				print(f"Detected peaks: {num_objects}")
				print(f"Valid PSF fits: {len(sigma_x_fitted)}")

				if len(sigma_x_fitted) == 0 or len(sigma_y_fitted) == 0:
					print("No valid PSF fits.")

				if self.capture_mode == "Single Image":
					self.threadactive = False
					break

				continue

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
					"binning": f"{self.bin_x}x{self.bin_y}",
					"capture_mode": self.capture_mode,
				}

				self.updateStatus.emit(status)
				self.updatePlot.emit(float(sigmax), float(sigmay), float(sigmaav))

				if self.capture_mode == "Single Image":
					print("Single Image mode complete. Stopping capture loop.")
					self.threadactive = False
					break

		finally:
			self.maxim_camera = None
			pythoncom.CoUninitialize()

			# for i in range(len(x2)):
			# 	print('amp: %s  sigma_x: %s   sigma_y: %s  Av: %s' % (amplitude[i], sigma_x_fitted[i], sigma_y_fitted[i], (sigma_y_fitted[i]+sigma_x_fitted[i])/2))
	
	def captureMaxIMFits(self):
		"""
		Capture one FITS image through MaxIM DL and return it as a NumPy array.
		"""

		output_path = Path(self.temp_fits_path)
		output_path.parent.mkdir(parents=True, exist_ok=True)

		# Connect to MaxIM only once
		if self.maxim_camera is None:
			self.maxim_camera = win32com.client.Dispatch("MaxIm.CCDCamera")
			self.maxim_camera.LinkEnabled = True

			if not self.maxim_camera.LinkEnabled:
				raise RuntimeError("Could not connect to camera through MaxIM DL.")

		cam = self.maxim_camera
		cam.BinX = int(self.bin_x)
		cam.BinY = int(self.bin_y)

		print(f"Taking {self.exposure:.2f} s MaxIM exposure at {self.bin_x}x{self.bin_y} binning...")

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

		cam.SaveImage(str(output_path))

		image = fits.getdata(str(output_path))

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
		self.resize(950, 750)
		self.setMinimumSize(850, 650)

		# Build a new two-column central layout.
		central = QtWidgets.QWidget(self)
		self.setCentralWidget(central)

		main_layout = QtWidgets.QHBoxLayout(central)
		main_layout.setContentsMargins(8, 8, 8, 8)
		main_layout.setSpacing(8)

		left_column = QtWidgets.QVBoxLayout()
		right_column = QtWidgets.QVBoxLayout()

		main_layout.addLayout(left_column, stretch=3)
		main_layout.addLayout(right_column, stretch=2)

		# ---------------- Left column: live image ----------------
		image_group = QtWidgets.QGroupBox("Live FITS Image")
		image_layout = QtWidgets.QVBoxLayout()

		self.focus_imagewidget = pg.ImageView()
		self.focus_imagewidget.ui.histogram.hide()
		self.focus_imagewidget.ui.roiBtn.hide()
		self.focus_imagewidget.ui.menuBtn.hide()

		image_layout.addWidget(self.focus_imagewidget)
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
		self.CaptureMode_combo.addItems(["Single Image", "Stream"])

		settings_layout.addRow("Capture mode:", self.CaptureMode_combo)
		settings_layout.addRow("Exposure (s):", self.Exposure_spinbox)
		settings_layout.addRow("Binning:", self.Binning_spinbox)
		settings_layout.addRow("Display zoom:", self.Zoom_slider)

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
		}

	def watchthread(self, worker):
		settings = self.getFocusSettings()

		self.thread = worker(self, settings=settings)
		self.thread.updateFocusFrame.connect(self.updateFocusFrame)
		self.thread.updatePlot.connect(self.updatePlot)
		self.thread.updateStatus.connect(self.updateStatus)

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

		# Keep only the most recent N points.
		if len(self.Sx) > self.max_plot_points:
			self.Sx = self.Sx[-self.max_plot_points:]
			self.Sy = self.Sy[-self.max_plot_points:]
			self.Syy = self.Syy[-self.max_plot_points:]
			self.Sav = self.Sav[-self.max_plot_points:]

		self.x_line.setData(self.Sx, self.Sy)
		self.y_line.setData(self.Sx, self.Syy)
		self.av_line.setData(self.Sx, self.Sav)

		if len(self.Sx) >= 2:
			self.Plot.setXRange(self.Sx[0], self.Sx[-1], padding=0.05)

		self.Plot.enableAutoRange(axis='y', enable=True)
	
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

		# Make a display-only copy.
		display_img = img.copy()

		# Downsample for display only.
		# This prevents high-frequency row/column structure from aliasing into
		# thick horizontal/vertical stripes in the small PyFocus display window.
		max_display_size = 100 + self.Zoom_slider.value() * 50
		height, width = display_img.shape

		block = max(1, int(max(height, width) / max_display_size))

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

		self.focus_imagewidget.setImage(
			display_img,
			levels=(low, high),
			autoLevels=False,
			autoRange=True
		)

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
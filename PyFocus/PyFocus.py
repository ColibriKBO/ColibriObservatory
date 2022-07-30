import time, sys
import argparse
import numpy as np
import numba as nb
import pyqtgraph as pg

import imageio
import scipy.optimize as opt
import scipy.ndimage as ndimage
import scipy.ndimage.filters as filters

import matplotlib.pyplot as plt

from alpaca.telescope import *
from alpaca.camera import *
from alpaca.focuser import *
from alpaca.exceptions import *


#################### PYQT5 LIBRARY/PACKAGE IMPORTS ####################

from PyQt5 import QtWidgets, uic, QtGui, QtCore
from PyQt5.QtWidgets import *
from PyQt5.QtCore import *
from PyQt5.QtGui import *

class FocusThread(QtCore.QThread):
	# grabImage = QtCore.pyqtSignal(int,int,int,int,float)
	updateFocusFrame = QtCore.pyqtSignal(object)
	updatePlot = QtCore.pyqtSignal(float,float,float)

	def __init__(self,parent=None):
		super(FocusThread,self).__init__(parent)
		self.threadactive = True

		Zoom = 5
		x = 0
		y = 0
		sizex = 50
		sizey = 50

	@QtCore.pyqtSlot()
	def run(self):
		sigmax = []
		sigmay = []
		sigmaav = []

		while self.threadactive:
			C.StartX = 0
			C.StartY = 0
			C.NumX = 100
			C.NumY = 100
			exposure = 0.5

			C.StartExposure(exposure, True)
			while not C.ImageReady:
				time.sleep(0.1)
				# print(f'{C.PercentCompleted}% complete')
			# print('finished')

			img = C.ImageArray
			imginfo = C.ImageArrayInfo
			if imginfo.ImageElementType == ImageArrayElementTypes.Int32:
				if C.MaxADU <= 65535:
					imgDataType = np.uint16 # Required for BZERO & BSCALE to be written
				else:
					imgDataType = np.int32
			elif imginfo.ImageElementType == ImageArrayElementTypes.Double:
				imgDataType = np.float64
			#
			# Make a numpy array of he correct shape for astropy.io.fits
			#
			if imginfo.Rank == 2:
				nda = np.array(img, dtype=imgDataType).transpose()
			else:
				nda = np.array(img, dtype=imgDataType).transpose(2,1,0)

			self.updateFocusFrame.emit(nda)

			global_mean = np.mean(nda)
			global_stddev = np.std(nda)
			# print('Image mean = %s +/- %s' % (global_mean, global_stddev))
			self.newtxt = 'Image mean = ' + str(global_mean) + ' +/- ' + str(global_stddev)
			
			data = nda.astype(np.float32)

			# Apply a mean filter
			fx = 2
			fy = 2
			data = ndimage.filters.convolve(data, weights=np.full((fx,fy), 1.0/4))
			
			# Locate local maxima
			neighborhood_size = 25
			intensity_threshold = 30
			data_max = filters.maximum_filter(data, neighborhood_size)
			# print(data_max)
			maxima = (data == data_max)
			data_min = filters.minimum_filter(data, neighborhood_size+10)
			diff = ((data_max - data_min) > intensity_threshold)
			maxima[diff == 0] = 0

			# Apply a mask
			border = 5
			border_mask = np.ones_like(maxima)*255
			border_mask[:border,:] = 0
			border_mask[-border:,:] = 0
			border_mask[:,:border] = 0
			border_mask[:,-border:] = 0

			# Find and label the maxima
			labeled, num_objects = ndimage.label(maxima)

			# Find centres of mass
			xy = np.array(ndimage.center_of_mass(data, labeled, range(1, num_objects+1)))

			# Unpack coordinates
			y,x = np.hsplit(xy,2)

			x2, y2, amplitude, intensity, sigma_y_fitted, sigma_x_fitted = self.fitPSF(nda, global_mean, x, y)

			sigmax = np.mean(sigma_x_fitted)
			sigmay = np.mean(sigma_y_fitted)
			sigmaav = (np.mean(sigma_x_fitted) + np.mean(sigma_y_fitted))/2

			self.updatePlot.emit(sigmax, sigmay, sigmaav)

			# for i in range(len(x2)):
			# 	print('amp: %s  sigma_x: %s   sigma_y: %s  Av: %s' % (amplitude[i], sigma_x_fitted[i], sigma_y_fitted[i], (sigma_y_fitted[i]+sigma_x_fitted[i])/2))

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
		segment_radius = 25
		roundness_threshold = 0.5
		max_feature_ratio = 0.8

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


		width = 320
		height = 800
		# setting  the fixed size of window
		self.setFixedSize(width, height)

		# display the GUI 
		self.show()

		####### GUI Modifications
		self.focus_imagewidget = pg.ImageView()
		self.Focus_layout.addWidget(self.focus_imagewidget, 0, 0)
		self.focus_imagewidget.show()
		self.focus_imagewidget.ui.histogram.hide()
		self.focus_imagewidget.ui.roiBtn.hide()
		self.focus_imagewidget.ui.menuBtn.hide()

		##### Button triggers
		self.Start_button.clicked.connect(self.startFocus)
		self.Stop_button.clicked.connect(self.stopFocus)

		# self.JogNorth_button.clicked.connect(self.jogScope)
		# self.JogSouth_button.clicked.connect(self.jogScope)
		# self.JogEast_button.clicked.connect(self.jogScope)
		# self.JogWest_button.clicked.connect(self.jogScope)

		windowWidth = 60
		self.Sx = list(range(windowWidth))
		self.Sy = [1 for i in range(windowWidth)]
		self.Syy = [1 for i in range(windowWidth)]
		self.Sav = [1 for i in range(windowWidth)]

		self.x_line = self.Plot.plot(self.Sx, self.Sy, pen = pg.mkPen(color='r'))
		self.y_line = self.Plot.plot(self.Sx, self.Syy, pen = pg.mkPen(color='g'))
		self.av_line = self.Plot.plot(self.Sx, self.Sav, pen = pg.mkPen(color='b'))

		self.thread = FocusThread(self)

	def watchthread(self,worker):
		self.thread = worker(self)
		self.thread.updateFocusFrame.connect(self.updateFocusFrame)
		self.thread.updatePlot.connect(self.updatePlot)

	def startthread(self):
		self.thread.start()

	def killthread(self):
		self.thread.stop()
		# print('Say what?')

	def plot(self, hour, temperature):
		labelStyle = {'color': '#FFF', 'font-size': '12px', 'padding': '0px'}
		self.Plot.plot(hour, temperature)
		self.Plot.setLabel('left', 'PSF (px)', **labelStyle)
		# self.Plot.enableAutoRange()
		# self.Plot.setAutoVisible(y=True)
		self.Plot.autoRange(padding=0)

	def updatePlot(self, sigmax, sigmay, average):

		self.Sx = self.Sx[1:]
		self.Sx.append(self.Sx[-1] + 1)

		self.Sy = self.Sy[1:]
		self.Sy.append(sigmax)

		self.Syy = self.Syy[1:]
		self.Syy.append(sigmay)

		self.Sav = self.Sav[1:]
		self.Sav.append(average)

		self.x_line.setData(self.Sx, self.Sy)
		self.y_line.setData(self.Sx, self.Syy)
		self.av_line.setData(self.Sx, self.Sav)

	def connectDevices(self):
		try:
			T.Connected = True
			print('Connected to telescope...')
			C.Connected = True
			print('Connected to camera...')
			# print(C.CanFastReadout)
			# C.FastReadout = True
			# print(C.FastReadout)
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
		self.killthread()

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

		self.focus_imagewidget.setImage(image, levels=(50,200))
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
	app = QtWidgets.QApplication(sys.argv) # create instance of QtWidgets.QApplication
	window = Ui()                          # create instance of class
	app.exec_()                            # start the application

T = Telescope('localhost:11111', 0) # Local Omni Simulator
C = Camera('localhost:11111', 0)
F = Focuser('localhost:11111', 0)

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
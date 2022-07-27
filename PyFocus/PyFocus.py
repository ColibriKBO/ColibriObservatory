import time, sys
import argparse
import numpy as np
import pyqtgraph as pg

import imageio

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

class Ui(QtWidgets.QMainWindow):
    def __init__(self, *args, **kwargs):

        # call inherited classes __init__ method
        super(Ui, self).__init__(*args, **kwargs)    
        
        # Load the .ui file
        # uic.loadUi('Camo-S.ui', self)
        uic.loadUi('PyFocus.ui', self)                
        self.title = "PyFocus Automated Focusing"
        self.statusBar = QStatusBar()
        self.setStatusBar(self.statusBar)

        width = 320
        height = 785
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

        # self.JogNorth_button.clicked.connect(self.jogScope)
        # self.JogSouth_button.clicked.connect(self.jogScope)
        # self.JogEast_button.clicked.connect(self.jogScope)
        # self.JogWest_button.clicked.connect(self.jogScope)
        

        # self.Plot.setXRange(0,1)

        self.plot([1,2,3,4,5,6,7,8,9,10], [30,32,34,32,33,31,29,32,35,45])

    def plot(self, hour, temperature):
        labelStyle = {'color': '#FFF', 'font-size': '12px', 'padding': '0px'}
        self.Plot.plot(hour, temperature)
        self.Plot.setLabel('left', 'PSF (px)', **labelStyle)
        self.Plot.autoRange(padding=0)
        # print(self.Plot.ViewBox.screenGeometry())

        # self.Plot.plotItem.getViewBox().setBackgroundColor((192, 192, 192))
        # self.Plot.setLabel('bottom', 'hour', **labelStyle)

        #######              

    def connectDevices(self):
        try:
            T.Connected = True
            print('Connected to telescope...')
            C.Connected = True
            print('Connected to camera...')
        except Exception as e:
            print(f'ERROR:  {str(e)}')

    def grabImage(self,x,y,sizex,sizey, exposure):
        C.StartX = x
        C.StartY = y
        C.NumX = sizex
        C.NumY = sizey

        C.StartExposure(exposure, True)
        while not C.ImageReady:
            time.sleep(0.5)
            print(f'{C.PercentCompleted}% complete')
        print('finished')

        self.img = C.ImageArray
        imginfo = C.ImageArrayInfo

        print(np.shape(self.img))

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
            self.nda = np.array(self.img, dtype=imgDataType).transpose()
        else:
            self.nda = np.array(self.img, dtype=imgDataType).transpose(2,1,0)

        return self.nda

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
        self.connectDevices()
        self.image = self.grabImage(0,0,self.Zoom_slider.value()*100,self.Zoom_slider.value()*100,self.Exposure_spinbox.value())

        self.updateFocusFrame(self.image)

    def updateFocusFrame(self, image):
        plt.imshow(image)
        plt.show()

        # self.focus_frame = image
        # self.focus_image.setImage(image)

        self.focus_imagewidget.setImage(image)



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
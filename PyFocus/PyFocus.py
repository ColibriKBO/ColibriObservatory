import time, sys
import argparse
import numpy as np
import numba as nb
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

# class FocusThread(QtCore.QObject):

#     output = QtCore.pyqtSignal(object)

#     def __init__(self, ctrl):
#         super(FocusThread, self).__init__()
#         # self.image = image
#         interval = 0.5
#         self.ctrl = ctrl
#         self.refreshtime = interval

#     def run(self):
#         print('Entered run')
#         print('id:', id(self.ctrl))
#         self.ctrl['break'] = False

#         while True:
#             outstring = '1'
#             self.output.emit(outstring)

#             if self.ctrl['break']:
#                 print('Break flag raised')
#                 break

#             time.sleep(self.refreshtime)

#     def stop(self):
#         self.threadactive = False
#         self.wait()

class FocusThread(QtCore.QThread):

    def __init__(self):
        super(FocusThread,self).__init__()
        self.threadactive = True

    def run(self):
        while self.threadactive:
            print('Hello World')
            time.sleep(1)


    def stop(self):
        self.threadactive = False
        self.wait()

class Ui(QtWidgets.QMainWindow):

    emit_stop = QtCore.pyqtSignal(int)

    def __init__(self, *args, **kwargs):

        # call inherited classes __init__ method
        super(Ui, self).__init__(*args, **kwargs)    
        
        # Load the .ui file
        # uic.loadUi('Camo-S.ui', self)
        uic.loadUi('PyFocus.ui', self)                
        self.title = "PyFocus Automated Focusing"
        # self.statusBar = QStatusBar()
        # self.setStatusBar(self.statusBar)

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

        self.thread = FocusThread(self)

    #     self.threadactive = True
    #     self.thread = QtCore.QThread()
    #     self.ctrl = {'break': False}
    #     print('id: ', id(self.ctrl))
    #     self.worker = FocusThread(self.ctrl)

    # def watchthread(self,worker):
    #     self.thread = worker(self)
    #     self.thread.finished.connect(self.close)

    # def startthread(self):
    #     self.thread.start()

    # def start(self):
        
    #     print(self.ctrl)
    #     self.worker.moveToThread(self.thread)
    #     self.thread.started.connect(self.worker.run)
    #     self.worker.output.connect(self.print_new_value)
    #     self.thread.start()

    # def stop(self):
    #     self.ctrl['break'] = True
    #     print(self.ctrl)

    def watchthread(self,worker):
        self.thread = worker(self)
        self.thread.finished.connect(self.close)

    def startthread(self):
        self.thread.start()

    def killthread(self):
        self.thread.stop()
        print('Say what?')

    # def print_new_value(self, value):
    #     print(value)


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
        C.StartX = 0
        C.StartY = 0
        C.NumX = 4096
        C.NumY = 4096
        C.BinX = 1
        C.BinY = 1

        C.StartExposure(exposure, True)
        while not C.ImageReady:
            time.sleep(0.5)
            print(f'{C.PercentCompleted}% complete')
        print('finished')

        self.img = C.ImageArray
        imginfo = C.ImageArrayInfo

        # print(np.shape(self.img))

        # testimages = nb_read_data(table)
        # hnumpix = sizex/2
        # vnumpix = sizey
        # imgain = 'high'

        # self.image = self.split_images(self.img, hnumpix, vnumpix, imgain)

        # print(np.shape(self.img))
        # print(np.shape(self.image))

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
        # self.connectDevices()
        # self.image = self.grabImage(0,0,self.Zoom_slider.value()*50,self.Zoom_slider.value()*50,self.Exposure_spinbox.value())

        # self.updateFocusFrame(self.image)



        print(self.Start_button.isChecked())
        if self.Start_button.isChecked():
            self.watchthread(FocusThread)
            self.startthread()

            # print(self.ctrl)
            # self.ctrl['break'] = False
            # self.start()
        else:
            self.killthread()

    def updateFocusFrame(self, image):
        # plt.imshow(image)
        # plt.show()

        # self.focus_frame = image
        # self.focus_image.setImage(image)

        self.focus_imagewidget.setImage(image, levels=(50,200))
        # self.focus_imagewidget.autoRange()

    def readxbytes(fid, numbytes):
        for i in range(1):
            data = fid.read(numbytes)
            if not data:
                break
        return data

    @nb.njit(nb.uint16[::1](nb.uint8[::1]),fastmath=True,parallel=True)
    def nb_read_data(data_chunk):
        """data_chunk is a contigous 1D array of uint8 data)
        eg.data_chunk = np.frombuffer(data_chunk, dtype=np.uint8)"""
        #ensure that the data_chunk has the right length

        assert np.mod(data_chunk.shape[0],3)==0

        out=np.empty(data_chunk.shape[0]//3*2,dtype=np.uint16)
        image1 = np.empty((2048,2048),dtype=np.uint16)
        image2 = np.empty((2048,2048),dtype=np.uint16)

        for i in nb.prange(data_chunk.shape[0]//3):
            fst_uint8=np.uint16(data_chunk[i*3])
            mid_uint8=np.uint16(data_chunk[i*3+1])
            lst_uint8=np.uint16(data_chunk[i*3+2])

            out[i*2] =   (fst_uint8 << 4) + (mid_uint8 >> 4)
            out[i*2+1] = ((mid_uint8 % 16) << 8) + lst_uint8

        return out

    def split_images(self,data,pix_h,pix_v,gain):
        interimg = np.reshape(data, [2*pix_v,pix_h])

        if gain == 'low':
            image = interimg[::2]
        else:
            image = interimg[1::2]

        return image

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
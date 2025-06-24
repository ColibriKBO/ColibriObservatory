import win32com.client
from win32com.universal import com_error
import numpy as np
import matplotlib.pyplot as plt
import time

# Constants
ASCOM_FLI_KEPLER_CAMERA = 'ASCOM.FLI.Kepler.Camera'

# Connect to the camera
cam = win32com.client.Dispatch(ASCOM_FLI_KEPLER_CAMERA)
if not cam.Connected:
    print('Connecting to the camera...')
    cam.Connected = True
    if not cam.Connected:
        print('Unable to connect to the camera.')
        exit(-1)

print('Connected to the camera!\n')

# Basic camera information
print(f"Description: {cam.Description}")
print(f"DriverInfo: {cam.DriverInfo}")
print(f"DriverVersion: {cam.DriverVersion}")
print(f"InterfaceVersion: {cam.InterfaceVersion}")
print(f"Name: {cam.Name}\n")

# Sensor details
print(f"CameraState: {cam.CameraState}")
print(f"PixelSizeX: {cam.PixelSizeX}")
print(f"PixelSizeY: {cam.PixelSizeY}")
print(f"CameraXSize: {cam.CameraXSize}")
print(f"CameraYSize: {cam.CameraYSize}")
print(f"NumX: {cam.NumX}")
print(f"NumY: {cam.NumY}")
print(f"StartX: {cam.StartX}")
print(f"StartY: {cam.StartY}")
print(f"BinX: {cam.BinX}")
print(f"BinY: {cam.BinY}")
print(f"MaxBinX: {cam.MaxBinX}")
print(f"MaxBinY: {cam.MaxBinY}")
print(f"CCDTemperature: {cam.CCDTemperature}")
print(f"HeatSinkTemperature: {cam.HeatSinkTemperature}\n")

# Capabilities
print(f"CanAbortExposure: {cam.CanAbortExposure}")
print(f"CanAsymmetricBin: {cam.CanAsymmetricBin}")
print(f"CanGetCoolerPower: {cam.CanGetCoolerPower}")
print(f"CanPulseGuide: {cam.CanPulseGuide}")
print(f"CanSetCCDTemperature: {cam.CanSetCCDTemperature}")
print(f"CanStopExposure: {cam.CanStopExposure}")
print(f"CanFastReadout: {cam.CanFastReadout}")
print(f"CoolerOn: {cam.CoolerOn}")
print(f"CoolerPower: {cam.CoolerPower}")
print(f"HasShutter: {cam.HasShutter}")
print(f"ExposureMax: {cam.ExposureMax}")
print(f"ExposureMin: {cam.ExposureMin}")

# Disconnect from the camera
print('\nDisconnecting from the camera...')
cam.Connected = False
print('Disconnected.')

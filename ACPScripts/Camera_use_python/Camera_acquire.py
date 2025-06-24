import win32com.client
import time
import numpy as np
import matplotlib.pyplot as plt
from datetime import datetime
import os

# Parameters
NUM_IMAGES = 2400
EXPOSURE_SEC = 0.025

# Output folder (your path)
OUTPUT_FOLDER = r'C:\Users\BlueBird\Documents\GitHub\ColibriObservatory\ACPScripts\Camera_use_python\rcd_frames'

# Function: create basic RCD header (384 bytes)
def generate_rcd_header():
    header = bytearray(384)
    header[0:4] = b'Meta'  # Magic number
    # You can fill in more fields here if needed
    return header

# Connect to ASCOM FLI Kepler Camera
cam = win32com.client.Dispatch('ASCOM.FLI.Kepler.Camera')

# Connect if needed
if not cam.Connected:
    print('Connecting...')
    cam.Connected = True
    if not cam.Connected:
        print('Error: could not connect to camera.')
        exit(1)

# Display some info
print('Connected:', cam.Description)
print('Sensor size:', cam.CameraXSize, 'x', cam.CameraYSize)

# Set Rolling HDR mode (mode 2)
print('Setting HDR mode...')
cam.Action('SetMode', str(2))
current_mode = cam.Action('GetMode', '')
print('Current mode:', current_mode)

# Set FramePassChannel = 1 (high gain only)
print('Setting FramePassChannel = HIGH GAIN...')
cam.Action('SetFramePassChannel', '1')

# Set binning (example: 2x2 binning)
cam.BinX = 2
cam.BinY = 2
print('Binning:', cam.BinX, 'x', cam.BinY)

# Set full frame for binned image
cam.NumX = cam.CameraXSize // cam.BinX
cam.NumY = cam.CameraYSize // cam.BinY
h = cam.NumY
w = cam.NumX
print('Image size:', w, 'x', h)

# Create output folder if needed
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Start image loop
for i in range(1, NUM_IMAGES + 1):
    print(f'\n[{i}/{NUM_IMAGES}] Starting exposure: {EXPOSURE_SEC:.3f} s')

    cam.StartExposure(EXPOSURE_SEC, True)

    # Wait for image ready
    while not cam.ImageReady:
        print('Waiting...')
        time.sleep(0.005)

    # Get image data (HIGH GAIN only)
    buffer = cam.ImageArray
    high_gain = np.array(buffer, dtype=np.uint16).reshape((h, w))

    # Create RCD header
    header = generate_rcd_header()

    # Output filename with numbering
    filename = f'frame_{i:06d}.rcd'
    output_path = os.path.join(OUTPUT_FOLDER, filename)

    # Write RCD file
    with open(output_path, 'wb') as f:
        f.write(header)
        high_gain.tofile(f)

    print(f'Saved: {output_path} | First pixel: {high_gain[0, 0]}')

# Done
print('\nAll images acquired.')

# Disconnect camera
cam.Connected = False
print('Camera disconnected.')

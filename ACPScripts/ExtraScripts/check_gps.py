"""
Filename:   check_gps.py
Author(s):  Peter Quigley
Contact:    pquigle@uwo.ca
Created:    Mon Oct 30, 2023
Updated:    Mon Oct 30, 2023
    
Description:
If in single mode, take a single image using ColibriGrab and use it to check
the GPS status. If in continuous mode, take a continuous stream of images and
check the GPS status of each one. In continuous mode, the program will run
until the user presses CTRL-C to stop it or for 24 hours, tabulating the percent
of images in which the GPS was locked.

Usage:
python check_gps.py [options]

"""

# Module Imports
import os, sys
import argparse
import time
import subprocess
import shutil
import threading
import numpy as np
import numba as nb
from pathlib import Path
from astropy.io import fits

# Custom Imports


#-------------------------------global vars-----------------------------------#

# Path variables
BASE_PATH = Path('D:/')
DATA_PATH = BASE_PATH / 'ColibriData'
IMGE_PATH = BASE_PATH / 'ColibriImages'
ARCHIVE_PATH = BASE_PATH / 'ColibriArchive'
TMP_PATH = BASE_PATH / 'tmp'

# Image variables (assumes square image)
IMG_WIDTH = 2048
BIT_DEPTH = 12
IMG_SIZE = IMG_WIDTH**2


#----------------------------------class--------------------------------------#

class GPSChecker(threading.Thread):
    def __init__(self, event, n_runs, target_dir=TMP_PATH.joinpath('gps')):
        
        # Initialize the thread
        threading.Thread.__init__(self)
        self.stopped= event

        # Set the target directory and number of runs
        self.target_dir = target_dir
        self.nruns = n_runs
        self.gps_locked = 0


    def run(self):
        # Run the program in continuous mode executing every 1s
        runs = 0
        while not self.stopped.wait(1):
            gpsLock = check_gps(self.target_dir)
            if gpsLock:
                self.gps_locked += 1

            # Check if the number of runs has been reached
            runs += 1
            if runs >= self.nruns:
                self.stopped.set()
                break


#--------------------------------functions------------------------------------#

###########################
## File Reading
###########################

def readxbytes(fid, start_byte, num_bytes):
    """
    Read a specified number of bytes from a file and return the data.
    Returns as a numpy array of the specified data type.

    Args:
        fid (file): The file to be read from.
        start_byte (int): The byte to start reading from.
        num_bytes (int): The number of bytes to read.
        dtype (str): The data type of the data to be read.

    Returns:
        data (np.ndarray): A numpy array containing the data read from the file.

    """

    # Seek to the specified byte
    fid.seek(start_byte)

    # Read the data
    data = fid.read(num_bytes)

    return data


def decodexbytes(fid, start_byte, num_bytes):
    """
    Read a specified number of bytes from a file and return the data.
    Returns as a string decoded as utf-8.

    Args:
        fid (file): The file to be read from.
        start_byte (int): The byte to start reading from.
        num_bytes (int): The number of bytes to read.

    Returns:
        data (np.ndarray): A numpy array containing the data read from the file.

    """

    # Seek to the specified byte
    fid.seek(start_byte)

    # Read the data
    data = fid.read(num_bytes)

    return data.decode('utf-8')


# Function to read 12-bit data with Numba to speed things up
@nb.njit(nb.uint16[::1](nb.uint8[::1]),fastmath=True,parallel=True)
def conv_12to16(data_chunk):
    """
    Function to read 12-bit data with Numba to speed things up.

    Credit to Mike Mazur for this function.
    
    Args:
        data_chunk (arr): A contigous 1D array of uint8 data
                              eg.data_chunk = np.frombuffer(data_chunk, dtype=np.uint8)
   
    Returns:
        out (arr): Output data in 16-bit format
   """
   
    #ensure that the data_chunk has the right length
    assert np.mod(data_chunk.shape[0],3)==0

    out=np.empty(data_chunk.shape[0]//3*2,dtype=np.uint16)

    for i in nb.prange(data_chunk.shape[0]//3):
        fst_uint8=np.uint16(data_chunk[i*3])
        mid_uint8=np.uint16(data_chunk[i*3+1])
        lst_uint8=np.uint16(data_chunk[i*3+2])

        out[i*2] =   (fst_uint8 << 4) + (mid_uint8 >> 4)
        out[i*2+1] = ((mid_uint8 % 16) << 8) + lst_uint8

    return out


def readRCD(filename):
    """
    Read a .rcd image file and return the data and relevant header information.

    Args:
        filename (str): The name of the .rcd file to be read.
    
    Returns:
        hdict (dict): A dictionary containing the header information.
            exptime (float): The exposure time of the image.
            timestamp (str): The timestamp of the image.
            lat (float): The latitude of the telescope.
            lon (float): The longitude of the telescope.
        data (np.ndarray): A numpy array containing the image data.

    Notes:
        This function reads high-gain lines, assumes 2x2 binning, and a
        2048x2048x12-bit image. These values are hard-coded into the function.

    """

    # Open the file
    with open(filename, 'rb') as rcd:

        # Read the header information
        hdict = {}
        hdict['serialnum'] = readxbytes(rcd, 63, 9) # Serial number of camera
        hdict['exptime'] = readxbytes(rcd, 85, 4) # Exposure time in 10.32us periods
        hdict['timestamp'] = readxbytes(rcd, 152, 29)
        hdict['lat'] = readxbytes(rcd, 182, 4)
        hdict['lon'] = readxbytes(rcd, 186, 4)

        # Read the data, convert to 16-bit, extract high-gain lines, reshape
        # size = (2048x2048 image) * (2 high/low gain modes) * 12-bit depth
        rcd.seek(384,0)
        data = np.fromfile(rcd, dtype=np.uint8, count=int(IMG_SIZE*2*(BIT_DEPTH/8)))
        data = conv_12to16(data)
        data = (data.reshape(2*IMG_WIDTH, IMG_WIDTH))[1::2]

        return hdict, data


def readFITS(filename):
    """
    Read a FITS file and return the data and relevant header information.

    Args:
        filename (str): The name of the FITS file to be read.
    
    Returns:
        hdict (dict): A dictionary containing the header information.
        data (np.ndarray): A numpy array containing the image data.
    """

    # Open the file
    with fits.open(filename) as hdul:
        # Get the header and data
        hdict = hdul[0].header
        data = hdul[0].data

    return hdict, data


def testGPSLock(filepath):
    """
    Check to see if there was a valid GPS lock established for the given image.

    Args:
        filepath (str/Path): Full filepath to the RCD image to be checked.

    Returns:
        gpsLock (bool): Returns true/false on whether a GPS lock was
                        established for the given image

    """

    # Open .rcd file and extract the ControlBlock2 variable which represents
    # the 8 boolean values following in the metadata (specifically the GPS
    # lock and GPS error variables) as an int
    with open(filepath, 'rb') as fid:
        fid.seek(140,0)
        ControlBlock2 = ord(fid.read(1))
        
    # Compare ControlBlock2 variable with expected 96 == 0b01100000 sequence
    # which represents a GPS locked, upper-left quadrant image with no GPS
    # error.
    gpsLock = (ControlBlock2 == 96)
    print("GPS Control Block: {}".format(ControlBlock2))
    
    return gpsLock


###########################
## Camera Functions
###########################

def check_gps(target_dir=TMP_PATH.joinpath('gps')):
    """
    Check the GPS status of a single image.

    Parameters
    ----------
    target_dir : pathlib.Path
        Path to the directory containing the images.

    Returns
    -------
    gpsLock : bool
        True if the GPS was locked, False otherwise.

    """

    print(f"\n{time.strftime('%Y-%m-%d %H:%M:%S')}: Checking GPS status...")

    # Generate a test image using ColibriGrab
    # Currently set to take a 0.1s exposure of a dark image
    subprocess.call(f"ColibriGrab -n 1 -p gps_check -e 100 -t 0 -f dark -w {target_dir}", stdout=open(os.devnull, 'wb'))

    # Set the path to the reference image
    gps_dirs = [d for d in target_dir.iterdir() if d.is_dir()]
    gps_dirs.sort(key=os.path.getmtime)
    gps_dir = gps_dirs[-1]
    gps_img = gps_dir.joinpath('gps_check_0000001.rcd')

    # Check if the image was created
    if not gps_img.exists():
        print("ERROR: Image was not created.")
        return None
    
    # Check if the GPS was locked
    gpsLock = testGPSLock(gps_img)
    print("  --> GPS Lock: {}".format(gpsLock))

    # Delete the image and directory
    shutil.rmtree(gps_dir)

    return gpsLock


#----------------------------------main---------------------------------------#

if __name__ == "__main__":

    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Check GPS status of images.')
    parser.add_argument('-c', '--continuous', type=int, nargs='?', const=86400, default=1,
                        help='Run in continuous mode for the specified number of seconds. Default is 86400 (24 hours).')

    # Extract mode from command line arguments
    args = parser.parse_args()
    n_runs = args.continuous

    # Check if continuous mode was selected
    if n_runs == 1:
        print("Running in single mode.")
    elif n_runs > 1:
        print("Running in continuous mode for {} seconds.".format(n_runs))
    else:
        print("Invalid time entered. Exiting.")
        sys.exit()

    # Create/recreate a directory to store the images
    gps_dir = TMP_PATH / 'gps'
    if gps_dir.exists():
        shutil.rmtree(gps_dir)
    gps_dir.mkdir(parents=True, exist_ok=True)

    # Run the program in continuous mode executing every 1s
    stop_flag = threading.Event()
    gps_thread = GPSChecker(stop_flag, n_runs, target_dir=gps_dir)
    gps_thread.start()

    # Wait for the thread to finish
    gps_thread.join()

    # Print the results
    print(f"\nGPS was locked {gps_thread.gps_locked} times out of {n_runs} runs.")
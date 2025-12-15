"""
Filename:   astrometry_correction.py
Author(s):  Peter Quigley
Contact:    pquigle@uwo.ca
Created:    Tue Nov 22 14:39 2022
Updated:    Mon May  1 14:35 2023
    
Description:
Analyzes a test image to determine the astrometric correction required to align
the telescope with the intended sky coordinates. This is done by comparing the
coordinates of the stars in the image with the coordinates of the same stars
from a reference catalog. The astrometric correction is then applied to the
telescope, fed via RunColibri.js' child process.

Usage:

"""

# Module Imports
import os, sys
import argparse
import sep
import subprocess
import binascii
import numpy as np
import numba as nb
import matplotlib.pyplot as plt
from matplotlib.colors import LogNorm
from astropy.io import fits
from astropy.io.fits import Header
from astropy import wcs
from pathlib import Path
from astropy.coordinates import Angle,EarthLocation,SkyCoord
from concurrent.futures import ThreadPoolExecutor, as_completed

# Custom Imports


#-------------------------------global vars-----------------------------------#

# Path variables
BASE_PATH = Path('D:/')
DATA_PATH = BASE_PATH / 'ColibriData'
IMGE_PATH = BASE_PATH / 'ColibriImages'
ARCHIVE_PATH = BASE_PATH / 'ColibriArchive'

# Image variables (assumes square image)
IMG_WIDTH = 2048
BIT_DEPTH = 12
IMG_SIZE = IMG_WIDTH**2

DEFAULT_SOLVE_TIMEOUT = 150  # seconds
DEFAULT_GRAB_TIMEOUT = 60    # seconds

# Site longitude/latitude
SITE_LAT  = 43.1933116667
SITE_LON = -81.3160233333
SITE_HGT = 224
SITE_LOC  = EarthLocation(lat=SITE_LAT,
                         lon=SITE_LON,
                         height=SITE_HGT)

# Verbose print statement
verboseprint = lambda *a, **k: None


#--------------------------------functions------------------------------------#

def windows_to_wsl_path(windows_path):
    """Convert a Windows path to a Unix-style path for WSL."""
    verboseprint("Path before replace: ", windows_path)
    windows_path = str(windows_path).replace("\\", "/")
    verboseprint("Path after replace: ", windows_path)
    
    # If the path starts with a drive letter (e.g., "D:") handle it
    if windows_path[1] == ':':
        drive, path = os.path.splitdrive(windows_path)
        drive = drive.lower().strip(':')  # Convert to lowercase and remove the colon
        wsl_path = f"/mnt/{drive}/{path.lstrip('/')}"  # Ensure there is a slash after the drive letter
    else:
        wsl_path = windows_path
    
    return wsl_path
    
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


def writeToFITS(filename, hdict, data):
    """
    Write data to a FITS file.
    
    Args:
        filename (str): The name of the FITS file to be written.
        data (np.ndarray): A numpy array containing the image data.
        hdict (dict): A dictionary containing the header information.

    Returns:
        None

    """

    # Update the site latitude and longitude to be in degrees
    latitude, longitude = computelatlong(hdict['lat'],hdict['lon'])

    # Create the HDU object and empty header
    hdu = fits.PrimaryHDU(data)
    hdr = hdu.header

    # Add the header information
    hdr.set('exptime', int(binascii.hexlify(hdict['exptime']), 16) * 10.32 / 1000000)
    hdr.set('DATE-OBS', str(hdict['timestamp'], 'utf-8'))
    hdr.set('SITELAT', latitude)
    hdr.set('SITELONG', longitude)
    hdr.set('SERIAL', str(hdict['serialnum'], 'utf-8'))

    # Write the data to a FITS file
    hdu.writeto(filename, overwrite=True)


###########################
## Image Processing
###########################

def computelatlong(lat,lon): 
    """
    Compute the latitude and longitude of the telescope from the raw data.
    Output is in degrees.

    Args:
        lat (str): The raw latitude data.
        lon (str): The raw longitude data.

    Returns:
        latitude (float): The latitude of the telescope.
        longitude (float): The longitude of the telescope.
    """

    degdivisor = 600000.0
    degmask = int(0x7fffffff)
    dirmask = int(0x80000000)

    latraw = int(binascii.hexlify(lat),16)
    lonraw = int(binascii.hexlify(lon),16)

    # Check the direction of the latitude
    if (latraw & dirmask) != 0:
        latitude = (latraw & degmask) / degdivisor
    else:
        latitude = -1*(latraw & degmask) / degdivisor

    # Check the direction of the longitude
    if (lonraw & dirmask) != 0:
        longitude = (lonraw & degmask) / degdivisor
    else:
        longitude = -1*(lonraw & degmask) / degdivisor

    return latitude, longitude


def extractStars(image_data, detect_threshold):
    """
    Locates the stars in an image using the sep module and completes
    preliminary photometry on the image. Does not subtract dark!

    Args:
        img_data (arr): 2D array of image flux data
        detect_thresh (float): Detection threshold for star finding
        
    Returns:
        star_chars (arr): [x, y] of all stars in pixels
    """

    # Find the stars in the image
    bkg = sep.Background(image_data)
    star_data = sep.extract(image_data, detect_threshold, err=bkg.globalrms)
    #star_chars = np.array([star_data['x'], star_data['y'], star_data['flux']]).T
    star_chars = np.array([star_data['x'], star_data['y']]).T

    return star_chars


###########################
## WCS Solving
###########################
def getLocalSolution(image_file, save_file, order):

    image_dir = os.path.dirname(image_file)
    save_file_base = image_dir

    image_file_wsl = windows_to_wsl_path(image_file)
    save_file_base_wsl = windows_to_wsl_path(save_file_base)
    save_file_wsl = save_file

    # NOTE: removed 'time' and we capture output so it can't flood
    command = [
        'wsl', 'solve-field',
        '--no-plots',
        '-D', save_file_base_wsl,
        '-N', f'{save_file_base_wsl}/{save_file_wsl}',
        '-t', str(order),
        '--scale-units', 'arcsecperpix',
        '--scale-low', '2.2',
        '--scale-high', '2.6',
        '--overwrite',
        image_file_wsl
    ]
    out = subprocess.run(
        command,
        check=True,
        timeout=DEFAULT_SOLVE_TIMEOUT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )

    wcs_header_path = f'{save_file_base}\\{save_file}'
    wcs_header = Header.fromfile(wcs_header_path)
    return wcs_header

def solve_image_parallel(image_file, save_file, order):
    """
    Attempt to solve using parallel processing
    """
    with ThreadPoolExecutor() as executor:
        future = executor.submit(getLocalSolution, image_file, save_file, order)
        try:
            wcs_header = future.result(timeout=DEFAULT_SOLVE_TIMEOUT + 10)
            return wcs_header
        except Exception as e:
            print(f"Astrometry solution failed: {e}")
            raise


def getSolution(image_file, save_file, order):
    '''send request to solve image from astrometry.net
    input: path to the image file to submit, filepath to save the WCS solution header to, order of soln
    returns: WCS solution header'''
    from astroquery.astrometry_net import AstrometryNet
    #astrometry.net API
    ast = AstrometryNet()
    
    #key for astrometry.net account
    ast.api_key = 'vbeenheneoixdbpb'    #key for Rachel Brown's account (040822)
    wcs_header = ast.solve_from_image(image_file, crpix_center = True, tweak_order = order, force_image_upload=True)

    #save solution to file
    if not save_file.exists():
            wcs_header.tofile(save_file)
            
    return wcs_header

def getWCSTransform(fits_filepath, file_str='ast_corr.fits', soln_order=4, attempt_backup=True):
    """
    Finds median image that best fits for the time of the detection and uses it to get Astrometry solution.
    Required to have a list of median-combined images (median_combos)


    Args:
        fits_filepath (str): Path to the fits file
        file_str (str): Filaename of saved WCS solution file
        soln_order (int): Order of the WCS solution

    Returns:
        transform (astropy.wcs.wcs.WCS): WCS solution for the image        

    """

    # TODO: Fix this function
    # Set WCS solution file path
    wcs_filepath = BASE_PATH / "tmp" / file_str


    # Try to create a WCS solution for the image
    try:
        #try if local Astrometry can solve it
        wcs_header = solve_image_parallel(str(fits_filepath), file_str, soln_order)
    except Exception as e:
        # if attempt_backup is False, raise the error
        if not attempt_backup:
            raise e

        # Otherwise, if not, try to solve it with astrometry.net
        print(f"\nLocal solution failed. Trying astrometry.net solution.\n    Error: {e}")
        wcs_header = getSolution(fits_filepath, wcs_filepath, soln_order)

    #calculate coordinate transformation
    transform = wcs.WCS(wcs_header)

    return transform


def convertToWSLPath(path):
    """
    Replace the drive letter in a Windows path with the WSL equivalent.

    Args:
        path (str): The Windows path to be converted.
    
    Returns:
        wsl_path (str): The converted WSL path.
    
    """

    # Split the path into drive and path
    drive,path = os.path.splitdrive(path)

    # Replace the drive letter with the WSL equivalent
    wsl_path = '/mnt/' + drive.lower().replace(':','') + path.replace('\\','/')

    return wsl_path


###########################
## RADEC <-> XY Mapping
###########################

def getRADEC_Single(transform, x, y):
    """
    Converts a single pixel coordinate to RA/Dec using the WCS solution

    Args:
        transform (astropy.wcs.wcs.WCS): WCS solution for the image
        x (float): x coordinate of the pixel
        y (float): y coordinate of the pixel

    Returns:
        ra (float): Right Ascension of the pixel in decimal degrees
        dec (float): Declination of the pixel in decimal degrees
    """

    # Convert the pixel coordinates to RA/Dec
    radec = transform.pixel_to_world(x, y)
    ra = radec.ra.degree
    dec = radec.dec.degree
    verboseprint(f"Target coordinates: RA={ra}, DEC={dec}")
    verboseprint(f"(x,y) = ({x},{y}) -> (RA,Dec) = ({ra},{dec})")
    return ra,dec


def getXY_Single(transform, ra, dec):
    """
    Converts a single RA/Dec coordinate to pixel coordinates using the WCS solution

    Args:
        transform (astropy.wcs.wcs.WCS): WCS solution for the image
        ra (float): Right Ascension of the pixel in decimal degrees
        dec (float): Declination of the pixel in decimal degrees

    Returns:
        x (float): x coordinate of the pixel
        y (float): y coordinate of the pixel
    """

    # Convert the RA/Dec coordinates to pixel coordinates
    px = transform.wcs_world2pix(np.array([[ra, dec]]), 0)
    x,y = px[0,0], px[0,1]
    

    verboseprint(f"(RA,Dec) = ({ra},{dec}) -> (x,y) = ({x},{y})")
    return x,y


#----------------------------------main---------------------------------------#

if __name__ == '__main__':

###########################
## Argparse Setup
###########################

    # Generate argument parser
    parser = argparse.ArgumentParser(description='Astrometric correction for Colibri.')

    # Available argument functionality
    parser.add_argument('coords', type=float, nargs=2, 
                        help='The (RA,DEC) coordinates of the target in decimal degrees.')
    parser.add_argument('-i', '--image', type=str, help='The image to be analyzed.')
    parser.add_argument('-t', '--test', action='store_true',
                        help='Run in test mode.')
    

    # Process argparse list as useful variables
    args = parser.parse_args()
    ra,dec = args.coords

    # If in test mode, verboseprint is now print
    test = args.test
    if test:
        verboseprint = print

    

###########################
## Image Generation
###########################

    # If no reference image is provided, generate a test image
    # using ColibriGrab.exe
    if args.image is None:
        colibrigrab_path = Path(os.path.expanduser('~')) / "Documents/GitHub/ColibriGrab/ColibriGrab/ColibriGrab.exe"
        try:
            subprocess.run(
                [str(colibrigrab_path),
                 "-n","1","-p","pointing_reference","-e","1000","-t","-10","-l","2","-f","normal","-w","D:\\tmp\\"],
                check=True, timeout=DEFAULT_GRAB_TIMEOUT
            )
        except subprocess.TimeoutExpired:
            print("0.0 0.0", flush=True); sys.exit(124)
        except Exception:
            print("0.0 0.0", flush=True); sys.exit(1)

        tmp_dir = BASE_PATH / 'tmp'
        try:
            tmp_dirs = sorted([d for d in tmp_dir.iterdir() if d.is_dir()], key=os.path.getmtime)
            img_dir = tmp_dirs[-1]
        except Exception:
            print("0.0 0.0", flush=True); sys.exit(1)

        ref_image = img_dir / 'pointing_reference_0000001.rcd'
        if not ref_image.exists():
            print(f"Could not find ColibriGrab test image '{ref_image}'.")
            print("0.0 0.0", flush=True); sys.exit(1)
    else:
        ref_image = Path(args.image)
        if not ref_image.exists():
            print(f"Reference image for astrometric correction '{ref_image}' not found.")
            print("0.0 0.0", flush=True); sys.exit(1)

###########################
## Astrometry
###########################

    # If the reference image is an rcd file, convert it to a fits file
    if ref_image.suffix == '.rcd':
        # Extract information from the reference image
        verboseprint(f"Reading reference image '{ref_image}'...")
        ref_hdict, ref_data = readRCD(ref_image)

        # Save the header and data as a fits file
        FITS_path = BASE_PATH / 'tmp' / ('astr_corr_unsolved.fits')
        if FITS_path.exists():
            FITS_path.unlink()
        writeToFITS(FITS_path, ref_hdict, ref_data)
    
    # Otherwise, the reference image is already a fits file
    elif ref_image.suffix == '.fits':
        # Set the path to the reference image
        FITS_path = ref_image

        # Extract the data from the image
        verboseprint(f"Reading reference image '{ref_image}'...")
        _, ref_data = readFITS(FITS_path)

    # Otherwise, the reference image is not a valid file type
    else:
        print("0.0 0.0")
        raise TypeError(f"Reference image for astrometric correction '{ref_image}' is not a valid file type.")

    # Get the WCS solution for the reference image
    verboseprint("Getting WCS solution for reference image...")
    try:
        ref_wcs = solve_image_parallel(FITS_path, 'astr_corr.fits', 4)
    except Exception as e:
        verboseprint(f"WARNING: 'Error: {e}' caused wcs transform to fail. \nBackup solution is currently disabled.")
        print("0.0 0.0")
        sys.exit(1)

    # Convert the central pixel of the reference image to RA/Dec
    verboseprint("Converting central pixel of reference image to RA/Dec...")
    transform = wcs.WCS(ref_wcs)
    ref_ra,ref_dec = getRADEC_Single(transform, IMG_WIDTH/2, IMG_WIDTH/2)
    verboseprint(f"Central pixel coordinates: (RA, Dec) = ({ref_ra}, {ref_dec})")
    # Calculate the offset between the reference image and the target
    print(f"Calculating offset between reference image and target...")
    print("Reference RA and dec: ", ref_ra, ref_dec)
    ra_offset = ra - ref_ra
    dec_offset = dec - ref_dec
    
    # Print the offset
    print(f"{ra_offset} {dec_offset}")

    # If in test mode, plot the reference image with the target marked
    if test:
        fig, ax = plt.subplots()
        verboseprint(f"Min pixel: {np.min(ref_data)}\nMax pixel: {np.max(ref_data)}")

        # Plot the reference image and mark the central pixel
        ax.imshow(ref_data, cmap='gray', origin='upper', norm=LogNorm())
        ax.plot(IMG_WIDTH/2, IMG_WIDTH/2, 'r+', label='Center')

        # Calculate pixel coordinates of the target and mark it
        target_x,target_y = getXY_Single(ref_wcs, ra, dec)
        ax.plot(target_x, target_y, 'c+', label='Target')

        # Add text with the offsets
        ax.text(0.05, 0.95, f"RA Offset: {ra_offset:.3f}\nDec Offset: {dec_offset:.3f}", 
                transform=ax.transAxes, ha='left', va='top', color='w')
        
        # Add legend and show the plot
        ax.legend()
        plt.show()


                                                
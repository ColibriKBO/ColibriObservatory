"""
Filename:   processdata.py
Author(s):  Mike Mazur, Roman Akhmetshyn, Peter Quigley
Contact:    pquigley@uwo.ca
Created:    Wed Oct 19 10:19:07 2022
Updated:    Wed Oct 19 10:19:07 2022
    
Usage: python processdata.py [-d][-p][-r][-s]
"""

# Module Imports
import os, sys
import shutil
import time
import pathlib
import subprocess
import argparse
import tkinter as tk
from pathlib import Path
from datetime import datetime, timedelta

# Custom Script Imports
from preparedata import is_dir_too_small

# STEP 1: Prepare data directories with preparedata.py functions
# STEP 2: Walk through directories in D:\ and look for processed.txt file
#           If processed.txt doesn't exist,
#               Setup base_path, obs_date, and process_date
#               Run colibri_main_py3.py on directory
#               Write log file to processed.txt
#               Write to processed.txt
#           If processed.txt exists,
#               Open processed.txt and check to see if main was completed
# STEP 3: Same as STEP 2, but run colibri_secondary.py
# STEP 4: Cleanup unnecessary files


#-------------------------------global vars-----------------------------------#

# Path variables
BASE_PATH = pathlib.Path('D:/')
DATA_PATH = BASE_PATH / 'ColibriData'
IMGE_PATH = BASE_PATH / 'ColibriImages'
ARCHIVE_PATH = BASE_PATH / 'ColibriArchive'
LOG_PATH = BASE_PATH / 'Logs' / 'Pipeline'
TMP_PATH = BASE_PATH / 'tmp'

# Timestamp format
OBSDATE_FORMAT = '%Y%m%d'
MINDIR_FORMAT  = '%Y%m%d_%H.%M.%S.%f'
TIMESTAMP_FORMAT = '%Y-%m-%dT%H:%M:%S.%f'
BARE_FORMAT = '%Y-%m-%d_%H%M%S_%f'
NICE_FORMAT = '%Y-%m-%d %H:%M:%S'

# GitHub Script Repository
GITHUB = pathlib.Path('~', 'Documents', 'GitHub').expanduser()
SCRIPTS = GITHUB / 'ColibriPipeline'
EMAIL_SCRIPT = GITHUB / 'ColibriEmail' / 'email_timeline.py'

# Computer name
TELESCOPE = os.environ['COMPUTERNAME']

# Misc variables
TMP_SUFFIX = ['_wcs.fits', '_wcs.axy', '_wcs.corr', '_wcs.match', '_wcs.rdls',
              '_wcs.solved', '_wcs.wcs', '_wcs-indx.xyls', '_corr.axy',
              '_corr.fits', '-ACP.log', '_wcs.axy']


#----------------------------------class--------------------------------------#

class ErrorTracker(object):
    """
    Indicates if any errors or warnings occurred during the running of the program.
    """

    def __init__(self):
        """
        Initializes an instance of the ErrorTracker class.
        """
        self.errors = []
        self.warnings = []

    def addError(self, error_msg):
        """
        Adds an error message to the list of errors.

        Args:
            error_msg (str): The error message to be added.
        """
        self.errors.append(error_msg)
        print(error_msg)

    def addWarning(self, warning_msg):
        """
        Adds a warning message to the list of warnings.

        Args:
            warning_msg (str): The warning message to be added.
        """
        self.warnings.append(warning_msg)
        print(warning_msg)

err = ErrorTracker()


#--------------------------------functions------------------------------------#

##############################
## Prepare Data Src
##############################

def getDirSize(dir_name):
    """
    Get the size of a directory in bytes.

    Args:
        dir_name (pathlib.Path): Path to the directory.

    Returns:
        int: Size of the directory in bytes.
    
    """

    total_size = 0
    for item in dir_name.iterdir():
        if item.is_file():
            total_size += item.stat().st_size
        elif item.is_dir():
            total_size += getDirSize(item)
    return total_size


def prepareData(eval_img_size=False):
    """
    Clean invalid data directories and bias directories. Assessment done based
    on the number of files in the directory and optionally image size.
    
    Args:
        eval_img_size (bool): If True, will check image size of each directory
            and delete directories that are too small.
    
    Returns:
        None

    """

    # Define minimum sizes
    min_images = 100
    min_biases = 9
    image_size = 12_583_296 # size in bytes of a 2048x2048x12-bit image plus header

    # Clean thumbs.db files
    cleanThumbsdb()

    # Loop through obsdate directories
    for obs_dir in DATA_PATH.iterdir():

        print(f"Cleaning {obs_dir}...")

        # Ignore obs_dir if it was already cleaned
        if (obs_dir / 'cleaned.txt').is_file():
            continue

        # For data directories, check minute subdirectories
        for min_dir in obs_dir.iterdir():

            # Ignore stop files
            if min_dir.is_file():
                continue

            # If the directory is a bias directory, check for the minimum
            # number of biases.
            elif 'Bias' in min_dir.name:
                for bias_dir in min_dir.iterdir():
                    num_images = len(list(bias_dir.iterdir()))
                    if num_images < min_biases:
                        err.addError(f"WARNING: {bias_dir} contains {num_images} biases and will be deleted!")
                        shutil.rmtree(bias_dir)

                continue

            # Get number of items in the directory
            num_images = len(list(min_dir.iterdir()))

            # If the directory contains fewer than the required number of
            # images, delete the directory.
            if num_images < min_images:
                err.addError(f"WARNING: {min_dir} contains {num_images} images and will be deleted!")
                #shutil.rmtree(min_dir)
                continue

            # If eval_img_size is True, check the image size of each
            elif (eval_img_size) and (getDirSize(min_dir) < num_images * image_size):
                err.addError(f"WARNING: {min_dir} contains images of a smaller size than expected!")
                shutil.rmtree(min_dir)
                continue
        
        # Create cleaned.txt file to indicate that the directory has been
        # cleaned.
        (obs_dir / 'cleaned.txt').touch()


def cleanThumbsdb():
    """
    Deletes all thumbs.db files in the data directory.
    
    This function checks if the 'Thumbs.db' file or directory exists in the data directory.
    If a 'Thumbs.db' directory is found, it attempts to remove it using the 'rmdir' function.
    If the 'Thumbs.db' directory is not empty, it recursively removes all its contents using the 'rmtree' function.
    If a 'Thumbs.db' file is found, it simply deletes the file using the 'unlink' function.

    Args:
        None

    Returns:
        None
        
    """

    # Check if Thumbs.db exists in data directory
    if (DATA_PATH / 'Thumbs.db').is_dir():
        err.addError("WARNING: Thumbs.db dir found in data directory!")

        try:
            # If Thumbs is empty, rmdir will work
            (DATA_PATH / 'Thumbs.db').rmdir()
        except:
            # If Thumbs is not empty, rmtree will work
            for item in (DATA_PATH / 'Thumbs.db').iterdir():
                if item.is_dir():
                    shutil.rmtree(item)
                else:
                    item.unlink()
            (DATA_PATH / 'Thumbs.db').rmdir()
    if (DATA_PATH / 'Thumbs.db').is_file():
        err.addError("WARNING: Thumbs.db file found in data directory!")
        (DATA_PATH / 'Thumbs.db').unlink()


def cleanD():
    """
    Clean D:/ and tmp of resulting files from the pipeline.
    
    Args:
        None
    
    Returns:
        None
    
    """

    print(f"Cleaning D:/ and tmp of pipeline files...")

    # Remove all files in D:/ following *_wcs.fits
    for file in BASE_PATH.glob('*_wcs.fits'):
        file.unlink()
    
    # Remove all files in tmp fitting the TMP_SUFFIX list
    for ext in TMP_SUFFIX:
        for file in TMP_PATH.glob(f'*{ext}'):
            file.unlink()


##############################
## Subscript Processing
##############################

def processRawData(obsdate, repro=False, new_stop=True, **kwargs):
    """
    As a wrapper for all processes which must occur with raw data.

    Args:
        obsdate (str): The date of the observation in the format YYYYMMDD.
        repro (bool): If True, will reprocess all data. If False, will only
            process data that has no stop file for that script.
        new_stop (bool): If True, will create a new stop file for each script
            that is run. If False, will not create a new stop file.
        **kwargs: Script names (minus '.py') to run. If no kwargs are given,
            no scripts will be run.

    Returns:
        runtime (float): The total runtime of all processes in seconds.
        
    """

    # Define the raw data directory and check that the directory exists
    raw_dir = DATA_PATH / obsdate
    if not raw_dir.exists():
        err.addError(f"ERROR: No raw data found on {obsdate}! Skipping primary processing!")
        return []
    
    # Collect the contents of the data directory and check that some raw data was collected
    minute_dirs = [min_dir for min_dir in raw_dir.iterdir() if min_dir.is_dir()]
    if len(minute_dirs) <= 1:
        err.addWarning(f"WARNING: No data found in {obsdate}! Skipping primary processing!")
        return []

    # Run all processes and get the runtime as a return
    runtime = runProcesses(raw_dir, repro=repro, new_stop=new_stop, pipe_std=obsdate, **kwargs)
    print(f"\n## All processes on raw data are complete for {obsdate}!\n")
    return runtime

    

def processArchive(obsdate, repro=False, new_stop=True, **kwargs):
    """
    As a wrapper for all processes which must occur with archival data.

    Args:
        obsdate (str): The date of the observation in the format YYYYMMDD.
        repro (bool): If True, will reprocess all data. If False, will only
            process data that has no stop file for that script.
        new_stop (bool): If True, will create a new stop file for each script
            that is run. If False, will not create a new stop file.
        **kwargs: Script names (minus '.py') to run. If no kwargs are given,
            no scripts will be run.
    
    Returns:
        list: A list of runtimes for each subprocess.

    """

    # Track the runtime of the subprocesses
    runtime = []

    # Define the raw data directory and check that the directory exists
    raw_dir = DATA_PATH / obsdate
    archive_dir = ARCHIVE_PATH / hyphonateDate(obsdate)
    if not raw_dir.exists():
        err.addWarning(f"WARNING: No raw data found on {obsdate}.")
        raw_dir.mkdir()
    if not archive_dir.exists():
        err.addWarning(f"WARNING: No archive directory found on {obsdate}.")
        archive_dir.mkdir()
    
    # Run all processes and get the runtime as a return
    runtime = runProcesses(raw_dir, repro=repro, new_stop=new_stop, pipe_std=obsdate, **kwargs)
    print(f"\n## All secondary processes are complete for {obsdate}!\n")
    return runtime


def runProcesses(stopfile_dir, repro=False, new_stop=True, pipe_std=None, **kwargs):
    """
    Run multiple subprocesses with specified command-line arguments.

    Args:
        stopfile_dir (str): The directory where stop files are stored.
        repro (bool, optional): Flag indicating whether to re-run processes that have already been performed. Defaults to False.
        new_stop (bool, optional): Flag indicating whether to write new stop files after each process completes. Defaults to True.
        pipe_std (str, optional): Flag indicating whether to record stdout and stderr to a log file. Defaults to None (no logging).
        **kwargs: Keyword arguments specifying the processes and their corresponding command-line arguments. The format is {'processname': [list_of_script_args]}.

    Returns:
        list: A list of runtimes for each subprocess.

    """

    # Track the runtime of the subprocesses
    runtime = []

    # Check if pipeing stdout and stderr to a log file
    if pipe_std is not None:
        # Define the log directory and check that the directory exists
        log_dir = LOG_PATH / pipe_std
        if not log_dir.exists():
            log_dir.mkdir()


    # Loop through kwargs to get processes and arguments
    # Kwarg format: {'processname' : [list_of_script_args]}
    for process,script_args in kwargs.items():
        stop_file = process + '.txt'
        if (stopfile_dir / stop_file).exists() and (repro is False):
            print(f"WARNING: {process} already preformed. Skipping...")
            continue

        # Check if pipeing stdout and stderr to a log file
        if pipe_std is not None:
            # Define the log file and check that the file exists
            log_file = log_dir / (process + '.log')
            
            # Use 'tee -a' to append to the log file and print to screen
            script_args = script_args + ['|', 'tee', '-a', log_file]

        # Run the process with appropriate command-line arguments
        t_start = time.time()
        try:
            print(f"Initializing subprocess {process + '.py'}...")
            subp = subprocess.run(['python', SCRIPTS / (process + '.py'), *script_args], shell=True)

            # Wait until the subprocess has completed
            try:
                while subp.poll() is None:
                    time.sleep(10)
            except AttributeError:
                pass

            # Write new stop file if requested
            if new_stop:
                print(f"Writing stop file for {process + '.py'}...")
                with open(stopfile_dir / stop_file, 'w') as sfile:
                    sfile.write(f'python {process}.py {script_args}')

        # If subprocess fails, skip the pipeline
        except Exception as Argument:
            err.addError(f"ERROR: {process + '.py'} failed with error {Argument}! Skipping...")

        # Record the runtime of the subprocess
        runtime.append(time.time() - t_start)

    # Return the runtime of the subprocess once all subprocesses have completed
    return runtime

def sendStatusEmail(obsdate, stopfile_dir, repro=False, new_stop=True,
                    errors=[], notes=[]):
    """
    Sends a daily status email with the given parameters.

    Args:
        obsdate (str): The observation date.
        stopfile_dir (str): The directory where the stop file will be written.
        repro (bool, optional): Whether to reproduce the email. Defaults to False.
        new_stop (bool, optional): Whether to write a new stop file. Defaults to True.
        errors (list, optional): List of errors to include in the email. Defaults to an empty list.
        notes (list, optional): List of notes to include in the email. Defaults to an empty list.

    Returns:
        None
    
    """

    # Check if email has already been sent
    stop_file = 'email.txt'
    if (stopfile_dir / stop_file).exists() and (repro is False):
        print(f"WARNING: Daily status email already sent. Skipping...")
        return

    # Define the command-line arguments
    # Process items in errors and notes individually
    script_args = [obsdate, '--errors', *errors, '--notes', *notes]

    # Run the process with appropriate command-line arguments
    try:
        print(f"Sending daily status email...")
        subp = subprocess.run(['python', EMAIL_SCRIPT, *script_args])

        # Wait until the subprocess has completed
        try:
            while subp.poll() is None:
                time.sleep(10)
        except AttributeError:
            pass

        # Write new stop file if requested
        if new_stop:
            print(f"Writing stop file for {EMAIL_SCRIPT.name}...")
            with open(stopfile_dir / stop_file, 'w') as sfile:
                sfile.write(f'python {EMAIL_SCRIPT.name} {script_args}')

    # If email_timeline.py fails, send a generic email as an alert
    except Exception as Argument:
        err.addError(f"ERROR: {EMAIL_SCRIPT.name} failed with error {Argument}! Skipping...")
        subp = subprocess.run(['python', EMAIL_SCRIPT.parent / 'generic_email.py'])
    

##############################
## Formatting Functions
##############################

def hyphonateDate(obsdate):
    """
    Converts the given date string to a hyphenated format.

    Args:
        obsdate (str): The YYYYMMDD date string to be converted.

    Returns:
        str: The hyphenated date string.

    """
    # Convert the date to a datetime object
    obsdate = datetime.strptime(obsdate, OBSDATE_FORMAT)

    # Convert the date to a hyphenated string
    obsdate = obsdate.strftime('%Y-%m-%d')

    return obsdate

def slashDate(obsdate):
    """
    Converts the given date string to a hyphenated format.

    Args:
        obsdate (str): The YYYYMMDD date string to be converted.

    Returns:
        str: The converted date string in the format 'YYYY/MM/DD'.

    """

    # Convert the date to a datetime object
    obsdate = datetime.strptime(obsdate, OBSDATE_FORMAT)

    # Convert the date to a hyphenated string
    obsdate = obsdate.strftime('%Y/%m/%d')

    return obsdate


#--------------------------------processes------------------------------------#

def ColibriProcesses(obsdate, repro=False, sigma_threshold=6, tot_runtime=[]):

    print("\n" + "#"*30 + f"\n{obsdate}\n" + "#"*30 + "\n")

##############################
## Raw Data Processing
##############################

    # Run subprocess over all dates in the specified list
    print(f"\n## Processing raw data from {obsdate}... ##\n")

    # This dictionary defines the *PYTHON* scripts which
    # handle the raw data. To add a script, just add to this
    # dictionary. Format is {script_basename : [list_of_cml_args]}.
    raw_processes = {
            'colibri_main_py3': ['d:/', slashDate(obsdate), f'-s {sigma_threshold}'],
            'coordsfinder': [f'-d {slashDate(obsdate)}'],
            'image_stats_bias': [f'-d {slashDate(obsdate)}'],
            'sensitivity': [f'-d {slashDate(obsdate)}']
                    }
    
    raw_runtime = processRawData(obsdate, repro=repro, new_stop=True, **raw_processes)
    tot_runtime += raw_runtime

##############################
## Archival Data Processing
##############################

    # Run subprocess over all dates in the specified list
    print(f"\n## Processing archival data from {obsdate}... ##\n")

    # This dictionary defines the *PYTHON* scripts which
    # handle the archival data. To add a script, just add to this
    # dictionary. Format is {script_basename : [list_of_cml_args]}.
    archive_processes = {
            'wcsmatching': [f'{obsdate}']
                        }
    
    archive_runtime = processArchive(obsdate, repro=repro, new_stop=True, **archive_processes)
    tot_runtime += archive_runtime

##############################
## Split-Responsibility Processing
##############################

    ## Here we must split the responsibilities between telescopes

    # Green-specific
    if TELESCOPE == "GREENBIRD":
        print(f"\n## Processing GREENONLY1 for {obsdate}... ##\n")

        # Wait until other telescopes are done
        path_RED  = pathlib.Path('R:/','ColibriArchive',hyphonateDate(obsdate),'done.txt')
        path_BLUE = pathlib.Path('B:/','ColibriArchive',hyphonateDate(obsdate),'done.txt')
        
        # Wait until processing is done, if processing has started
        while not (path_RED.is_file() == path_RED.parent.is_dir()) or \
                not (path_BLUE.is_file() == path_BLUE.parent.is_dir()):

            red_stop_exists = (path_RED.is_file() == path_RED.parent.is_dir())
            blue_stop_exists = (path_BLUE.is_file() == path_BLUE.parent.is_dir())

            # Print status
            if (not red_stop_exists) and (not blue_stop_exists):
                print("Waiting for %s and %s..." % (path_RED, path_BLUE))
            elif not red_stop_exists:
                print("Waiting for %s..." % path_RED)
            elif not blue_stop_exists:
                print("Waiting for %s..." % path_BLUE)
            time.sleep(300)
        
        print(f"Red and Blue are ready for GREEN {obsdate} processing.")

        # This dictionary defines the *PYTHON* scripts which
        # handle the GREEN processes. To add a script, just add to this
        # dictionary. Format is {script_basename : [list_of_cml_args]}.
        GREEN1_processes =  {
                'simultaneous_occults': [f'{obsdate}'],
                'colibri_secondary': [f'-d {slashDate(obsdate)}']
                            }
        
        GREEN1_runtime = processArchive(obsdate, repro=repro, new_stop=True, **GREEN1_processes)
        tot_runtime += GREEN1_runtime

        
    # Blue-specific
    elif TELESCOPE == "BLUEBIRD":
        print(f"\n## WCS matching for {obsdate}... ##\n")

        # Wait until other telescopes are done
        path_RED   = pathlib.Path('R:/','ColibriArchive',hyphonateDate(obsdate),'done.txt')
        path_GREEN = pathlib.Path('G:/','ColibriArchive',hyphonateDate(obsdate),'done.txt')
        
        # Wait until processing is done, if processing has started
        while not (path_RED.is_file() == path_RED.parent.is_dir()) or \
                not (path_GREEN.is_file() == path_GREEN.parent.is_dir()):

            red_stop_exists = (path_RED.is_file() == path_RED.parent.is_dir())
            green_stop_exists = (path_GREEN.is_file() == path_GREEN.parent.is_dir())

            # Print status
            if (not red_stop_exists) and (not green_stop_exists):
                print("Waiting for %s and %s..." % (path_RED, path_GREEN))
            elif not red_stop_exists:
                print("Waiting for %s..." % path_RED)
            elif not green_stop_exists:
                print("Waiting for %s..." % path_GREEN)
            time.sleep(300)
        
        print(f"Red and Green are ready for BLUE {obsdate} processing.")

        # This dictionary defines the *PYTHON* scripts which
        # handle the BLUE processes. To add a script, just add to this
        # dictionary. Format is {script_basename : [list_of_cml_args]}.
        BLUE_processes =  {
                'wcsmatching': [f'{obsdate}','-m']
                            }
        
        BLUE_runtime = processArchive(obsdate, repro=True, new_stop=True, **BLUE_processes)
        tot_runtime += BLUE_runtime


##############################
## Artificial Lightcurves
##############################

    # Generate artificial lightcurves

    print(f"\n## Artificial lightcurves for {obsdate}... ##\n")

    # Check for a stop file
    gat_stop = DATA_PATH / obsdate / 'generate_specific_lightcurve.txt'
    if gat_stop.exists():
        print(f"WARNING: generate_specific_lightcurve already preformed. Skipping...")

    else:
        # If the list of artificial lightcurves has not been created, wait 5 minutes
        gat_file = ARCHIVE_PATH / hyphonateDate(obsdate) / 'generate_artificial.txt'
        print(f"Waiting for the gat_file for {obsdate}...")
        while not gat_file.exists():
            time.sleep(300)

        # Read lines from generate_artificial.txt
        print(f"## Generating artificial lightcurves for {obsdate}...")
        with open(gat_file, 'r') as gat:
            tot_gat_runtime = 0
            for line in gat.readlines():
                gat_params = line.strip('\n').split(' ') + ['-m']
                gat_runtime = runProcesses(ARCHIVE_PATH / hyphonateDate(obsdate),
                                            repro=True, new_stop=False,
                                            pipe_std=obsdate,
                                            generate_specific_lightcurve=gat_params)
                tot_gat_runtime += sum(filter(None, gat_runtime))

        # Create stop file
        gat_stop.touch()

        # Delete gat file
        #gat_file.unlink()

        # Record runtime
        tot_runtime.append(tot_gat_runtime)
                

##############################
## Cumulative Stats & Timeline
##############################       
    
    # Write when all other processes are done
    (ARCHIVE_PATH / hyphonateDate(obsdate) / 'timeline_ready.txt').touch()

    if TELESCOPE == "GREENBIRD":

        print(f"\n## Processing endgame for {obsdate}... ##\n")

        # Wait until other telescopes are done
        path_RED  = pathlib.Path('R:/','ColibriArchive',hyphonateDate(obsdate),'timeline_ready.txt')
        path_BLUE = pathlib.Path('B:/','ColibriArchive',hyphonateDate(obsdate),'timeline_ready.txt')
        
        # Wait until processing is done, if processing has started
        while not (path_RED.is_file() == path_RED.parent.is_dir()) or \
                not (path_BLUE.is_file() == path_BLUE.parent.is_dir()):
            
            red_stop_exists = (path_RED.is_file() == path_RED.parent.is_dir())
            blue_stop_exists = (path_BLUE.is_file() == path_BLUE.parent.is_dir())

            # Print status
            if (not red_stop_exists) and (not blue_stop_exists):
                print("Waiting for %s and %s..." % (path_RED, path_BLUE))
            elif not red_stop_exists:
                print("Waiting for %s..." % path_RED)
            elif not blue_stop_exists:
                print("Waiting for %s..." % path_BLUE)
            time.sleep(300)
        
        print(f"Red and Blue are ready for GREEN {obsdate} processing.")

        # Read in star-hours
        starhour_path = list(pathlib.Path('B:/','ColibriArchive',hyphonateDate(obsdate)).glob('starhours_*.txt'))
        if len(starhour_path) == 0:
            starhours = 0
        else:
            starhours = float(starhour_path[0].name.strip('.txt').strip('starhours_'))

        # This dictionary defines the *PYTHON* scripts which
        # handle the GREEN processes. To add a script, just add to this
        # dictionary. Format is {script_basename : [list_of_cml_args]}.
        end_processes =  {
                'cumulative_stats': [f'{obsdate}',f'{starhours}'],
                'timeline': [f'{obsdate}']
                            }
        
        end_runtime = processArchive(obsdate, repro=repro, new_stop=True, **end_processes)
        tot_runtime += end_runtime

        # Send status email
        sendStatusEmail(obsdate, DATA_PATH / obsdate, repro=repro, new_stop=True,
                        errors=err.errors, notes=[])


#----------------------------------main---------------------------------------#

if __name__ == '__main__':
    
##############################
## Generate Warning Window
##############################

    # Generate window
    window = tk.Tk()
    
    # Create label
    label_var = tk.StringVar()
    label_var.set('Colibri data pipeline is running! Do not run any other programs on this machine!')
    label = tk.Label(window, textvariable=label_var, font=('Arial',25))
    label.pack()
    
    # Update and show window once
    window.update_idletasks()
    window.update()


##############################
## Argument Parser Setup
##############################

    # Generate argument parser
    arg_parser = argparse.ArgumentParser(description="Automation of the Colibri data processing pipeline",
                                         formatter_class=argparse.RawTextHelpFormatter)

    # Available argument functionality
    arg_parser.add_argument('-d', '--date', help='Observation date (YYYYMMDD) of data to be processed.', nargs='*')
    arg_parser.add_argument('-r', '--repro', help='Will reprocess data if used.', action="store_true")
    arg_parser.add_argument('-s', '--sigma', help='Significance treshold.', default='6')
    arg_parser.add_argument('-t', '--test', help='Use ColibriData2 instead of ColibriData', action='store_true')
    #arg_parser.add_argument('-l', '--nolog', help='Print stderr only to screen, instead of to log.', action="store_true")


    # Process argparse list as useful variables
    cml_args = arg_parser.parse_args()

    # Standard inputs
    repro = cml_args.repro
    sigma_threshold = cml_args.sigma
    
    # If test, parse LongTermStorage instead of ColibriData
    if cml_args.test:
        DATA_PATH = BASE_PATH / 'LongTermStorage'
    
    # Get dates to process
    cleanThumbsdb()
    if cml_args.date is None:
        data_dirs = sorted(DATA_PATH.iterdir())
    elif len(cml_args.date) == 0:
        data_dirs = sorted(DATA_PATH.iterdir())
    else:
        data_dirs = [(DATA_PATH / data_date) for data_date in cml_args.date]


##############################
## Computer Synchronization
##############################

    
    # Define other computers' parent data directories
    if cml_args.test:
        pass
    elif TELESCOPE == "REDBIRD":
        other_telescopes = [Path("G:","ColibriData"), Path("B:", "ColibriData")]
    elif TELESCOPE == "GREENBIRD":
        other_telescopes = [Path("R:","ColibriData"), Path("B:", "ColibriData")]
    elif TELESCOPE == "BLUEBIRD":
        other_telescopes = [Path("R:","ColibriData"), Path("G:", "ColibriData")]

    # Change COMSPEC to point to Powershell
    os.environ['COMSPEC'] = 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'

    # Generate night directories for other telescopes if they don't exist
    for obs_date in data_dirs:
        for other_telescope in other_telescopes:
            if not (other_telescope / obs_date.name).exists():
                (other_telescope / obs_date.name).mkdir()
    
    # Wait for other telescopes to do the same as above
    # and then collect data directories again
    time.sleep(60)
    if cml_args.date is None:
        obs_dates = sorted(data_dir.name for data_dir in DATA_PATH.iterdir())
    elif len(cml_args.date) == 0:
        obs_dates = sorted(data_dir.name for data_dir in DATA_PATH.iterdir())
    else:
        obs_dates = cml_args.date

    # Total runtime
    tot_runtime = []


##############################
## Day-By-Day Processing
##############################

    # Process each date specified
    for obsdate in obs_dates:
        ColibriProcesses(obsdate, repro=repro, sigma_threshold=sigma_threshold)


##############################
## End Of Script
##############################

    print("\n#" + "-"*50 + "#\n")

    # Print total time
    print(f"Total time to process was {sum(filter(None,tot_runtime))} seconds")

    # Print errors
    if (len(err.errors) > 0) or (len(err.warnings) > 0):
        print("The following errors were encountered:")
        for error in err.errors:
            print(error)
        for warning in err.warnings:
            print(warning)

    # Write errors to log file
    today = datetime.now().strftime(OBSDATE_FORMAT)
    log_file = LOG_PATH / f'{today}_pipeline.log'
    with open(log_file, 'a') as logfile:
        logfile.write("\n" + "-"*50 +  "\n")
        logfile.write(datetime.now().strftime(NICE_FORMAT) + "\n\n")
        logfile.write(f"Total time to process was {sum(filter(None,tot_runtime))} seconds\n")
        logfile.write("The following errors were encountered:\n")
        for error in err.errors:
            logfile.write(f"+ {error} \n")
        for warning in err.warnings:
            logfile.write(f"+ {warning} \n")

    # Clean up D:/ and tmp
    cleanD()
    
    # Close tkinter window
    window.destroy()
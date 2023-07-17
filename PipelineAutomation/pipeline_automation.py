"""
Filename:   processdata.py
Author(s):  Mike Mazur, Roman Akhmetshyn, Peter Quigley
Contact:    pquigley@uwo.ca
Created:    Wed Oct 19 10:19:07 2022
Updated:    Wed Oct 19 10:19:07 2022
    
Usage: python processdata.py [-d][-p][-r][-s]
"""

# Module Imports
import os, sys, shutil
import time
import pathlib
import glob
import subprocess
import argparse
import tkinter as tk
from pathlib import Path
from datetime import datetime

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

# Timestamp format
OBSDATE_FORMAT = '%Y%m%d'
MINDIR_FORMAT  = '%Y%m%d_%H.%M.%S.%f'
TIMESTAMP_FORMAT = '%Y-%m-%dT%H:%M:%S.%f'
BARE_FORMAT = '%Y-%m-%d_%H%M%S_%f'

# GitHub Script Repository
scripts = pathlib.Path('~', 'Documents', 'GitHub', 'ColibriPipeline').expanduser()


#----------------------------------class--------------------------------------#

class ErrorTracker(object):
    """
    Indicates if any errors or warnings occured during the running of the program.
    """

    def __init__(self):

        self.errors = []


    def addError(self, error_msg):

        self.errors.append(error_msg)
        print(error_msg)

err = ErrorTracker()


#--------------------------------functions------------------------------------#

def cleanThumbsdb():
    """
    Deletes all thumbs.db files in the data directory.
    
    """

    if (DATA_PATH / 'Thumbs.db').is_dir():
        err.addError("WARNING: Thumbs.db file found in data directory!")

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
    elif (DATA_PATH / 'Thumbs.db').is_file():
        (DATA_PATH / 'Thumbs.db').unlink()


def processRawData(obsdate, repro=False, new_stop=True, **kwargs):
    """
    
    """

    # Define the raw data directory and check that the directory exists
    raw_dir = DATA_PATH / obsdate
    if not raw_dir.exists():
        err.addError(f"ERROR: No raw data found on {obsdate}! Skipping primary processing!")
        return
    
    # Collect the contents of the data directory and check that some raw data was collected
    minute_dirs = [min_dir for min_dir in raw_dir.iterdir() if min_dir.is_dir()]
    if len(minute_dirs) <= 1:
        err.addError(f"WARNING: No data found in {obsdate}! Skipping primary processing!")
        return

    # Run all processes and get the runtime as a return
    runtime = runProcesses(raw_dir, repro=False, new_stop=True, **kwargs)
    print("\n" + "#"*30 + f"\nAll processes on raw data are complete for {obsdate}!\n" + "#"*30 + "\n")
    return runtime

    

def proceessArchive(obsdate, repro=False, new_stop=True, **kwargs):
    """
    
    """

    # Track the runtime of the subprocesses
    runtime = []

    # Define the raw data directory and check that the directory exists
    raw_dir = DATA_PATH / obsdate
    archive_dir = ARCHIVE_PATH / hyphonateDate(obsdate)
    if not raw_dir.exists():
        err.addError(f"WARNING: No raw data found on {obsdate}.")
        raw_dir.mkdir()
    if not archive_dir.exists():
        err.addError(f"WARNING: No archive directory found on {obsdate}.")
        archive_dir.mkdir()
    
    # Run all processes and get the runtime as a return
    runtime = runProcesses(raw_dir, repro=False, new_stop=True, **kwargs)
    print("\n" + "#"*30 + f"\nAll secondary processes are complete for {obsdate}!\n" + "#"*30 + "\n")
    return runtime


def runProcesses(stopfile_dir, repro=False, new_stop=True, **kwargs):
    """
    
    """

    # Track the runtime of the subprocesses
    runtime = []

    # Loop through kwargs to get processes and arguments
    # Kwarg format: {'processname' : [list_of_cml_args]}
    for process,cml_args in kwargs.items():
        stop_file = process + '.txt'
        if (stopfile_dir / stop_file).exists() and (repro is False):
            print(f"WARNING: {process} already preformed. Skipping...")
            continue

        # Run the process with appropriate command-line arguments
        t_start = time.time()
        try:
            print(f"Initializing subprocess {process + '.py'}...")
            subp = subprocess.run(['python', scripts / (process + '.py'), *cml_args])

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
                    sfile.write(f'python {process}.py {cml_args}')

        # If subprocess fails, skip the pipeline
        except Exception as Argument:
            err.addError(f"ERROR: {process + '.py'} failed with error {Argument}! Skipping...")

        # Record the runtime of the subprocess
        runtime.append(time.time() - t_start)

    # Return the runtime of the subprocess once all subprocesses have completed
    return runtime


def hyphonateDate(obsdate):

    # Convert the date to a datetime object
    obsdate = datetime.strptime(obsdate, OBSDATE_FORMAT)

    # Convert the date to a hyphonated string
    obsdate = obsdate.strftime('%Y-%m-%d')

    return obsdate

def slashDate(obsdate):

    # Convert the date to a datetime object
    obsdate = datetime.strptime(obsdate, OBSDATE_FORMAT)

    # Convert the date to a hyphonated string
    obsdate = obsdate.strftime('%Y/%m/%d')

    return obsdate


#-----------------------------------main--------------------------------------#

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

    # Define computer name for computer specific processes
    telescope = os.environ['COMPUTERNAME']
    
    # Define other computers' parent data directories
    if cml_args.test:
        pass
    elif telescope == "REDBIRD":
        other_telescopes = [Path("G:","ColibriData"), Path("B:", "ColibriData")]
    elif telescope == "GREENBIRD":
        other_telescopes = [Path("R:","ColibriData"), Path("B:", "ColibriData")]
    elif telescope == "BLUEBIRD":
        other_telescopes = [Path("R:","ColibriData"), Path("G:", "ColibriData")]

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
## Raw Data Processing
##############################

    # Run subprocess over all dates in the specified list
    for obsdate in obs_dates:
        print(f"## Processing raw data from {obsdate}...")

        # This dictionary defines the *PYTHON* scripts which
        # handle the raw data. To add a script, just add to this
        # dictionary. Format is {script_basename : [list_of_cml_args]}.
        raw_processes = {
                'colibri_main_py3': ['d:\\', slashDate(obsdate), f'-s {sigma_threshold}'],
                'coordsfinder': [f'-d {slashDate(obsdate)}'],
                'image_stats_bias': [f'-d {slashDate(obsdate)}'],
                'sensitivity': [f'-d {slashDate(obsdate)}']
                        }
        
        raw_runtime = processRawData(obsdate, repro=repro, new_stop=True, **raw_processes)
        tot_runtime.append(raw_runtime)

##############################
## Archival Data Processing
##############################

    # Run subprocess over all dates in the specified list
    for obsdate in obs_dates:
        print(f"## Processing archival data from {obsdate}...")

        # This dictionary defines the *PYTHON* scripts which
        # handle the archival data. To add a script, just add to this
        # dictionary. Format is {script_basename : [list_of_cml_args]}.
        archive_processes = {
                'wcsmatching': [f'{obsdate}']
                            }
        
        archive_runtime = processRawData(obsdate, repro=repro, new_stop=True, **archive_processes)
        tot_runtime.append(archive_runtime)

##############################
## Split-Responsibility Processing
##############################

    ## Here we must split the responsibilities between telescopes

    # Green-specific
    if telescope == "GREENBIRD":
        print(f"Beginning phase1 of GREENBIRD-only processes...")

        for obsdate in obs_dates:
            print(f"## Processing {obsdate}...")

            # Wait until other telescopes are done
            path_RED  = pathlib.Path('R:/','ColibriArchive',hyphonateDate(obsdate),'done.txt')
            path_BLUE = pathlib.Path('B:/','ColibriArchive',hyphonateDate(obsdate),'done.txt')
            
            # Wait until processing is done, if processing has started
            while not (path_RED.is_file() == path_RED.parent.is_dir()) or \
                    not (path_BLUE.is_file() == path_BLUE.parent.is_dir()):
                print("Waiting for %s and %s..." % (path_RED, path_BLUE))
                time.sleep(300)
            
            print(f"Red and Blue are ready for GREEN {obsdate} processing.")

            # This dictionary defines the *PYTHON* scripts which
            # handle the GREEN processes. To add a script, just add to this
            # dictionary. Format is {script_basename : [list_of_cml_args]}.
            GREEN1_processes =  {
                    'simultaneous_occults': [f'{obsdate}'],
                    'colibri_secondary': ['-b d:\\',f'-d {hyphonateDate(obsdate)}']
                                }
            
            GREEN1_runtime = processRawData(obsdate, repro=repro, new_stop=True, **GREEN1_processes)
            tot_runtime.append(GREEN1_runtime)

    # Blue-specific
    if telescope == "BLUEBIRD":
        print(f"Beginning BLUEBIRD-only processes...")

        for obsdate in obs_dates:
            print(f"## Processing {obsdate}...")

            # Wait until other telescopes are done
            path_RED   = pathlib.Path('R:/','ColibriArchive',hyphonateDate(obsdate),'done.txt')
            path_GREEN = pathlib.Path('G:/','ColibriArchive',hyphonateDate(obsdate),'done.txt')
            
            # Wait until processing is done, if processing has started
            while not (path_RED.is_file() == path_RED.parent.is_dir()) or \
                    not (path_BLUE.is_file() == path_BLUE.parent.is_dir()):
                print("Waiting for %s and %s..." % (path_RED, path_BLUE))
                time.sleep(300)
            
            print(f"Red and Green are ready for BLUE {obsdate} processing.")

            # This dictionary defines the *PYTHON* scripts which
            # handle the BLUE processes. To add a script, just add to this
            # dictionary. Format is {script_basename : [list_of_cml_args]}.
            BLUE_processes =  {
                    'wcsmatching': [f'{obsdate}','-m']
                              }
            
            BLUE_runtime = processRawData(obsdate, repro=repro, new_stop=True, **GREEN1_processes)
            tot_runtime.append(BLUE_runtime)


##############################
## Artificial Lightcurves
##############################

    # Generate artificial lightcurves
    for obsdate in obs_dates:
    
        # If the list of artificial lightcurves has not been created, wait 5 minutes
        gat_file = ARCHIVE_PATH / hyphonateDate(obsdate) / 'generate_artificial.txt'
        while not gat_file.exists():
            time.sleep(300)
        
        
        # Read lines from generate_artificial.txt
        with open(gat_file, 'r') as gat:
            gat_runtime = 0
            for line in gat.readlines():
                gat_runtime += runProcesses(ARCHIVE_PATH / hyphonateDate(obsdate), new_stop=False,
                                            generate_specific_lightcurve=line.strip('\n').split(' '))

        # Delete gat file
        gat_file.unlink()

        # Record runtime
        tot_runtime.append(gat_runtime)
                

##############################
## Cumulative Stats & Timeline
##############################       
    
    # Write when all other processes are done
    for obsdate in obs_dates:
        (ARCHIVE_PATH / hyphonateDate(obsdate) / 'timeline_ready.txt').touch()

    if telescope == "GREENBIRD":
        print(f"Beginning end-of-pipeline processes...")

        for obsdate in obs_dates:
            print(f"## Processing {obsdate}...")

            # Wait until other telescopes are done
            path_RED  = pathlib.Path('R:/','ColibriArchive',hyphonateDate(obsdate),'timeline_ready.txt')
            path_BLUE = pathlib.Path('B:/','ColibriArchive',hyphonateDate(obsdate),'timeline_ready.txt')
            
            # Wait until processing is done, if processing has started
            while not (path_RED.is_file() == path_RED.parent.is_dir()) or \
                    not (path_BLUE.is_file() == path_BLUE.parent.is_dir()):
                print("Waiting for %s and %s..." % (path_RED, path_BLUE))
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
            
            end_runtime = processRawData(obsdate, repro=repro, new_stop=True, **end_processes)
            tot_runtime.append(end_runtime)


##############################
## End Of Script
##############################

    print("#" + "-"*50 + "#")

    # Print total time
    print(f"Total time to process was {sum(tot_runtime)} seconds")

    # Print errors
    if len(err.errors) > 0:
        print("The following errors were encountered:")
        for error in err.errors:
            print(error)
    
    # Close tkinter window
    window.destroy()
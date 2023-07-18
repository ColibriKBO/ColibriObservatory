"""
Filename:   clean_stopfiles.py
Author(s):  Peter Quigley
Contact:    pquigley@uwo.ca
Created:    Mon Jul 17 2023 23:42
Updated:    Mon Jul 17 2023 23:42
    
Usage: python clean_stopfiles.py <stopfile1> <stopfile2> ... <stopfileN>
"""

# Module Imports
import os, sys
import argparse
import pathlib

#-------------------------------global vars-----------------------------------#

# Path variables
BASE_PATH = pathlib.Path('D:/')
DATA_PATH = BASE_PATH / 'ColibriData'


#--------------------------------functions------------------------------------#

def removeStopFile(stopfile_names):
    """
    Walk through all data directories and remove the stopfile from each.
    
    Args:
        stopfile_name (list): List of stopfile names to remove.
    
    Returns:
        None
    
    """

    # Walk through all data subdirectories
    for subdir in DATA_PATH.iterdir():
        if subdir.is_dir():
            # Walk through all files in the subdirectory
            for file in subdir.iterdir():
                if file.is_file():
                    # If the file is one of the stopfile, remove it
                    if file.name in stopfile_names:
                        file.unlink()
                        print(f'Removed {file.name} from {subdir.name}.')

#----------------------------------main---------------------------------------#

if __name__ == '__main__':
    # Parse command line arguments
    parser = argparse.ArgumentParser()
    parser.add_argument('stopfile_names', nargs='+', help='Stopfile names to remove.')
    args = parser.parse_args()

    # Remove the stopfiles
    removeStopFile(args.stopfile_names)
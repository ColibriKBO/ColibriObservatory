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
import datetime
import glob
import subprocess
import argparse
import tkinter as tk
from pathlib import Path

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


#--------------------------------functions------------------------------------#


def subprocessLoop(dir_list,subprocess_list,stop_file,
                   repro=False,new_stop=True,check_others=False):
    """
    Run a subprocess using the subprocess model iterating through the available
    observation data directories.

    Args:
        dir_list (list): Generator object of data files
        subprocess_list (list): List to be passed to subprocess.run. Will
                                replace "obsYMD" with appropriate variable.
        stop_file (str): Filename of file indicating data has already been
                         processed

        repro (bool, optional): Boolean indicating if previously processed data
                                should be reprocessed
        new_stop (bool, optional): Boolean indicating if a new stop file should
                                   be written after running the subprocess
        check_others (bool,optional): Boolean indicating if it should check if
                                      RED and BLUE are done processing

    Returns:
        runtime (float): Time to run the subprocess

    """
    
    # Begin timing module here
    starttime = time.time()
    
    
    # Walk through the directories and find those with less than n files and
    # remove them. Check all of the files in the remainining directories to
    # ensure that all files are the right size.
    for d in dir_list:
        dirsplit = os.path.split(d)

        # Sanitize directories to be analyzed
        if len(dirsplit[1]) == 0:
            print('Root directory excluded')
        elif dirsplit[-1] == 'ColibriData':
            print('ColibriData directory excluded')
        elif dirsplit[-1] == 'Dark':
            print('Dark directory excluded')
        elif dirsplit[0].split('\\')[-1] == 'Dark':
            print('Dark subdirectory excluded.')
            
        # Found valid data directory
        else:
            # Data already processed
            if os.path.isfile(os.path.join(d,stop_file)) and repro == False:
                print(f"{stop_file} already found in {d}")
            
            # Data not processed or reprocess requested
            else:
                print(f"Starting 1st stage on: {d}")
                
                # Get data observation date
                basepath = pathlib.Path('d:')
                dirdaytime = dirsplit[1]
                obsyear = int(dirdaytime[:4])
                obsmonth = str(dirdaytime[4:6])
                obsday = str(dirdaytime[6:8])
                obsYMD = str('%s/%s/%s' % (obsyear, obsmonth, obsday))
                subp_list = [item.replace("obsYMD",obsYMD) for item in subprocess_list]
                
                # If this is a Green-exclusive process, wait for Red and Blue to finish
                if check_others == True:
                    path_RED  = pathlib.Path('R:/','ColibriArchive',obsYMD.replace('/','-'),'done.txt')
                    path_BLUE = pathlib.Path('B:/','ColibriArchive',obsYMD.replace('/','-'),'done.txt')
                    
                    # Wait until processing is done, if processing has started
                    while not (path_RED.is_file() == path_RED.parent.is_dir()) or \
                          not (path_BLUE.is_file() == path_BLUE.parent.is_dir()):
                        print("Waiting for %s and %s..." % (path_RED, path_BLUE))
                        time.sleep(300)
                    
                    print("Red and Blue are ready.")
                
                # Run subprocess and write a new stop file if requested
                try:
                    subp = subprocess.run(subp_list)
                    
                    try:
                        while subp.poll() is None:
                            print('.', end='', flush=True)
                            time.sleep(10)
                    except AttributeError:
                        pass
                        
                    if new_stop:
                        with open(os.path.join(d,stop_file),'w') as sf:
                            # Note that this requires sigma_threshold to be a
                            # global, defined variable
                            
                            print(f"Saving {stop_file} to {os.path.join(d,stop_file)}.")
                            sf.write(f"base_path: {str(basepath)}\n")
                            sf.write(f"obs_date: {obsyear}{obsmonth}{obsday}\n")
                            sf.write(f"process_date: {process_date}\n")
                            sf.write("run_par: True\n")
                            sf.write(f"sigma_threshold: {sigma_threshold}\n")
                            
                        print(f"Wrote {stop_file} to {d}")
                        
                except Exception as Argument:
                    print(f"Error occurred running {subprocess_list[1]}!")
                    
                    with open(os.path.join("d:","Logs","Pipeline",f"{process_date}.txt"), "a") as err:
                        err.write(f"Error occurred running {subprocess_list[1]}!")
                        err.write(str(Argument)+'\n')
    
    print("")
    return time.time()-starttime



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

    telescope = os.environ['COMPUTERNAME']
    
    # Generate argument parser
    arg_parser = argparse.ArgumentParser(description="Automation of the Colibri data processing pipeline",
                                         formatter_class=argparse.RawTextHelpFormatter)

    # Available argument functionality
    arg_parser.add_argument('-d', '--date', help='Observation date (YYYY/MM/DD) of data to be processed.', default='All')
    arg_parser.add_argument('-p', '--procdate', help='Processing date (YYYY/MM/DD).', default=str(datetime.datetime.today().strftime('%Y/%m/%d')))
    arg_parser.add_argument('-r', '--repro', help='Will reprocess data if used.', action="store_true")
    arg_parser.add_argument('-s', '--sigma', help='Significance treshold.', default='6')
    arg_parser.add_argument('-t', '--test', help='Use ColibriData2 instead of ColibriData', action='store_true')
    #arg_parser.add_argument('-l', '--nolog', help='Print stderr only to screen, instead of to log.', action="store_true")


    # Process argparse list as useful variables
    cml_args = arg_parser.parse_args()

    obsYYYYMMDD = cml_args.date
    process_date = (cml_args.procdate).replace('/','-')
    repro = cml_args.repro
    sigma_threshold = cml_args.sigma
    
    if cml_args.date == 'All':
        datadir = 'd:\\ColibriData\\'
    elif cml_args.test:
        datadir = 'd:\\LongTermStorage\\'
    else:
        obs_date = obsYYYYMMDD.split('/')[0] + obsYYYYMMDD.split('/')[1] + obsYYYYMMDD.split('/')[2]
        datadir = 'd:\\ColibriData\\' + obs_date + '\\'

    # GitHub Script Repository
    scripts = pathlib.Path('~', 'Documents', 'GitHub', 'ColibriPipeline', 'ColibriPipeline').expanduser()

    # Timing array
    t = []


##############################
## Directory/File Cleanup
##############################
    starttime = time.time()

    # Count of removed files/folders
    bad_dirs  = 0
    bad_files = 0

    # Walk through the directories and find those with less than n files and remove them.
    # Check all of the files in the remainining directories to ensure that all files are the right size.
    for root, dirs, files in os.walk(datadir):
        
        if root != datadir and os.path.split(root)[-1] != 'Dark' and len(os.path.split(root)[-1]) != 8:
            if is_dir_too_small(root, 9):
                #print('Dir is too small')
                print('Removing directory %s' % root)
                shutil.rmtree(root)
                bad_dirs += 1
            else:
                # for f in os.listdir(root):
                for f in glob.iglob(root + '**/*.rcd', recursive=True):
                    if os.path.getsize(os.path.join(root,f)) < (12 * 1024 - 1):
                        print('Removing file %s' % f)
                        os.remove(f)
                        bad_files += 1

    # Create generator object of the surviving data directories
    dirlist = [ f.path for f in os.scandir(datadir) if f.is_dir() ]

    print(f"{bad_dirs} directories removed for being too small")
    print(f"{bad_files} removed for being too small")
    
    t.append(time.time()-starttime)
    print(f"Completed data preparation in {t0} seconds",file=sys.stderr)


##############################
## Primary Pipeline (Initial Dip Detection & Star Finding)
##############################

    print("\nStarting 1st stage processing...")

    # Run primary pipeline
    pipeline1_program = str(scripts / 'colibri_main_py3.py')
    pipeline1_list = ['python', pipeline1_program, 'd:\\', 'obsYMD', f"-s {sigma_threshold}"]
    process_time = subprocessLoop(dirlist,pipeline1_list,'1process.txt',repro=repro,new_stop=False)
    t.append(process_time)

    # Get star coordinates
    starfinder_program = str(scripts / 'coordsfinder.py')
    starfinder_list = ['python', starfinder_program, '-d obsYMD']
    process_time = subprocessLoop(dirlist,starfinder_list,'1process.txt',repro=repro)
    t.append(process_time)

    print(f"Completed 1st stage data processing in {sum(t)} seconds",file=sys.stderr)

    # Run wcsmapping for all
        

##############################
## Dark & Sensitivity Calculations
##############################

    # Run image bias stat calculations
    print('\nStarting bias stat calculations...')

    biasstat_program = str(scripts / 'image_stats_bias.py')
    biasstat_list = ['python', biasstat_program, '-d obsYMD']
    process_time = subprocessLoop(dirlist,biasstat_list,'biasprocess.txt',repro=repro)
    t.append(process_time)
    print(f"Completed bias image stats in {process_time} seconds",file=sys.stderr)
    
    # Run sensitivity calculations
    print('\nStarting sensitivity calculations...')

    sensitivity_program = str(scripts / 'sensitivity.py')
    sensitivity_list = ['python', sensitivity_program,  '-d obsYMD']
    process_time = subprocessLoop(dirlist,sensitivity_list,'sensitivity.txt',repro=repro)
    t.append(process_time)
    print(f"Completed sensitivity calculation in {process_time} seconds",file=sys.stderr)


##############################
##  GREENBIRD Exclusive Processes:
##  Secondary Pipeline (Simultaneous Occultations)
##  Tertiary Pipeline
##############################
    
    if telescope=="GREENBIRD":
        
        # Run secondary pipeline
        print('\nStarting 2nd stage processing...')
        
        pipeline2_program = str(scripts / 'simultaneous_occults.py')
        pipeline2_list = ['python', pipeline2_program, '-d obsYMD']
        process_time = subprocessLoop(dirlist,pipeline2_list,'2process.txt',repro=repro,check_others=True)
        t.append(process_time)
        print(f"Completed 2nd stage data processing in {process_time} seconds",file=sys.stderr)
        
        # Run tertiary pipeline
        print('\nStarting 3rd stage processing...')
        
        pipeline3_program = str(scripts / 'colibri_secondary.py')
        pipeline3_list = ['python', pipeline3_program, '-b d:\\', '-d obsYMD']
        process_time = subprocessLoop(dirlist,pipeline3_list,'3process.txt',repro=repro)
        t.append(process_time)
        print(f"Completed 3nd stage data processing in {process_time} seconds",file=sys.stderr)

        # Run timeline generator
        print('\nStarting timeline generation...')

        timeline_program = str(scripts / 'timeline.py')
        timeline_list = ['python', timeline_program, '-d obsYMD']
        process_time = subprocessLoop(dirlist,timeline_list,'timeline.txt',repro=repro)
        t.append(process_time)
        print(f"Completed timeline in {process_time} seconds",file=sys.stderr)


##############################
## End Of Script
##############################

    # Print total time
    print(f"Total time to process was {sum(t)} seconds")
    
    # Close tkinter window
    window.destroy()
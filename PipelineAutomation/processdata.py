import os, sys, shutil
import time
import pathlib
import datetime
import glob
import subprocess
import argparse
import tkinter as tk

from pathlib import Path
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

if __name__ == '__main__':

    
##############################
## Generate Warning Window
##############################

    ## Generate window
    window = tk.Tk()
    
    ## Create label
    label_var = tk.StringVar()
    label_var.set('Colibri data pipeline is running! Do not run any other programs on this machine!')
    label = tk.Label(window, textvariable=label_var, font=('Arial',25))
    label.pack()
    
    ## Update and show window once
    window.update_idletasks()
    window.update()


##############################
## Argument Parser Setup
##############################

    telescope = os.environ['COMPUTERNAME']
    
    ## Generate argument parser
    arg_parser = argparse.ArgumentParser(description="Automation of the Colibri data processing pipeline",
                                         formatter_class=argparse.RawTextHelpFormatter)

    ## Available argument functionality
    arg_parser.add_argument('-d', '--date', help='Observation date (YYYY/MM/DD) of data to be processed.', default='All')
    arg_parser.add_argument('-p', '--procdate', help='Processing date (YYYY/MM/DD).', default=str(datetime.datetime.today().strftime('%Y/%m/%d')))
    arg_parser.add_argument('-r', '--repro', help='Will reprocess data if used.', action="store_true")
    arg_parser.add_argument('-s', '--sigma', help='Significance treshold.', default='6') #10-05 Roman A
    #arg_parser.add_argument('-l', '--nolog', help='Print stderr only to screen, instead of to log.', action="store_true")


    ## Process argparse list as useful variables
    cml_args = arg_parser.parse_args()

    obsYYYYMMDD = cml_args.date
    process_date = cml_args.procdate
    repro = cml_args.repro
    sigma_threshold = cml_args.sigma
    
    if cml_args.date == 'All':
        datadir = 'd:\\ColibriData\\'
    else:
        obs_date = obsYYYYMMDD.split('/')[0] + obsYYYYMMDD.split('/')[1] + obsYYYYMMDD.split('/')[2]
        datadir = 'd:\\ColibriData\\' + obs_date + '\\'


##############################
## Directory/File Cleanup
##############################
    starttime = time.time()

    ## Count of removed files/folders
    bad_dirs  = 0
    bad_files = 0

    ## Walk through the directories and find those with less than n files and remove them.
    ## Check all of the files in the remainining directories to ensure that all files are the right size.
    for root, dirs, files in os.walk(datadir):
        
        if root != datadir and os.path.split(root)[-1] != 'Bias' and len(os.path.split(root)[-1]) != 8:
            if is_dir_too_small(root, 30):
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


    print(f"{bad_dirs} directories removed for being too small")
    print(f"{bad_files} removed for being too small")
    print(f"Completed data preparation in {time.time()-starttime} seconds\n",file=sys.stderr)


##############################
## Primary Pipeline (Initial Dip Detection)
##############################
    print("Starting 1st stage processing...")
    starttime = time.time()

    ## Create generator object of the data directory subdirectories
    dirlist = [ f.path for f in os.scandir(datadir) if f.is_dir() ]

    ## Loop through all subdirectories in the data directory an analyze only
    ## those with unprocessed data (unless reproc == True)
    for d in dirlist:
        dirsplit = os.path.split(d)

        # Sanitize directories to be analyzed
        if len(dirsplit[1]) == 0:
            print('Root directory excluded')
        elif dirsplit[-1] == 'ColibriData':
            print('ColibriData directory excluded')
        elif dirsplit[-1] == 'Bias':
            print('Bias directory excluded')
        elif dirsplit[0].split('\\')[-1] == 'Bias':
            print('Bias subdirectory excluded.')
            
        # Found valid data directory
        else:
            # Data already processed
            if os.path.isfile(os.path.join(d, '1process.txt')) and repro == False:
                print(f"1st stage processing already complete on {d}")
                
                # print('File exisits. Opening existing file.')
                # with open(os.path.join(d, '1process.txt')) as f1:
                #   lines = f1.readlines()
                #   base_path = lines[0].strip('\n').split()[1]
                #   obsyear = int(lines[1].strip('\n').split()[1].split('/')[0])
                #   obsmonth = int(lines[1].strip('\n').split()[1].split('/')[1])
                #   obsday = int(lines[1].strip('\n').split()[1].split('/')[2])
            
            # Data not processed or reprocess requested
            else:
                print(f"Starting 1st stage on: {d}")
                
                # Get data observation date
                basepath = pathlib.Path('d:')
                dirdaytime = dirsplit[1]
                obsyear = int(dirdaytime[:4])
                obsmonth = int(dirdaytime[4:6].lstrip("0"))
                obsday = int(dirdaytime[6:8].lstrip("0"))
                obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
                
                
                # Run colibri_main_py3.py (primary pipeline)
                try:
                    p = subprocess.run(['python', os.path.expanduser('~/documents/github/colibripipeline/colibri_main_py3.py'), 'd:\\',str(obsYMD), str(sigma_threshold)])

                    while p.poll() is None:
                        print('.', end='', flush=True)
                        time.sleep(1)
                        
                    with open(os.path.join(d, '1process.txt'), 'w+') as f1:
                        f1.write(f"base_path: {str(basepath)}\n")
                        f1.write(f"obs_date: {obsyear}{obsmonth}{obsday}\n")
                        f1.write(f"sigma_threshold: {sigma_threshold}\n")
                        f1.write(f"process_data: {process_date}\n")
                        f1.write(f"run_par: True\n")
                    
                        print(f"Wrote 1process.txt to {root}")
                except:
                    print("error in the 1st stage!")
                    
                
                # Run coordsfinder.py (get star coordinates)
                print("calculating coordinates")
                try:
                    p = subprocess.run(['python', os.path.expanduser('~/documents/github/colibripipeline/coordsfinder.py'), '-d ' + str(obsYMD)])
                    while p.poll() is None:
                        print('.', end='', flush=True)
                        time.sleep(10)
                except:
                    print("error in calculating solution!")

    t1 = time.time()-starttime
    print(f"Completed 1st stage data processing in {t1} seconds",file=sys.stderr)


##############################
## Secondary Pipeline (Simultaneous Occultations)
##############################
    starttime = time.time()
    
    if telescope=="GREENBIRD":
        print('Starting 2nd stage processing...')
        
        ## Loop through all subdirectories in the data directory an analyze only
        ## those with unprocessed data (unless reproc == True)
        for d in dirlist:
            dirsplit = os.path.split(d)
    
            # Sanitize directories to be analyzed
            if len(dirsplit[1]) == 0:
                print('Root directory excluded')
            elif dirsplit[-1] == 'ColibriData':
                print('ColibriData directory excluded')
            elif dirsplit[-1] == 'Bias':
                print('Bias directory excluded')
            elif dirsplit[0].split('\\')[-1] == 'Bias':
                print('Bias subdirectory excluded.')
                
            # Found valid data directory
            else:
                # Data already processed
                if os.path.isfile(os.path.join(d, '2process.txt')) and repro == False:
                    print('2nd stage processing already complete on %s' % d)
                    # print('File exisits. Opening existing file.')
                    with open(os.path.join(d, '2process.txt')) as f1:
                        lines = f1.readlines()
                        base_path = lines[0].strip('\n').split()[1]
                        obsyear = int(lines[1].strip('\n').split()[1].split('/')[0])
                        obsmonth = int(lines[1].strip('\n').split()[1].split('/')[1])
                        obsday = int(lines[1].strip('\n').split()[1].split('/')[2])
                        obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
                        
                # Data not processed or reprocess requested
                else:
                    basepath = pathlib.Path('d:')
                    dirdaytime = dirsplit[1]
                    obsyear = int(dirdaytime[:4])
                    obsmonth = int(dirdaytime[4:6].lstrip("0"))
                    obsday = int(dirdaytime[6:8].lstrip("0"))
                    obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
                    path1=pathlib.Path('/','Y:','/'+obsYMD.replace('/','-'),'REDBIRD_done.txt')
                    path2=pathlib.Path('/','Z:','/'+obsYMD.replace('/','-'),'BLUEBIRD_done.txt')
        
                    # Check that Red and Blue are finished
                    while not (path1.is_file() and path2.is_file()):
                        print('Waiting for Red and Blue...')
                        time.sleep(300)
                        
                    print('Starting 2st stage on: %s' % d)
                    try:
                        p = subprocess.run(['python', os.path.expanduser('~/documents/github/colibripipeline/simultaneous_occults.py'), '-d ' + str(obsYMD)])
    
                        while p.poll() is None:
                            print('.', end='', flush=True)
                            time.sleep(10)

                        with open(os.path.join(d, '2process.txt'), 'w+') as f1:
                            f1.write('base_path: %s\n' % str(basepath))
                            f1.write('obs_date: %s/%s/%s\n' % (obsyear, obsmonth, obsday))
                            # f1.write('process_date: %s/%s/%s\n' % (procyear, procmonth, procday))
                            f1.write('process_date: %s\n' % process_date)
                            f1.write('run_par: True\n')
                    except:
                        print("error in the 2st stage!")
    

    
        print('Finished 2nd stage processing.')
        t2 = time.time()-starttime
        
        
##############################
## Tertiary Pipeline 
##############################
        starttime = time.time()
        
        print('Starting 3rd stage processing...')
        for d in dirlist:
            dirsplit = os.path.split(d)
    
            if len(dirsplit[1]) == 0:
                print('Root directory excluded')
            elif dirsplit[-1] == 'ColibriData':
                print('ColibriData directory excluded')
            elif dirsplit[-1] == 'Bias':
                print('Bias directory excluded')
            elif dirsplit[0].split('\\')[-1] == 'Bias':
                print('Bias subdirectory excluded.')
            else:
                if os.path.isfile(os.path.join(d, '3process.txt')) and repro == False:
                    print('3rd stage processing already complete on %s' % d)
                    # print('File exisits. Opening existing file.')
                    with open(os.path.join(d, '3process.txt')) as f1:
                        lines = f1.readlines()
                        base_path = lines[0].strip('\n').split()[1]
                        obsyear = int(lines[1].strip('\n').split()[1].split('/')[0])
                        obsmonth = int(lines[1].strip('\n').split()[1].split('/')[1])
                        obsday = int(lines[1].strip('\n').split()[1].split('/')[2])
                        obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
                else:
                    basepath = pathlib.Path('d:')
                    dirdaytime = dirsplit[1]
                    obsyear = int(dirdaytime[:4])
                    obsmonth = int(dirdaytime[4:6].lstrip("0"))
                    obsday = int(dirdaytime[6:8].lstrip("0"))
                    obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
    
                    # Run colibri_main_py3.py
                    print('Starting 3rd stage on: %s' % d)
                    try:
                        p = subprocess.run(['python', os.path.expanduser('~/documents/github/colibripipeline//colibri_secondary.py'), '-b'+'d:\\', '-d' + str(obsYMD)])
    
                        while p.poll() is None:
                            print('.', end='', flush=True)
                            time.sleep(1)
                    except:
                        print("error in the 3rd stage!")
    
                    with open(os.path.join(d, '3process.txt'), 'w+') as f1:
                        f1.write('base_path: %s\n' % str(basepath))
                        f1.write('obs_date: %s/%s/%s\n' % (obsyear, obsmonth, obsday))
                        # f1.write('process_date: %s/%s/%s\n' % (procyear, procmonth, procday))
                        f1.write('process_date: %s\n' % process_date)
                        f1.write('run_par: True\n')
    
                    print('Finished 3rd stage processing.')
    
        t3 = time.time()-starttime
        
        print('Completed 2nd stage data processing in  %s seconds' % (t2-t1))
        print('Completed 3nd stage data processing in  %s seconds' % (t3-t2))
        
        
            ###### Step 4... ######
        print('Calculating bias stats...')
        for d in dirlist:
                dirsplit = os.path.split(d)
        
                if len(dirsplit[1]) == 0:
                    print('Root directory excluded')
                elif dirsplit[-1] == 'ColibriData':
                    print('ColibriData directory excluded')
                elif dirsplit[-1] == 'Bias':
                    print('Bias directory excluded')
                elif dirsplit[0].split('\\')[-1] == 'Bias':
                    print('Bias subdirectory excluded.')
                else:
                    if os.path.isfile(os.path.join(d, 'biasprocess.txt')) and repro == False:
                        biasdone = True
                        print('bias processing already complete on %s' % d)
                        # print('File exisits. Opening existing file.')
                        with open(os.path.join(d, 'biasprocess.txt')) as f1:
                            lines = f1.readlines()
                            base_path = lines[0].strip('\n').split()[1]
                            obsyear = int(lines[1].strip('\n').split()[1].split('/')[0])
                            obsmonth = int(lines[1].strip('\n').split()[1].split('/')[1])
                            obsday = int(lines[1].strip('\n').split()[1].split('/')[2])
                            obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
                    else:
                        biasdone = False
                        basepath = pathlib.Path('d:')
                        dirdaytime = dirsplit[1]
                        obsyear = int(dirdaytime[:4])
                        obsmonth = int(dirdaytime[4:6].lstrip("0"))
                        obsday = int(dirdaytime[6:8].lstrip("0"))
                        obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
        
                    if biasdone == True:
                        pass
                    else:
                        # Run colibri_main_py3.py
                        print('Starting bias stage on: %s' % d)
                        try:
                            p = subprocess.run(['python', os.path.expanduser('~/documents/github/colibripipeline/image_stats_bias.py'), '-b'+'d:\\', '-d' + str(obsYMD)])
                            #print('step 3')
                            while p.poll() is None:
                                print('.', end='', flush=True)
                                time.sleep(1)
                        except:
                            print("error in the bias calculation stage!")
                        with open(os.path.join(d, 'biasprocess.txt'), 'w+') as f1:
                            f1.write('base_path: %s\n' % str(basepath))
                            f1.write('obs_date: %s/%s/%s\n' % (obsyear, obsmonth, obsday))
                            # f1.write('process_date: %s/%s/%s\n' % (procyear, procmonth, procday))
                            f1.write('process_date: %s\n' % process_date)
                            f1.write('run_par: True\n')
        
        t4 = time.time()-starttime
        
            ###### Step 5... ######
        print('Calculating sensitivity...')
        for d in dirlist:
                dirsplit = os.path.split(d)
        
                if len(dirsplit[1]) == 0:
                    print('Root directory excluded')
                elif dirsplit[-1] == 'ColibriData':
                    print('ColibriData directory excluded')
                elif dirsplit[-1] == 'Bias':
                    print('Bias directory excluded')
                elif dirsplit[0].split('\\')[-1] == 'Bias':
                    print('Bias subdirectory excluded.')
                else:
                    if os.path.isfile(os.path.join(d, 'sensitivity.txt')) and repro == False:
                        biasdone = True
                        print('sensitivity processing already complete on %s' % d)
                        # print('File exisits. Opening existing file.')
                        with open(os.path.join(d, 'sensitivity.txt')) as f1:
                            lines = f1.readlines()
                            base_path = lines[0].strip('\n').split()[1]
                            obsyear = int(lines[1].strip('\n').split()[1].split('/')[0])
                            obsmonth = int(lines[1].strip('\n').split()[1].split('/')[1])
                            obsday = int(lines[1].strip('\n').split()[1].split('/')[2])
                            obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
                    else:
                        biasdone = False
                        basepath = pathlib.Path('d:')
                        dirdaytime = dirsplit[1]
                        obsyear = int(dirdaytime[:4])
                        obsmonth = int(dirdaytime[4:6].lstrip("0"))
                        obsday = int(dirdaytime[6:8].lstrip("0"))
                        obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
        
                    if biasdone == True:
                        pass
                    else:
                        # Run colibri_main_py3.py
                        print('Starting sensitivity stage on: %s' % d)
                        try:
                            p = subprocess.run(['python', os.path.expanduser('~/documents/github/colibripipeline/sensitivity.py'),  '-d' + str(obsYMD)])
                            #print('step 3')
                            while p.poll() is None:
                                print('.', end='', flush=True)
                                time.sleep(1)
                        except:
                            print("error in the sensitivity calculation stage!")
                        with open(os.path.join(d, 'sensitivity.txt'), 'w+') as f1:
                            f1.write('base_path: %s\n' % str(basepath))
                            f1.write('obs_date: %s/%s/%s\n' % (obsyear, obsmonth, obsday))
                            # f1.write('process_date: %s/%s/%s\n' % (procyear, procmonth, procday))
                            f1.write('process_date: %s\n' % process_date)
                            f1.write('run_par: True\n')
        t5 = time.time()-starttime
    
    
        
        print('Completed sensitivity in %s seconds' % (t5-t4))
        
        
        print('Completed bias image stats in %s seconds' % (t4-t3))
        print('Total time to process was %s seconds' % (t5))
        
    

    else:
        print('Completed 1st stage data processing in %s seconds' % t1)

            ###### Step 4... ######
        print('Calculating bias stats...')
        for d in dirlist:
                dirsplit = os.path.split(d)
        
                if len(dirsplit[1]) == 0:
                    print('Root directory excluded')
                elif dirsplit[-1] == 'ColibriData':
                    print('ColibriData directory excluded')
                elif dirsplit[-1] == 'Bias':
                    print('Bias directory excluded')
                elif dirsplit[0].split('\\')[-1] == 'Bias':
                    print('Bias subdirectory excluded.')
                else:
                    if os.path.isfile(os.path.join(d, 'biasprocess.txt')) and repro == False:
                        biasdone = True
                        print('bias processing already complete on %s' % d)
                        # print('File exisits. Opening existing file.')
                        with open(os.path.join(d, 'biasprocess.txt')) as f1:
                            lines = f1.readlines()
                            base_path = lines[0].strip('\n').split()[1]
                            obsyear = int(lines[1].strip('\n').split()[1].split('/')[0])
                            obsmonth = int(lines[1].strip('\n').split()[1].split('/')[1])
                            obsday = int(lines[1].strip('\n').split()[1].split('/')[2])
                            obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
                    else:
                        biasdone = False
                        basepath = pathlib.Path('d:')
                        dirdaytime = dirsplit[1]
                        obsyear = int(dirdaytime[:4])
                        obsmonth = int(dirdaytime[4:6].lstrip("0"))
                        obsday = int(dirdaytime[6:8].lstrip("0"))
                        obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
        
                    if biasdone == True:
                        pass
                    else:
                        # Run colibri_main_py3.py
                        print('Starting bias stage on: %s' % d)
                        try:
                            p = subprocess.run(['python', os.path.expanduser('~/documents/github/colibripipeline/image_stats_bias.py'), '-b'+'d:\\', '-d' + str(obsYMD)])
                            #print('step 3')
                            while p.poll() is None:
                                print('.', end='', flush=True)
                                time.sleep(1)
                        except:
                            print("error in the bias calculation stage!")
                        with open(os.path.join(d, 'biasprocess.txt'), 'w+') as f1:
                            f1.write('base_path: %s\n' % str(basepath))
                            f1.write('obs_date: %s/%s/%s\n' % (obsyear, obsmonth, obsday))
                            # f1.write('process_date: %s/%s/%s\n' % (procyear, procmonth, procday))
                            f1.write('process_date: %s\n' % process_date)
                            f1.write('run_par: True\n')
        t3 = time.time()-starttime
    
            ###### Step 5... ######
        print('Calculating sensitivity...')
        for d in dirlist:
                dirsplit = os.path.split(d)
        
                if len(dirsplit[1]) == 0:
                    print('Root directory excluded')
                elif dirsplit[-1] == 'ColibriData':
                    print('ColibriData directory excluded')
                elif dirsplit[-1] == 'Bias':
                    print('Bias directory excluded')
                elif dirsplit[0].split('\\')[-1] == 'Bias':
                    print('Bias subdirectory excluded.')
                else:
                    if os.path.isfile(os.path.join(d, 'sensitivity.txt')) and repro == False:
                        biasdone = True
                        print('sensitivity processing already complete on %s' % d)
                        # print('File exisits. Opening existing file.')
                        with open(os.path.join(d, 'sensitivity.txt')) as f1:
                            lines = f1.readlines()
                            base_path = lines[0].strip('\n').split()[1]
                            obsyear = int(lines[1].strip('\n').split()[1].split('/')[0])
                            obsmonth = int(lines[1].strip('\n').split()[1].split('/')[1])
                            obsday = int(lines[1].strip('\n').split()[1].split('/')[2])
                            obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
                    else:
                        biasdone = False
                        basepath = pathlib.Path('d:')
                        dirdaytime = dirsplit[1]
                        obsyear = int(dirdaytime[:4])
                        obsmonth = int(dirdaytime[4:6].lstrip("0"))
                        obsday = int(dirdaytime[6:8].lstrip("0"))
                        obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
        
                    if biasdone == True:
                        pass
                    else:
                        # Run colibri_main_py3.py
                        print('Starting sensitivity stage on: %s' % d)
                        try:
                            p = subprocess.run(['python', os.path.expanduser('~/documents/github/colibripipeline/sensitivity.py'),  '-d' + str(obsYMD)])
                            #print('step 3')
                            while p.poll() is None:
                                print('.', end='', flush=True)
                                time.sleep(1)
                        except:
                            print("error in the sensitivity calculation stage!")
                        with open(os.path.join(d, 'sensitivity.txt'), 'w+') as f1:
                            f1.write('base_path: %s\n' % str(basepath))
                            f1.write('obs_date: %s/%s/%s\n' % (obsyear, obsmonth, obsday))
                            # f1.write('process_date: %s/%s/%s\n' % (procyear, procmonth, procday))
                            f1.write('process_date: %s\n' % process_date)
                            f1.write('run_par: True\n')
        t4 = time.time()-starttime
    
    
        print('Completed bias image stats in %s seconds' % (t3-t1))
        print('Completed sensitivity in %s seconds' % (t4-t3))
        print('Total time to process was %s seconds' % (t4))

    window.destroy()
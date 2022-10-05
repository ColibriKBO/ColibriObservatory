import os, shutil
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
# 			If processed.txt doesn't exist,
#				Setup base_path, obs_date, and process_date
# 				Run colibri_main_py3.py on directory
# 				Write log file to processed.txt
#				Write to processed.txt
# 			If processed.txt exists,
#				Open processed.txt and check to see if main was completed
# STEP 3: Same as STEP 2, but run colibri_secondary.py
# STEP 4: Cleanup unnecessary files

if __name__ == '__main__':

    window = tk.Tk()
	
	# Create label
    label_var = tk.StringVar()
    label_var.set('Colibri data pipeline is running! Do not run any other programs on this machine!')
    label = tk.Label(window, textvariable=label_var, font=('Arial',25))
    label.pack()
    
	# Update and show window once
    window.update_idletasks()
    window.update()
    
    ''' Argument parsing added by MJM - July 20, 2022 '''
    arg_parser = argparse.ArgumentParser(description=""" Run secondary Colibri processing
		Usage:

		""",
		formatter_class=argparse.RawTextHelpFormatter)

    arg_parser.add_argument('-d', '--date', help='Observation date (YYYY/MM/DD) of data to be processed.', default='All')
    arg_parser.add_argument('-p', '--procdate', help='Processing date (YYYY/MM/DD).', default=str(datetime.datetime.today().strftime('%Y/%m/%d')))
    arg_parser.add_argument('-r', '--repro', help='Reprocess data. True or False.', default=False)
    arg_parser.add_argument('-s', '--sigma', help='significance treshold.', default='5') #10-05 Roman A

    cml_args = arg_parser.parse_args()

    obsYYYYMMDD = cml_args.date
    procYYYYMMDD = cml_args.procdate
    repro = cml_args.repro

    if cml_args.date == 'All':
        datadir = 'd:\\ColibriData\\'
    else:
        obs_date = obsYYYYMMDD.split('/')[0] + obsYYYYMMDD.split('/')[1] + obsYYYYMMDD.split('/')[2]
        datadir = 'd:\\ColibriData\\' + obs_date + '\\'
		
        process_date = procYYYYMMDD
    
	# Start a timer
    starttime = time.time()
    m = 0
    n = 0

	# STEP 1
	# Walk through the directories and find those with less than n files and remove them.
	# Check all of the files in the remainining directories to ensure that all files are the right size.
    for root, dirs, files in os.walk(datadir):
		# print(root)
        if root != datadir and os.path.split(root)[-1] != 'Bias' and len(os.path.split(root)[-1]) != 8:
            if is_dir_too_small(root, 30):
				#print('Dir is too small')
                print('Removing directory %s' % root)
                shutil.rmtree(root)
                m += 1
            else:
				# for f in os.listdir(root):
                for f in glob.iglob(root + '**/*.rcd', recursive=True):
                    if os.path.getsize(os.path.join(root,f)) < (12 * 1024 - 1):
                        print('Removing file %s' % f)
                        os.remove(f)
                        n += 1

	# Run additional scripts to interrogate data if desired.

    print('%d directories removed for being too small.' % m)
    print('%d files removed for being too small.' % n)

    print('Completed data preparation in  %s seconds' % (time.time()-starttime))

	##########
	# STEP 2 #
	##########

	# Start a timer
    print('Starting 1st stage processing...')
    starttime = time.time()

    dirlist = [ f.path for f in os.scandir(datadir) if f.is_dir() ]

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
            if os.path.isfile(os.path.join(d, '1process.txt')) and repro == False:
                primarydone = True
                print('1st stage processing already complete on %s' % d)
				# print('File exisits. Opening existing file.')
				# with open(os.path.join(d, '1process.txt')) as f1:
				# 	lines = f1.readlines()
				# 	base_path = lines[0].strip('\n').split()[1]
				# 	obsyear = int(lines[1].strip('\n').split()[1].split('/')[0])
				# 	obsmonth = int(lines[1].strip('\n').split()[1].split('/')[1])
				# 	obsday = int(lines[1].strip('\n').split()[1].split('/')[2])
            else:
                primarydone = False
                basepath = pathlib.Path('d:')
                dirdaytime = dirsplit[1]
                obsyear = int(dirdaytime[:4])
                obsmonth = int(dirdaytime[4:6].lstrip("0"))
                obsday = int(dirdaytime[6:8].lstrip("0"))
                obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
                sigma_threshold = cml_args.sigma #10-05 Roman A

            if primarydone == True:
                pass
            else:
                
				# Run colibri_main_py3.py
                try:
                    p = subprocess.run(['python', os.path.expanduser('~/documents/github/colibripipeline/colibri_main_py3.py'), 'd:\\', obsYYYYMMDD, sigma_threshold])

                    while p.poll() is None:
                        print('.', end='', flush=True)
                        time.sleep(1)
                except:
                    pass

                print('Here: %s' % d)
                with open(os.path.join(d, '1process.txt'), 'w+') as f1:
                    f1.write('base_path: %s\n' % str(basepath))
                    f1.write('obs_date: %s/%s/%s\n' % (obsyear, obsmonth, obsday))
                    f1.write('sigma_threshold : %s\n' % (sigma_threshold))
					# f1.write('process_date: %s/%s/%s\n' % (procyear, procmonth, procday))
                    f1.write('process_date: %s\n' % process_date)
                    f1.write('run_par: True\n')
                    print('Wrote 1process.txt to %s' % root)

                print('Finished primary processing.')

    t1 = time.time()-starttime

    print('Completed 1st stage data processing in  %s seconds' % t1)

	##########
	# Step 3 #
	##########

    print('Starting 2nd stage processing...')
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
            if os.path.isfile(os.path.join(d, '2process.txt')) and repro == False:
                secondarydone = True
                print('2nd stage processing already complete on %s' % d)
				# print('File exisits. Opening existing file.')
                with open(os.path.join(d, '2process.txt')) as f1:
                    lines = f1.readlines()
                    base_path = lines[0].strip('\n').split()[1]
                    obsyear = int(lines[1].strip('\n').split()[1].split('/')[0])
                    obsmonth = int(lines[1].strip('\n').split()[1].split('/')[1])
                    obsday = int(lines[1].strip('\n').split()[1].split('/')[2])
                    obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
            else:
                secondarydone = False
                basepath = pathlib.Path('d:')
                dirdaytime = dirsplit[1]
                obsyear = int(dirdaytime[:4])
                obsmonth = int(dirdaytime[4:6].lstrip("0"))
                obsday = int(dirdaytime[6:8].lstrip("0"))
                obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)

            if secondarydone == True:
                pass
            else:
				# Run colibri_main_py3.py
                try:
                    p = subprocess.run(['python', os.path.expanduser('~/documents/github/colibripipeline/colibri_secondary.py'), '-b'+'d:\\', '-d' + str(obsYMD)])

                    while p.poll() is None:
                        print('.', end='', flush=True)
                        time.sleep(1)
                except:
                    pass

                with open(os.path.join(d, '2process.txt'), 'w+') as f1:
                    f1.write('base_path: %s\n' % str(basepath))
                    f1.write('obs_date: %s/%s/%s\n' % (obsyear, obsmonth, obsday))
					# f1.write('process_date: %s/%s/%s\n' % (procyear, procmonth, procday))
                    f1.write('process_date: %s\n' % process_date)
                    f1.write('run_par: True\n')

                print('Finished 2nd stage processing.')

    t2 = time.time()-starttime

	###### Step 4... ######
    print('Calculating bias stats...')
    try:
        p = subprocess.run(['python', os.path.expanduser('~/documents/github/colibripipeline/image_stats_bias.py'), '-b'+'d:\\', '-d' + str(obsYMD)])
        print('step 3')
        while p.poll() is None:
            print('.', end='', flush=True)
            time.sleep(1)
    except:
        pass

    t3 = time.time()-starttime

	# ##### Step 5... #####
	# print('Creating bias plots...')
	# try:
	# 	p=subprocess.run(['python', os.path.expanduser('~/documents/github/colibripipeline/biasPlots.py')])
	# except:
	# 	pass

    print('Completed 1st stage data processing in %s seconds' % t1)
    print('Completed 2nd stage data processing in  %s seconds' % (t2-t1))
    print('Completed bias image stats in %s seconds' % (t3-t2))
    print('Total time to process was %s seconds' % (t3))

    window.destroy()

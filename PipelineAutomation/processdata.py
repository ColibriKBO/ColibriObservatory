import os, shutil
import time
import pathlib
import datetime
import glob
import subprocess
from pathlib import Path
from preparedata import is_dir_too_small

# STEP 1: Prepare data directories with preparedata.py functions
# STEP 2: Walk through directories in D:\ and look for processed.txt file
# 			If processed.txt doesn't exist,
#				Setup base_path, obs_date, and process_date
# 				Run colibri_main_py3.py on directory
# 				Write log file to processed.txt
#				Run colibri_secondary.py
#				Write to processed.txt
# 			If processed.txt exists,
#				Open processed.txt and check to see if main was completed
# STEP 3: Remove unnecessary files

if __name__ == '__main__':

	# Start a timer
	starttime = time.time()
	m = 0
	n = 0

	# datadir = 'd:\\ColibriData\\'
	datadir = 'd:\\TemporaryFiles\\test\\'

	# STEP 1
	# Walk through the directories and find those with less than n files and remove them.
	# Check all of the files in the remainining directories to ensure that all files are the right size.
	for root, dirs, files in os.walk(datadir):
		if root != datadir and os.path.split(root)[-1] != 'Bias':
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

	# Run scripts to interrogate data if desired.

	print('%d directories removed for being too small.' % m)
	print('%d files removed for being too small.' % n)

	print('Completed data preparation in  %s seconds' % (time.time()-starttime))

	##########
	# STEP 2 #
	##########
	datadir = 'd:\\ColibriData\\'
	repro = True

	# Start a timer
	starttime = time.time()

	for root, dirs, files in os.walk(datadir):
		dirlist = os.path.split(root)

		if len(dirlist[1]) == 0:
			print('Root directory excluded')
		elif dirlist[-1] == 'Bias':
			print('Bias directory excluded')
		elif dirlist[0].split('\\')[-1] == 'Bias':
			print('Bias subdirectory excluded.')
		else:
			if os.path.isfile(os.path.join(root, '1process.txt')) and repro == False:
				# print(os.path.join(root, '1process.txt'))
				primarydone = True
				print('File exisits. Opening existing file.')
				with open(os.path.join(root, '1process.txt')) as f1:
					lines = f1.readlines()
					base_path = lines[0].strip('\n').split()[1]
					obsyear = int('0' + lines[1].strip('\n').split()[1].split('/')[0])
					obsmonth = int('0' + lines[1].strip('\n').split()[1].split('/')[1])
					obsday = int('0' + lines[1].strip('\n').split()[1].split('/')[2])
					# print(obsyear)
					# print(obsmonth)
					# print(obsday)
			else:
				primarydone = False
				# Path(os.path.join(root, '1process')).touch()
				# with open(os.path.join(root, '1process.txt'), 'w+') as f1:
					# print(datetime.datetime(2022,7,12))
					# print(datetime.datetime.today().strftime('%Y/%m/%d'))
				basepath = pathlib.Path('d:')
				dirdaytime = dirlist[1]
				obsyear = '0' + dirdaytime[:4]
				obsmonth = '0' + dirdaytime[4:6].lstrip("0")
				obsday = '0' + dirdaytime[6:8].lstrip("0")
				obsYMD = '%s/%s/%s' % (obsyear.lstrip('0'), obsmonth, obsday)
				print(obsYMD)
				procYMD = str(datetime.datetime.today().strftime('%Y/%m/%d'))
				procyear = int(datetime.datetime.today().strftime('%Y'))
				procmonth = int(datetime.datetime.today().strftime('%m'))
				procday = int(datetime.datetime.today().strftime('%d'))

			if primarydone == True:
				pass
			else:
				# Run colibri_main_py3.py
				try:
					p = subprocess.run(['python', 'd:\\Scripts\\colibri_main_py3.py', 'd:\\', obsYMD])

					while p.poll() is None:
						print('.', end='', flush=True)
						time.sleep(1)
				except:
					pass

				with open(os.path.join(root, '1process.txt'), 'w+') as f1:
					f1.write('base_path: %s\n' % str(basepath))
					f1.write('obs_date: %s/%s/%s\n' % (obsyear, obsmonth, obsday))
					f1.write('process_date: %s/%s/%s\n' % (procyear, procmonth, procday))
					f1.write('run_par: True\n')

				print('Finished primary processing.')

	t1 = time.time()-starttime

	print('Completed 1st stage data processing in  %s seconds' % t1)

	##########
	# Step 3 #
	##########

	print('Starting secondary processing...')
	for root, dirs, files in os.walk(datadir):
		dirlist = os.path.split(root)

		if len(dirlist[1]) == 0:
			print('Root directory excluded')
		elif dirlist[-1] == 'Bias':
			print('Bias directory excluded')
		elif dirlist[0].split('\\')[-1] == 'Bias':
			print('Bias subdirectory excluded.')
		else:
			if os.path.isfile(os.path.join(root, '2process.txt')) and repro == False:
				# print(os.path.join(root, '1process.txt'))
				secondarydone = True
				print('File exisits. Opening existing file.')
				with open(os.path.join(root, '1process.txt')) as f1:
					lines = f1.readlines()
					base_path = lines[0].strip('\n').split()[1]
					obsyear = int('0' + lines[1].strip('\n').split()[1].split('/')[0])
					obsmonth = int('0' + lines[1].strip('\n').split()[1].split('/')[1])
					obsday = int('0' + lines[1].strip('\n').split()[1].split('/')[2])
			else:
				secondarydone = False
				basepath = pathlib.Path('d:')
				dirdaytime = dirlist[1]
				obsyear = '0' + dirdaytime[:4]
				obsmonth = '0' + dirdaytime[4:6].lstrip("0")
				obsday = '0' + dirdaytime[6:8].lstrip("0")
				obsYMD = '%s/%s/%s' % (obsyear.lstrip('0'), obsmonth, obsday)
				procYMD = str(datetime.datetime.today().strftime('%Y/%m/%d'))
				procyear = int(datetime.datetime.today().strftime('%Y'))
				procmonth = int(datetime.datetime.today().strftime('%m'))
				procday = int(datetime.datetime.today().strftime('%d'))

			if secondarydone == True:
				pass
			else:
				# Run colibri_main_py3.py
				try:
					p = subprocess.run(['python', 'd:\\Scripts\\colibri_secondary.py', 'd:\\', obsYMD])

					while p.poll() is None:
						print('.', end='', flush=True)
						time.sleep(1)
				except:
					pass

				with open(os.path.join(root, '2process.txt'), 'w+') as f1:
					f1.write('base_path: %s\n' % str(basepath))
					f1.write('obs_date: %s/%s/%s\n' % (obsyear, obsmonth, obsday))
					f1.write('process_date: %s/%s/%s\n' % (procyear, procmonth, procday))
					f1.write('run_par: True\n')

				print('Finished secondary processing.')

	t2 = time.time()-starttime
	print('Completed 1st stage data processing in %s seconds' % t1)
	print('Completed 2nd stage data processing in  %s seconds' % (t2-t1))
	print('Total time to process was %s seconds' % (t2))

import os
import time
import pathlib
import datetime

datadir = 'd:\\ColibriData\\'
repro = True

# Start a timer
starttime = time.time()

# for root, dirs, files in os.walk(datadir):
# 	dirlist = os.path.split(root)
# 	print(dirlist)

dirlist = [ f.path for f in os.scandir(datadir) if f.is_dir() ]

print(dirlist)

for d in dirlist:
	dirlist = os.path.split(d)

	if len(dirlist[1]) == 0:
		print('Root directory excluded')
	elif dirlist[-1] == 'Dark':
		print('Dark directory excluded')
	elif dirlist[0].split('\\')[-1] == 'Dark':
		print('Dark subdirectory excluded.')
	else:
		if os.path.isfile(os.path.join(d, '1process.txt')) and repro == False:
			# print(os.path.join(root, '1process.txt'))
			primarydone = True
			print('File exisits. Opening existing file.')
			with open(os.path.join(d, '1process.txt')) as f1:
				lines = f1.readlines()
				base_path = lines[0].strip('\n').split()[1]
				obsyear = int(lines[1].strip('\n').split()[1].split('/')[0])
				obsmonth = int(lines[1].strip('\n').split()[1].split('/')[1])
				obsday = int(lines[1].strip('\n').split()[1].split('/')[2])
				print(obsyear)
				print(obsmonth)
				print(obsday)
		else:
			primarydone = False
			basepath = pathlib.Path('d:')
			dirdaytime = dirlist[1]
			obsyear = int(dirdaytime[:4])
			obsmonth = int(dirdaytime[4:6].lstrip("0"))
			obsday = int(dirdaytime[6:8].lstrip("0"))
			obsYMD = '%s/%s/%s' % (obsyear, obsmonth, obsday)
			procYMD = str(datetime.datetime.today().strftime('%Y/%m/%d'))
			procyear = int(datetime.datetime.today().strftime('%Y'))
			procmonth = int(datetime.datetime.today().strftime('%m'))
			procday = int(datetime.datetime.today().strftime('%d'))
			print(obsYMD)
			print(obsyear)
			print(obsmonth)
			print(obsday)
			print(procyear)
			print(procmonth)
			print(procday)
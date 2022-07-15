import os, shutil, glob
import time
import fnmatch

# Check to see if a directory is empty
def is_non_empty_dir(dir_name: str) -> bool:
	"""
	Returns True if the directory exists and contains item(s) else False
	"""
	success = False
	try:
		if any(os.scandir(dir_name)):
			success = True
	except NotADirectoryError:
		pass
	except FileNotFoundError:
		pass
	return success

# Check to see if a directory contains less than n files
def is_dir_too_small(dir_name: str, n) -> bool:
	"""
	Returns True if the directory contains less than n item(s) else False
	"""
	success = False

	try:
		numfiles = len(fnmatch.filter(os.listdir(dir_name), '*.*'))
		if numfiles < n:
			success = True
	except:
		pass
	
	return success

if __name__ == '__main__':
	starttime = time.time()
	m = 0
	n = 0

	# Walk through the directories and find those with less than n files and remove them.
	# Check all of the files in the remainining directories to ensure that all files are the right size.
	for root, dirs, files in os.walk('d:\\ColibriData\\'):
		if root != 'd:\\ColibriData\\' and os.path.split(root)[-1] != 'Bias':
			if is_dir_too_small(root, 30):
				print('Removing directory %s' % root)
				m += 1
				#shutil.rmtree(root)
			else:
				# for f in os.listdir(root):
				for f in glob.iglob(root + '**/*.rcd', recursive=True):
					if os.path.getsize(os.path.join(root,f)) < 12 * 1024:
						print('Removing %s' % f)
						#os.remove(f)
						n += 1

	# Run scripts to interrogate data if desired.

	print('%d directories removed for being too small.' % m)
	print('%d files removed for being too small.' % n)

	print('--- %s seconds ---' % (time.time()-starttime))
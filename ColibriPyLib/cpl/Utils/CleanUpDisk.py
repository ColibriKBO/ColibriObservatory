import os, shutil
import time
import argparse
import pathlib

def removeTree(path):
	if os.path.isdir(path):
		try:
			shutil.rmtree(path)
		except OSError:
			print("Can't remove tree")

def remove(path):
	if os.path.isdir(path):
		try:
			os.rmdir(path)
		except OSError:
			print("Can't remove folder: %s" % path)
	else:
		try:
			if os.path.exists(path):
				os.remove(path)
		except OSError:
			print("Can't remove file: %s" % path)

def cleanup(num_days, path):
	time_in_s = time.time() - (num_days * 24 * 3600)
	for root, dirs, files in os.walk(path, topdown=False):
		for file_ in files:
			full_path = os.path.join(root, file_)
			stat = os.stat(full_path)
			if stat.st_mtime <= time_in_s:
				remove(full_path)

		if not os.listdir(root):
			remove(root)

if __name__ == "__main__":
	# Parse arguments
	arg_parser = argparse.ArgumentParser(description=""" Cleanup data directories
			Usage:

			""",
			formatter_class=argparse.RawTextHelpFormatter)

	arg_parser.add_argument("-p", "--path", help="Base directory from which to begin cleanup.", default="d:\\ColibriData")
	arg_parser.add_argument("-d", "--days", help="Number of days in age a file/directory must exceed to delete", default=2)
	arg_parser.add_argument("-f", "--free", help="Amount of free space in TB required.", default=None)
	arg_parser.add_argument("-e", "--exposure", help="Exposure time in s. Used to calculate data rate.", default=0.025)

	cml_args = arg_parser.parse_args()

	base_path = pathlib.Path(cml_args.path)
	num_days = cml_args.days
	free_space = cml_args.free

	# Data rate in MB/s. Assuming a file size of 12.289 MB
	data_rate = (1 / cml_args.exposure) * 12.289

	if free_space == None:
		# Calculate length of night
		sunset = 0
		sunrise = 36000
		length_of_night = sunrise - sunset

		# Calculate amount of space required (in GB)
		free_space = length_of_night * data_rate / 1000

	print(base_path)
	data_disk = os.path.split(base_path)[0]
	print(data_disk)

	total, used, free = shutil.disk_usage(data_disk)
	print("  Disk %s statistics" % data_disk)
	print("**********************")
	print("Total Size: %d TiB" % (total // (2**30) / 1000))
	print("Used Space: %d TiB" % (used // (2**30) / 1000))
	print("Free Space: %d GiB" % (free // (2**30)))
	print("Required Space: %d GiB" % free_space)

	processed_dirs = []
	level = 1

	for root, dirs, files in os.walk(base_path):
		if level > 0:
			for dir in dirs:
				if os.path.exists(os.path.join(base_path, dir, "2process.txt")):
					processed_dirs.append(os.path.join(base_path, dir))
					# print((time.time() - os.stat(os.path.join(base_path, dir)).st_mtime)/(24*3600))
		else:
			break

		level -= 1

	print(processed_dirs)

	if ((free // (2**30)) < free_space):
		while ((free // (2**30)) < free_space):
			print("Only %d GB of free space." % (free // (2**30)))
			print("Freeing at least %d GB from %s" % (free_space - int((free)//(2**30)), data_disk))
			for proc_dir in processed_dirs:
				print(proc_dir)
				removeTree(proc_dir)

			old_free = free
			total, used, free = shutil.disk_usage(data_disk)

			if (free - old_free) == 0:
				print("Didn't remove anything. Breaking out of loop.")
				break
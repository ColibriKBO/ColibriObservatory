import os
import shutil

# Define the path to the parent directory
parent_dir = r"D:\colibrigrab_test_new"

# Create a new directory to organize by exposure
organized_dir = r"D:\colibrigrab_test_organized"
os.makedirs(organized_dir, exist_ok=True)

# List all the directories in the parent directory
parent_subdirs = [os.path.join(parent_dir, d) for d in os.listdir(parent_dir) if os.path.isdir(os.path.join(parent_dir, d))]

# Function to organize subdirectories by exposure settings
def organize_by_exposure(organized_dir, subdirs):
    exposure_dict = {}
    for subdir in subdirs:
        # Extract the exposure time from the directory name
        exposure = subdir.split('_')[1]
        exposure_dir = os.path.join(organized_dir, exposure + "ms")
        
        # Create a directory for the exposure if it doesn't exist
        if exposure_dir not in exposure_dict:
            os.makedirs(exposure_dir, exist_ok=True)
            exposure_dict[exposure_dir] = exposure_dir
        
        # Move the subdirectory into the exposure directory
        shutil.move(subdir, exposure_dict[exposure_dir])

    return exposure_dict

# Function to recursively move subdirectories up one level
def move_subdirs_up_one_level(parent_subdir):
    sub_subdirs = [os.path.join(parent_subdir, d) for d in os.listdir(parent_subdir) if os.path.isdir(os.path.join(parent_subdir, d))]
    for sub_subdir in sub_subdirs:
        # Move each subdirectory to the parent directory
        shutil.move(sub_subdir, parent_subdir)
        
    # Delete the now empty parent subdirectory
    if not os.listdir(parent_subdir):
        os.rmdir(parent_subdir)

# Organize directories by exposure settings
exposure_dict = organize_by_exposure(organized_dir, parent_subdirs)

# Iterate through each exposure directory and move its subdirectories up one level
for exposure_dir in exposure_dict.values():
    move_subdirs_up_one_level(exposure_dir)

# Verify the changes
result = os.listdir(organized_dir)
print(result)

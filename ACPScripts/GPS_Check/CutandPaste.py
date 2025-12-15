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
        parts = os.path.basename(subdir).split('_')
        if len(parts) > 1:
            exposure = parts[1]
            exposure_dir = os.path.join(organized_dir, exposure + "ms")
            
            # Create a directory for the exposure if it doesn't exist
            if exposure_dir not in exposure_dict:
                os.makedirs(exposure_dir, exist_ok=True)
                exposure_dict[exposure_dir] = exposure_dir
            
            # Move the subdirectory into the exposure directory
            new_subdir_path = os.path.join(exposure_dict[exposure_dir], os.path.basename(subdir))
            shutil.move(subdir, new_subdir_path)
            
    return exposure_dict

# Function to move the time directories to the root exposure directory and delete old folders
def move_time_dirs_to_root_and_cleanup(exposure_dict):
    for exposure_dir in exposure_dict.values():
        # Get all time directories inside the exposure directory
        time_dirs = [os.path.join(exposure_dir, d) for d in os.listdir(exposure_dir) if os.path.isdir(os.path.join(exposure_dir, d))]
        for time_dir in time_dirs:
            # Move each time directory to the root exposure directory
            new_time_dir_name = os.path.basename(time_dir)
            new_time_dir_path = os.path.join(os.path.dirname(exposure_dir), new_time_dir_name)
            shutil.move(time_dir, new_time_dir_path)
        # Delete the old exposure directories after moving the time directories
        if not os.listdir(exposure_dir):
            os.rmdir(exposure_dir)

# Organize directories by exposure settings
exposure_dict = organize_by_exposure(organized_dir, parent_subdirs)

# Move the time directories to the root exposure directory and delete old folders
move_time_dirs_to_root_and_cleanup(exposure_dict)

# Verify the changes
result = os.listdir(organized_dir)
print(result)

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
            
            # Move the contents of time directories up one level and delete empty parent directories
            move_contents_up_and_delete(new_subdir_path)

    return exposure_dict

# Function to move the contents of time directories up one level and delete the old directory
def move_contents_up_and_delete(parent_subdir):
    time_dirs = [os.path.join(parent_subdir, d) for d in os.listdir(parent_subdir) if os.path.isdir(os.path.join(parent_subdir, d))]
    for time_dir in time_dirs:
        for item in os.listdir(time_dir):
            shutil.move(os.path.join(time_dir, item), parent_subdir)
        # Delete the now-empty time directory
        os.rmdir(time_dir)
    # Delete the now-empty parent directory
    if not os.listdir(parent_subdir):
        os.rmdir(parent_subdir)

# Organize directories by exposure settings
exposure_dict = organize_by_exposure(organized_dir, parent_subdirs)

# Verify the changes
result = os.listdir(organized_dir)
print(result)

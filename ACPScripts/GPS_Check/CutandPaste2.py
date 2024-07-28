import os
import shutil

# Define the path to the organized directory
organized_dir = r"D:\colibrigrab_test_organized"

# Function to move sub-subdirectories to the parent exposure directory and delete old folders
def move_subdirs_to_parent_and_cleanup(exposure_dir):
    for subdir in os.listdir(exposure_dir):
        subdir_path = os.path.join(exposure_dir, subdir)
        if os.path.isdir(subdir_path):
            for subsubdir in os.listdir(subdir_path):
                subsubdir_path = os.path.join(subdir_path, subsubdir)
                new_path = os.path.join(exposure_dir, subsubdir)
                if os.path.isdir(subsubdir_path):
                    shutil.move(subsubdir_path, new_path)
            # Remove the old empty directory
            if not os.listdir(subdir_path):
                os.rmdir(subdir_path)

# Iterate through each exposure directory and process its subdirectories
for exposure_folder in os.listdir(organized_dir):
    exposure_path = os.path.join(organized_dir, exposure_folder)
    if os.path.isdir(exposure_path):
        move_subdirs_to_parent_and_cleanup(exposure_path)

# Verify the changes
result = os.listdir(organized_dir)
print(result)

import os
from pathlib import Path
import re
from datetime import datetime, timedelta

def testGPSLock(filepath):
    with open(filepath, 'rb') as fid:
        fid.seek(140, 0)  # Move to the byte where ControlBlock2 is expected
        ControlBlock2 = ord(fid.read(1))
    gpslock = (ControlBlock2 == 96)
    return gpslock

def getCaptureDate(filepath):
    # This function attempts to extract the date by searching through the hex data
    with open(filepath, 'rb') as fid:
        hex_data = fid.read(2048)  # Read first 2048 bytes as an example (increased from 512)
        ascii_data = hex_data.decode('ascii', errors ='ignore')  # Convert to ASCII
        
        # Use regex to find the datetime format "YYYY-MM-DDTHH:MM:SS.ssssssZ"
        match = re.search(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?', ascii_data)
        if match:
            return match.group(0)  # Returns the first occurrence of a datetime in the format
        else:
            return None


def is_time_consistent(metadata_time, file_system_time):
    try:
        # Truncate the fractional seconds to 6 digits if there are more
        if '.' in metadata_time:
            time_part, fractional_part = metadata_time.split('.')
            fractional_part = fractional_part.rstrip('Z')[:6]  # Keep only the first 6 digits
            metadata_time = f"{time_part}.{fractional_part}Z"
        
        metadata_dt = datetime.strptime(metadata_time, "%Y-%m-%dT%H:%M:%S.%fZ")
        
        # Since file_system_time is already a datetime object, use it directly
        fs_dt = file_system_time
        
        # Check for consistency within the +/- 4 seconds window
        delta = abs((metadata_dt - fs_dt).total_seconds())
        return delta <= 4
    except ValueError as e:
        print(f"Error parsing time: {e}")
        return False

# Define the root directory
GPS_CHECK_ROOT_DIR = Path("D:\\colibrigrab_test_organized\\")

# Open the summary log file in append mode
with open(GPS_CHECK_ROOT_DIR / "gps_summary_log_test.txt", "a") as summary_log_file:
    best_exposure = None
    lowest_gps_loss_ratio = float('inf')
    
    # Get the list of exposure folders and sort them numerically
    exposure_folders = [folder for folder in GPS_CHECK_ROOT_DIR.iterdir() if folder.is_dir()]
    exposure_folders.sort(key = lambda x: int(x.name.replace('ms', '')))
    
    # Iterate through each sorted exposure folder in the root directory
    for exposure_folder in exposure_folders:
        gps_loss = 0
        total_images = 0
        inconsistent_frames = 0

        # Open the detailed log file for the current exposure folder
        with open(exposure_folder / "gps_check_log_test.txt", "w") as log_file:
            # Recursively search for .rcd files in the current exposure folder
            for subdir in exposure_folder.iterdir():
                if subdir.is_dir():
                    for filepath in subdir.rglob("*.rcd"):
                        gps_lock = testGPSLock(filepath)
                        capture_date = getCaptureDate(filepath)
                        file_system_time = datetime.fromtimestamp(os.path.getmtime(filepath))
                        
                        # Check if the GPS lock is good and the time is consistent
                        if not gps_lock or capture_date is None or not is_time_consistent(capture_date, file_system_time):
                            gps_loss += 1
                            if capture_date is not None and not is_time_consistent(capture_date, file_system_time):
                                inconsistent_frames += 1
                        total_images += 1

                        # Log the result for the current file
                        log_file.write(f"File: {filepath} - GPS Lock: {gps_lock} - Capture Date: {capture_date} - File System Time: {file_system_time}\n")

            # Log the summary for the current exposure folder
            log_file.write(f"\nExposure Folder: {exposure_folder.name}\n")
            log_file.write(f"GPS Loss: {gps_loss} / {total_images}\n")
            log_file.write(f"Inconsistent Time Frames: {inconsistent_frames} / {total_images}\n")

        # Append the summary results to the summary log file
        exposure = int(exposure_folder.name.replace('ms', ''))
        summary_log_file.write(f"Exposure Folder: {exposure_folder.name}\n")
        summary_log_file.write(f"Exposure: {exposure} ms\n")
        summary_log_file.write(f"GPS Loss: {gps_loss} / {total_images}\n")
        summary_log_file.write(f"Inconsistent Time Frames: {inconsistent_frames} / {total_images}\n\n")
        print(f"Exposure Folder: {exposure_folder.name} - GPS Loss: {gps_loss} / {total_images} - Inconsistent Time Frames: {inconsistent_frames}", flush = True)

        # Calculate the GPS loss ratio
        if total_images > 0:
            gps_loss_ratio = gps_loss / total_images
        else:
            gps_loss_ratio = float('inf')  # Handle division by zero

        # Update best exposure based on GPS loss ratio
        if gps_loss_ratio < lowest_gps_loss_ratio:
            lowest_gps_loss_ratio = gps_loss_ratio
            best_exposure = exposure

    # Log the best exposure setting
    summary_log_file.write(f"\nBest Exposure Setting: {best_exposure} ms with GPS Loss Ratio: {lowest_gps_loss_ratio}\n")
    print(f"\nBest Exposure Setting: {best_exposure} ms with GPS Loss Ratio: {lowest_gps_loss_ratio}", flush = True)

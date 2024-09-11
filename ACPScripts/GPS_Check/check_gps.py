import os
from pathlib import Path
import re
from datetime import datetime, timedelta
import numpy as np

def testGPSLock(filepath):
    with open(filepath, 'rb') as fid:
        fid.seek(140, 0)  # Move to the byte where ControlBlock2 is expected
        ControlBlock2 = ord(fid.read(1))
    gpslock = (ControlBlock2 == 96)
    return gpslock

def getCaptureDate(filepath):
    # This function attempts to extract the date by searching through the hex data
    with open(filepath, 'rb') as fid:
        hex_data = fid.read(2048)  # Read first 2048 bytes as an example
        ascii_data = hex_data.decode('ascii', errors='ignore')  # Convert to ASCII
        
        # Use regex to find the datetime format "YYYY-MM-DDTHH:MM:SS.ssssssZ"
        match = re.search(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?', ascii_data)
        if match:
            return match.group(0)  # Returns the first occurrence of a datetime in the format
        else:
            return None

def parse_capture_date(capture_date):
    """
    Parse the capture date while retaining all fractional seconds for high precision.
    """
    if capture_date.endswith('Z'):
        # Remove 'Z' and split the datetime and fractional seconds part
        time_part, fractional_part = capture_date.rstrip('Z').split('.')
        
        # Parse the main datetime part
        datetime_part = datetime.strptime(time_part, "%Y-%m-%dT%H:%M:%S")
        
        # Convert the fractional part to seconds (full precision)
        fractional_seconds = int(fractional_part) / (10 ** len(fractional_part))
        return datetime_part + timedelta(seconds=fractional_seconds)
    
    return None

def calculate_offset(time1, time2):
    """
    Calculate the time difference (in microseconds) between two timestamps.
    """
    try:
        time1_dt = parse_capture_date(time1)
        time2_dt = parse_capture_date(time2)
        if time1_dt and time2_dt:
            return (time2_dt - time1_dt).total_seconds() * 1e6  # Return in microseconds
        return None
    except Exception as e:
        print(f"Error calculating offset: {e}")
        return None

# Define the root directory
GPS_CHECK_ROOT_DIR = Path("D:\\colibrigrab_test_organized\\")

# Open the summary log file in append mode
with open(GPS_CHECK_ROOT_DIR / "gps_summary_log_test.txt", "a") as summary_log_file, \
     open(GPS_CHECK_ROOT_DIR / "time_offset_log.txt", "a") as offset_log_file:
    
    best_exposure = None
    lowest_gps_loss_ratio = float('inf')
    
    # Get the list of exposure folders and sort them numerically
    exposure_folders = [folder for folder in GPS_CHECK_ROOT_DIR.iterdir() if folder.is_dir()]
    exposure_folders.sort(key=lambda x: int(x.name.replace('ms', '')))
    
    # Iterate through each sorted exposure folder in the root directory
    for exposure_folder in exposure_folders:
        gps_loss = 0
        total_images = 0
        inconsistent_frames = 0
        capture_times = []

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
                        if not gps_lock or capture_date is None:
                            gps_loss += 1
                        total_images += 1

                        if capture_date:
                            capture_times.append(capture_date)

                        # Log the result for the current file
                        log_file.write(f"File: {filepath} - GPS Lock: {gps_lock} - Capture Date: {capture_date} - File System Time: {file_system_time}\n")

            # Log the summary for the current exposure folder
            log_file.write(f"\nExposure Folder: {exposure_folder.name}\n")
            log_file.write(f"GPS Loss: {gps_loss} / {total_images}\n")
            log_file.write(f"Inconsistent Time Frames: {inconsistent_frames} / {total_images}\n")

        # Calculate time offsets and log to a separate log file
        time_offsets = []
        for i in range(1, len(capture_times)):
            offset = calculate_offset(capture_times[i-1], capture_times[i])
            if offset is not None:
                time_offsets.append(offset)
                offset_log_file.write(f"Exposure {exposure_folder.name}: Time offset between frame {i} and {i+1}: {offset:.2f} µs\n")
        
        # Calculate and log average and standard deviation of time offsets
        if time_offsets:
            avg_offset = np.mean(time_offsets)
            stddev_offset = np.std(time_offsets)
            offset_log_file.write(f"Exposure {exposure_folder.name}: Average time offset: {avg_offset:.2f} µs\n")
            offset_log_file.write(f"Exposure {exposure_folder.name}: Standard deviation of time offsets: {stddev_offset:.2f} µs\n\n")
        else:
            offset_log_file.write(f"Exposure {exposure_folder.name}: No valid time offsets to calculate.\n\n")

        # Append the summary results to the summary log file
        exposure = int(exposure_folder.name.replace('ms', ''))
        summary_log_file.write(f"Exposure Folder: {exposure_folder.name}\n")
        summary_log_file.write(f"Exposure: {exposure} ms\n")
        summary_log_file.write(f"GPS Loss: {gps_loss} / {total_images}\n")
        summary_log_file.write(f"Inconsistent Time Frames: {inconsistent_frames} / {total_images}\n\n")
        print(f"Exposure Folder: {exposure_folder.name} - GPS Loss: {gps_loss} / {total_images} - Inconsistent Time Frames: {inconsistent_frames}", flush=True)

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
    print(f"\nBest Exposure Setting: {best_exposure} ms with GPS Loss Ratio: {lowest_gps_loss_ratio}", flush=True)

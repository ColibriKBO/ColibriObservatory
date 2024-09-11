import os
from pathlib import Path
from datetime import datetime, timedelta
import numpy as np

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
    Calculate the time difference (in milliseconds) between two timestamps.
    """
    try:
        time1_dt = parse_capture_date(time1)
        time2_dt = parse_capture_date(time2)
        if time1_dt and time2_dt:
            return (time2_dt - time1_dt).total_seconds() * 1e3  # Return in milliseconds
        return None
    except Exception as e:
        print(f"Error calculating offset: {e}")
        return None

# Define the root directory where the log files are located
GPS_CHECK_ROOT_DIR = Path("D:\\colibrigrab_test_organized\\")

# Get the list of exposure folders
exposure_folders = [folder for folder in GPS_CHECK_ROOT_DIR.iterdir() if folder.is_dir()]
exposure_folders.sort(key=lambda x: int(x.name.replace('ms', '')))

# Iterate through each exposure folder
for exposure_folder in exposure_folders:
    gps_check_log = exposure_folder / "gps_check_log_test.txt"
    
    if gps_check_log.exists():
        capture_times = []
        
        # Read the gps_check_log_test.txt file to extract capture times
        with open(gps_check_log, "r") as log_file:
            for line in log_file:
                if "Capture Date:" in line:
                    # Extract the capture date from the log
                    capture_date = line.split("Capture Date:")[1].strip().split(" - ")[0]
                    if capture_date:
                        capture_times.append(capture_date)
        
        # Create a time_offset_log.txt file inside the same folder as gps_check_log_test.txt
        cleaned_exposure_name = exposure_folder.name.replace('msms', 'ms')  # Clean up 'msms' to 'ms'
        
        with open(exposure_folder / "time_offset_log.txt", "w") as offset_log_file:
            # Calculate time offsets
            time_offsets = []
            for i in range(1, len(capture_times)):
                offset = calculate_offset(capture_times[i-1], capture_times[i])
                if offset is not None:
                    time_offsets.append(offset)
                    offset_log_file.write(f"Exposure {cleaned_exposure_name}: Time offset between frame {i} and {i+1}: {offset:.3f} ms\n")
            
            # Calculate and log average and standard deviation of time offsets
            if time_offsets:
                avg_offset = np.mean(time_offsets)
                stddev_offset = np.std(time_offsets)
                offset_log_file.write(f"Exposure {cleaned_exposure_name}: Average time offset: {avg_offset:.3f} ms\n")
                offset_log_file.write(f"Exposure {cleaned_exposure_name}: Standard deviation of time offsets: {stddev_offset:.3f} ms\n\n")
            else:
                offset_log_file.write(f"Exposure {cleaned_exposure_name}: No valid time offsets to calculate.\n\n")
    else:
        print(f"gps_check_log_test.txt not found in {exposure_folder}")

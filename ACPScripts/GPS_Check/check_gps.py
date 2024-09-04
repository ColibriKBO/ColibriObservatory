import os
from pathlib import Path
import re
from datetime import datetime

def testGPSLock(filepath):
    with open(filepath, 'rb') as fid:
        fid.seek(140, 0)  # Move to the byte where ControlBlock2 is expected
        ControlBlock2 = ord(fid.read(1))
    gpslock = (ControlBlock2 == 96)
    return gpslock

def getCaptureDate(filepath):
    # This function attempts to extract the full capture date and time by searching through the hex data
    with open(filepath, 'rb') as fid:
        hex_data = fid.read(1024)  # Read first 1024 bytes as an example (adjust as needed)
        ascii_data = hex_data.decode('ascii', errors='ignore')  # Convert to ASCII
        
        # Use regex to find the datetime format "YYYY-MM-DDTHH:MM:SS.sssssssssZ"
        match_iso = re.search(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{9}Z', ascii_data)
        # Use regex to find the datetime format "MM/DD/YYYY HH:MM:SS.sssssssss"
        match_standard = re.search(r'\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2}\.\d{9}', ascii_data)
        
        if match_iso:
            return match_iso.group(0)  # Returns the first occurrence of the ISO 8601 datetime format
        elif match_standard:
            return match_standard.group(0)  # Returns the first occurrence of the standard datetime format
        else:
            return None

def analyzeTimeProgression(capture_dates):
    if not capture_dates:
        return 0  # No dates to analyze

    inconsistent_count = 0
    last_time = None

    for date_str in capture_dates:
        try:
            if 'T' in date_str:
                # ISO format
                current_time = datetime.strptime(date_str, '%Y-%m-%dT%H:%M:%S.%fZ')
            else:
                # Standard format
                current_time = datetime.strptime(date_str, '%m/%d/%Y %H:%M:%S.%f')
        except ValueError:
            # Skip if date parsing fails
            continue

        if last_time and current_time <= last_time:
            inconsistent_count += 1
        
        last_time = current_time

    return inconsistent_count


# Define the root directory
GPS_CHECK_ROOT_DIR = Path("D:\\colibrigrab_test_organized\\")

# Open the summary log file in append mode
with open(GPS_CHECK_ROOT_DIR / "gps_summary_log_test.txt", "a") as summary_log_file:
    best_exposure = None
    lowest_gps_loss_ratio = float('inf')
    
    # Get the list of exposure folders and sort them numerically
    exposure_folders = [folder for folder in GPS_CHECK_ROOT_DIR.iterdir() if folder.is_dir()]
    exposure_folders.sort(key=lambda x: int(x.name.replace('ms', '')))
    
    # Iterate through each sorted exposure folder in the root directory
    for exposure_folder in exposure_folders:
        gps_loss = 0
        total_images = 0
        capture_dates = []

        # Open the detailed log file for the current exposure folder
        with open(exposure_folder / "gps_check_log_test.txt", "w") as log_file:
            # Recursively search for .rcd files in the current exposure folder
            for subdir in exposure_folder.iterdir():
                if subdir.is_dir():
                    for filepath in subdir.rglob("*.rcd"):
                        gps_lock = testGPSLock(filepath)
                        capture_date = getCaptureDate(filepath)
                        
                        if not gps_lock or capture_date is None:
                            gps_loss += 1
                        total_images += 1

                        if capture_date:
                            capture_dates.append(capture_date)

                        # Log the result for the current file
                        log_file.write(f"File: {filepath} - GPS Lock: {gps_lock} - Capture Date: {capture_date}\n")

            # Analyze time progression
            inconsistent_time_count = analyzeTimeProgression(capture_dates)

            # Log the summary for the current exposure folder
            log_file.write(f"\nExposure Folder: {exposure_folder.name}\n")
            log_file.write(f"GPS Loss: {gps_loss} / {total_images}\n")
            log_file.write(f"Inconsistent Time Progression Count: {inconsistent_time_count}\n")

        # Append the summary results to the summary log file
        exposure = int(exposure_folder.name.replace('ms', ''))
        summary_log_file.write(f"Exposure Folder: {exposure_folder.name}\n")
        summary_log_file.write(f"Exposure: {exposure} ms\n")
        summary_log_file.write(f"GPS Loss: {gps_loss} / {total_images}\n")
        summary_log_file.write(f"Inconsistent Time Progression Count: {inconsistent_time_count}\n\n")
        print(f"Exposure Folder: {exposure_folder.name} - GPS Loss: {gps_loss} / {total_images} - Inconsistent Time Count: {inconsistent_time_count}", flush=True)

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

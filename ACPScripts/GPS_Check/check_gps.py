import os
from pathlib import Path

def testGPSLock(filepath):
    with open(filepath, 'rb') as fid:
        fid.seek(140, 0)
        ControlBlock2 = ord(fid.read(1))

    gpslock = (ControlBlock2 == 96)
    return gpslock

# Define the root directory
GPS_CHECK_ROOT_DIR = Path("D:\\colibrigrab_test_organized\\")

# Open the summary log file in append mode
with open(GPS_CHECK_ROOT_DIR / "gps_summary_log.txt", "a") as summary_log_file:
    best_exposure = None
    lowest_gps_loss = float('inf')
    
    # Iterate through each exposure folder in the root directory
    for exposure_folder in GPS_CHECK_ROOT_DIR.iterdir():
        if exposure_folder.is_dir():
            gps_loss = 0
            total_images = 0

            # Open the detailed log file for the current exposure folder
            with open(exposure_folder / "gps_check_log.txt", "w") as log_file:
                # Recursively search for .rcd files in the current exposure folder
                for filepath in exposure_folder.rglob("*.rcd"):
                    gps_lock = testGPSLock(filepath)
                    if not gps_lock:
                        gps_loss += 1
                    total_images += 1

                    # Log the result for the current file
                    log_file.write(f"File: {filepath} - GPS Lock: {gps_lock}\n")

                # Log the summary for the current exposure folder
                log_file.write(f"\nExposure Folder: {exposure_folder.name}\n")
                log_file.write(f"GPS Loss: {gps_loss} / {total_images}\n")

            # Append the summary results to the summary log file
            exposure = int(exposure_folder.name.replace('ms', ''))
            summary_log_file.write(f"Exposure Folder: {exposure_folder.name}\n")
            summary_log_file.write(f"Exposure: {exposure} ms\n")
            summary_log_file.write(f"GPS Loss: {gps_loss} / {total_images}\n\n")
            print(f"Exposure Folder: {exposure_folder.name} - GPS Loss: {gps_loss} / {total_images}")

            # Update best exposure based on GPS loss
            if gps_loss < lowest_gps_loss:
                lowest_gps_loss = gps_loss
                best_exposure = exposure

    # Log the best exposure setting
    summary_log_file.write(f"\nBest Exposure Setting: {best_exposure} ms with GPS Loss: {lowest_gps_loss}\n")
    print(f"\nBest Exposure Setting: {best_exposure} ms with GPS Loss: {lowest_gps_loss}")

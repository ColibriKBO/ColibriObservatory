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
    
    # Iterate through each folder in the root directory
    for folder in GPS_CHECK_ROOT_DIR.iterdir():
        if folder.is_dir():
            gps_loss = 0
            total_images = 0

            # Open the detailed log file for the current folder
            with open(folder / "gps_check_log.txt", "w") as log_file:
                # Recursively search for .rcd files in the current folder
                for filepath in folder.rglob("*.rcd"):
                    gps_lock = testGPSLock(filepath)
                    if not gps_lock:
                        gps_loss += 1
                    total_images += 1

                    # Log the result for the current file
                    log_file.write(f"File: {filepath} - GPS Lock: {gps_lock}\n")

                # Log the summary for the current folder
                log_file.write(f"\nFolder: {folder.name}\n")
                log_file.write(f"GPS Loss: {gps_loss} / {total_images}\n")

            # Append the summary results to the summary log file
            exposure = int(folder.name.split('_')[1].replace('ms', ''))
            summary_log_file.write(f"Folder: {folder.name}\n")
            summary_log_file.write(f"Exposure: {exposure} ms\n")
            summary_log_file.write(f"GPS Loss: {gps_loss} / {total_images}\n\n")
            print(f"Folder: {folder.name} - GPS Loss: {gps_loss} / {total_images}")

            # Update best exposure based on GPS loss
            if gps_loss < lowest_gps_loss:
                lowest_gps_loss = gps_loss
                best_exposure = exposure

    # Log the best exposure setting
    summary_log_file.write(f"\nBest Exposure Setting: {best_exposure} ms with GPS Loss: {lowest_gps_loss}\n")
    print(f"\nBest Exposure Setting: {best_exposure} ms with GPS Loss: {lowest_gps_loss}")


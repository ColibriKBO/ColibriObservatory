import os
from pathlib import Path
from datetime import datetime, timedelta
import numpy as np
import matplotlib.pyplot as plt

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

def plot_time_offsets(frame_numbers, time_offsets, exposure_folder, frame_drop_threshold):
    """
    Plot the time offsets versus frame numbers as a scatter plot with smaller markers.
    """
    plt.figure(figsize=(10, 6))
    plt.scatter(frame_numbers, time_offsets, marker='o', color='red', s=20)  # Scatter plot with smaller markers
    plt.axhline(y=frame_drop_threshold, color='purple', linestyle='--', label=f'Frame Drop Threshold ({frame_drop_threshold} ms)')
    plt.title(f"Time Offsets Between Frames for {exposure_folder.name.replace('msms', 'ms')} Exposure Time", fontsize=20)
    plt.xlabel("Frame Number", fontsize=18)
    plt.ylabel("Time Offset between frames (ms)", fontsize=18)
    plt.grid(True)
    plt.legend()
    plt.savefig(exposure_folder / "time_offsets_plot.png")  # Save the plot as a PNG
    plt.show()  # Display the plot

# Define the root directory where the log files are located
GPS_CHECK_ROOT_DIR = Path("D:\\colibrigrab_test_organized1\\")

# Get the list of exposure folders
exposure_folders = [folder for folder in GPS_CHECK_ROOT_DIR.iterdir() if folder.is_dir()]
exposure_folders.sort(key=lambda x: int(x.name.replace('ms', '')))

# Iterate through each exposure folder
for exposure_folder in exposure_folders:
    gps_check_log = exposure_folder / "gps_check_log_test.txt"
    
    if gps_check_log.exists():
        capture_times = []
        
        # Extract exposure time from the folder name (e.g., 25ms)
        exposure_time = int(exposure_folder.name.replace('msms', 'ms').replace('ms', ''))  # Extract exposure time in ms
        frame_drop_threshold = 2 * exposure_time  # Frame drop threshold is 2x the exposure time
        
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
        
        time_offsets = []
        frame_numbers = []
        frame_drops = 0  # To count the number of frame drops
        
        with open(exposure_folder / "time_offset_log.txt", "w") as offset_log_file:
            # Calculate time offsets
            for i in range(1, len(capture_times)):
                offset = calculate_offset(capture_times[i-1], capture_times[i])
                if offset is not None:
                    time_offsets.append(offset)
                    frame_numbers.append(i)
                    offset_log_file.write(f"Exposure {cleaned_exposure_name}: Time offset between frame {i} and {i+1}: {offset:.3f} ms\n")
                    
                    # Count as frame drop if offset exceeds the 2x exposure time threshold
                    if offset > frame_drop_threshold:
                        frame_drops += 1
            
            # Calculate and log average and standard deviation of time offsets
            if time_offsets:
                avg_offset = np.mean(time_offsets)
                stddev_offset = np.std(time_offsets)
                offset_log_file .write(f"======================================================================================\n")
                offset_log_file.write(f"Average time offset: {avg_offset:.3f} ms\n")
                offset_log_file.write(f"Standard deviation of time offsets: {stddev_offset:.3f} ms\n")
                
                # Calculate frame drop percentage and log the results
                total_frames = len(capture_times) - 1  # Total frames analyzed
                frame_drop_percentage = (frame_drops / total_frames) * 100 if total_frames > 0 else 0
                offset_log_file.write(f"Number of frame drops: {frame_drops} / {total_frames} ({frame_drop_percentage:.2f}%)\n\n")
            else:
                offset_log_file.write(f"No valid time offsets to calculate.\n\n")
        
        # If there are time offsets, plot them
        if time_offsets:
            plot_time_offsets(frame_numbers, time_offsets, exposure_folder, frame_drop_threshold)
    else:
        print(f"gps_check_log_test.txt not found in {exposure_folder}")

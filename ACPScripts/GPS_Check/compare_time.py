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
    Calculate the absolute time difference (in milliseconds) between two timestamps.
    """
    try:
        time1_dt = parse_capture_date(time1)
        time2_dt = parse_capture_date(time2)
        if time1_dt and time2_dt:
            return abs((time2_dt - time1_dt).total_seconds()) * 1e3  # Return absolute time difference in milliseconds
        return None
    except Exception as e:
        print(f"Error calculating offset: {e}")
        return None

def plot_time_offsets(frame_numbers, time_offsets, exposure_name, root_dir, avg_offset, stddev_offset, color):
    """
    Plot time offsets for a single exposure and save the plot to the root directory.
    """
    plt.figure(figsize=(10, 6))
    plt.scatter(frame_numbers, time_offsets, marker='o', color=color, s=6)
    plt.title(f"{exposure_name} Exposure Time Offset", fontsize=20)
    plt.xlabel("Frame Number", fontsize=18)
    plt.ylabel("Time Offset between frames (ms)", fontsize=18)
    plt.grid(True)
    
    # Add stats to the plot
    plt.legend([f"Avg ± Std: {avg_offset:.3f} ± {stddev_offset:.3f} ms"], loc="best", fontsize=14)
    
    # Save individual plot
    plot_filename = f"{exposure_name}_Time_Offsets.png"
    plt.savefig(root_dir / plot_filename)
    plt.show()

def plot_combined_time_offsets(exposure_data, root_dir):
    """
    Plot all exposures in a single plot using different colors.
    """
    plt.figure(figsize=(12, 8))
    colors = ['blue', 'gray', 'purple', 'black']  # Colors for the exposures
    for idx, (exposure_name, frame_numbers, time_offsets, avg_offset, stddev_offset) in enumerate(exposure_data):
        plt.scatter(frame_numbers, time_offsets, marker='o', color=colors[idx], s=6, label=f"{exposure_name} Avg ± Std: {avg_offset:.3f} ± {stddev_offset:.3f} ms")

    plt.title("Time Offsets Between Frames for All Exposures", fontsize=20)
    plt.xlabel("Frame Number", fontsize=18)
    plt.ylabel("Time Offset between frames (ms)", fontsize=18)
    plt.legend(loc="best", fontsize=14)
    plt.grid(True)
    
    # Save combined plot to the root directory
    plot_filename = "All_Exposures_Time_Offsets.png"
    plt.savefig(root_dir / plot_filename)
    plt.show()

# Define the root directory where the log files and subfolders are located
ROOT_DIR = Path("D:\\tmp\\CameraTimingCheck")
red_dir = ROOT_DIR / "Red"
green_dir = ROOT_DIR / "Green"

def find_log_file(folder):
    """
    Search for gps_check_log_test.txt inside the exposure folder or any subfolder.
    """
    for subdir in folder.rglob("*"):
        if subdir.is_file() and subdir.name == "gps_check_log_test.txt":
            return subdir
    return None

def get_capture_times(log_file):
    """
    Extract capture times from the gps_check_log_test.txt file.
    """
    capture_times = []
    with open(log_file, "r") as log:
        for line in log:
            if "Capture Date:" in line:
                capture_date = line.split("Capture Date:")[1].strip().split(" - ")[0]
                if capture_date:
                    capture_times.append(capture_date)
    return capture_times

exposure_data = []
colors = ['blue', 'gray', 'purple', 'black']  # Colors for each exposure

# Iterate through each exposure folder (e.g., 25ms, 33ms) in Red
for idx, exposure_folder in enumerate(red_dir.iterdir()):
    if exposure_folder.is_dir():
        green_exposure_folder = green_dir / exposure_folder.name  # Match the same exposure folder in Green
        
        if green_exposure_folder.exists():
            # Find the gps_check_log_test.txt file for Red and Green
            red_log = find_log_file(exposure_folder)
            green_log = find_log_file(green_exposure_folder)
            
            if red_log and green_log:
                # Get the capture times from both Red and Green logs
                capture_times_red = get_capture_times(red_log)
                capture_times_green = get_capture_times(green_log)
                
                # Ensure both Red and Green have the same number of capture times
                if len(capture_times_red) == len(capture_times_green):
                    time_offsets = []
                    frame_numbers = []
                    frame_drops = 0  # To count the number of frame drops
                    
                    # Calculate time offsets between Red and Green frames
                    for i in range(len(capture_times_red)):
                        offset = calculate_offset(capture_times_red[i], capture_times_green[i])
                        if offset is not None:
                            time_offsets.append(offset)
                            frame_numbers.append(i)
                    
                    # Log the time offsets and frame drops
                    log_file_name = ROOT_DIR / f"Red_and_Green_{exposure_folder.name}_time_offsets_log.txt"
                    with open(log_file_name, "w") as log_file:
                        for i, offset in enumerate(time_offsets):
                            log_file.write(f"Frame {i + 1}: Time offset = {offset:.3f} ms\n")
                        
                        total_frames = len(time_offsets)
                        avg_offset = np.mean(time_offsets)
                        stddev_offset = np.std(time_offsets)
                        
                        # Determine frame drops (spikes that exceed 1 second or spikes above average + threshold)
                        threshold = avg_offset + 2 * stddev_offset  # Define a threshold
                        for offset in time_offsets:
                            if offset > threshold or offset > 1000:  # Consider spikes greater than 1 second or large offsets
                                frame_drops += 1
                        
                        # Log summary stats
                        frame_drop_percentage = (frame_drops / total_frames) * 100 if total_frames > 0 else 0
                        log_file.write(f"======================================================================================\n")
                        log_file.write(f"Average time offset: {avg_offset:.3f} ms\n")
                        log_file.write(f"Standard deviation of time offsets: {stddev_offset:.3f} ms\n")
                        log_file.write(f"Total frames: {total_frames}\n")
                        log_file.write(f"Frame drops (> 1 second or significant spikes): {frame_drops} / {total_frames} ({frame_drop_percentage:.2f}%)\n")
                    
                    # Store data for combined plotting
                    cleaned_exposure_name = exposure_folder.name.replace('msms', 'ms')  # Clean up 'msms' to 'ms'
                    exposure_data.append((cleaned_exposure_name, frame_numbers, time_offsets, avg_offset, stddev_offset))

                    # Plot each exposure individually with the same color as in the combined plot
                    plot_time_offsets(frame_numbers, time_offsets, cleaned_exposure_name, ROOT_DIR, avg_offset, stddev_offset, colors[idx])
                else:
                    print(f"Mismatch in frame counts for Red and Green for exposure {exposure_folder.name}")
            else:
                print(f"Log files not found for Red or Green in exposure {exposure_folder.name}")
        else:
            print(f"Green folder not found for {exposure_folder.name}")

# Plot all exposures together if data is available
if exposure_data:
    plot_combined_time_offsets(exposure_data, ROOT_DIR)

import numpy as np
import os
from pathlib import Path

# Function for reading specified number of bytes
def readxbytes(fid, numbytes):
    for i in range(1):
        data = fid.read(numbytes)
        if not data:
            break
    return data

# Function to read 12-bit data with Numba to speed things up
def nb_read_data(data_chunk):
    """data_chunk is a contigous 1D array of uint8 data)
    eg.data_chunk = np.frombuffer(data_chunk, dtype=np.uint8)"""
    assert np.mod(data_chunk.shape[0], 3) == 0

    out = np.empty(data_chunk.shape[0] // 3 * 2, dtype=np.uint16)

    for i in range(data_chunk.shape[0] // 3):
        fst_uint8 = np.uint16(data_chunk[i * 3])
        mid_uint8 = np.uint16(data_chunk[i * 3 + 1])
        lst_uint8 = np.uint16(data_chunk[i * 3 + 2])

        out[i * 2] = (fst_uint8 << 4) + (mid_uint8 >> 4)
        out[i * 2 + 1] = ((mid_uint8 % 16) << 8) + lst_uint8

    return out

def readRCD(filename):
    with open(filename, 'rb') as fid:
        # Go to start of file
        fid.seek(0, 0)

        # Load data portion of file
        fid.seek(384, 0)
        table = np.fromfile(fid, dtype=np.uint8, count=12582912)

    return table

def process_directory(directory, output_file):
    with open(output_file, 'w') as f:
        f.write("Elevation (°)\tExposure Time (ms)\tAvg Pixel Value (Normal Frame)\tStd Dev (Normal Frame)\tAvg Pixel Value (Dark Frame)\tStd Dev (Dark Frame)\n")

        current_elevation = None
        current_exposure = None
        normal_frames = []
        dark_frames = []
        
        for root, dirs, files in os.walk(directory):
            for file in files:
                if file.endswith(".rcd"):
                    file_path = os.path.join(root, file)
                    try:
                        # Parse elevation and exposure from filename or directory structure
                        elevation, exposure_time = parse_filename_or_directory(file_path)

                        data = readRCD(file_path)
                        image_data = nb_read_data(data)

                        # Detect when we switch to a new elevation/exposure set
                        if (elevation != current_elevation or exposure_time != current_exposure) and normal_frames:
                            write_results(f, current_elevation, current_exposure, normal_frames, dark_frames)
                            normal_frames = []
                            dark_frames = []

                        # Add data to normal or dark frame list
                        if is_dark_frame(file_path):
                            dark_frames.append(image_data)
                        else:
                            normal_frames.append(image_data)

                        # Update current elevation and exposure
                        current_elevation = elevation
                        current_exposure = exposure_time

                    except Exception as e:
                        print(f"Error processing file {file_path}: {e}")
        
        # Write remaining results
        if normal_frames:
            write_results(f, current_elevation, current_exposure, normal_frames, dark_frames)

def is_dark_frame(file_path):
    # Implement logic to detect dark frames based on filename or other indicators
    return "Dark" in file_path

def write_results(f, elevation, exposure_time, normal_frames, dark_frames):
    if normal_frames:
        normal_mean = np.mean([np.mean(frame) for frame in normal_frames])
        normal_std = np.std([np.std(frame) for frame in normal_frames])
    else:
        normal_mean = 0.0
        normal_std = 0.0

    if dark_frames:
        dark_mean = np.mean([np.mean(frame) for frame in dark_frames])
        dark_std = np.std([np.std(frame) for frame in dark_frames])
    else:
        dark_mean = 0.0
        dark_std = 0.0

    f.write(f"{elevation:.1f}\t{exposure_time:.1f}\t{normal_mean:.2f}\t{normal_std:.2f}\t{dark_mean:.2f}\t{dark_std:.2f}\n")

def parse_filename_or_directory(file_path):
    # Implement logic to extract elevation and exposure time from filename or directory structure
    # This is a placeholder, adjust based on your file naming convention
    filename = os.path.basename(file_path)
    elevation = float(filename.split('_')[0].replace("Alt", ""))
    exposure_time = float(filename.split('_')[1].replace("ms", ""))
    return elevation, exposure_time

if __name__ == "__main__":
    root_dir = 'D:\\tmp\\AirmassSensitivity'
    output_file = 'output_results.txt'

    process_directory(root_dir, output_file)

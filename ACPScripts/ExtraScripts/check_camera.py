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

def process_directory(directory):
    results = []
    normal_frames = []
    dark_frames = []

    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".rcd"):
                file_path = os.path.join(root, file)
                try:
                    data = readRCD(file_path)
                    image_data = nb_read_data(data)

                    mean_value = np.mean(image_data)
                    std_dev_value = np.std(image_data)

                    if "Dark" in root:  # assuming dark frames are in a folder with "Dark" in the name
                        dark_frames.append((mean_value, std_dev_value))
                    else:
                        normal_frames.append((mean_value, std_dev_value))

                except Exception as e:
                    print(f"Error processing file {file_path}: {e}")

    return normal_frames, dark_frames

def write_results_to_file(output_file, normal_frames, dark_frames):
    with open(output_file, 'w') as f:
        f.write("Elevation (°)\tExposure Time (ms)\tAvg Pixel Value (Normal Frame)\tStd Dev (Normal Frame)\tAvg Pixel Value (Dark Frame)\tStd Dev (Dark Frame)\n")

        for norm, dark in zip(normal_frames, dark_frames):
            f.write(f"##\t25\t{norm[0]:.2f}\t{norm[1]:.2f}\t{dark[0]:.2f}\t{dark[1]:.2f}\n")
            # Adjust the format to reflect actual elevation and exposure time if needed.

if __name__ == "__main__":
    root_dir = 'D:\\tmp\\AirmassSensitivity'
    output_file = 'output_results.txt'

    normal_frames, dark_frames = process_directory(root_dir)
    write_results_to_file(output_file, normal_frames, dark_frames)

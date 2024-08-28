import numpy as np
import os
import concurrent.futures
import logging
from numba import jit
import re

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

@jit(nopython=True, parallel=True)
def nb_read_data(data_chunk):
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
        fid.seek(384, 0)
        table = np.memmap(fid, dtype=np.uint8, mode='r', offset=384, shape=(12582912,))
    return table

def extract_exposure_time(filename):
    match = re.search(r'(\d+)ms', filename)
    if match:
        return int(match.group(1))
    else:
        return 25  # Default or fallback exposure time

def extract_elevation(filename):
    match = re.search(r'Alt(\d+\.\d+)', filename)
    if match:
        return float(match.group(1))
    else:
        return 0  # Default or fallback elevation

def process_file(file_path, dark_mode):
    try:
        data = readRCD(file_path)
        image_data = nb_read_data(data)

        mean_value = np.mean(image_data)
        std_dev_value = np.std(image_data)

        exposure_time = extract_exposure_time(file_path)
        elevation = extract_elevation(file_path)

        return 'dark' if dark_mode else 'normal', mean_value, std_dev_value, exposure_time, elevation
    except Exception as e:
        logging.error(f"Error processing file {file_path}: {e}")
        return None

def process_directory_parallel(directory):
    normal_frames = []
    dark_frames = []
    dark_mode = False

    with concurrent.futures.ProcessPoolExecutor(max_workers=16) as executor:
        futures = []
        file_count = 0
        for root, dirs, files in os.walk(directory):
            for file in sorted(files):
                if file.endswith(".rcd"):
                    file_path = os.path.join(root, file)
                    futures.append(executor.submit(process_file, file_path, dark_mode))
                    dark_mode = not dark_mode  # Alternate between normal and dark mode
                    file_count += 1

        for i, future in enumerate(concurrent.futures.as_completed(futures, timeout=600)):  # 10-minute timeout
            try:
                result = future.result()
                if result:
                    frame_type, mean_value, std_dev_value, exposure_time, elevation = result
                    if frame_type == 'dark':
                        dark_frames.append((mean_value, std_dev_value, exposure_time, elevation))
                    else:
                        normal_frames.append((mean_value, std_dev_value, exposure_time, elevation))
                if i % 10 == 0:
                    logging.info(f"Processed {i + 1}/{file_count} files.")
            except concurrent.futures.TimeoutError:
                logging.error(f"Task timed out after 10 minutes.")

    return normal_frames, dark_frames

def write_results_to_file(output_file, normal_frames, dark_frames):
    try:
        # Combine normal and dark frames with their associated metadata for easier grouping
        combined_frames = [(norm[3], norm[2], norm[0], norm[1], dark[0], dark[1]) for norm, dark in zip(normal_frames, dark_frames)]
        
        # Group data by elevation and exposure time
        results_dict = {}
        
        for frame in combined_frames:
            key = (frame[0], frame[1])  # (elevation, exposure_time)
            if key not in results_dict:
                results_dict[key] = {'norm_means': [], 'norm_stds': [], 'dark_means': [], 'dark_stds': []}
            
            results_dict[key]['norm_means'].append(frame[2])
            results_dict[key]['norm_stds'].append(frame[3])
            results_dict[key]['dark_means'].append(frame[4])
            results_dict[key]['dark_stds'].append(frame[5])

        with open(output_file, 'w') as f:
            f.write("Elevation (°)\tExposure Time (ms)\tAvg Pixel Value (Normal Frame)\tStd Dev (Normal Frame)\tAvg Pixel Value (Dark Frame)\tStd Dev (Dark Frame)\n")
            
            for key, values in sorted(results_dict.items()):
                elevation, exposure_time = key
                avg_norm_mean = np.mean(values['norm_means'])
                avg_norm_std = np.mean(values['norm_stds'])
                avg_dark_mean = np.mean(values['dark_means'])
                avg_dark_std = np.mean(values['dark_stds'])
                
                f.write(f"{elevation:.1f}\t{exposure_time}\t{avg_norm_mean:.2f}\t{avg_norm_std:.2f}\t{avg_dark_mean:.2f}\t{avg_dark_std:.2f}\n")
                f.flush()  # Ensure data is written immediately
            
            logging.info(f"Results written to {output_file}")
    except Exception as e:
        logging.error(f"Error writing to file {output_file}: {e}")


if __name__ == "__main__":
    
    root_dir = "D:\\tmp\\AirmassSensitivity"
    output_file = "D:\\tmp\\AirmassSensitivity\\output_results.txt"
    #root_dir = 'D:\\colibrigrab_test_new'
    #output_file = 'D:\\colibrigrab_test_new\\output_results.txt'

    normal_frames, dark_frames = process_directory_parallel(root_dir)
    write_results_to_file(output_file, normal_frames, dark_frames)

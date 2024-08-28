import numpy as np
import os
import logging
from numba import jit

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

def process_file(file_path):
    try:
        data = readRCD(file_path)
        image_data = nb_read_data(data)

        mean_value = np.mean(image_data)
        std_dev_value = np.std(image_data)

        return mean_value, std_dev_value
    except Exception as e:
        logging.error(f"Error processing file {file_path}: {e}")
        return None

def extract_info_from_filename(file_name):
    try:
        parts = file_name.split('_')
        if "Dark" in parts[0]:
            is_dark = True
            parts = parts[1:]
        else:
            is_dark = False
        
        elevation = float(parts[0].replace('Alt', ''))
        exposure_time = int(parts[1].split('ms')[0])

        return elevation, exposure_time, is_dark
    except (IndexError, ValueError) as e:
        logging.error(f"Failed to parse information from file name: {file_name}")
        return None, None, None

def process_directory(directory):
    results = {}
    file_counter = 0
    
    for file in sorted(os.listdir(directory)):
        if file.endswith(".rcd"):
            file_path = os.path.join(directory, file)
            elevation, exposure_time, is_dark = extract_info_from_filename(file)
            if elevation is not None and exposure_time is not None:
                if file_counter % 25 == 0:
                    logging.info(f"Processing file: {file} | Elevation: {elevation} | Exposure Time: {exposure_time}ms | Dark: {is_dark}")
                result = process_file(file_path)
                if result:
                    mean_value, std_dev_value = result
                    key = (elevation, exposure_time)
                    if key not in results:
                        results[key] = {"normal_means": [], "normal_stds": [], "dark_means": [], "dark_stds": []}
                    if is_dark:
                        results[key]["dark_means"].append(mean_value)
                        results[key]["dark_stds"].append(std_dev_value)
                    else:
                        results[key]["normal_means"].append(mean_value)
                        results[key]["normal_stds"].append(std_dev_value)
            
            file_counter += 1
    
    averaged_results = []
    for key, values in results.items():
        elevation, exposure_time = key
        avg_normal_mean = np.mean(values["normal_means"]) if values["normal_means"] else float('NaN')
        avg_normal_std = np.mean(values["normal_stds"]) if values["normal_stds"] else float('NaN')
        avg_dark_mean = np.mean(values["dark_means"]) if values["dark_means"] else float('NaN')
        avg_dark_std = np.mean(values["dark_stds"]) if values["dark_stds"] else float('NaN')
        averaged_results.append((elevation, exposure_time, avg_normal_mean, avg_normal_std, avg_dark_mean, avg_dark_std))
    
    return averaged_results

def process_root_directory(root_directory):
    all_results = []
    
    for sub_dir in os.listdir(root_directory):
        full_sub_dir = os.path.join(root_directory, sub_dir)
        if os.path.isdir(full_sub_dir):
            results = process_directory(full_sub_dir)
            if results:
                all_results.extend(results)
    
    return all_results

def write_results_to_file(output_file, results):
    try:
        with open(output_file, 'w') as f:
            f.write("Elevation (°)\tExposure Time (ms)\tAvg Pixel Value (Normal Frame)\tStd Dev (Normal Frame)\tAvg Pixel Value (Dark Frame)\tStd Dev (Dark Frame)\n")
            for res in results:
                elevation, exposure_time, normal_mean, normal_std, dark_mean, dark_std = res
                f.write(f"{elevation}\t{exposure_time}\t{normal_mean:.2f}\t{normal_std:.2f}\t{dark_mean:.2f}\t{dark_std:.2f}\n")
            logging.info(f"Results written to {output_file}")
    except Exception as e:
        logging.error(f"Error writing to file {output_file}: {e}")

if __name__ == "__main__":
    

    root_dir = 'D:\\tmp\\AirmassSensitivity'  # Change this to your directory
    output_file = 'D:\\tmp\\AirmassSensitivity\\output_results.txt'
    # root_dir = 'D:\\colibrigrab_test_new'  # Change this to your directory
    # output_file = 'D:\\colibrigrab_test_new\\output_results.txt'

    results = process_root_directory(root_dir)
    write_results_to_file(output_file, results)

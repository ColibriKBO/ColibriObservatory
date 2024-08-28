import numpy as np
import os
from numba import jit

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
        return None

def extract_info_from_filename(file_name):
    try:
        parts = file_name.split('_')
        is_dark = "Dark" in parts[0]
        if is_dark:
            parts = parts[1:]
        elevation = float(parts[0].replace('Alt', ''))
        exposure_time = int(parts[1].split('ms')[0])
        return elevation, exposure_time, is_dark
    except (IndexError, ValueError):
        return None, None, None

def process_directory(directory):
    results = {}
    files = [os.path.join(root, filename) for root, _, filenames in os.walk(directory) 
             for filename in filenames if filename.lower().endswith(".rcd")]
    
    total_files = len(files)

    for i, file in enumerate(files):
        elevation, exposure_time, is_dark = extract_info_from_filename(os.path.basename(file))
        if elevation is not None and exposure_time is not None:
            if i % 50 == 0 or i == total_files - 1:  # Print every 50 files processed
                print(f"Processed {i + 1}/{total_files} files.")
            result = process_file(file)
            if result:
                mean_value, std_dev_value = result
                key = (elevation, exposure_time, is_dark)
                if key not in results:
                    results[key] = {"normal": (None, None), "dark": (None, None)}
                if is_dark:
                    results[key]["dark"] = (mean_value, std_dev_value)
                else:
                    results[key]["normal"] = (mean_value, std_dev_value)

    return results

def process_root_directory(root_directory):
    all_results = {}
    for sub_dir in os.listdir(root_directory):
        full_sub_dir = os.path.join(root_directory, sub_dir)
        if os.path.isdir(full_sub_dir):
            results = process_directory(full_sub_dir)
            all_results.update(results)
    return all_results

def write_results_to_file(output_file, results):
    try:
        with open(output_file, 'w') as f:
            f.write("Elevation (°)\tExposure Time (ms)\tAvg Pixel Normal\tStd Dev Normal\tAvg Pixel Dark\tStd Dev Dark\n")
            for key, value in results.items():
                elevation, exposure_time = key[:2]
                normal_mean, normal_std = value["normal"]
                dark_mean, dark_std = value["dark"]

                normal_mean = f"{normal_mean:.2f}" if normal_mean is not None else "NaN"
                normal_std = f"{normal_std:.2f}" if normal_std is not None else "NaN"
                dark_mean = f"{dark_mean:.2f}" if dark_mean is not None else "NaN"
                dark_std = f"{dark_std:.2f}" if dark_std is not None else "NaN"

                f.write(f"{elevation}\t{exposure_time}\t{normal_mean}\t{normal_std}\t{dark_mean}\t{dark_std}\n")
    except Exception as e:
        pass

def clean_up_results_file(output_file):
    try:
        with open(output_file, 'r') as f:
            lines = f.readlines()
        
        header = lines[0]
        data_lines = lines[1:]
        cleaned_data = {}

        for line in data_lines:
            parts = line.strip().split("\t")
            elevation, exposure_time = parts[:2]
            normal_mean, normal_std, dark_mean, dark_std = parts[2:]

            key = (elevation, exposure_time)

            if key in cleaned_data:
                existing_line = cleaned_data[key]
                if "NaN" in existing_line[2:4]:
                    cleaned_data[key][2:4] = [normal_mean, normal_std]
                if "NaN" in existing_line[4:]:
                    cleaned_data[key][4:] = [dark_mean, dark_std]
            else:
                cleaned_data[key] = [elevation, exposure_time, normal_mean, normal_std, dark_mean, dark_std]

        with open(output_file, 'w') as f:
            f.write(header)
            for key, values in cleaned_data.items():
                f.write("\t".join(values) + "\n")
    except Exception as e:
        pass

if __name__ == "__main__":
    root_dir = 'D:\\colibrigrab_test_new'
    output_file = 'D:\\colibrigrab_test_new\\output_results.txt'

    results = process_root_directory(root_dir)
    write_results_to_file(output_file, results)
    clean_up_results_file(output_file)

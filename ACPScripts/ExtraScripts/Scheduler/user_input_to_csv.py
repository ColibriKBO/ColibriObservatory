# Incorporating Tk: Import tkinter
from tkinter import *
from tkinter import ttk
from tkinter import messagebox
import csv
import re
import os

def is_valid_time_format(time_str):
    """Check if the time is in the correct format YYYY:MM:DD:HH:mm."""
    pattern = r'^\d{4}:\d{2}:\d{2}:\d{2}:\d{2}'
    return re.match(pattern, time_str) is not None

def is_valid_decimal(value_str, min_value=None, max_value=None):
    """Check if the input is a valid decimal number and within optional min/max bounds."""
    try:
        value = float(value_str)
        if min_value is not None and value < min_value:
            return False
        if max_value is not None and value > max_value:
            return False
        return True
    except ValueError:
        return False
    
def update_request_count():
    """Update the label with the number of requests made."""
    try:
        total_requests = 0
        pending_requests = 0
        with open('colibri_user_observations.csv', 'r') as read_file:
            csv_reader = csv.DictReader(read_file)
            for row in csv_reader:
                total_requests += 1
                if row['Completion'] == '0':
                    pending_requests += 1

        request_count_label.config(text=f"Total Requests: {total_requests} | Pending Requests: {pending_requests}")
    except FileNotFoundError:
        request_count_label.config(text="Total Requests: 0 | Pending Requests: 0")
    except KeyError:
        # Handles the case where the field name doesn't exist in the CSV
        messagebox.showerror("CSV Error", "The specified fields was not found in the CSV file.")
        request_count_label.config(text="Total Requests: 0 | Pending Requests: 0")

def is_csv_empty(file_path):
    return os.stat(file_path).st_size == 0

def write_user_input_to_csv(*args):
    try:
        name_val = str(directory_name.get())
        priority_val = str(priority.get())

        ra_val = str(ra.get())
        dec_val = str(dec.get())

        start_time_val = str(start_time.get())
        end_time_val = str(end_time.get())

        num_exposures_val = str(num_exposures.get())
        exposure_time_val = str(exposure_time.get())

        filter_val = str(filter.get())
        binning_val = str(binning.get())

        # Validate Inputs
        if len(name_val) == 0:
            messagebox.showerror("Input Error", "Directory Name cannot be empty.")
            return
        
        if not priority_val.isdigit() or not (1 <= int(priority_val) <= 10):
            messagebox.showerror("Input Error", "Priority must be an integer between 1 and 10. Offending input: " + priority_val)
            return
        
        if not is_valid_time_format(start_time_val):
            messagebox.showerror("Input Error", "Start Time must be in the format YYYY:MM:DD:HH:mm. Offending input: " + start_time_val)
            return
        
        if not is_valid_time_format(end_time_val):
            messagebox.showerror("Input Error", "End Time must be in the format YYYY:MM:DD:HH:mm. Offending input: " + end_time_val)
            return
        
        if not is_valid_decimal(ra_val, 0, 360):
            messagebox.showerror("Input Error", "RA must be a valid decimal number between 0 and 360. Offending input: " + ra_val)
            return
        
        if not is_valid_decimal(dec_val, -90, 90):
            messagebox.showerror("Input Error", "Dec must be a valid decimal number between -90 and 90. Offending input: " + dec_val)
            return
        
        if not num_exposures_val.isdigit() or int(num_exposures_val) <= 0:
            messagebox.showerror("Input Error", "Number of Exposures must be a positive integer. Offending input: " + num_exposures_val)
            return
        
        if not is_valid_decimal(exposure_time_val, 0):
            messagebox.showerror("Input Error", "Exposure Time must be a positive integer or decimal number in seconds. Offending input: " + exposure_time_val)
            return
        
        if filter_val not in ["normal", "dark", "biased"]:
            messagebox.showerror("Input Error", "Filter must be 'normal', 'dark', or 'biased'. Offending input: " + filter_val)
            return
        
        if binning_val not in ["1", "2", "3"]:
            messagebox.showerror("Input Error", "Binning must be 1, 2, or 3. Offending input: " + binning_val)
            return

        # If all checks pass, write to the CSV file
        with open('colibri_user_observations.csv', 'a+', newline='') as write_file:
            csv_writer = csv.DictWriter(write_file, fieldnames=['Directory Name', 'Priority', 'RA', 'Dec', 'Start Time', 'End Time', 'Num Exposures', 'Exposure Time', 'Filter', 'Binning', 'Completion'])

            if is_csv_empty('colibri_user_observations.csv'):
                csv_writer.writeheader()

            write_row = {
                'Directory Name': name_val,
                'Priority': priority_val,
                'RA': ra_val,
                'Dec': dec_val,
                'Start Time': start_time_val,
                'End Time': end_time_val,
                'Num Exposures': num_exposures_val,
                'Exposure Time': int(float(exposure_time_val) * 1000),
                'Filter': filter_val,
                'Binning': binning_val,
                'Completion': 0
            }
            csv_writer.writerow(write_row)

        ttk.Label(mainframe, text="Request recorded!").grid(column=1, row=7)
        ttk.Label(mainframe, text="Submit another request or close the application.").grid(column=1, row=8)

        # Clear the entries after submission
        directory_name_entry.delete(0, END)
        priority_entry.delete(0, END)
        ra_entry.delete(0, END)
        dec_entry.delete(0, END)
        start_time_entry.delete(0, END)
        end_time_entry.delete(0, END)
        num_exposures_entry.delete(0, END)
        exposure_time_entry.delete(0, END)
        filter_entry.delete(0, END)
        binning_entry.delete(0, END)

        update_request_count()
    except ValueError as ve:
        messagebox.showerror("Input Error", f"Value Error: {ve}")
        pass

# Set up the main application window
root = Tk()
root.title("Colibri Telescope Array Observation Requirements")

mainframe = ttk.Frame(root, padding="3 3 12 12")
mainframe.grid(column=0, row=0, sticky=(N, W, E, S))

root.columnconfigure(0, weight=1)
root.rowconfigure(0, weight=1)

directory_name = StringVar()
directory_name_entry = ttk.Entry(mainframe, width=7, textvariable=directory_name)
directory_name_entry.grid(column=2, row=1)

priority = StringVar()
priority_entry = ttk.Entry(mainframe, width=7, textvariable=priority)
priority_entry.grid(column=5, row=1)

ra = StringVar()
ra_entry = ttk.Entry(mainframe, width=7, textvariable=ra)
ra_entry.grid(column=2, row=2)

dec = StringVar()
dec_entry = ttk.Entry(mainframe, width=7, textvariable=dec)
dec_entry.grid(column=5, row=2)

start_time = StringVar()
start_time_entry = ttk.Entry(mainframe, width=7, textvariable=start_time)
start_time_entry.grid(column=2, row=3)

end_time = StringVar()
end_time_entry = ttk.Entry(mainframe, width=7, textvariable=end_time)
end_time_entry.grid(column=5, row=3)

num_exposures = StringVar()
num_exposures_entry = ttk.Entry(mainframe, width=7, textvariable=num_exposures)
num_exposures_entry.grid(column=2, row=4)

exposure_time = StringVar()
exposure_time_entry = ttk.Entry(mainframe, width=7, textvariable=exposure_time)
exposure_time_entry.grid(column=5, row=4)

filter = StringVar()
filter_entry = ttk.Entry(mainframe, width=7, textvariable=filter)
filter_entry.grid(column=2, row=5)

binning = StringVar()
binning_entry = ttk.Entry(mainframe, width=7, textvariable=binning)
binning_entry.grid(column=5, row=5)

ttk.Button(mainframe, text="Submit", command=write_user_input_to_csv).grid(column=2, row=6)
ttk.Button(mainframe, text="Close", command=root.destroy).grid(column=4, row=6)

ttk.Label(mainframe, text="Directory Name:").grid(column=1, row=1)
ttk.Label(mainframe, text="Priority (between 1 and 10, inclusive):").grid(column=4, row=1)

ttk.Label(mainframe, text="Right Ascension (decimal degrees):").grid(column=1, row=2)
ttk.Label(mainframe, text="Declination (decimal degrees):").grid(column=4, row=2)

ttk.Label(mainframe, text="Start Time (in UTC, format YYYY:MM:DD:HH:mm):").grid(column=1, row=3)
ttk.Label(mainframe, text="End Time (in UTC, format YYYY:MM:DD:HH:mm):").grid(column=4, row=3)

ttk.Label(mainframe, text="Number of Exposures:").grid(column=1, row=4)
ttk.Label(mainframe, text="Exposure Time (seconds):").grid(column=4, row=4)

ttk.Label(mainframe, text="Filter (normal, dark, or biased):").grid(column=1, row=5)
ttk.Label(mainframe, text="Binning (1, 2, or 3):").grid(column=4, row=5)

# Request count label at the bottom right
request_count_label = ttk.Label(mainframe, text="Total Requests: 0 | Pending Requests: 0")
request_count_label.grid(column=5, row=7)

# Initialize request count on startup
update_request_count()

for child in mainframe.winfo_children(): child.grid_configure(padx=5, pady=5)

directory_name_entry.focus()

root.bind("<Return>", write_user_input_to_csv)

root.mainloop()
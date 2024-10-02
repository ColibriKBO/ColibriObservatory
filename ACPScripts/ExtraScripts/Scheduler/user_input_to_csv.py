# Import necessary libraries from tkinter for creating the GUI
from tkinter import *  # Import everything from the tkinter module
from tkinter import ttk  # Import themed widgets (improved appearance)
from tkinter import messagebox  # Import message boxes for error handling
import csv  # For handling CSV file reading and writing
import re  # For regular expressions, used in input validation
import os  # For file operations (e.g., checking if a file is empty)

# Function to validate the time format (YYYY:MM:DD:HH:mm)
def is_valid_time_format(time_str):
    """Check if the time is in the correct format YYYY:MM:DD:HH:mm."""
    pattern = r'^\d{4}:\d{2}:\d{2}:\d{2}:\d{2}'  # Define regex pattern for the time format
    return re.match(pattern, time_str) is not None  # Return True if format matches, otherwise False

# Function to validate a decimal number and optional range
def is_valid_decimal(value_str, min_value=None, max_value=None):
    """Check if the input is a valid decimal number and within optional min/max bounds."""
    try:
        value = float(value_str)  # Attempt to convert input to a float
        # If min_value is provided, ensure the number is greater or equal to it
        if min_value is not None and value < min_value:
            return False
        # If max_value is provided, ensure the number is less than or equal to it
        if max_value is not None and value > max_value:
            return False
        return True  # Return True if all conditions are met
    except ValueError:
        return False  # If conversion to float fails, return False

# Function to update the request count label
def update_request_count():
    """Update the label with the number of total and pending requests."""
    try:
        total_requests = 0  # Initialize total requests counter
        pending_requests = 0  # Initialize pending requests counter
        with open('colibri_user_observations.csv', 'r') as read_file:  # Open the CSV file for reading
            csv_reader = csv.DictReader(read_file)  # Use DictReader to parse CSV rows as dictionaries
            for row in csv_reader:
                total_requests += 1  # Increment total requests counter
                # Check if the observation is pending (Completion == '0')
                if row['Completion'] == '0':
                    pending_requests += 1  # Increment pending requests counter

        # Update the label with the counts of total and pending requests
        request_count_label.config(text=f"Total Requests: {total_requests} | Pending Requests: {pending_requests}")
    except FileNotFoundError:  # Handle case where the CSV file doesn't exist
        request_count_label.config(text="Total Requests: 0 | Pending Requests: 0")  # Set request count to zero
    except KeyError:  # Handle case where expected CSV fields are missing
        # Show an error message if a required CSV field is missing
        messagebox.showerror("CSV Error", "The specified field was not found in the CSV file.")
        request_count_label.config(text="Total Requests: 0 | Pending Requests: 0")

# Function to check if a CSV file is empty
def is_csv_empty(file_path):
    """Check if the CSV file is empty by checking its size."""
    return os.stat(file_path).st_size == 0  # Return True if file size is zero (empty)

# Function to write user input to the CSV file
def write_user_input_to_csv(*args):
    """Write user input from the form to the CSV file after validation."""
    try:
        # Get the input values from the GUI
        name_val = str(directory_name.get())  # Directory name
        priority_val = str(priority.get())  # Priority

        ra_val = str(ra.get())  # Right Ascension (RA)
        dec_val = str(dec.get())  # Declination (Dec)

        start_time_val = str(start_time.get())  # Observation start time
        end_time_val = str(end_time.get())  # Observation end time

        obs_duration_val = str(obs_duration.get())  # Observation duration
        exposure_time_val = str(exposure_time.get())  # Exposure time

        filter_val = str(filter.get())  # Filter type
        binning_val = str(binning.get())  # Binning mode

        # Validate user inputs

        # Validate the directory name is not empty
        if len(name_val) == 0:
            messagebox.showerror("Input Error", "Directory Name cannot be empty.")
            return
        
        # Validate priority as an integer between 1 and 10
        if not priority_val.isdigit() or not (1 <= int(priority_val) <= 10):
            messagebox.showerror("Input Error", f"Priority must be an integer between 1 and 10. Offending input: {priority_val}")
            return
        
        # Validate start and end times in the correct format
        if not is_valid_time_format(start_time_val):
            messagebox.showerror("Input Error", f"Start Time must be in the format YYYY:MM:DD:HH:mm. Offending input: {start_time_val}")
            return
        if not is_valid_time_format(end_time_val):
            messagebox.showerror("Input Error", f"End Time must be in the format YYYY:MM:DD:HH:mm. Offending input: {end_time_val}")
            return
        
        # Validate RA is a decimal number between 0 and 360 degrees
        if not is_valid_decimal(ra_val, 0, 360):
            messagebox.showerror("Input Error", f"RA must be a valid decimal number between 0 and 360. Offending input: {ra_val}")
            return
        
        # Validate Dec is a decimal number between -90 and 90 degrees
        if not is_valid_decimal(dec_val, -90, 90):
            messagebox.showerror("Input Error", f"Dec must be a valid decimal number between -90 and 90. Offending input: {dec_val}")
            return
        
        # Validate observation duration is a positive integer
        if not obs_duration_val.isdigit() or int(obs_duration_val) <= 0:
            messagebox.showerror("Input Error", f"Observation Duration must be a positive integer in minutes. Offending input: {obs_duration_val}")
            return
        
        # Validate exposure time as a positive number
        if not is_valid_decimal(exposure_time_val, 0):
            messagebox.showerror("Input Error", f"Exposure Time must be a positive number in seconds. Offending input: {exposure_time_val}")
            return
        
        # Validate filter selection from a limited set of values
        if filter_val not in ["1", "2", "3"]:
            messagebox.showerror("Input Error", f"Filter must be '1' for normal, '2' for dark, or '3' for biased. Offending input: {filter_val}")
            return
        
        # Validate binning mode as either '1' or '2'
        if binning_val not in ["1", "2"]:
            messagebox.showerror("Input Error", f"Binning must be 1 or 2. Offending input: {binning_val}")
            return

        # If all validations pass, write the data to the CSV file
        with open('colibri_user_observations.csv', 'a+', newline='') as write_file:
            csv_writer = csv.DictWriter(write_file, fieldnames=[
                'Directory Name', 'Priority', 'RA', 'Dec', 'Start Time', 'End Time',
                'Obs Duration', 'Exposure Time', 'Filter', 'Binning', 'Completion'])

            # Write header if the CSV file is empty
            if is_csv_empty('colibri_user_observations.csv'):
                csv_writer.writeheader()

            # Prepare the row of data to write
            write_row = {
                'Directory Name': name_val,
                'Priority': priority_val,
                'RA': ra_val,
                'Dec': dec_val,
                'Start Time': start_time_val,
                'End Time': end_time_val,
                'Obs Duration': obs_duration_val,
                'Exposure Time': exposure_time_val,
                'Filter': filter_val,
                'Binning': binning_val,
                'Completion': 0  # Mark observation as not completed (Completion = 0)
            }
            csv_writer.writerow(write_row)  # Write the row to the CSV

        # Display confirmation message in the UI
        ttk.Label(mainframe, text="Request recorded!").grid(column=1, row=7)
        ttk.Label(mainframe, text="Submit another request or close the application.").grid(column=1, row=8)

        # Clear all input fields after submission
        directory_name_entry.delete(0, END)
        priority_entry.delete(0, END)
        ra_entry.delete(0, END)
        dec_entry.delete(0, END)
        start_time_entry.delete(0, END)
        end_time_entry.delete(0, END)
        obs_duration_entry.delete(0, END)
        exposure_time_entry.delete(0, END)
        filter_entry.delete(0, END)
        binning_entry.delete(0, END)

        update_request_count()  # Refresh the request count
    except ValueError as ve:
        messagebox.showerror("Input Error", f"Value Error: {ve}")  # Handle value errors
        pass

# Set up the main application window
root = Tk()  # Initialize Tkinter root window
root.title("Colibri Telescope Array Observation Requirements")  # Set window title

# Create and configure the main frame (container for widgets)
mainframe = ttk.Frame(root, padding="3 3 12 12")  # Padding for the frame
mainframe.grid(column=0, row=0, sticky=(N, W, E, S))  # Use grid layout for the frame
root.columnconfigure(0, weight=1)  # Configure column resizing
root.rowconfigure(0, weight=1)  # Configure row resizing

# Create labels and input fields for each required parameter
directory_name = StringVar()  # Variable to hold the directory name input
directory_name_entry = ttk.Entry(mainframe, width=25, textvariable=directory_name)  # Input field for directory name
directory_name_entry.grid(column=2, row=1, sticky=(W, E))  # Position the input field

priority = StringVar()  # Variable for priority input
priority_entry = ttk.Entry(mainframe, width=25, textvariable=priority)  # Input field for priority
priority_entry.grid(column=5, row=1, sticky=(W, E))  # Position the input field

ra = StringVar()  # Variable for RA input
ra_entry = ttk.Entry(mainframe, width=25, textvariable=ra)  # Input field for RA
ra_entry.grid(column=2, row=2, sticky=(W, E))  # Position the input field

dec = StringVar()  # Variable for Dec input
dec_entry = ttk.Entry(mainframe, width=25, textvariable=dec)  # Input field for Dec
dec_entry.grid(column=5, row=2, sticky=(W, E))  # Position the input field

start_time = StringVar()  # Variable for start time input
start_time_entry = ttk.Entry(mainframe, width=25, textvariable=start_time)  # Input field for start time
start_time_entry.grid(column=2, row=3, sticky=(W, E))  # Position the input field

end_time = StringVar()  # Variable for end time input
end_time_entry = ttk.Entry(mainframe, width=25, textvariable=end_time)  # Input field for end time
end_time_entry.grid(column=5, row=3, sticky=(W, E))  # Position the input field

obs_duration = StringVar()  # Variable for observation duration input
obs_duration_entry = ttk.Entry(mainframe, width=25, textvariable=obs_duration)  # Input field for observation duration
obs_duration_entry.grid(column=2, row=4, sticky=(W, E))  # Position the input field

exposure_time = StringVar()  # Variable for exposure time input
exposure_time_entry = ttk.Entry(mainframe, width=25, textvariable=exposure_time)  # Input field for exposure time
exposure_time_entry.grid(column=5, row=4, sticky=(W, E))  # Position the input field

filter = StringVar()  # Variable for filter type input
filter_entry = ttk.Entry(mainframe, width=25, textvariable=filter)  # Input field for filter type
filter_entry.grid(column=2, row=5, sticky=(W, E))  # Position the input field

binning = StringVar()  # Variable for binning mode input
binning_entry = ttk.Entry(mainframe, width=25, textvariable=binning)  # Input field for binning mode
binning_entry.grid(column=5, row=5, sticky=(W, E))  # Position the input field

# Create button to submit the form and handle submission
submit_button = ttk.Button(mainframe, text="Submit Request", command=write_user_input_to_csv)
submit_button.grid(column=2, row=6, sticky=W)  # Position the button

# Create button to close the form
close_button = ttk.Button(mainframe, text="Close", command=root.destroy)
close_button.grid(column=4, row=6, sticky=W) # Position the button

# Label for displaying the request count (total and pending)
request_count_label = ttk.Label(mainframe, text="Total Requests: 0 | Pending Requests: 0")
request_count_label.grid(column=5, row=7, sticky=W)  # Position the label
# Initialize request count on startup
update_request_count()

# Labels for input fields (displayed next to entry fields)
ttk.Label(mainframe, text="Directory Name:").grid(column=1, row=1, sticky=W)  # Label for directory name
ttk.Label(mainframe, text="Priority (1-10):").grid(column=4, row=1, sticky=W)  # Label for priority
ttk.Label(mainframe, text="RA (0-360 degrees):").grid(column=1, row=2, sticky=W)  # Label for RA
ttk.Label(mainframe, text="Dec (-90 to 90 degrees):").grid(column=4, row=2, sticky=W)  # Label for Dec
ttk.Label(mainframe, text="Start Time (in UTC, YYYY:MM:DD:HH:mm):").grid(column=1, row=3, sticky=W)  # Label for start time
ttk.Label(mainframe, text="End Time (in UTC, YYYY:MM:DD:HH:mm):").grid(column=4, row=3, sticky=W)  # Label for end time
ttk.Label(mainframe, text="Observation Duration (min):").grid(column=1, row=4, sticky=W)  # Label for observation duration
ttk.Label(mainframe, text="Exposure Time (sec):").grid(column=4, row=4, sticky=W)  # Label for exposure time
ttk.Label(mainframe, text="Filter (1 for normal, 2 for dark, or 3 for biased):").grid(column=1, row=5, sticky=W)  # Label for filter type
ttk.Label(mainframe, text="Binning (1 or 2):").grid(column=4, row=5, sticky=W)  # Label for binning mode

# Run the Tkinter event loop to display the GUI
root.mainloop()  # Start the main event loop of the GUI application
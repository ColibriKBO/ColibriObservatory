# Incorporating Tk: Import tkinter
from tkinter import *
from tkinter import ttk
import csv

def write_user_input_to_csv(*args):
    try:
        name = str(directory_name.get())
        priority = str(priority_entry.get())

        start_time = str(start_time_entry.get())
        end_time = str(end_time_entry.get())

        ra = str(ra_entry.get())
        dec = str(dec_entry.get())

        num_exposures = str(num_exposures_entry.get())
        exposure_time = str(exposure_time_entry.get())

        filter = str(filter_entry.get())
        binning = str(binning_entry.get())

        write_file = open('colibri_user_observations.csv', 'a+', newline='')
        csv_writer = csv.DictWriter(write_file, fieldnames=['Directory Name', 'Priority', 'RA', 'Dec', 'Start Time', 'End Time', 'Num Exposures', 'Exposure Time', 'Filter', 'Binning', 'Completion'])

        # csv_writer.writeheader()

        write_row = {'Directory Name': name, 'Priority': priority,'RA': ra, 'Dec': dec, 'Start Time': start_time, 'End Time': end_time, 'Num Exposures': num_exposures, 'Exposure Time': exposure_time, 'Filter': filter, 'Binning': binning, 'Completion': 0}
        csv_writer.writerow(write_row)

        write_file.close()

        ttk.Label(mainframe, text="Request recorded!").grid(column=1, row=7)
        ttk.Label(mainframe, text="Submit another request or close the application.").grid(column=1, row=8)

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
    except ValueError:
        print("Error!")
        print(ValueError)
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
ttk.Label(mainframe, text="Priority:").grid(column=4, row=1)

ttk.Label(mainframe, text="Right Ascension (decimal degrees):").grid(column=1, row=2)
ttk.Label(mainframe, text="Declination (decimal degrees):").grid(column=4, row=2)

ttk.Label(mainframe, text="Start Time (YYYY:MM:DD:HH:mm):").grid(column=1, row=3)
ttk.Label(mainframe, text="End Time (YYYY:MM:DD:HH:mm):").grid(column=4, row=3)

ttk.Label(mainframe, text="Number of Exposures:").grid(column=1, row=4)
ttk.Label(mainframe, text="Exposure Time (millseconds):").grid(column=4, row=4)

ttk.Label(mainframe, text="Filter (normal, dark, or biased):").grid(column=1, row=5)
ttk.Label(mainframe, text="Binning (1, 2, or 3):").grid(column=4, row=5)

for child in mainframe.winfo_children(): child.grid_configure(padx=5, pady=5)

directory_name_entry.focus()

root.bind("<Return>", write_user_input_to_csv)

root.mainloop()
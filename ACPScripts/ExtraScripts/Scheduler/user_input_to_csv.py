# Incorporating Tk: Import tkinter
from tkinter import *
from tkinter import ttk
import csv

def write_user_input_to_csv(*args):
    try:
        name = str(directory_name.get())
        # start = str(start_time.get())
        ra = str(ra_entry.get())
        dec = str(dec_entry.get())
        num_exposures = str(num_exposures_entry.get())
        exposure_time = str(exposure_time_entry.get())
        filter = str(filter_entry.get())
        binning = str(binning_entry.get())

        write_file = open('colibri_user_observations.csv', 'a+', newline='')
        csv_writer = csv.DictWriter(write_file, fieldnames=['Directory Name', 'RA', 'Dec', 'Num Exposures', 'Exposure Time', 'Filter', 'Binning'])

        # csv_writer.writeheader()

        write_row = {'Directory Name': name, 'RA': ra, 'Dec': dec, 'Num Exposures': num_exposures, 'Exposure Time': exposure_time, 'Filter': filter, 'Binning': binning}
        csv_writer.writerow(write_row)

        write_file.close()

        ttk.Label(mainframe, text="Request recorded!").grid(column=3, row=4)
        ttk.Label(mainframe, text="Submit another request or close the application.").grid(column=3, row=5)

        directory_name_entry.delete(0, END)
        # start_time_entry.delete(0, END)
        ra_entry.delete(0, END)
        dec_entry.delete(0, END)
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

# start_time = StringVar()
# start_time_entry = ttk.Entry(mainframe, width=7, textvariable=start_time)
# start_time_entry.grid(column=2, row=2, sticky=(W, E))
ra = StringVar()
ra_entry = ttk.Entry(mainframe, width=7, textvariable=ra)
ra_entry.grid(column=4, row=1)

dec = StringVar()
dec_entry = ttk.Entry(mainframe, width=7, textvariable=dec)
dec_entry.grid(column=6, row=1)

num_exposures = StringVar()
num_exposures_entry = ttk.Entry(mainframe, width=7, textvariable=num_exposures)
num_exposures_entry.grid(column=2, row=2)

exposure_time = StringVar()
exposure_time_entry = ttk.Entry(mainframe, width=7, textvariable=exposure_time)
exposure_time_entry.grid(column=4, row=2)

filter = StringVar()
filter_entry = ttk.Entry(mainframe, width=7, textvariable=filter)
filter_entry.grid(column=6, row=2)

binning = StringVar()
binning_entry = ttk.Entry(mainframe, width=7, textvariable=binning)
binning_entry.grid(column=2, row=3)

ttk.Button(mainframe, text="Submit", command=write_user_input_to_csv).grid(column=3, row=3)
ttk.Button(mainframe, text="Close", command=root.destroy).grid(column=5, row=3)

ttk.Label(mainframe, text="Directory Name:").grid(column=1, row=1)
ttk.Label(mainframe, text="Right Ascension (decimal degrees):").grid(column=3, row=1)
ttk.Label(mainframe, text="Declination (decimal degrees):").grid(column=5, row=1)
ttk.Label(mainframe, text="Number of Exposures:").grid(column=1, row=2)
ttk.Label(mainframe, text="Exposure Time (seconds):").grid(column=3, row=2)
ttk.Label(mainframe, text="Filter (normal, dark, or biased):").grid(column=5, row=2)
ttk.Label(mainframe, text="Binning (1, 2, or 3):").grid(column=1, row=3)
# ttk.Label(mainframe, text="Start Time:").grid(column=1, row=2, sticky=E)

for child in mainframe.winfo_children(): child.grid_configure(padx=5, pady=5)

directory_name_entry.focus()

root.bind("<Return>", write_user_input_to_csv)

root.mainloop()
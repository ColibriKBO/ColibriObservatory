# astrometry_correction_test.py

import subprocess
import time

fields = [
    (273.736, -18.640),
    (92.419,  23.902),
    (287.740, -17.914),
    (105.436, 22.379),
    (254.789, -27.225),
    (129.972, 19.312)
]

for ra, dec in fields:
    # Convert RA from degrees to hours
    ra_hours = ra / 15.0
    
    start_time = time.time()
    print(f"Testing field: RA={ra_hours}, DEC={dec}, -test")
    result = subprocess.run(
        ['python', 'astrometry_correction.py', '-t',str(ra_hours), str(dec)],
        capture_output=True,
        text=True
    )
    end_time = time.time()
    
    # Parse the output
    output = result.stdout.strip().split()
    if len(output) == 2:
        ra_offset = float(output[0])
        dec_offset = float(output[1])
    else:
        ra_offset = dec_offset = 0.0

    print("RA Offset:", ra_offset)
    print("Dec Offset:", dec_offset)
    print("Standard Output:", result.stdout)
    print("Error:", result.stderr)
    print("Duration: {:.2f} seconds".format(end_time - start_time))
    print("\n")

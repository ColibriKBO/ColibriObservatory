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
    start_time = time.time()
    print(f"Testing field: RA={ra}, DEC={dec}, -test")
    result = subprocess.run(
        ['python', 'astrometry_correction.py', str(ra), str(dec)],
        capture_output=True,
        text=True
    )
    end_time = time.time()
    
    print("Standard Output:", result.stdout)
    print("Error:", result.stderr)
    print("Duration: {:.2f} seconds".format(end_time - start_time))
    print("\n")

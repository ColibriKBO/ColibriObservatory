import numpy as np
import os
import glob
from astropy.io import fits

# Input folder (your .rcd files)
INPUT_FOLDER = r'C:\Users\BlueBird\Documents\GitHub\ColibriObservatory\ACPScripts\Camera_use_python\rcd_frames'

# Output folder (sibling folder for .fits files)
OUTPUT_FOLDER = os.path.join(os.path.dirname(INPUT_FOLDER), 'rcd_frames_fits')
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Image size (2048 x 2048 for 2x2 binning)
IMG_W = 2048
IMG_H = 2048

# Find all .rcd files
rcd_files = sorted(glob.glob(os.path.join(INPUT_FOLDER, '*.rcd')))
print(f'Found {len(rcd_files)} .rcd files.')

for i, rcd_file in enumerate(rcd_files, 1):
    with open(rcd_file, 'rb') as f:
        header = f.read(384)
        img_data = np.frombuffer(f.read(), dtype=np.uint16)
        
        if img_data.size != IMG_W * IMG_H:
            print(f'Warning: unexpected image size in {rcd_file}')
            continue
        
        image = img_data.reshape((IMG_H, IMG_W))

    # Create FITS PrimaryHDU
    hdu = fits.PrimaryHDU(image)
    hdu.header['COMMENT'] = 'Converted from RCD'

    # Output .fits filename
    base_name = os.path.basename(rcd_file).replace('.rcd', '.fits')
    out_path = os.path.join(OUTPUT_FOLDER, base_name)
    hdu.writeto(out_path, overwrite=True)
    
    print(f'[{i}/{len(rcd_files)}] Saved: {out_path}')

print('\nAll files converted to FITS.')

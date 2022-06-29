import numpy as np
import matplotlib.pyplot as plt
from astropy.visualization import astropy_mpl_style, quantity_support
plt.style.use(astropy_mpl_style)
quantity_support()
import astropy.units as u
from astropy.time import Time
from astropy.coordinates import SkyCoord, EarthLocation, AltAz, get_sun, get_moon
from datetime import datetime as dt
import time


print(time.localtime().tm_hour-time.gmtime().tm_hour)

elginfield = EarthLocation(lat=43.192*u.deg, lon=-81.318*u.deg, height=586*u.m)
utcoffset = (time.localtime().tm_hour-time.gmtime().tm_hour)*u.hour  # Eastern Standard Time
time = Time('2012-7-12 00:00:00') - utcoffset

t = dt.now()
time = Time(t.strftime('%Y-%m-%d') + ' 00:00:00') - utcoffset

midnight = Time('2020-01-27 00:00:00') - utcoffset
print(midnight)
midnight = Time(time)
print(midnight)
delta_midnight = np.linspace(-12, 12, 1000)*u.hour
times_July12_to_13 = midnight + delta_midnight
frame_July12_to_13 = AltAz(obstime=times_July12_to_13, location=elginfield)
sunaltazs_July12_to_13 = get_sun(times_July12_to_13).transform_to(frame_July12_to_13)

moon_July12_to_13 = get_moon(times_July12_to_13)
moonaltazs_July12_to_13 = moon_July12_to_13.transform_to(frame_July12_to_13)

#print(int(t.strftime('%H'))+int(t.strftime('%M'))/60 + int(t.strftime('%S'))/3600)
#print(t.strftime("%Y-%m-%d %H:%M:%S"))

plt.plot(delta_midnight, sunaltazs_July12_to_13.alt, color='r', label='Sun')
plt.plot(delta_midnight, moonaltazs_July12_to_13.alt, color=[0.75]*3, ls='--', label='Moon')

plt.show()
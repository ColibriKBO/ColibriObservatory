import math
import time
import numpy as np

def twilightTimes(julian_date, site=[43.0,-81.0]):
	n = np.floor(julian_date -2451545.0 + 0.0008)
	Jstar = n - (site[1]/360.0)
	M = (357.5291 + 0.98560028 * Jstar) % 360.0
	C = 1.9148*np.sin(np.radians(M)) + 0.02*np.sin(2*np.radians(M)) + 0.0003*np.sin(3*np.radians(M))
	lam = (M + C + 180.0 + 102.9372) % 360.0
	Jtransit = 2451545.0 + Jstar + 0.0053*np.sin(np.radians(M)) - 0.0069*np.sin(2*np.radians(lam))
	sindec = np.sin(np.radians(lam)) * np.sin(np.radians(23.44))
	cosHA = (np.sin(np.radians(-12.0)) - (np.sin(np.radians(site[0]))*sindec)) / (np.cos(np.radians(site[0]))*np.cos(np.arcsin(sindec)))
	Jrise = Jtransit - (np.degrees(np.arccos(cosHA)))/360.0
	Jset = Jtransit + (np.degrees(np.arccos(cosHA)))/360.0

	return Jrise, Jset

Jrise, Jset = twilightTimes((time.time()/86400.0) + 2440587.5)
print(Jrise, Jset)

print((Jset-Jrise)*24)
print((Jrise-2440587.5)*86400)
print((Jset-2440587.5)*86400)

# function twilightTimes(jDate) // Returns astronomical twilight end (sunrise) and start (sunset) times as JD
# {
# 	lat = Telescope.SiteLatitude
# 	lon = Telescope.SiteLongitude
# 	n = np.floor(jDate - 2451545.0 + 0.0008)
# 	Jstar = n - (lon/360.0)
# 	M = (357.5291 + 0.98560028 * Jstar) % 360
# 	C = 1.9148*np.sin(Util.Degrees_Radians(M)) + 0.02*np.sin(2*Util.Degrees_Radians(M)) + 0.0003*np.sin(3*Util.Degrees_Radians(M))
# 	lam = (M + C + 180 + 102.9372) % 360
# 	Jtransit = 2451545.0 + Jstar + 0.0053*np.sin(Util.Degrees_Radians(M)) - 0.0069*np.sin(2*Util.Degrees_Radians(lam))
# 	sindec = np.sin(Util.Degrees_Radians(lam)) * np.sin(Util.Degrees_Radians(23.44))
# 	cosHA = (np.sin(Util.Degrees_Radians(-12)) - (np.sin(Util.Degrees_Radians(lat))*sindec)) / (np.cos(Util.Degrees_Radians(lat))*np.cos(np.asin(sindec)))
# 	Jrise = Jtransit - (Util.Radians_Degrees(np.acos(cosHA)))/360
# 	Jset = Jtransit + (Util.Radians_Degrees(np.acos(cosHA)))/360

# 	return [Jrise, Jset]
# }
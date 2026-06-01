"""src.constants

Project-wide constants and dictionary keys.

Compatibility notes:
- Do not rename or delete existing symbols here; they are used throughout the
    simulation codebase (and some may be persisted into on-disk artifacts).
- The classes below are intentionally simple namespaces (not Enums) to keep
    access patterns stable (e.g., ``FieldDataKeys.SNR``).
"""

# Public exports (primarily to make `from src.constants import *` predictable).
__all__ = [
    # Conversion factors
    'D_SUN',
    'RAD_TO_MAS',
    'AU',
    'MAS_TO_AS',
    'PARSECS_TO_M',
    # Gaia DR3 keys
    'GaiaDR3Keys',
    'GET_DATA_STR',
    # Field keys
    'FieldDataKeys',
    'MISSRATE',
    # KBO keys
    'KBODataKeys',
]

# ---------------------------------------------------------------------------
# Conversion factors
# ---------------------------------------------------------------------------

D_SUN = 1.391016e9  # Diameter of the sun in meters
RAD_TO_MAS = 2.063e8  # Convert Radians to milliarcseconds
AU = 1.495978707e11  # Convert AU to meters
MAS_TO_AS = 0.001  # Converts milliarcseconds to arcseconds
PARSECS_TO_M = 3.086e16  # Converts parsecs to meters


# ---------------------------------------------------------------------------
# Gaia DR3 data column keys
# ---------------------------------------------------------------------------


class GaiaDR3Keys:
    GID = 'SOURCE_ID'
    LON = 'ecl_lon'
    LAT = 'ecl_lat'
    RA = 'ra'
    DEC = 'dec'
    MAG = 'phot_g_mean_mag'
    PAR = 'parallax'
    PAR_ERR = 'parallax_error'
    RAD = 'radius_gspphot'
    RAD_ERR_UPPER = 'radius_gspphot_upper'
    RAD_ERR_LOWER = 'radius_gspphot_lower'
    REQUIRED_PARAMS = [GID, MAG, PAR, RAD]  # Stars without data in these columns are rejected in sorting for KBO search


# TODO: Figure out what to do with this.
GET_DATA_STR = 'Specify location of GAIA data'


# ---------------------------------------------------------------------------
# Field data keys
# ---------------------------------------------------------------------------

class FieldDataKeys:
    # Main keys
    COORD_STR_REG = 'CENTROID'  # Key for the region coordinates
    STAR_STR_REG = 'STARS'  # Key for the GAIA data for the stars in the region
    INFO_STR_REG = 'INFO'
    MISC_STR_REG = 'MISC'

    # INFO_STR_REG Subkeys
    NSTARS_TOTAL_REG = 'NSTARS_TOTAL'
    NSTARS_MAGLIM_REG = 'NSTARS_MAG_LIMITED'
    NSTARS_COMPLETE_REG = 'NSTARS_COMPLETE'
    NSTARS_SIZE_REG = 'NSTARS_SIZE_LIMITED'
    NSTARS_PLS_REG = 'NSTARS_POSITIVE_ERRORS'
    NSTARS_MIN_REG = 'NSTARS_NEGATIVE_ERRORS'

    # MISC_STR_REG Subkeys (also carries the previous information for some reason)
    NREGIONS_REG = 'NUMBER_OF_REGIONS'
    M_LIM_REG = 'MAG_LIMIT'
    NSTARS_M_REG = 'NSTARS_MAG_LIMITED'
    SIZE_LIM_REG = 'ANGULAR_SIZE_LIMIT_MAS'

    # Custom data keys for custom data that gets added at different stages in the simulation
    ANGSIZE = 'ANGULAR_SIZE'
    ANGSIZE_P = 'ANGULAR_SIZE_LARGE'
    ANGSIZE_M = 'ANGULAR_SIZE_SMALL'
    SNR = 'SNR'
    PREDICTED_SNR = 'PREDICTED_SNR'

    NSTARS_REG = 'NSTARS_SAMPLE'

    LATITUDE_SCORE = 'LATITUDE_SCORE'  # Score based on the latitude of the field

    ELON_REG = 'FIELD_CENTRE_ELON'
    ELAT_REG = 'FIELD_CENTRE_ELAT'
    WIDTH_REG = 'DX'
    HEIGHT_REG = 'DY'
    EXPOSURE_REG = 'exp'
    ALTITUDE_REG = 'ALTITUDE'
    ZENITH_REG = 'ZENITH_ANGLE'
    AIRMASS_REG = 'AIRMASS'


MISSRATE = 'Likelihood'  # Misc key for the KBO occultation dictionary


# ---------------------------------------------------------------------------
# KBO data keys
# ---------------------------------------------------------------------------


class KBODataKeys:
    # For calculating the model in Gladmann
    R_MIN = 'r_min'  # inner radial boundary, AU
    R_MAX = 'r_max'  # outer radial boundary, AU
    RADPOW = 'c'  # exponent for radial power law
    SIZPOW = 'q'  # exponent for differential size power law, small limit
    DK = 'Dk'  # KBO diameter (km) of 'break' in differential power size law
    MIN_DIAM = 'min_diam'  # minimum diameter (km) of KBO in which to probe
    C_VAL = 'C'  # albedo-based sky-surface-density constant, given by Gladmann
    R0_VAL = 'R0'  # R magnitude limit of sky survey, magnitudes
    AREA = 'sky_area'  # area of sky over which to probe, square degrees

    # The keys for translating those results into KBO parameters
    NOBJ = 'num_kbos'  # number of KBOs in the model
    BINS = 'kbo_diameter_grid'  # grid of KBO diameters to sample (km)
    DIAM = 'diameters'  # KBO diameters (km)
    HDIST = 'hdists'  # heliocentric KBO distances (AU)
    GDIST = 'gdists'  # geocentric KBO distances (AU)
    DX = 'dx'  # deviation in x-coordinate position relative to centre
    DY = 'dy'  # deviation in y-coordinate position relative to centre

    # The keys for defining the Colibri field
    ELON = 'elon'  # ecliptic longitude, based on field coords and DX
    ELAT = 'elat'  # ecliptic latitude, based on field coords and DY
    V_ELON = 'v_elon'  # ecliptic longitude velocity, km/second
    V_ELAT = 'v_elat'  # ecliptic latitude velocity, km/second
    PM_TOTAL = 'pm_total'  # total apparent proper motion, arcmin/hour

    # Cartesian positions and velocities (heliocentric ecliptic frame)
    X = 'x_ecl'  # x-coordinate position, AU
    Y = 'y_ecl'  # y-coordinate position, AU
    Z = 'z_ecl'  # z-coordinate position, AU
    V_X = 'vx_ecl'  # x-coordinate velocity, km/second
    V_Y = 'vy_ecl'  # y-coordinate velocity, km/second
    V_Z = 'vz_ecl'  # z-coordinate velocity, km/second

    PATHS = 'paths'  # heads of vectors in field where KBO will move in simulation
    ANGSIZE_KBO = 'angsize_kbo'  # angular size of KBO, degrees
    OCCULTATION_DIAM = 'occultation_diam'  # effective occultation diameter (km), clamped to Fresnel scale
    ANGSIZE_KBO_OCC = 'angsize_kbo_occ'  # occultation angular size of KBO (degrees), from OCCULTATION_DIAM
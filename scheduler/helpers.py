"""Scheduling helpers vendored from Colibri_Simulations/src/support/helpers.py.

Only `get_transverse_velocity` is needed by the standalone scheduler.
"""

import math

import numpy as np


def get_transverse_velocity(dist, elongation_deg):
    '''Calculate the relative angular velocity of an object at a particular distance, given its relative position to Earth and Sun.'''

    elongation = math.radians(elongation_deg)  # Convert elongation from degrees to radians
    v_earth = 29747  # m/s
    dist_ratio = 1. / dist

    relative_velocity = v_earth * (np.sqrt(dist_ratio*(1-((dist_ratio**2)*(math.sin(elongation)**2)))) +
                                   math.cos(elongation))  # m/s, found in richards paper Eq11

    return relative_velocity  # m/s

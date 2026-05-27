"""
Filename:   astrometry_correction.py
Description:
    Per-pointing astrometric corrector for the Colibri array. Solves a
    reference image (RCD or FITS) against either a local
    `solve-field` (via WSL) or astrometry.net online, and prints the
    (ra_offset, dec_offset) in decimal degrees between the requested
    target and the image centre.

Stdout contract (relied on by RunColibri.js::parseOffsets):
    Exactly one line of output: "<ra_offset> <dec_offset>"
    On any failure, that line is "0.0 0.0" and the exit code is non-zero.
    Every diagnostic / progress / traceback message goes to stderr.

Usage:
    astrometry_correction.py RA DEC [-i IMG] [--solver {local,online}]
                                    [--verbose] [--plot]

Environment overrides:
    COLIBRI_BASE             Default Windows: D:/  ; Linux: ~/colibri-sim
    COLIBRI_TMP              Default {COLIBRI_BASE}/tmp
    COLIBRI_GRAB_EXE         Path to ColibriGrab.exe
    COLIBRI_ASTROMETRY_KEY   astrometry.net API key
    COLIBRI_SOLVE_TIMEOUT    Seconds (default 150)
"""

import argparse
import binascii
import os
import platform
import subprocess
import sys
import time
import traceback
from pathlib import Path

import numpy as np
import numba as nb
from astropy.io import fits
from astropy.io.fits import Header
from astropy import wcs


# ----------------------------- configuration ------------------------------- #

def _default_base() -> Path:
    if platform.system() == "Windows":
        return Path("D:/")
    return Path.home() / "colibri-sim"


BASE_PATH = Path(os.environ.get("COLIBRI_BASE", str(_default_base())))
TMP_PATH = Path(os.environ.get("COLIBRI_TMP", str(BASE_PATH / "tmp")))
GRAB_EXE = Path(os.environ.get(
    "COLIBRI_GRAB_EXE",
    str(Path.home() / "Documents/GitHub/ColibriGrab/ColibriGrab/ColibriGrab.exe"),
))
ASTROMETRY_KEY = os.environ.get("COLIBRI_ASTROMETRY_KEY", "vbeenheneoixdbpb")
SOLVE_TIMEOUT = int(os.environ.get("COLIBRI_SOLVE_TIMEOUT", "150"))

IMG_WIDTH = 2048
BIT_DEPTH = 12
IMG_SIZE = IMG_WIDTH ** 2

# Replaced at runtime when --verbose is set.
def _noop(*_a, **_k): pass
verboseprint = _noop


def _emit(msg: str) -> None:
    """Diagnostic line to stderr — never stdout."""
    print(msg, file=sys.stderr, flush=True)


def _fail(reason: str) -> None:
    """Emit reason to stderr and the failure sentinel to stdout, then exit 1."""
    _emit(f"ERROR: {reason}")
    print("0.0 0.0", flush=True)
    sys.exit(1)


# ----------------------------- path helpers -------------------------------- #

def to_wsl_path(p) -> str:
    """Convert a Windows path to a WSL /mnt/<drive>/... path."""
    s = str(p).replace("\\", "/")
    if len(s) >= 2 and s[1] == ":":
        drive = s[0].lower()
        rest = s[2:].lstrip("/")
        return f"/mnt/{drive}/{rest}"
    return s


# --------------------------------- RCD I/O --------------------------------- #

def _read_bytes(fid, start: int, n: int) -> bytes:
    fid.seek(start)
    return fid.read(n)


@nb.njit(nb.uint16[::1](nb.uint8[::1]), fastmath=True, parallel=True)
def conv_12to16(data_chunk):
    """Unpack 12-bit packed pixels into 16-bit values."""
    assert np.mod(data_chunk.shape[0], 3) == 0
    out = np.empty(data_chunk.shape[0] // 3 * 2, dtype=np.uint16)
    for i in nb.prange(data_chunk.shape[0] // 3):
        a = np.uint16(data_chunk[i * 3])
        b = np.uint16(data_chunk[i * 3 + 1])
        c = np.uint16(data_chunk[i * 3 + 2])
        out[i * 2] = (a << 4) + (b >> 4)
        out[i * 2 + 1] = ((b % 16) << 8) + c
    return out


def read_rcd(filename: Path):
    """Read a .rcd file. Returns (header-dict, 2D high-gain image)."""
    with open(filename, "rb") as rcd:
        hdict = {
            "serialnum": _read_bytes(rcd, 63, 9),
            "exptime":   _read_bytes(rcd, 85, 4),
            "timestamp": _read_bytes(rcd, 152, 29),
            "lat":       _read_bytes(rcd, 182, 4),
            "lon":       _read_bytes(rcd, 186, 4),
        }
        rcd.seek(384, 0)
        raw = np.fromfile(rcd, dtype=np.uint8, count=int(IMG_SIZE * 2 * (BIT_DEPTH / 8)))
        data = conv_12to16(raw)
        data = data.reshape(2 * IMG_WIDTH, IMG_WIDTH)[1::2]
    return hdict, data


def read_fits(filename: Path):
    with fits.open(filename) as hdul:
        return hdul[0].header, hdul[0].data


def _decode_lat_lon(lat_raw_bytes, lon_raw_bytes):
    degdiv = 600000.0
    degmask = 0x7fffffff
    dirmask = 0x80000000
    latraw = int(binascii.hexlify(lat_raw_bytes), 16)
    lonraw = int(binascii.hexlify(lon_raw_bytes), 16)
    lat = (latraw & degmask) / degdiv * (1 if (latraw & dirmask) else -1)
    lon = (lonraw & degmask) / degdiv * (1 if (lonraw & dirmask) else -1)
    return lat, lon


def write_fits_from_rcd(filename: Path, hdict: dict, data: np.ndarray) -> None:
    """Write an RCD-derived image to a FITS file the solvers can ingest."""
    lat, lon = _decode_lat_lon(hdict["lat"], hdict["lon"])
    hdu = fits.PrimaryHDU(data)
    hdr = hdu.header
    hdr.set("EXPTIME", int(binascii.hexlify(hdict["exptime"]), 16) * 10.32 / 1e6)
    hdr.set("DATE-OBS", hdict["timestamp"].decode("utf-8", errors="replace"))
    hdr.set("SITELAT", lat)
    hdr.set("SITELONG", lon)
    hdr.set("SERIAL", hdict["serialnum"].decode("utf-8", errors="replace"))
    hdu.writeto(filename, overwrite=True)


def ensure_fits(image_path: Path, work_dir: Path) -> Path:
    """Return a FITS path for the given image, converting from RCD if needed."""
    if image_path.suffix.lower() == ".fits":
        return image_path
    if image_path.suffix.lower() == ".rcd":
        verboseprint(f"Converting {image_path} to FITS...")
        hdict, data = read_rcd(image_path)
        ts = time.strftime("%Y%m%d_%H%M%S")
        out = work_dir / f"astr_corr_{image_path.stem}_{ts}.fits"
        write_fits_from_rcd(out, hdict, data)
        return out
    raise ValueError(f"Unsupported image type: {image_path.suffix}")


# ------------------------------- solvers ----------------------------------- #

def _solve_local(fits_path: Path, work_dir: Path, order: int) -> Header:
    """Solve with WSL `solve-field`. Returns the WCS Header."""
    fits_wsl = to_wsl_path(fits_path)
    work_wsl = to_wsl_path(work_dir)
    out_fits = work_dir / f"{fits_path.stem}.solved.fits"
    out_wsl = to_wsl_path(out_fits)

    cmd = [
        "wsl", "solve-field",
        "--no-plots",
        "-D", work_wsl,
        "-N", out_wsl,
        "-t", str(order),
        "--scale-units", "arcsecperpix",
        "--scale-low", "2.2",
        "--scale-high", "2.6",
        "--overwrite",
        fits_wsl,
    ]
    verboseprint("Running:", " ".join(cmd))
    result = subprocess.run(
        cmd,
        check=True,
        timeout=SOLVE_TIMEOUT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    verboseprint(result.stdout)
    if not out_fits.exists():
        raise FileNotFoundError(f"solve-field did not produce {out_fits}")
    with fits.open(out_fits) as hdul:
        return hdul[0].header


def _solve_online(fits_path: Path, work_dir: Path, order: int) -> Header:
    """Solve with astrometry.net online. Returns the WCS Header."""
    from astroquery.astrometry_net import AstrometryNet
    ast = AstrometryNet()
    ast.api_key = ASTROMETRY_KEY
    verboseprint(f"Submitting {fits_path} to astrometry.net (tweak_order={order})...")
    wcs_header = ast.solve_from_image(
        str(fits_path),
        crpix_center=True,
        tweak_order=order,
        force_image_upload=True,
        solve_timeout=SOLVE_TIMEOUT,
    )
    if wcs_header is None:
        raise RuntimeError("astrometry.net returned no solution")
    save_path = work_dir / f"{fits_path.stem}.wcs"
    try:
        wcs_header.tofile(save_path, overwrite=True)
    except TypeError:
        if not save_path.exists():
            wcs_header.tofile(save_path)
    return wcs_header


def solve_wcs(fits_path: Path, work_dir: Path, solver: str, order: int = 4) -> wcs.WCS:
    work_dir.mkdir(parents=True, exist_ok=True)
    if solver == "local":
        header = _solve_local(fits_path, work_dir, order)
    elif solver == "online":
        header = _solve_online(fits_path, work_dir, order)
    else:
        raise ValueError(f"Unknown solver: {solver}")
    return wcs.WCS(header)


# ----------------------- pixel <-> sky coordinate ops ---------------------- #

def pixel_to_radec(transform: wcs.WCS, x: float, y: float):
    radec = transform.pixel_to_world(x, y)
    return float(radec.ra.degree), float(radec.dec.degree)


def radec_to_pixel(transform: wcs.WCS, ra: float, dec: float):
    px = transform.wcs_world2pix(np.array([[ra, dec]]), 0)
    return float(px[0, 0]), float(px[0, 1])


# ------------------------ acquisition helper (prod) ------------------------ #

def grab_reference_image() -> Path:
    """Run ColibriGrab.exe to acquire a single reference RCD and return its path."""
    write_dir = BASE_PATH / "tmp"
    write_dir.mkdir(parents=True, exist_ok=True)
    cmd = (
        f'"{GRAB_EXE}" -n 1 -p pointing_reference -e 1000 -t 0 -f normal '
        f'-w {write_dir}\\'
    )
    verboseprint("Running grab:", cmd)
    os.system(cmd)

    subdirs = [d for d in write_dir.iterdir() if d.is_dir()]
    if not subdirs:
        raise FileNotFoundError(f"No grab subdirectory under {write_dir}")
    latest = max(subdirs, key=os.path.getmtime)
    img = latest / "pointing_reference_0000001.rcd"
    if not img.exists():
        raise FileNotFoundError(f"Could not find grabbed image at {img}")
    return img


# ----------------------------- main work paths ----------------------------- #

def correct_pointing(target_ra: float, target_dec: float,
                     image_path: Path, solver: str, plot: bool) -> tuple:
    """Solve `image_path`, return (ra_offset, dec_offset, ref_ra, ref_dec, image_data)."""
    fits_path = ensure_fits(image_path, TMP_PATH)
    verboseprint(f"Solving {fits_path} with solver={solver}...")
    transform = solve_wcs(fits_path, TMP_PATH, solver)
    ref_ra, ref_dec = pixel_to_radec(transform, IMG_WIDTH / 2, IMG_WIDTH / 2)
    verboseprint(f"Reference centre: RA={ref_ra}, Dec={ref_dec}")
    ra_offset = target_ra - ref_ra
    dec_offset = target_dec - ref_dec

    if plot:
        _plot(fits_path, transform, target_ra, target_dec, ra_offset, dec_offset)
    return ra_offset, dec_offset, ref_ra, ref_dec


def _plot(fits_path: Path, transform: wcs.WCS,
          target_ra: float, target_dec: float,
          ra_offset: float, dec_offset: float) -> None:
    import matplotlib.pyplot as plt
    from matplotlib.colors import LogNorm
    _, data = read_fits(fits_path)
    fig, ax = plt.subplots()
    ax.imshow(data, cmap="gray", origin="upper", norm=LogNorm())
    ax.plot(IMG_WIDTH / 2, IMG_WIDTH / 2, "r+", label="Centre")
    tx, ty = radec_to_pixel(transform, target_ra, target_dec)
    ax.plot(tx, ty, "c+", label="Target")
    ax.text(0.05, 0.95,
            f"RA offset: {ra_offset:.4f}\nDec offset: {dec_offset:.4f}",
            transform=ax.transAxes, ha="left", va="top", color="w")
    ax.legend()
    plt.show()


# --------------------------------- CLI ------------------------------------- #

def _parse_args(argv=None):
    p = argparse.ArgumentParser(description="Astrometric correction for Colibri.")
    p.add_argument("coords", type=float, nargs=2, metavar=("RA", "DEC"),
                   help="Target (RA DEC) in decimal degrees.")
    p.add_argument("-i", "--image", type=str, default=None,
                   help="Path to an existing reference image (.rcd or .fits). "
                        "If omitted, ColibriGrab.exe is used to acquire one.")
    p.add_argument("--solver", choices=("local", "online"), default="online",
                   help="WCS solver backend (default: online).")
    p.add_argument("--verbose", action="store_true",
                   help="Emit progress messages to stderr.")
    p.add_argument("--plot", action="store_true",
                   help="Show a matplotlib plot of the solved image with target marker.")
    return p.parse_args(argv)


def main(argv=None) -> int:
    global verboseprint
    args = _parse_args(argv)

    if args.verbose:
        verboseprint = _emit

    TMP_PATH.mkdir(parents=True, exist_ok=True)

    try:
        target_ra, target_dec = args.coords

        if args.image is None:
            try:
                image_path = grab_reference_image()
            except Exception as e:
                _fail(f"Grab failed: {e}")
        else:
            image_path = Path(args.image)
            if not image_path.exists():
                _fail(f"Image not found: {image_path}")

        ra_off, dec_off, _, _ = correct_pointing(
            target_ra, target_dec, image_path, args.solver, args.plot,
        )
        print(f"{ra_off} {dec_off}", flush=True)
        return 0

    except SystemExit:
        raise
    except Exception:
        _emit("Unhandled exception in astrometry_correction.py:")
        _emit(traceback.format_exc())
        print("0.0 0.0", flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())

import ctypes
from ctypes import wintypes, c_int32, c_uint32, c_uint64, c_uint16, c_uint8, c_bool, c_double, POINTER, byref
import os
import time

# === Config ===
dll_path = r"C:\Users\BlueBird\Documents\GitHub\ColibriObservatory\ACPScripts\Camera_use_python\libflipro.x64.dll"
output_dir = r"D:\TestImages\FLI\StreamTest"
os.makedirs(output_dir, exist_ok=True)

stream_prefix = "StreamTest_"
num_frames = 2400
exposure_us = 25  # 25 ms
delay_us = 0
width = 2048
height = 2048

# === Load DLL ===
lib = ctypes.WinDLL(dll_path)

# === Structs ===
class FPRODEVICEINFO(ctypes.Structure):
    _fields_ = [
        ("cFriendlyName", ctypes.c_wchar * 256),
        ("cSerialNo", ctypes.c_wchar * 256),
        ("cDevicePath", ctypes.c_wchar * 512),
        ("eConnType", ctypes.c_uint32),
        ("uiVendorId", ctypes.c_uint32),
        ("uiProdId", ctypes.c_uint32),
        ("eUSBSpeed", ctypes.c_uint32)
    ]

class FPROSENSMODE(ctypes.Structure):
    _fields_ = [
        ("uiModeIndex", ctypes.c_uint32),
        ("wcModeName", ctypes.c_wchar * 32)
    ]

class FPROSTREAMSTATS(ctypes.Structure):
    _fields_ = [
        ("uiDiskFramesWritten", c_uint32),
        ("iStatus", c_int32)
    ]

# === Function Signatures ===
lib.FPROCam_GetCameraList.argtypes = (POINTER(FPRODEVICEINFO), POINTER(c_uint32))
lib.FPROCam_GetCameraList.restype = c_int32

lib.FPROCam_Open.argtypes = (POINTER(FPRODEVICEINFO), POINTER(c_int32))
lib.FPROCam_Open.restype = c_int32

lib.FPROCam_Close.argtypes = (c_int32,)
lib.FPROCam_Close.restype = c_int32

lib.FPROSensor_GetModeCount.argtypes = (c_int32, POINTER(c_uint32), POINTER(c_uint32))
lib.FPROSensor_GetModeCount.restype = c_int32

lib.FPROSensor_GetMode.argtypes = (c_int32, c_uint32, POINTER(FPROSENSMODE))
lib.FPROSensor_GetMode.restype = c_int32

lib.FPROSensor_SetMode.argtypes = (c_int32, c_uint32)
lib.FPROSensor_SetMode.restype = c_int32

lib.FPROSensor_SetBinning.argtypes = (c_int32, c_uint32, c_uint32)
lib.FPROSensor_SetBinning.restype = c_int32

lib.FPROFrame_ComputeFrameSize.argtypes = (c_int32, c_uint32, c_uint32)
lib.FPROFrame_ComputeFrameSize.restype = c_int32

lib.FPROCtrl_SetExposure.argtypes = (c_int32, c_uint64, c_uint64, c_bool)
lib.FPROCtrl_SetExposure.restype = c_int32

lib.FPROFrame_StreamInitialize.argtypes = (c_int32, c_uint32, ctypes.c_wchar_p, ctypes.c_wchar_p)
lib.FPROFrame_StreamInitialize.restype = c_int32

lib.FPROFrame_StreamStart.argtypes = (c_int32, c_uint32, c_uint64)
lib.FPROFrame_StreamStart.restype = c_int32

lib.FPROFrame_StreamGetStatistics.argtypes = (c_int32, POINTER(FPROSTREAMSTATS))
lib.FPROFrame_StreamGetStatistics.restype = c_int32

lib.FPROFrame_StreamStop.argtypes = (c_int32,)
lib.FPROFrame_StreamStop.restype = c_int32

lib.FPROFrame_StreamDeinitialize.argtypes = (c_int32,)
lib.FPROFrame_StreamDeinitialize.restype = c_int32

# === Camera Detection ===
dev_info_array = (FPRODEVICEINFO * 1)()
num_devices = c_uint32(1)

lib.FPROCam_GetCameraList(dev_info_array, byref(num_devices))
time.sleep(1)

if num_devices.value < 1:
    raise RuntimeError("No FLI cameras found")

print(f"Found {num_devices.value} camera(s). Opening first.")

handle = c_int32(-1)
res = lib.FPROCam_Open(byref(dev_info_array[0]), byref(handle))
time.sleep(2)
if res < 0:
    raise RuntimeError("Failed to open camera")
cam = handle.value
print("Camera opened.")

# === HDR Mode Selection ===
mode_count = c_uint32(0)
current_mode = c_uint32(0)
lib.FPROSensor_GetModeCount(cam, byref(mode_count), byref(current_mode))
time.sleep(5)

chosen_mode = None
for i in range(mode_count.value):
    mode = FPROSENSMODE()
    lib.FPROSensor_GetMode(cam, i, byref(mode))
    mode_name = mode.wcModeName
    print(f"Mode {i}: {mode_name}")
    if "HDR Rolling Reset 2x2" in mode_name:
        chosen_mode = mode.uiModeIndex
        print(f"Selecting mode: {mode_name}")
        lib.FPROSensor_SetMode(cam, mode.uiModeIndex)
        time.sleep(1)
        break

if chosen_mode is None:
    print("Warning: HDR/VIDEO mode not found — using default mode.")

# === Binning ===
lib.FPROSensor_SetBinning(cam, 2, 2)
print("Binning set to 2x2.")

# === Frame Size ===
frame_bytes = lib.FPROFrame_ComputeFrameSize(cam, width, height)
print(f"Computed frame size: {frame_bytes} bytes")

# === Exposure ===
res = lib.FPROCtrl_SetExposure(cam, c_uint64(exposure_us*1000000), c_uint64(delay_us), c_bool(False))
if res < 0:
    raise RuntimeError("Failed to set exposure")
print(f"Exposure set to {exposure_us} ms")

# === Stream Init ===
stream_prefix_w = stream_prefix
stream_dir_w = output_dir

res = lib.FPROFrame_StreamInitialize(cam, frame_bytes, stream_dir_w, stream_prefix_w)
if res < 0:
    raise RuntimeError("Failed to initialize stream")
print("Stream initialized.")

# === Stream Start ===
res = lib.FPROFrame_StreamStart(cam, num_frames, exposure_us)
if res < 0:
    raise RuntimeError("Failed to start stream")
print("Streaming started...")

# === Monitor ===
stats = FPROSTREAMSTATS()
written = 0
start_time = time.time()

while True:
    lib.FPROFrame_StreamGetStatistics(cam, byref(stats))
    print(f"\rFrames written: {stats.uiDiskFramesWritten}", end='', flush=True)
    if stats.uiDiskFramesWritten >= num_frames:
        break
    time.sleep(0.1)

# === Cleanup ===
print("\nStream complete. Stopping...")
lib.FPROFrame_StreamStop(cam)
lib.FPROFrame_StreamDeinitialize(cam)
lib.FPROCam_Close(cam)

elapsed = time.time() - start_time
fps = num_frames / elapsed
print(f"Done. Total time: {elapsed:.2f} s | Effective FPS: {fps:.2f}")

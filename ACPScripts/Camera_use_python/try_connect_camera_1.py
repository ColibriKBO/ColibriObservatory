import ctypes
from ctypes import POINTER, byref, c_int32, c_uint32, c_wchar

dll_path = r"C:\Users\BlueBird\Documents\GitHub\ColibriObservatory\ACPScripts\Camera_use_python\libflipro.x64.dll"
lib = ctypes.WinDLL(dll_path)

class FPRODEVICEINFO(ctypes.Structure):
    _fields_ = [
        ("cFriendlyName", c_wchar * 256),
        ("cSerialNo", c_wchar * 256),
        ("cDevicePath", c_wchar * 512),
        ("eConnType", c_uint32),
        ("uiVendorId", c_uint32),
        ("uiProdId", c_uint32),
        ("eUSBSpeed", c_uint32)
    ]

lib.FPROCam_GetCameraList.argtypes = (POINTER(FPRODEVICEINFO), POINTER(c_uint32))
lib.FPROCam_GetCameraList.restype = c_int32

lib.FPROCam_Open.argtypes = (POINTER(FPRODEVICEINFO), POINTER(c_int32))
lib.FPROCam_Open.restype = c_int32

dev_info_array = (FPRODEVICEINFO * 1)()
num_devices = c_uint32(1)

res_list = lib.FPROCam_GetCameraList(dev_info_array, byref(num_devices))
if res_list < 0 or num_devices.value < 1:
    print("NO_CAMERA")
    exit(1)

handle = c_int32(-1)
res_open = lib.FPROCam_Open(byref(dev_info_array[0]), byref(handle))

if res_open == 0:
    print("SUCCESS")
    exit(0)
else:
    print(f"FAIL_OPEN {res_open}")
    exit(2)

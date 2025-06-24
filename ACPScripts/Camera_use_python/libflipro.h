///
/// @file libflipro.h
///
/// @brief Finger Lakes Instrumentation Camera API
///
/// The library uses the standard way of creating macros which make exporting
/// from a DLL simpler. All files within this DLL are compiled with the LIBFLIPRO_EXPORTS
/// symbol defined on the command line. This symbol should not be defined on any project
/// that uses this DLL. This way any other project whose source files include this file see 
/// LIBFLIPRO_API functions as being imported from a DLL, whereas this DLL sees symbols
/// defined with this macro as being exported.
///

#ifdef __cplusplus
extern "C" { 
#endif

#ifndef _LIBFLIPRO_H_
/// @cond DO_NOT_DOCUMENT
#define _LIBFLIPRO_H_
/// @endcond

#ifdef __linux__
#include <wchar.h>
#include <stdarg.h>
#endif
#include "stdbool.h"
#include "stdint.h"

// The following ifdef block is the standard way of creating macros which make exporting 
// from a DLL simpler. All files within this DLL are compiled with the LIBFLIPRO_EXPORTS
// symbol defined on the command line. This symbol should not be defined on any project
// that uses this DLL. This way any other project whose source files include this file see 
// LIBFLIPRO_API functions as being imported from a DLL, whereas this DLL sees symbols
// defined with this macro as being exported.
/// @cond DO_NOT_DOCUMENT
#if defined(_WIN32) || defined(_WINDOWS)
#ifdef LIBFLIPRO_EXPORTS
#define LIBFLIPRO_API __declspec(dllexport) int32_t 
#define LIBFLIPRO_API_DATA __declspec(dllexport)
#define LIBFLIPRO_VOID __declspec(dllexport) void
#else
#define LIBFLIPRO_API __declspec(dllimport) int32_t 
#define LIBFLIPRO_API_DATA __declspec(dllimport)
#define LIBFLIPRO_VOID __declspec(dllimport) void
#endif

#endif

#ifdef __linux__
#define LIBFLIPRO_API int32_t
#define LIBFLIPRO_API_DATA
#define LIBFLIPRO_VOID void
#endif
/// @endcond

////////////////////////////////////////////////////////////////////////
// Typedefs, Defines, Macros
////////////////////////////////////////////////////////////////////////
// Version information
/// @cond DO_NOT_DOCUMENT
#define FPRO_API_VERSION_MAJOR (1)
#define FPRO_API_VERSION_MINOR (11)    // Should change if must change the Camera side as well
#define FPRO_API_VERSION_BUILD (23)    // Minor changes not requiring Camera change
/// @endcond

//
// Some Helpful #defines
///
/// @brief Convert image size in  Bytes to Pixels
///
/// The frame size is 1.5 * width * height (12 bit pixels)
/// This macro only works if the pixel size is 12 bits.
#define FPRO_IMAGE_FRAMEBYTES_TO_PIXELS(__framebytes)  (((__framebytes) << 1) / 3)
///
/// @brief Convert Pixels to Image size in Bytes
///
/// This macro only works if the pixel size is 12 bits.
#define FPRO_IMAGE_PIXELS_TO_FRAMEBYTES(__pixels)  (((__pixels) & 0x1) ? ((((__pixels) * 3 ) >> 1) + 1) : (((__pixels) * 3 ) >> 1))
///
/// @brief Convert image dimensions in Pixels to Image size in Bytes
///
/// This macro only works if the pixel size is 12 bits.
#define FPRO_IMAGE_DIMENSIONS_TO_FRAMEBYTES(__width,__height)  FPRO_IMAGE_PIXELS_TO_FRAMEBYTES((__width) * (__height))
///
/// @brief Maximum number of pre/post frame Reference rows supported by the API.
///
/// This number should be treated as a constant.
#define FPRO_REFERENCE_ROW_MAX  (4094)
///
/// @brief Height of Thumbnail image in pixels.
#define FPRO_THUMBNAIL_ROWS  (512)
///
/// @brief Width of Thumbnail image in pixels.
#define FPRO_THUMBNAIL_COLUMNS  (512)
///
/// @brief Max pixel depth
///
/// Use this macro to extract the Max Pixel depth supported by
/// the device from the FPROCAP capabilities structure.
///
#define FPRO_GET_MAX_PIXEL_DEPTH(__pCapCam, __uiMax)	{	\
															if (__pCapCam)	\
															{	\
																for (int __ix = 0; __ix < 32; ++__ix)	\
																	if (__pCapCam->uiAvailablePixelDepths & (1 << __ix))	\
																		__uiMax = __ix + 1;	\
															}	\
															else   \
															{	\
																__uiMax = 12;	\
															}	\
														}


///
/// @brief Known Device Types
/// @enum FPRODEVICETYPE
///
/// These constants are returned in the Device Capabilities Structure 
/// FPROCAP in the uiDeviceType field.
/// See the user manual for a description of the capabilities for 
/// your device.
///
/// @var FPRODEVICETYPE::FPRO_CAM_DEVICE_TYPE_GSENSE400
/// @brief Enum value = 0x01000400
/// @var FPRODEVICETYPE::FPRO_CAM_DEVICE_TYPE_GSENSE2020
/// @brief Enum value = 0x01002020
/// @var FPRODEVICETYPE::FPRO_CAM_DEVICE_TYPE_GSENSE4040
/// @brief Enum value = 0x01004040
/// @var FPRODEVICETYPE::FPRO_CAM_DEVICE_TYPE_KODAK47051
/// @brief Enum value = 0x02047051
/// @var FPRODEVICETYPE::FPRO_CAM_DEVICE_TYPE_KODAK29050
/// @brief Enum value = 0x02029050
/// @var FPRODEVICETYPE::FPRO_CAM_DEVICE_TYPE_DC230_42
/// @brief Enum value = 0x03023042
/// @var FPRODEVICETYPE::FPRO_CAM_DEVICE_TYPE_DC230_84
/// @brief Enum value = 0x03023084
/// 
typedef enum
{
	FPRO_CAM_DEVICE_TYPE_GSENSE400  = 0x01000400,
	FPRO_CAM_DEVICE_TYPE_GSENSE2020 = 0x01002020,
	FPRO_CAM_DEVICE_TYPE_GSENSE4040 = 0x01004040,
	FPRO_CAM_DEVICE_TYPE_GSENSE6060 = 0x01006060,
	FPRO_CAM_DEVICE_TYPE_KODAK47051 = 0x02047051,
	FPRO_CAM_DEVICE_TYPE_KODAK29050 = 0x02029050,
	FPRO_CAM_DEVICE_TYPE_DC230_42   = 0x03023042,
	FPRO_CAM_DEVICE_TYPE_DC230_84 = 0x03023084,
	FPRO_CAM_DEVICE_TYPE_DC4320   = 0x03004320
} FPRODEVICETYPE;

///
/// @brief Maximum String Length
///
/// The maximum number of characters (not bytes) allowed in USB strings throughout
/// the API.
///
#define FPRO_USB_STRING_MAXLEN  (256)

///
/// @brief Maximum path length for low level OS device path
///
/// The maximum number of characters (not bytes) allowed for device path
/// strings throughout the API.
///
#define FPRO_DEVICE_MAX_PATH_LENGTH  (1024)

///
/// @brief Supported Connection Types
/// @enum FPROCONNECTION
///
/// This enumeration is used as part of the FPRODEVICEINFO structure to
/// return the physical connection type to the camera.
///
/// @var FPROCONNECTION::FPRO_CONNECTION_USB 
/// @brief Camera is connected with a USB link.
///
/// @var FPROCONNECTION::FPRO_CONNECTION_FIBRE 
/// @brief Camera is connected with a Fibre Optic link.
///
typedef enum
{
	FPRO_CONNECTION_USB,
	FPRO_CONNECTION_FIBRE,
} FPROCONNECTION;

///
/// @brief Known USB Connection Speeds
/// @enum FPROUSBSPEED
///
/// This enumeration is used as part of the FPRODEVICEINFO structure to
/// return the detected USB connection speed.  FLI Cameras require a
/// FPRO_USB_SUPERSPEED USB connection in order to transfer image data reliably.
///
/// @var FPROUSBSPEED::FPRO_USB_FULLSPEED 
/// @brief Full Speed Connection
///
/// @var FPROUSBSPEED::FPRO_USB_HIGHSPEED 
/// @brief High Speed Connection
///
/// @var FPROUSBSPEED::FPRO_USB_SUPERSPEED 
/// @brief Super Speed Connection
///
typedef enum
{
	FPRO_USB_FULLSPEED,
	FPRO_USB_HIGHSPEED,
	FPRO_USB_SUPERSPEED
} FPROUSBSPEED;

///
/// @typedef device_info_t FPRODEVICEINFO
/// @brief Device Information
///
/// This is used as the Camera Device enumeration structure.  It is
/// returned by the #FPROCam_GetCameraList function and contains the
/// list of detected cameras.  To open a connection to a specific camera,
/// a single FPRODEVICEINFO structure is passed to the #FPROCam_Open function.
///
/// @var FPRODEVICEINFO::cFriendlyName 
/// @brief Human readable friendly name of the USB device.
///        This string along with the cSerialNo field provide a unique name
///        for your device suitable for a user interface.
/// @var FPRODEVICEINFO::cSerialNo 
/// @brief The manufacturing serial number of the device.
/// @var FPRODEVICEINFO::cDevicePath
/// @brief The OS device Path.  Used internally by the API for opening requisite file 
///        descriptors to connect to the device.
/// @var FPRODEVICEINFO::eConnType 
/// @brief The physical connection type.  If the connection type is FPRO_CONNECTION_USB, then the
///        uiVendorId, uiProdId, and eUSBSpeed fields are also filled in.  Otherwise those fields
///        are not used and their contents is undefined.
/// @var FPRODEVICEINFO::uiVendorId 
/// @brief The USB vendor ID.  This field is applicable only when the eCOnnType is #FPRO_CONNECTION_USB.
/// @var FPRODEVICEINFO::uiProdId 
/// @brief The USB Product ID.  This field is applicable only when the eCOnnType is #FPRO_CONNECTION_USB.
/// @var FPRODEVICEINFO::eUSBSpeed 
/// @brief The USB connection speed of the device.  This field is applicable only when the eCOnnType is #FPRO_CONNECTION_USB.
/// <br>NOTE: When connected through USB, FLI Cameras require a FPRO_USB_SUPERSPEED USB connection 
///           in order to transfer image data reliably.
typedef struct device_info_t
{
	wchar_t        cFriendlyName[FPRO_USB_STRING_MAXLEN];
	wchar_t        cSerialNo[FPRO_USB_STRING_MAXLEN];
	wchar_t        cDevicePath[FPRO_DEVICE_MAX_PATH_LENGTH];
	FPROCONNECTION eConnType;
	uint32_t       uiVendorId;
	uint32_t       uiProdId;
	FPROUSBSPEED   eUSBSpeed;
} FPRODEVICEINFO;


///
/// @brief Version String Lengths
///
/// Maximum length characters (not bytes) of version strings.
#define FPRO_VERSION_STRING_MAXLEN  (32)
///
/// @typedef device_version_info_t FPRODEVICEVERS
/// @brief Device Version Information
///
/// Contains the various version numbers supplied by the device.
/// See #FPROCam_GetDeviceVersion.
///
/// @var FPRODEVICEVERS::cFirmwareVersion
/// @brief The version of firmware on the internal device processor.
/// @var FPRODEVICEVERS::cFPGAVersion
/// @brief The version of firmware on the internal FPGA device.
/// @var FPRODEVICEVERS::cControllerVersion
/// @brief The version of firmware on the internal sensor controller device.
/// @var FPRODEVICEVERS::cHostHardwareVersion
/// @brief The version of firmware on the host interface card if any.  For example,
///        it returns the hardware version of the Host PCIE card for Fibre connections.
///        For USB connections, there is no host side interface card so '0' is returned.
typedef struct device_version_info_t
{
	wchar_t cFirmwareVersion[FPRO_VERSION_STRING_MAXLEN];
	wchar_t cFPGAVersion[FPRO_VERSION_STRING_MAXLEN];
	wchar_t cControllerVersion[FPRO_VERSION_STRING_MAXLEN];
	wchar_t cHostHardwareVersion[FPRO_VERSION_STRING_MAXLEN];
} FPRODEVICEVERS;

///
/// @enum FPROTESTIMAGETYPE
/// @brief Test Image Types
///
/// The Camera has the ability to generate test image data.  This enumeration 
/// is used to tell the camera how you would like the test image data to be
/// formatted: row order or column order by pixel.
///
/// @var FPROTESTIMAGETYPE::FLI_TESTIMAGE_TYPE_ROW
/// @brief Row order format.
/// <br>The first 'width' number of pixels will be 0, the second 'width'
///     number of pixels will be 1... etc.
/// @var FPROTESTIMAGETYPE::FLI_TESTIMAGE_TYPE_COL
/// @brief Column order format.
/// <br>The first pixel of the first row will be 0, the second pixel will be 1...
///     the n'th pixel of the row will n.  The first pixel of the second row
///     will be 0 again, followed by 1, etc...
///
typedef enum
{
	FLI_TESTIMAGE_TYPE_ROW,
	FLI_TESTIMAGE_TYPE_COL,
} FPROTESTIMAGETYPE;


///
/// @enum FPROEXTTRIGTYPE
/// @brief External Trigger Types
///
/// This enumeration defines the types of external triggers available.
/// There is a single external trigger line available to the camera.  This
/// enumeration governs how this signal behaves.  This enumeration is used with
/// the FPROCtrl_GetExternalTriggerEnable and FPROCtrl_SetExternalTriggerEnable API's.
///
/// @var FPROEXTTRIGTYPE::FLI_EXT_TRIGGER_RISING_EDGE
/// @brief Trigger Exposure on Rising Edge
/// <br>For this setting, when the external trigger line goes from low to high, it 
///     triggers the exposure to begin on the camera.  The exposure will complete based
///     on the exposure time set with the FPROCtrl_SetExposure API.
/// @var FPROEXTTRIGTYPE::FLI_EXT_TRIGGER_FALLING_EDGE
/// @brief Trigger Exposure on Falling Edge
/// <br>For this setting, when the external trigger line goes from high to low, it 
///     triggers the exposure to begin on the camera.  The exposure will complete based
///     on the exposure time set with the FPROCtrl_SetExposure API.
/// @var FPROEXTTRIGTYPE::FLI_EXT_TRIGGER_EXPOSE_ACTIVE_HIGH
/// @brief Exposure Active High
/// <br>For this setting, the exposure is active the entire time the external trigger signal is high.  
///     The exposure will complete when the external trigger line goes low or when the exposure time
///     has reached the value set with the FPROCtrl_SetExposure API (whichever occurs first).  
///     That is, in this case the value used in the FPROCtrl_SetExposure API acts as a maximum exposure time. 
/// @var FPROEXTTRIGTYPE::FLI_EXT_TRIGGER_EXPOSE_ACTIVE_LOW
/// @brief Exposure Active High
/// <br>For this setting, the exposure is active the entire time the external trigger signal is low.  
///     The exposure will complete when the external trigger line goes high or when the exposure time
///     has reached the value set with the FPROCtrl_SetExposure API (whichever occurs first).  
///     That is, in this case the value used in the FPROCtrl_SetExposure API acts as a maximum exposure time. 
///
typedef enum
{
	FLI_EXT_TRIGGER_FALLING_EDGE,
	FLI_EXT_TRIGGER_RISING_EDGE,
	FLI_EXT_TRIGGER_EXPOSE_ACTIVE_LOW,
	FLI_EXT_TRIGGER_EXPOSE_ACTIVE_HIGH
} FPROEXTTRIGTYPE;

///
/// @enum FPRODBGLEVEL
/// @brief Debug Capability
///
/// The API provides a debug interface.  This sets the level of debug information
/// that can be logged by your application.
///
/// @var FPRODBGLEVEL::FPRO_DEBUG_NONE 
/// @brief All debug disabled
/// @var FPRODBGLEVEL::FPRO_DEBUG_ERROR 
/// @brief Only ERROR level debug is output
/// @var FPRODBGLEVEL::FPRO_DEBUG_WARNING 
/// @brief WARNING and ERROR debug is output
/// @var FPRODBGLEVEL::FPRO_DEBUG_INFO 
/// @brief INFO, WARNING, and ERROR debug is output
/// @var FPRODBGLEVEL::FPRO_DEBUG_DEBUG 
/// @brief DEBUG, INFO, WARNING, and ERROR debug is output
/// @var FPRODBGLEVEL::FPRO_DEBUG_TRACE 
/// @brief TRACE, DEBUG, INFO, WARNING, and ERROR debug is output
typedef enum
{
	FPRO_DEBUG_NONE,
	FPRO_DEBUG_ERROR,
	FPRO_DEBUG_WARNING,
	FPRO_DEBUG_INFO,
	FPRO_DEBUG_DEBUG,
	FPRO_DEBUG_TRACE
} FPRODBGLEVEL;


///
/// @enum FPROGPSSTATE
/// @brief GPS Connection State
///
/// This enumeration defines the possible states of an optional GPS receiver attached
/// to the camera.  The GPS data is contained in the Meta Data that prepends every image.
/// The format for the fields in the Meta Data is shown below:
/// <br>
/// <br><B>Timestamp</B><br>
/// @code
///	Year - 2016(31:26), Month(25:22), Days(21:17), Hours(16:12), Minutes(11:6), Seconds(5:0)
/// @endcode
/// <br><B>Longitude</B><br>
/// @code
///  East / West(31), 600000 * DDD + 10000 * MM.MMMM(31:0)
/// @endcode
/// Where bit 31 is 1 for East and 0 for West
/// <br>
/// <br><B>Latitude</B><br>
/// @code
/// North / South(31), 600000 * DD + 10000 * MM.MMMM(31:0)
/// @endcode
/// Where bit 31 is 1 for North and 0 for South
/// <br>
/// @var FPROGPSSTATE::FPRO_GPS_NOT_DETECTED 
/// @brief GPS unit has not been detected by the camera.
/// @var FPROGPSSTATE::FPRO_GPS_DETECTED_NO_SAT_LOCK 
/// @brief GPS unit has been detected by the camera but the satellite lock has not been made.
/// @var FPROGPSSTATE::FPRO_GPS_DETECTED_AND_SAT_LOCK 
/// @brief GPS unit has been detected by the camera and the satellite lock has been made.  This is the only
///        value that will provide accurate results in the Meta Data.
typedef enum
{
	FPRO_GPS_NOT_DETECTED = 0,
	FPRO_GPS_DETECTED_NO_SAT_LOCK,
	FPRO_GPS_DETECTED_AND_SAT_LOCK

} FPROGPSSTATE;

///
/// @enum FPROSENSREADCFG
/// @brief Sensor Read Out Configuration
///
/// Some camera models support different physical imaging sensor read out configurations.
/// This enumeration allows setting and retrieving the sensor read out configuration through the
/// #FPROSensor_SetReadoutConfiguration() and #FPROSensor_GetReadoutConfiguration().  Consult your
/// camera user documentation for availability of this feature for your camera model.
/// <br>
/// For the Cobalt cameras that support this feature, you may select one of the channels or all four
/// of the channels.  Selecting 2 or 3 channels is not allowed.
/// <br>
/// @var FPROSENSREADCFG::FPRO_SENSREAD_CB_TOPLEFT
/// @brief Read data using the top left channel of the sensor.
/// @var FPROSENSREADCFG::FPRO_SENSREAD_CB_TOPRIGHT
/// @brief Read data using the top right channel of the sensor.
/// @var FPROSENSREADCFG::FPRO_SENSREAD_CB_BOTTOMLEFT
/// @brief Read data using the bottom left channel of the sensor.
/// @var FPROSENSREADCFG::FPRO_SENSREAD_CB_BOTTOMRIGHT
/// @brief Read data using the bottom left channel of the sensor.
/// @var FPROSENSREADCFG::FPRO_SENSREAD_CB_ALL
/// @brief Read data using all 4 sensor channels.
typedef enum
{
	FPRO_SENSREAD_CB_BOTTOMLEFT = 0x01,
	FPRO_SENSREAD_CB_BOTTOMRIGHT = 0x02,
	FPRO_SENSREAD_CB_TOPLEFT = 0x04,
	FPRO_SENSREAD_CB_TOPRIGHT = 0x08,
	FPRO_SENSREAD_CB_ALL = 0x0F
} FPROSENSREADCFG;

//
/// @brief Sensor Mode Name Length
///
/// Max allowed name length for Camera Modes. See #FPROSENSMODE
///
#define FPRO_SENSOR_MODE_NAME_LENGTH  (32)

///
/// @typedef sensor_mode_t FPROSENSMODE
/// @brief Sensor Modes
///
/// The FLI Camera devices support the concept of 'Modes'.  A mode is a collection
/// of settings for the camera.  As this structure illustrates, the mode has a
/// name and an index.  The name can be used primarily for a user interface so that
/// a user can see a friendly and descriptive name for the mode.  The index is used by
/// the API to set a particular mode on the camera.  See #FPROSensor_SetMode, #FPROSensor_GetMode,
/// and #FPROSensor_GetModeCount.
///
/// @var FPROSENSMODE::uiModeIndex 
/// @brief The corresponding index of the mode name.
/// @var FPROSENSMODE::wcModeName 
/// @brief A descriptive human readable name for the mode suitable for
///        a user interface.
typedef struct sensor_mode_t
{
	uint32_t uiModeIndex;
	wchar_t  wcModeName[FPRO_SENSOR_MODE_NAME_LENGTH];
} FPROSENSMODE;


///
/// @brief Gain Scale Factor
///
/// All gain table values (see #FPROGAINTABLE) returned by the API are scaled 
/// by the factor #FPRO_GAIN_SCALE_FACTOR.
#define FPRO_GAIN_SCALE_FACTOR (1000)

///
/// @enum  FPROGAINTABLE
/// @brief Gain Tables
///
/// The camera makes available specific gain values for the image sensor.
/// Each set of values is stored in a table and this enum allows you to pick
/// the desired gain table to get using the function #FPROSensor_GetGainTable.
/// The values in the table can be used as part of a user interface allowing users
/// to select a specific gain setting. The settings are retrieved and set by index
/// in the gain table using #FPROSensor_GetGainIndex and #FPROSensor_SetGainIndex.
/// <br><br> Note that all gain table values returned by the API are scaled by the factor #FPRO_GAIN_SCALE_FACTOR.
///
/// @var FPROGAINTABLE::FPRO_GAIN_TABLE_LOW_CHANNEL 
/// @brief Low Gain Channel used for Low Gain images in HDR modes.
/// @var FPROGAINTABLE::FPRO_GAIN_TABLE_HIGH_CHANNEL 
/// @brief High Gain Channel used for LDR modes
/// <br>NOTE: Different cameras support different gain settings.  The number of gain settings for
/// the camera are stored in the device Capabilities structure #FPROCAP.
typedef enum
{
	FPRO_GAIN_TABLE_LOW_CHANNEL,
	FPRO_GAIN_TABLE_HIGH_CHANNEL,

	FPRO_GAIN_TABLE_CHANNEL_NUM,
} FPROGAINTABLE;

///
/// @typedef gain_value_t FPROGAINVALUE
/// @brief Gain Value
///
/// The function #FPROSensor_GetGainTable returns a list of FPROGAINVALUE 
/// items.  The uiDeviceIndex must be used to set the desired gain on the camera
/// using the #FPROSensor_SetGainIndex function.
///
/// @var FPROGAINVALUE::uiValue 
/// @brief The actual gain value.
/// @var FPROGAINVALUE::uiDeviceIndex 
/// @brief The device index to use to set the gain value on the camera.
typedef struct gain_value_t
{
	uint32_t uiValue;
	uint32_t uiDeviceIndex;
} FPROGAINVALUE;

///
/// @enum  FPROBLACKADJUSTCHAN
/// @brief Black Adjust Channels
///
/// Depending on the camera model, multipel channels may be supported with respect to Black Level and Black Sun adjustment.
/// This enumeration lists the appropriate channels supported by the API.  They are meant for use with the 
/// #FPROSensor_GetBlackLevelAdjustEx, #FPROSensor_GetBlackSunAdjustEx, #FPROSensor_SetBlackLevelAdjustEx, and #FPROSensor_SetBlackSunAdjustEx 
/// API calls to specify the channel for the adjustment.
/// <br><br>
///
/// @var FPROBLACKADJUSTCHAN::FPRO_BLACK_ADJUST_CHAN_LDR 
/// @brief Specifies the LDR Black adjust channel.
/// @var FPROBLACKADJUSTCHAN::FPRO_BLACK_ADJUST_CHAN_HDR 
/// @brief Specifies the HDR Black adjust channel.
/// <br>NOTE: Not supported on all devices. See your specific device documentation for details.
typedef enum
{
	FPRO_BLACK_ADJUST_CHAN_LDR,
	FPRO_BLACK_ADJUST_CHAN_HDR,
} FPROBLACKADJUSTCHAN;

// Camera Capabilities
#pragma pack(push, 1)
///
/// @typedef camera_capabilities_t FPROCAP
/// @brief Camera Capabilities
///
/// The camera capabilities structure is a structure provided by the camera that
/// publishes a set of camera capabilities.  The structure is retrieved using the 
/// #FPROSensor_GetCapabilities API.  
/// <br>
/// Diffferent camera models offer different sets of capabilities based on the 
/// imaging sensor and other hardware attributes.  The values in this structure can 
/// be used by an application to configure settings and user interfaces based
/// on the specific camera model that is connected.  The uiDeviceType member is a 
/// specific device type, one of #FPRODEVICETYPE, that allows further checking
/// by an application as it can cover specific functionality not described by
/// this structure.  The uIDeviceType number maps to a specific camera model.  As such,
/// you can use this number along with the user documentation provided for the
/// associated camera model to determine specific functionality not covered here.
/// <br>
/// <br>
/// Reference Rows: The Pre and Post frame reference row fields in the capabilities
/// structure is the number of physical pre/post imaging sensor cells available for
/// the camera model.  For pre-frame reference row, this is a hard number.  That is, 
/// no more pre-frame reference rows may be requested in an image frame than specified
/// by this number.  For post-frame reference rows, additional reference rows may be
/// requested in an image frame.  The post-frame number is just provided to indicate the
/// number of physical rows available.
/// <br>
/// <br>
/// Dummy Pixels: For API versions up to 1.10.x, the uiDummyPixelNum field contained the
/// Dummy pixels pixels appended to specified rows (post row).  From API versions 1.11.x and onward, the
/// value is divided into two 16 bit quantities.  The upper 16 bits contains the Pre-Row Dummy Pixels
/// and the lower 16 bits contains the Post Row Dummy Pixels.  Note for this to be completely functional, 
/// your camera firmware version must also be version 1.11.x or newer.
typedef struct camera_capabilities_t
{
	uint32_t uiSize;                      ///< Size of this structure (including uiSize)
	uint32_t uiCapVersion;                ///< Version of this structure
	uint32_t uiDeviceType;                ///< General device type- see documentation
	uint32_t uiMaxPixelImageWidth;        ///< Max allowed image width in pixels
	uint32_t uiMaxPixelImageHeight;       ///< max allowed image height in pixels
	uint32_t uiAvailablePixelDepths;      ///< Bit is set if pixel depth allowed (lsb= pixel depth 1)
	uint32_t uiBinningsTableSize;         ///< 0= 1:1 binning only
	uint32_t uiBlackLevelMax;             ///< Max Value Allowed (see #FPROSensor_SetBlackLevelAdjust())
	uint32_t uiBlackSunMax;               ///< Max Value Allowed (see #FPROSensor_SetBlackSunAdjust())
	uint32_t uiLowGain;                   ///< Number of Gain Values (Low Gain channel for low gain frame in HDR Modes)
	uint32_t uiHighGain;                  ///< Number Of Gain Values (High Gain channel for LDR Modes)
	uint32_t uiReserved;                  ///< Reserved
	uint32_t uiRowScanTime;               ///< Row Scan Time in nano secs (LDR)
	uint32_t uiDummyPixelNum;             ///< Number of Pre and Post Row Dummy Pixels when enabled. See #FPROFrame_SetDummyPixelEnable
	bool     bHorizontalScanInvertable;   ///< False= Normal scan direction only, True= Inverse Scan Available
	bool     bVerticalScanInvertable;     ///< False= Normal scan direction only, True= Inverse Scan Available
	uint32_t uiNVStorageAvailable;        ///< Number of bytes of Non-Volatile Storage available on the camera
	uint32_t uiPreFrameReferenceRows;     ///< Number of Pre-Frame Reference rows available
	uint32_t uiPostFrameReferenceRows;    ///< Number of Post-Frame Reference rows available
	uint32_t uiMetaDataSize;              ///< Number of bytes used for the pre-frame image meta data

} FPROCAP;
#pragma pack(pop)


// Auxiliary I/O
/// @enum  FPROAUXIO
/// @brief Auxiliary I/O Pins
///
/// The camera makes available auxiliary I/O pins for customer defined use.  This enum simply 
/// assigns a name for each of the pins to be used in the FPROAuxIO_xxx() set of API calls.
/// <br><br> Note that different camera models can support different Aux I/O pins.  Consult your 
/// specific camera documentation for supported pins and physical pin outs.
///
/// @var FPROAUXIO::FPRO_AUXIO_1 
/// @brief Name for AUX I/O Pin 1
/// @var FPROAUXIO::FPRO_AUXIO_2 
/// @brief Name for AUX I/O Pin 2
/// @var FPROAUXIO::FPRO_AUXIO_3 
/// @brief Name for AUX I/O Pin 3
/// @var FPROAUXIO::FPRO_AUXIO_4 
/// @brief Name for AUX I/O Pin 4
///
typedef enum
{
	FPRO_AUXIO_1= 0x01,
	FPRO_AUXIO_2= 0x02,
	FPRO_AUXIO_3= 0x04,
	FPRO_AUXIO_4= 0x08,
} FPROAUXIO;

/// @enum  FPROAUXIO_DIR
/// @brief Auxiliary I/O Pin Direction
///
/// The camera makes available auxiliary I/O pins for customer defined use.  The pins can be defined
/// as inputs or ouputs.  This enum is to be used with the FPROAuxIO_xxx() set of API calls to set the
/// direction of a given AUX I/O pin.  See #FPROAUXIO for more information.
/// <br><br> Note that different camera models can support different Aux I/O pins.  Consult your 
/// specific camera documentation for supported pins and physical pin outs.
///
/// @var FPROAUXIO_DIR::FPRO_AUXIO_DIR_IN 
/// @brief Set AUX I/O pin as an input with respect to the camera.
/// @var FPROAUXIO_DIR::FPRO_AUXIO_DIR_OUT 
/// @brief Set AUX I/O pin as an output with respect to the camera.
typedef enum
{
	FPRO_AUXIO_DIR_IN= 0,
	FPRO_AUXIO_DIR_OUT,
} FPROAUXIO_DIR;

/// @enum  FPROAUXIO_STATE
/// @brief Auxiliary Output State 
///
/// The camera makes available auxiliary I/O pins for customer defined use.  The pins can be defined
/// as inputs or ouputs.  For pins defined as outputs, this enum is to be used with the FPROAuxIO_xxx() 
/// set of API calls to set the state of that pin.  See #FPROAUXIO for more information.
/// <br><br> Note that different camera models can support different Aux I/O pins.  Consult your 
/// specific camera documentation for supported pins and physical pin outs.
///
/// @var FPROAUXIO_STATE::FPRO_AUXIO_STATE_LOW 
/// @brief Pin is in the low state.
/// @var FPROAUXIO_STATE::FPRO_AUXIO_STATE_HIGH 
/// @brief Pin is in the high state.
typedef enum
{
	FPRO_AUXIO_STATE_LOW,
	FPRO_AUXIO_STATE_HIGH,
} FPROAUXIO_STATE;


/// @enum  FPROAUXIO_EXPACTIVETYPE
/// @brief Exposure Active Auxiliary Output
///
/// The camera makes available an auxiliary output pin that signals when an exposure is active.  This
/// enum defines the the set of signal types that may be configured for the output.  Consult your
/// specific camera documentation for the timing details of each of these signal types.
/// <br><br> Note that different camera models can support different Aux I/O pins.  Consult your 
/// specific camera documentation for supported pins and physical pin outs.
///
/// @var FPROAUXIO_EXPACTIVETYPE::FPRO_AUXIO_EXPTYPE_EXPOSURE_ACTIVE 
/// @brief Exposure Active- consult your camera documentation for timing details.
/// @var FPROAUXIO_EXPACTIVETYPE::FPRO_AUXIO_EXPTYPE_GLOBAL_EXPOSURE_ACTIVE 
/// @brief Global Exposure Active- consult your camera documentation for timing details.
/// @var FPROAUXIO_EXPACTIVETYPE::FPRO_AUXIO_EXPTYPE_FIRST_ROW_SYNC 
/// @brief First Row Sync- consult your camera documentation for timing details.
typedef enum
{
	FPRO_AUXIO_EXPTYPE_EXPOSURE_ACTIVE= 0,
	FPRO_AUXIO_EXPTYPE_GLOBAL_EXPOSURE_ACTIVE,
	FPRO_AUXIO_EXPTYPE_FIRST_ROW_SYNC,
	FPRO_AUXIO_EXPTYPE_RESERVED
} FPROAUXIO_EXPACTIVETYPE;


/// @typedef FPROSTREAMERSTATUS
/// @brief Streamer Status
///
/// The FLI Camera devices support the ability to stream images to disk.
/// The FPROFrame_Streamxxx() API's are used to enable, start, and stop the streaming process.
/// In addition, #FPROFrame_StreamGetStatistics() is provided to retrieve the current stream
/// statistics.  The status is part of the #FPROSTREAMSTATS statistics returned by the
/// #FPROFrame_StreamGetStatistics() API.  Note that this status is with respect to  images
/// arriving from the camera.  Multiple frames can be received and queued to be written to disk.
/// As such, in order to correctly determine when all images have been received and written
/// to the disk, you need to check the #FPROSTREAMSTATS uiDiskFramesWritten field and make sure it
/// matches the number of images you requested.  If you stop the stream before all frames are
/// written to the disk, any frames not fully written will be lost.
///
/// @var FPROSTREAMERSTATUS::FPRO_STREAMER_STOPPED 
/// @brief Streaming Stopped.  This is the default state.  It also enters this state when the
/// requested number of images have been streamed or #FPROFrame_StreamStop() is called.
/// @var FPROSTREAMERSTATUS::FPRO_STREAMER_STREAMING 
/// @brief Streaming is running.  This state is entered when streaming is started via the FPROFrame_StreamStart() API.
/// It remains in this state until #FPROFrame_StreamStop() is called, the requested number of images have been streamed, or
/// an error has caused streaming to stop.
/// @var FPROSTREAMERSTATUS::FPRO_STREAMER_STOPPED_ERROR 
/// @brief If streaming has stopped due to an error, the status will be less than 0.  Consult the log file for error messages.
typedef enum
{
	FPRO_STREAMER_STOPPED_ERROR = -1,
	FPRO_STREAMER_STOPPED= 0,
	FPRO_STREAMER_STREAMING,

} FPROSTREAMERSTATUS;


///
/// @typedef fpro_stream_stats_t FPROSTREAMSTATS
/// @brief Streamer Statistics
///
/// The FLI Camera devices support the ability to stream images to disk.
/// The FPROFrame_Streamxxx() API's are used to enable, start, and stop the streaming process.
/// In addition, #FPROFrame_StreamGetStatistics() is provided to retrieve the current stream
/// statistics in this structure.  The statistics are reset each time #FPROFrame_StreamStart() 
/// is called.
///
/// @var FPROSTREAMSTATS::uiNumFramesReceived 
/// @brief The number of frames received from the camera.
/// @var FPROSTREAMSTATS::uiTotalBytesReceived 
/// @brief The total number of bytes received from the camera.
/// @var FPROSTREAMSTATS::uiDiskFramesWritten 
/// @brief The total number of frames written to disk.
/// @var FPROSTREAMSTATS::dblDiskAvgMBPerSec 
/// @brief The average disk write rate in MBytes/sec on a per frame basis
/// @var FPROSTREAMSTATS::dblDiskPeakMBPerSec 
/// @brief The peak write rate in MBytes/sec; the fastest a given frame was written.
/// @var FPROSTREAMSTATS::iStatus 
/// @brief The status of the streamer. See #FPROSTREAMERSTATUS.
/// @var FPROSTREAMSTATS::uiReserved 
/// @brief Reserved for internal use.
typedef struct fpro_stream_stats_t
{
	uint32_t            uiNumFramesReceived;
	uint64_t            uiTotalBytesReceived;
	uint64_t            uiDiskFramesWritten;
	double              dblDiskAvgMBPerSec;
	double              dblDiskPeakMBPerSec;
	FPROSTREAMERSTATUS  iStatus;
	uint32_t            uiReserved;
} FPROSTREAMSTATS;

/// @enum  FPRO_FRAME_TYPE
/// @brief Image Frame Type 
///
/// The camera has the ability to produce different frame types.  The default
/// frame type is FPRO_FRAMETYPE_NORMAL.  Consult you camera documentation for
/// the details of each frame type and availability on a given camera model.
/// <br>
/// <br>
/// See #FPROFrame_SetFrameType() and #FPROFrame_GetFrameType().
/// <br>
///
/// @var FPRO_FRAME_TYPE::FPRO_FRAMETYPE_NORMAL 
/// @brief Normal Frame (default).
/// @var FPRO_FRAME_TYPE::FPRO_FRAMETYPE_DARK 
/// @brief Dark Frame.
/// @var FPRO_FRAME_TYPE::FPRO_FRAMETYPE_BIAS 
/// @brief Bias Frame.
/// @var FPRO_FRAME_TYPE::FPRO_FRAMETYPE_LIGHTFLASH 
/// @brief Light Flash Frame.
/// @var FPRO_FRAME_TYPE::FPRO_FRAMETYPE_DARKFLASH 
/// @brief Dark Flash Frame.
typedef enum
{
	FPRO_FRAMETYPE_NORMAL= 0,
	FPRO_FRAMETYPE_DARK,
	FPRO_FRAMETYPE_BIAS,
	FPRO_FRAMETYPE_LIGHTFLASH,
	FPRO_FRAMETYPE_DARKFLASH,
} FPRO_FRAME_TYPE;

/// @enum  FPROCMS
/// @brief Correlated Multile Samples (Samples Per Pixel)
///
/// Some camera models are capable of taking multiple sensor samples per pixel.  Based
/// on imaging modes this can effect the amount of image data sent by the camera for
/// a frame of data.  Consult your specific camera documentation for details on how this
/// feature is supported and its effect on image data.  The values are used in the 
/// #FPROSensor_GetSamplesPerPixel() and #FPROSensor_SetSamplesPerPixel() API calls.
///
/// @var FPROCMS::FPROCMS_1 
/// @brief Single Sample Per Pixel.  This is the default for all cameras.
/// @var FPROCMS::FPROCMS_2 
/// @brief Two sensor samples per pixel are read out.
/// @var FPROCMS::FPROCMS_4 
/// @brief Four sensor samples per pixel are read out.
typedef enum
{
	FPROCMS_1 = 0,
	FPROCMS_2,
	FPROCMS_4,
} FPROCMS;


///
/// @typedef unpacked_images_t FPROUNPACKEDIMAGES
/// @brief Unpacked Image Buffers
///
/// The raw data returned by the cameras is of varying formats, bit depths, and interleaving based on the 
/// internal senor used in the camera.  In order to make use of the data for analysis or display, the images
/// must be unpacked to a form more suitable.  This structure is used by the API to allow the application to 
/// request the frames to be automatically unpacked.  The specific usage of these pointers is described in the
/// function documentation in which they are used.  For example, see #FPROFrame_GetVideoFrameUnpacked() for a description
/// of how this structure is used for that particular call.
///
/// @var FPROUNPACKEDIMAGES::pMetaData 
/// @brief The raw Meta Data Buffer.
/// @var FPROUNPACKEDIMAGES::uiMetaDataSize 
/// @brief The Size of the pMetaData buffer.
/// @var FPROUNPACKEDIMAGES::bMetaDataRequest 
/// @brief The Meta Data request Flag.  Set to 'true' to unpack meta data.
///
/// @var FPROUNPACKEDIMAGES::pLowImage 
/// @brief The Low Image Buffer.
/// @var FPROUNPACKEDIMAGES::uiLowImageSize 
/// @brief The Size of the pLowImage buffer in pixels.
/// @var FPROUNPACKEDIMAGES::bLowImageRequest 
/// @brief The Low Image request Flag.  Set to 'true' to unpack the low gain image plane.
///
/// @var FPROUNPACKEDIMAGES::pHighImage 
/// @brief The High Image Buffer.
/// @var FPROUNPACKEDIMAGES::uiHighImageSize 
/// @brief The Size of the pHighImage buffer in pixels.
/// @var FPROUNPACKEDIMAGES::bHighImageRequest 
/// @brief The High Image request Flag.  Set to 'true' to unpack the high gain image plane.
///
/// @var FPROUNPACKEDIMAGES::pMergedImage 
/// @brief The Merged Image Buffer.
/// @var FPROUNPACKEDIMAGES::uiMergedImageSize 
/// @brief The Size of the pMergedImage buffer in pixels.
/// @var FPROUNPACKEDIMAGES::bMergedImageRequest 
/// @brief The Merged Image request Flag.  Set to 'true' to merge the low and high gain image planes.
typedef struct unpacked_images_t
{
	uint8_t  *pMetaData;
	uint32_t uiMetaDataSize;
	bool     bMetaDataRequest;

	uint16_t *pLowImage;
	uint64_t uiLowImageSize;
	bool     bLowImageRequest;

	uint16_t *pHighImage;
	uint64_t uiHighImageSize;
	bool     bHighImageRequest;

	uint16_t *pMergedImage;
	uint64_t uiMergedImageSize;
	bool     bMergedImageRequest;

} FPROUNPACKEDIMAGES;

///
/// @typedef int_point_t FPROPOINT
/// @brief Point Coordinates
///
/// A simple structure to define a point in space.  Used by other structures in the API 
/// such as #FPROPLANESTATS to specifiy the location of the dimmest and brightest
/// pixels in an image plane.
///
/// @var FPROPOINT::X 
/// @brief The x coordinate.
/// @var FPROPOINT::Y 
/// @brief The y coordinate.
typedef struct int_point_t
{
	int32_t X;
	int32_t Y;
} FPROPOINT;

///
/// @typedef pixel_info_t FPROPIXELINFO
/// @brief Defines a locaton and value of a pixel within an image plane.
///
/// A composite structure to define a locaton and value of a pixel within an image plane.  
/// Used by other structures in the API such as #FPROPLANESTATS to specifiy the location of the 
/// dimmest and brightest pixels in an image plane.
///
/// @var FPROPIXELINFO::ptPosition 
/// @brief The x and y coordinate of the pixel within the plane.
/// @var FPROPIXELINFO::uiValue 
/// @brief The pixel value.
typedef struct pixel_info_t
{
	FPROPOINT ptPosition;
	uint32_t  uiValue;
} FPROPIXELINFO;

/// @typedef image_plane_stats_t FPROPLANESTATS
/// @brief Defines the set of statistics available for unpacked frames.
///
/// This structure provides the given statistics for an image plane when unpacked by
/// the API. See #FPROUNPACKEDSTATS for more information.
///
/// @var FPROPLANESTATS::uiLCutoff 
/// @brief The lower pixel value cutoff.
/// @var FPROPLANESTATS::uiUCutoff 
/// @brief The Upper pixel value cutoff.
/// @var FPROPLANESTATS::uiHistogramSize 
/// @brief The number of elements in the array pointed to by pdblHistogram.  
/// @var FPROPLANESTATS::pdblHistogram 
/// @brief The pixel value histogram. The index is the pixel value, the value at that index is the number of pixels with that pixel value. 
/// @var FPROPLANESTATS::dblMean 
/// @brief The mean of the pixel values in the plane. 
/// @var FPROPLANESTATS::dblMedian 
/// @brief The median of the pixel values in the plane. 
/// @var FPROPLANESTATS::dblMode 
/// @brief The mode of the pixel values in the plane. 
/// @var FPROPLANESTATS::dblStandardDeviation 
/// @brief The standard deviation of the pixels in the plane.
/// @var FPROPLANESTATS::pixBrightest 
/// @brief The location and value of the brightest pixel in the plane.
/// @var FPROPLANESTATS::pixDimmest 
/// @brief The location and value of the dimmest pixel in the plane.
typedef struct image_plane_stats_t
{
	uint32_t uiLCutoff;
	uint32_t uiUCutoff;
	uint32_t uiHistogramSize;
	double   *pdblHistogram;
	double   dblMean;
	double   dblMedian;
	double   dblMode;
	double   dblStandardDeviation;

	FPROPIXELINFO pixBrightest;
	FPROPIXELINFO pixDimmest;

} FPROPLANESTATS;

/// @typedef FPROUNPACKEDSTATS
/// @brief Statistics for unpacked image planes.
///
/// A structure to retrieve the statistics for unpacked frames.  The pointers within the
/// encapsulated structures are allocated and deallocated by the API.
/// See #FPROFrame_GetVideoFrameUnpacked() for a description
/// of how this structure is used for that particular call.
///
/// @var FPROUNPACKEDSTATS::statsLowImage 
/// @brief The statistics for the low image. 
/// @var FPROUNPACKEDSTATS::bLowRequest 
/// @brief Set to true to request the statistics for this image plane when unpacking.
/// @var FPROUNPACKEDSTATS::statsHighImage 
/// @brief The statistics for the high image. 
/// @var FPROUNPACKEDSTATS::bHighRequest 
/// @brief Set to true to request the statistics for this image plane when unpacking.
/// @var FPROUNPACKEDSTATS::statsMergedImage 
/// @brief The statistics for the merged image. 
/// @var FPROUNPACKEDSTATS::bMergedRequest 
/// @brief Set to true to request the statistics for this image plane when unpacking.
typedef struct unpacked_stats_t
{
	FPROPLANESTATS statsLowImage;
	bool     bLowRequest;

	FPROPLANESTATS statsHighImage;
	bool     bHighRequest;

	FPROPLANESTATS statsMergedImage;
	bool     bMergedRequest;

} FPROUNPACKEDSTATS;

//////////////////////////////////////////
// Camera Open, Close
//////////////////////////////////////////
//////////////////////////////////////////
//////////////////////////////////////////
/// 
/// @brief FPROCam_GetCameraList
/// 
/// Returns a list of cameras detected on the host.  Most often it is the
/// first function called in the API in order to provide a list of
/// available devices to the user.  The information provided in the 
/// FPRODEVICEINFO structure allows unique names to be constructed for
/// each camera. A pointer an FPRODEVICEINFO structure corresponding to a 
/// user selected device is passed to a subsequent call to FPROCam_Open() 
/// in order to connect to the camera.
///
///	@param pDeviceInfo - Pointer to user allocated memory to hold the list of devices.
/// @param pNumDevices - On entry, the max number of devices that may be assigned to the list.
///                      Note that the pDeviceInfo pointer must point to enough memory to hold
///                      the given pNumDevices.  On exit, it contains the number of devices
///                      detected and inserted in the list.  This can be less than the requested
///                      number.  If it returns the requested number, there may be additional 
///                      devices connected.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
///
LIBFLIPRO_API FPROCam_GetCameraList(FPRODEVICEINFO *pDeviceInfo, uint32_t *pNumDevices);


//////////////////////////////////////////
///
/// @brief Connects to the camera specified by the pDevInfo parameter.  
///
/// This call must complete successfully in order to use any calls in the API
/// that communicate with the camera.
/// The returned handle is passed to all such subsequent API calls.
///
///	@param pDevInfo - Pointer to device description as returned by FPROCam_GetCameraList().
/// @param pHandle - On successful completion, it contains the device handle to use in 
///                  subsequent API calls.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCam_Open(FPRODEVICEINFO *pDevInfo, int32_t *pHandle);


//////////////////////////////////////////
///
/// @brief Disconnects from the camera an releases the handle.
///
/// @param iHandle - Connected camera handle to close.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCam_Close(int32_t iHandle);

//////////////////////////////////////////
///
/// @brief Returns the version of this API Library.  
///
/// This function may be called
/// at any time, it does not need a device handle to report the API version.
///
///
/// @param pVersion - Buffer for returned NULL terminated version string.
/// @param uiLength - Length of supplied buffer.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCam_GetAPIVersion(wchar_t *pVersion, uint32_t uiLength);

//////////////////////////////////////////
///
/// @brief Returns the version information from the connected device.
///
/// @param iHandle - The handle to an open camera device returned from FPROCam_Open().
/// @param pVersion - Structure buffer to return version information.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCam_GetDeviceVersion(int32_t iHandle, FPRODEVICEVERS *pVersion);

///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
// Frame Data Functions
///////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////
///
/// @brief Aborts the active image capture.
///
/// The abort function is meant to be called to abort the current image capture.
/// It can be called from a different thread that is performing the image capture
/// as long as the recommended calling pattern for image capture is followed.
/// See FPROFrame_CaptureStart(), FPROFrame_CaptureStop() for a description of
/// the recommended image capture calling pattern.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_CaptureAbort(int32_t iHandle);

//////////////////////////////////////////
///
/// @brief Ends the active image capture.
///
/// The end function is meant to be called to be called to end the current image capture
/// and allow the capturing thread to retrieve the image data.  It is intended to be
/// be used to end a long exposure prior to the full exposure completing.  Given that,
/// it will normally be called from a different thread that is performing the image capture
/// as long as the recommended calling pattern for image capture is followed.
/// See FPROFrame_CaptureStart(), FPROFrame_CaptureStop() for a description of
/// the recommended image capture calling pattern.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_CaptureEnd(int32_t iHandle);

//////////////////////////////////////////
///
/// @brief Initiates the capture of the configured image.  
///
/// The image is retrieved using the FPROFrame_GetVideoFrame() API.
///
/// NOTE: In order to ensure data pipe integrity, FPROFrame_CaptureStart(), 
///       FPROFrame_GetVideoFrame(), and FPROFrame_CaptureStop() must be called
///	      from the same thread in a pattern similar to below:
///
/// @code
///
///     FPROFrame_CaptureStart();
///     while (frames_to_get)
///         FPROFrame_GetVideoFrame();
///	    FPROFrame_CaptureStop();
///
/// @endcode
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiFrameCount - Number of frames to capture. 0 == infinite stream.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_CaptureStart(int32_t iHandle, uint32_t uiFrameCount);

//////////////////////////////////////////
///
/// @brief Stops the active image capture.
///
/// NOTE: In order to ensure data pipe integrity, FPROFrame_CaptureStart(), 
///       FPROFrame_GetVideoFrame(), and FPROFrame_CaptureStop() must be called
///	      from the same thread in a pattern similar to below:
///
/// @code
///
///     FPROFrame_CaptureStart();
///     while (frames_to_get)
///         FPROFrame_GetVideoFrame();
///	    FPROFrame_CaptureStop();
///
/// @endcode
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_CaptureStop(int32_t iHandle);

//////////////////////////////////////////
///
/// @brief Initiates the capture of a thumbnail image.  
///
/// The image is transferred over the
/// image endpoint and is retrieved using the FPROFrame_GetThumbnail() API.
/// Thumbnail images are 512x512 pixels.  No Metadata or dummy pixels are included
/// in the image.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_CaptureThumbnail(int32_t iHandle);

//////////////////////////////////////////
///
/// @brief Computes the size in bytes of the image frame based on the given pixel width and height.  
///
/// This function uses the actual camera settings to determine the size of the image data that
/// will be received.  As such, all camera settings must be set up for your image prior to calling
/// this function.  Since communications with the camera is required to complete this function
/// successfuly, it can fail on the communication.  In addition, this function can take tens of 
/// milli-seconds to complete because of this communication so it should not be called in time 
/// critical situations.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiPixelWidth - The width of the expected image in pixels.
/// @param uiPixelHeight - The height of the expected image in pixels.
///
/// @return The size of the expected image frame in bytes on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_ComputeFrameSize(int32_t iHandle,uint32_t uiPixelWidth, uint32_t uiPixelHeight);

//////////////////////////////////////////
///
/// @brief Frees the Unpacked Buffers within the given structure.  
///
/// See #FPROFrame_GetVideoFrameUnpacked() for additional information.
///
///	@param pUPBuffers - The buffers to free.
///
/// @return None.
LIBFLIPRO_VOID FPROFrame_FreeUnpackedBuffers(FPROUNPACKEDIMAGES *pUPBuffers);

//////////////////////////////////////////
///
/// @brief Frees the Unpacked Statistics Buffers within the given structure.  
///
/// See #FPROFrame_GetVideoFrameUnpacked() for additional information.
///
///	@param pStats - The statistics buffers to free.
///
/// @return None.
LIBFLIPRO_VOID FPROFrame_FreeUnpackedStatistics(FPROUNPACKEDSTATS *pStats);

//////////////////////////////////////////
///
/// @brief Retrieves the dummy pixel configuration to be appended row data.  
///
/// If enabled, dummy pixels are appended to every other row of image data 
/// starting with the second row of data.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param pEnable - true: Dummy pixels will be appended to every other image row
///                  false: Dummy pixels will NOT be appended to every other image row
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_GetDummyPixelEnable(int32_t iHandle, bool *pEnable);

//////////////////////////////////////////
///
/// @brief Retrieves the Frame Type setting.  
///
/// Returns the frame type set by the #FPROFrame_SetFrameType() API.
/// The default frame type is FPRO_FRAMETYPE_NORMAL.  Typically this is only used for testing
/// purposes.  Consult your documentation for a description and availability of the different
/// frame types found on a given camera model.  See also #FPRO_FRAME_TYPE.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param pType - The current frame type setting.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_GetFrameType(int32_t iHandle, FPRO_FRAME_TYPE *pType);

//////////////////////////////////////////
///
/// @brief Retrieves the reference row count to be appended to frame data.  
///
/// If the count is > 0, this number of reference rows are appended to the
/// frame data.  See #FPROCAP capabilities stucture for details about reference rows.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pNumRows - Pointer to the number of reference rows to append to the image frame data.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_GetReferenceRowPostFrameCount(int32_t iHandle, uint32_t *pNumRows);

//////////////////////////////////////////
///
/// @brief Retrieves the reference row count to be prepended to frame data.  
///
/// If the count is > 0, this number of reference rows are prepended to the
/// frame data.  See #FPROCAP capabilities stucture for details about reference rows.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pNumRows -  Pointer to the number of reference rows to prepend to the image frame data.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_GetReferenceRowPreFrameCount(int32_t iHandle, uint32_t *pNumRows);

//////////////////////////////////////////
///
/// @brief Enables image data imaging.
///
/// Image data may be disabled allowing only reference rows to be
/// produced for image frames.  Reference rows are configured with the 
/// #FPROFrame_SetReferenceRowPostFrameCount() and #FPROFrame_SetReferenceRowPreFrameCount()
/// API calls.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param pEnable - true: Image data pixels enabled, false: Image data pixels disabled.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_GetImageDataEnable(int32_t iHandle, bool *pEnable);

//////////////////////////////////////////
///
/// @brief Retrieves the test image data settings.
///
/// When enabled, the camera generates a test pattern rather than capturing image data from the
/// image sensor.  See #FPROFrame_SetTestImageEnable().
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param pEnable - true: Enable test image data
///                  false: Disables test image data- normal image data produced
/// @param pFormat - Format of the test image data to produce.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_GetTestImageEnable(int32_t iHandle, bool *pEnable, FPROTESTIMAGETYPE *pFormat);

//////////////////////////////////////////
///
/// @brief Gets the area of the image sensor being used to produce image frame data.
///
/// Image frames are retrieved using the FPROFrame_GetVideoFrame() API.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param pColOffset - Start column (pixel) of the image frame
/// @param pRowOffset - Start row (pixel) of the image frame
/// @param pWidth - Width of the image frame in pixels.
/// @param pHeight - Height of the image frame in pixels.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_GetImageArea(int32_t iHandle, uint32_t *pColOffset, uint32_t *pRowOffset, uint32_t *pWidth, uint32_t *pHeight);

//////////////////////////////////////////
///
/// @brief Retrieves the current pixel configuration.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param pPixelDepth - The current pixel depth.
/// @param pPixelLSB - The Pixel LSB offset.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_GetPixelConfig(int32_t iHandle, uint32_t *pPixelDepth, uint32_t *pPixelLSB);


//////////////////////////////////////////
///
/// @brief Retrieves the thumbnail image from the camera.
///
/// The image is transferred over the
/// image endpoint and is retrieved using the FPROFrame_GetThumbnail() API.
/// Thumbnail images are 512x512 12 bit pixels in size.  That is, no Metadata,
/// reference rows, or dummy pixels are included in the image.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param pFrameData - The buffer to store the frame data
/// @param pSize - Size the of the pFrameData buffer.
///                On return, the number of bytes actually received.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_GetThumbnailFrame(int32_t iHandle, uint8_t *pFrameData, uint32_t *pSize);

//////////////////////////////////////////
///
/// @brief Retrieves an image frame from the camera.
///
/// It is important to call this function with the
/// appropriate size buffer for the frame.  That is, the buffer size should be match the
/// expected frame size.  If it is too large, the function will try and read the given size and 
/// may stall the USB connection if no more frame data is available.
///
/// NOTE: In order to ensure data pipe integrity, #FPROFrame_CaptureStart(), 
///       #FPROFrame_GetVideoFrame(), and #FPROFrame_CaptureStop() must be called
///	      from the same thread in a pattern similar to below:
///
/// @code
///
///     FPROFrame_CaptureStart();
///     while (frames_to_get)
///         FPROFrame_GetVideoFrame();
///	    FPROFrame_CaptureStop();
///
/// @endcode
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param pFrameData - The buffer to store the frame data.
/// @param pSize - Size the of the pFrameData buffer.
///                On return, the number of bytes actually received.
/// @param uiTimeoutMS - How long to wait for a frame to be available.
///                      Assuming you make this call very soon after the FPROFrame_CaptureStart()
///                      call, you should set this to the exposure time.  Internally, the API
///                      blocks (i.e. no communication with the camera) for some time less than 
///                      uiTimeoutMS and then attempts to retrieve the frame.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_GetVideoFrame(int32_t iHandle, uint8_t *pFrameData, uint32_t *pSize, uint32_t uiTimeoutMS);


//////////////////////////////////////////
///
/// @brief Retrieves an image frame from the camera and optioanally unpacks and merges the image planes.
///
/// This function behaves identically as the #FPROFrame_GetVideoFrame() call with respect to starting, stopping,
/// and timeouts.  See #FPROFrame_GetVideoFrame() for details.
/// <br>
/// In addition, if you specify unpacking buffers, the function will also unpack the raw image data received
/// and return the planes requested (Low Gain, High Gain, Merged).  The planes to unpack are specified in the
/// pUPBuffers parameter.  If this parameter is NULL, the function behaves identically to that of #FPROFrame_GetVideoFrame()
/// call.  
/// <br>
/// <br>
/// To allocate the buffers, the first time you call this function for a given frame setup, you must set the buffer pointers
/// within the structure to NULL and set the corresponding 'request flag' in the structure to 'true'.  For example, to receive a merged
/// frame, set pUPBUffers->pMergedImage to NULL and set pUPBuffers->bMergedImageRequest to 'true'.  The API will allocate the 
/// requested buffers and return the requested planes.  If your frame setup does not change, you may reuse the buffers that have
/// been allocated for subsequent exposures.  If the buffers provided are of incorrect size, the API does it's best to re-allocate them.
/// If it can not, the function will return an error.  In this case the raw frame may still have been receieved correctly.  Check the 
/// *pSize value to obtain the number of bytes in the raw frame that were successfully received. When you are done with the buffers, you 
/// must call #FPROFrame_FreeUnpackedBuffers() to free the memory.
/// <br>
/// <br>
/// The meta data returned in the pUPBuffers structure is not the raw meta data received from the camera.  It has been modified to 
/// reflect the processing of the raw frame.  The raw meta data for the image is at the start of the pFrameData buffer just as it is
/// with #FPROFrame_GetVideoFrame().  If you wnt to process the raw frame, or determine the original image characteristics, you must
/// use the meta data in the pFrameData buffer.
/// <br>
/// <br>
/// Similarly, when you call this function the first time and request statistics for the frames, the API allocates the
/// needed memory within the statistics structure.  Make sure you initialize the structure with 0's in order for this to
/// work properly!  The structure can then be reused in subsequent calls.
/// When you are done with the statistics, you must call #FPROFrame_FreeUnpackedStatistics() to free the memory.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param pFrameData - The buffer to store the frame data.
/// @param pSize - Size the of the pFrameData buffer.
///                On return, the number of bytes actually received.
/// @param uiTimeoutMS - How long to wait for a frame to be available.
///                      Assuming you make this call very soon after the FPROFrame_CaptureStart()
///                      call, you should set this to the exposure time.  Internally, the API
///                      blocks (i.e. no communication with the camera) for some time less than 
///                      uiTimeoutMS and then attempts to retrieve the frame.
/// @param pUPBuffers - If specified, the call will return the unpacked buffers requested.
/// @param pStats - If specified, the call will return the statistics requested.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_GetVideoFrameUnpacked(int32_t iHandle, uint8_t *pFrameData, uint32_t *pSize, uint32_t uiTimeoutMS, FPROUNPACKEDIMAGES *pUPBuffers, FPROUNPACKEDSTATS *pStats);

//////////////////////////////////////////
///
/// @brief Retrieves an externally triggered image frame from the camera.
///
/// This function is intended for use when using external trigger sources for image capture.
/// Unlike FPROFrame_GetVideoFrame(), no timeout is specified.  It waits forever until notification
/// of image frame data availability from the camera.  FPROFrame_CaptureAbort() and FPROFrame_CaptureEnd()
/// can be used to cancel the exposure as described in those API calls. 
/// <br>
/// <br>
/// FPROFrame_CaptureStart() is not expected to be called prior to this API because the External Trigger
/// will be supplying the trigger source.  However, if this call is awaiting image data, another thread may
/// call FPROFrame_CaptureStart() to force a trigger.  Once exposed, this function will return the data as
/// if an external trigger occurred. If you do call FPROFrame_CaptureStart() to force a trigger, it is important
/// to call FPROFrame_CaptureStop() after the image is retrieved.
/// <br>
/// <br>
/// It is important to call this function with the
/// appropriate size buffer for the frame.  That is, the buffer size should be match the
/// expected frame size.  If it is too large, the function will try and read the given size and 
/// may stall the USB connection if no more frame data is available.
///
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param pFrameData - The buffer to store the frame data.
/// @param pSize - Size the of the pFrameData buffer.
///                On return, the number of bytes actually received.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_GetVideoFrameExt(int32_t iHandle, uint8_t *pFrameData, uint32_t *pSize);

//////////////////////////////////////////
///
/// @brief Returns whether or not Image Frame data is ready for retrieval.  
///
/// This API is primarily used in conjunction with an external trigger setup.
/// Since the external trigger is not natively synchronized with the software 
/// in any way, a method to determine when the image data is
/// available for retrieval is required.  Users can use this routine to query
/// the camera and wait for image data to be available.  When the function
/// succeeds and *pAvailable is 'true', the user can call the normal FPROFrame_GetVideoFrame()
/// API to retrieve the data.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param pAvailable - Pointer for returned query. 
///                     true: Image Frame data is available for retrieval
///                     false: Image Frame Data is not available.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_IsAvailable(int32_t iHandle, bool *pAvailable);

//////////////////////////////////////////
///
/// @brief Sets the dummy pixel configuration to be appended row data.  
///
/// For the FPRO_CAM_DEVICE_TYPE_GSENSE400 and FPRO_CAM_DEVICE_TYPE_GSENSE4040 model
/// cameras, if enabled, dummy pixels are appended to every other row of image data
/// starting with the second row of data.  Consult your Camera Model user documentation 
/// as not all models support dummy pixels in the same way.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param bEnable - true: Dummy pixels will be appended to every other image row
///                  false: Dummy pixels will NOT be appended to every other image row
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_SetDummyPixelEnable(int32_t iHandle, bool bEnable);

//////////////////////////////////////////
///
/// @brief Sets Frame Type produced by the camera.  
///
/// Sets Frame Type produced by the camera.  The frame type can be retrieved using the #FPROFrame_GetFrameType()
/// API. The default frame type is FPRO_FRAMETYPE_NORMAL.  Typically this is only used for testing
/// purposes.  Consult your documentation for a description and availability of the different
/// frame types found on a given camera model.  See also #FPRO_FRAME_TYPE.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param eType - The frame type to set.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_SetFrameType(int32_t iHandle, FPRO_FRAME_TYPE eType);

//////////////////////////////////////////
///
/// @brief Sets the reference row count to be appended to frame data.  
///
/// If the count is > 0, this number of reference rows are appended to the
/// frame data.  See #FPROCAP capabilities stucture for details about reference rows.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiNumRows - The number of reference rows to append to the image frame data data.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_SetReferenceRowPostFrameCount(int32_t iHandle, uint32_t uiNumRows);

//////////////////////////////////////////
///
/// @brief Sets the reference row count to be prepended to frame data.  
///
/// If the count is > 0, this number of reference rows are prepended to the
/// frame data.  See #FPROCAP capabilities stucture for details about reference rows.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiNumRows - The number of reference rows to prepend to the image frame data.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_SetReferenceRowPreFrameCount(int32_t iHandle, uint32_t uiNumRows);

//////////////////////////////////////////
///
/// @brief Enables image data imaging.
///
/// Image data may be disabled allowing only reference rows to be
/// produced for image frames.  Reference rows are configured with the 
/// #FPROFrame_SetReferenceRowPreFrameCount() and #FPROFrame_SetReferenceRowPostFrameCount()
/// API calls.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param bEnable - true: Enables image data pixels, false: disables image data pixels.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_SetImageDataEnable(int32_t iHandle, bool bEnable);

//////////////////////////////////////////
///
/// @brief Enables test image data to be generated rather than normal image data.
///
/// Use this to generate a test pattern rather than capturing image data from the
/// image sensor.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param bEnable - true: Enable test image data
///                  false: Disables test image data- normal image data produced
/// @param eFormat - Format of the test image data to produce. This parameter is
///                  ignored if bEnable == false.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_SetTestImageEnable(int32_t iHandle, bool bEnable, FPROTESTIMAGETYPE eFormat);

//////////////////////////////////////////
///
/// @brief Sets the area of the image sensor to be used for Tracking Frames during image capture.
///
/// The tracking frames are retrieved as normal image frames using the 
/// FPROFrame_GetVideoFrame() API.  The image frame follow the tracking 
/// frames in the USB stream.
/// The exposure time setting set with FPROCtrl_SetExposure() applies to the
/// tracking frames. As such, the total exposure time for your image frame will
/// be exposure_time * uiNumTrackingFrames.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param uiStartRow - Start row of the tracking frame (inclusive).
/// @param uiEndRow - End row of the tracking frame (inclusive).
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_SetTrackingArea(int32_t iHandle, uint32_t uiStartRow, uint32_t uiEndRow);

//////////////////////////////////////////
///
/// @brief Enables the production of Tracking Frames by the camera.
///
/// There will be uiNumTrackingFrames produced for every image frame
/// produced.  The image frame follow the tracking frames in the USB stream.
/// The exposure time setting set with FPROCtrl_SetExposure() applies to the
/// tracking frames. As such, the total exposure time for your image frame will
/// be exposure_time * uiNumTrackingFrames.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param uiNumTrackingFrames - Number of Tracking frames to produce.  0 disables Tracking Frames.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_SetTrackingAreaEnable (int32_t iHandle, uint32_t uiNumTrackingFrames);

//////////////////////////////////////////
///
/// @brief Sets the current pixel configuration to the specified values.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param uiPixelDepth - The current pixel depth.
/// @param uiPixelLSB - The Pixel LSB offset.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_SetPixelConfig(int32_t iHandle, uint32_t uiPixelDepth, uint32_t uiPixelLSB);

//////////////////////////////////////////
///
/// @brief Sets the area of the image sensor to be used to produce image frame data.
///
/// Image frames are retrieved using the FPROFrame_GetVideoFrame() API.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param uiColOffset - Start column (pixel) of the image frame
/// @param uiRowOffset - Start row (pixel) of the image frame
/// @param uiWidth - Width of the image frame in pixels.
/// @param uiHeight - Height of the image frame in pixels.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_SetImageArea(int32_t iHandle, uint32_t uiColOffset, uint32_t uiRowOffset, uint32_t uiWidth, uint32_t uiHeight);

#if defined(_WIN32) || defined(_WINDOWS)
//////////////////////////////////////////
///
/// @brief Initializes the Streamer interfaces.
///
/// The Streamer interfaces enable an efficient stream-to-functionality.  Frames
/// are streamed directly from the camera to disk.  This function initializes the 
/// various sub modules, allocates resources, and enables the streaming capability.
///  This function must be called prior to #FPROFrame_StreamStart(). 
///
/// The streaming operation streams frames of the same size.  In order to change the frame size,
/// the streaming must be stopped and deinitialized using the #FPROFrame_StreamStop() and 
/// FPROFrame_StreamDeinitialize() API's respectively.  Then a new stream can be initialzed with
/// a new frame size.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param uiFrameSizeBytes - Size of the frames that will be streamed.
/// @param pRootPath - Name of the root path to store the files on disk.
/// @param pFilePrefix - A file name prefix to be applied to each file being saved..
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_StreamInitialize(int32_t iHandle, uint32_t uiFrameSizeBytes, wchar_t *pRootPath, wchar_t *pFilePrefix);

//////////////////////////////////////////
///
/// @brief Deinitializes the Streamer interfaces.
///
/// This funtion deinitializes the streamer interfaces.  All streaming operations are stopped
/// and streaming resources are returned to the system.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_StreamDeinitialize(int32_t iHandle);

//////////////////////////////////////////
///
/// @brief Start the streaming operation.
///
/// This funtion starts the actual streaming operations.  The streaming interfaces must
/// have been previously initialized by a successful call to #FPROFrame_StreamInitialize().
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param uiFrameCount - Number of frames to stream.  Zero (0) == infinite (until the disk fills
///                       or #FPROFrame_StreamStop is called.
///	@param uiFrameIntervalMS - The frame interval in milliseconds() (exposure time + delay).
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_StreamStart(int32_t iHandle,uint32_t uiFrameCount,uint64_t uiFrameIntervalMS);

//////////////////////////////////////////
///
/// @brief Stop the streaming operation.
///
/// This funtion stops the actual streaming operations.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_StreamStop(int32_t iHandle);

//////////////////////////////////////////
///
/// @brief Stop the streaming operation.
///
/// This funtion stops the actual streaming operations.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param pStats - The returned statistics. See #FPROSTREAMSTATS.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFrame_StreamGetStatistics(int32_t iHandle, FPROSTREAMSTATS *pStats);

//////////////////////////////////////////
///
/// @brief Retrieve the next image available for preview from the image stream.
///
/// This funtion is to be used while image streaming is taking place.
/// It will retrieve the available preview from the image stream.  The image returned
/// is also written to disk as normal.  If you call this function faster than the 
/// exposure time, you will receive the same preview image.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///	@param pImage - The buffer for the image data.
/// @param pLength - On enter, the size of the buffer pointed to by pImage.  On exit, the actual
///                  number of bytes stored in pImage.
/// @param uiTimeoutMSecs - Timeout to wait for an image in milli-seconds.  Useful when
///                         streaming 1 image.  Once the first image arrives, there will
///                         always be an image available for preview until #FPROFrame_StreamDeinitialize
///                         is called.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.  On timeout, the function
///         returns success (0), and sets the *pLength parameter to 0.
LIBFLIPRO_API FPROFrame_StreamGetPreviewImage(int32_t iHandle, uint8_t *pImage, uint32_t *pLength, uint32_t uiTimeoutMSecs);

#endif

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
// Control Functions
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
//////////////////////////////////////////
///
/// @brief Reads the current duty cycle of the cooler.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pDutyCycle - Returned Cooler Duty Cycle 0-100%.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetCoolerDutyCycle(int32_t iHandle, uint32_t *pDutyCycle);

//////////////////////////////////////////
///
/// @brief Reads the exposure time of the image sensor.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pExposureTime - Returned exposure time in nanoseconds.
/// @param pFrameDelay - Returned frame delay (end -to-start) time in nanoseconds.
///                      When performing multiple exposures with a single trigger, the frame 
///                      delay is the time from the end of expsosure of a frame
///                      to the start of exposure of the next frame.
/// @param pImmediate - This parameter affects the way exposure starts when the 
///                     FPROFrame_CaptureStart() function is called.  The camera
///                     image sensor is continually exposing its pixels on a row
///                     by row basis. When this parameter is set to true, the exposure 
///                     for the frame begins at whatever image sensor row is currently
///                     being exposed.  The raw image data returned by the FPROFrame_GetVideoFrame()
///                     call begins with this row (most likely not row 0).  The row that
///                     starts the raw video frame is recorded in the meta data for the image frame.
///
///                     When this parameter is set to false, the camera waits until row 0 is
///                     being exposed before starting the frame exposure.  In this case, the
///                     image frame data returned by the FPROFrame_GetVideoFrame() call will
///                     start at row 0.
///
/// NOTE: The Exposure Time and Frame Delay values are translated to camera specific units which
///       are in turn dependent on the current imaging mode of the camera (e.g. LDR vs HDR).
///       The API does its best to perform the necessary conversions automatically
///       when the modes are changed. It is recommended, however,  to make sure the 
///       desired exposure times are set after imaging modes have changed using this 
///       and its counterpart API function FPROCtrl_SetExposure().
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetExposure(int32_t iHandle, uint64_t *pExposureTime, uint64_t *pFrameDelay, bool *pImmediate);


//////////////////////////////////////////
///
/// @brief Returns the external trigger settings of the camera.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pEnable - true: External trigger enabled, false: External trigger disabled
/// @param pTrigType - The behavior of the external trigger signal.  See #FPROEXTTRIGTYPE.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetExternalTriggerEnable(int32_t iHandle, bool *pEnable, FPROEXTTRIGTYPE *pTrigType);

//////////////////////////////////////////
///
/// @brief Returns the current Fan status, on or off.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pOn - true: the fan is on, false: the fan is off
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetFanEnable(int32_t iHandle, bool *pOn);

//////////////////////////////////////////
///
/// @brief Returns the current state of an optionally attached GPS unit.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pState - One of FPROGPSSTATE enumerations. See #FPROGPSSTATE for the definitions
/// of the states.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetGPSState(int32_t iHandle, FPROGPSSTATE *pState);

//////////////////////////////////////////
///
/// @brief Reads the current heater configuration.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pPwrPercentage - The setting of the heater in percent.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetHeaterPower(int32_t iHandle, uint32_t *pPwrPercentage);

//////////////////////////////////////////
///
/// @brief Gets the delay between setting the Illumination on/off via FPROCtrl_SetIlluminationOn()
/// and when the illumination actually activates.  Each increment is TBD msecs.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pOnDelay - Delay for turning the illumination on in TBD msec increments
/// @param pOffDelay - Delay for turning the illumination off in TBD msec increments
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetIlluminationDelay(int32_t iHandle, uint32_t *pOnDelay, uint32_t *pOffDelay);

//////////////////////////////////////////
///
/// @brief Returns the setting of External Illumination- on or off.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pOn - true: illumination on, false: illumination off
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetIlluminationOn(int32_t iHandle, bool *pOn);

//////////////////////////////////////////
///
/// @brief Returns the state of the LED on or off setting.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pOn - true: LED on, false: LED off
/// <br>
/// See #FPROCtrl_SetLED() for a description of the LED functionality.
/// <br>
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetLED(int32_t iHandle, bool *pOn);

//////////////////////////////////////////
///
/// @brief Retuend the LED Duration setting.
///
///	@param iHandle - The handle to an open camera device returned from #FPROCam_Open()
/// @param *pDurationUsec - Duration in micro seconds.  0xFFFFFFFF = always on.
/// <br>
/// <br>
/// Note that each camera model may have different resolution capability on the duration
/// (i.e. something larger than a micro-second).  The FPROCtrl_SetLEDDuration() converts the
/// micro-second value passed to the proper resolution for the camera.  This call reverses
/// the conversion.  As such, the value returned by this call may not match the value exactly
/// as that passed to FPROCtrl_SetLEDDuration().  On most cameras, the physical resolution for
/// this duration is 10usecs.
/// <br>
/// <br>
/// Also see #FPROCtrl_SetLEDDuration() for a description of the LED functionality.
/// <br>
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetLEDDuration(int32_t iHandle, uint32_t *pDurationUsec);

//////////////////////////////////////////
///
/// @brief Reads the internal sensor temperature of the camera.  
///
/// Note that if this
/// function is called during an exposure and 'Read During Exposure' is not
/// enabled, the internal sensor temperature is not explicitly read.  The
/// last value successfully read will be returned.  See the
/// FPROCtrl_SetSensorTemperatureReadEnable() API for more information.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pTemp - For the returned temperature, deg C.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetSensorTemperature(int32_t iHandle, int32_t *pTemp);

//////////////////////////////////////////
///
/// @brief Returns the 'read sensor temperature during exposure' enabled flag.
///
/// See FPROCtrl_SetSensorTemperatureReadEnable() for more details.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pEnable - true: 'read sensor temperature during exposure' Enabled
///                  false: 'read sensor temperature during exposure' Disabled
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetSensorTemperatureReadEnable(int32_t iHandle, bool *pEnable);


//////////////////////////////////////////
///
/// @brief Gets the current shutter setting.
///
/// By default the camera controls the shutter during exposures.  In order for 
/// the #FPROCtrl_SetShutterOpen() API to correctly control the shutter,
/// the #FPROCtrl_SetShutterOverride() API must be called prior with the override 
/// parameter set to True.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pOpen - true: Shutter open, false: Shutter closed
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetShutterOpen(int32_t iHandle, bool *pOpen);

//////////////////////////////////////////
///
/// @brief Gets the current shutter override setting.
///
/// By default the camera controls the shutter during exposures.  In order for 
/// the #FPROCtrl_SetShutterOpen() API to correctly control the shutter,
/// the shutter override must be set to True.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pOverride - true: Allows user control of shutter, false: Camera controls shutter
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetShutterOverride(int32_t iHandle, bool *pOverride);

//////////////////////////////////////////
///
/// @brief Reads the various temperatures sensors of the camera.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pAmbientTemp - For the returned Ambient temperature, deg C.
/// @param pBaseTemp - For the returned Base temperature, deg C.
/// @param pCoolerTemp - For the returned Cooler temperature, deg C.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetTemperatures(int32_t iHandle, double *pAmbientTemp, double *pBaseTemp, double *pCoolerTemp);

//////////////////////////////////////////
///
/// @brief Returns the Base Temperature Set Point.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pSetPoint - The setpoint value in -75 to 70 degC.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_GetTemperatureSetPoint(int32_t iHandle, double *pSetPoint);

//////////////////////////////////////////
///
/// @brief Sets the exposure time of the image sensor.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiExposureTime - Exposure time in nanosecond increments.
/// @param uiFrameDelay - Frame delay (end - to - start) time in nanoseconds.
///                       When performing multiple exposures with a single trigger, the frame 
///                       delay is the time from the end of exposure of a frame
///                       to the start of exposure of the next frame.
/// @param bImmediate - This parameter affects the way exposure starts when the 
///                     FPROFrame_CaptureStart() function is called.  The camera
///                     image sensor is continually exposing its pixels on a row
///                     by row basis. When this parameter is set to true, the exposure 
///                     for the frame begins at whatever image sensor row is currently
///                     being exposed.  The raw image data returned by the FPROFrame_GetVideoFrame()
///                     call begins with this row (most likely not row 0).  The row that
///                     starts the raw video frame is recorded in the meta data for the image frame.
///
///                     When this parameter is set to false, the camera waits until row 0 is
///                     being exposed before starting the frame exposure.  In this case, the
///                     image frame data returned by the FPROFrame_GetVideoFrame() call will
///                     start at row 0.
///
/// <br>
/// NOTE: The Exposure Time and Frame Delay values are translated to camera specific units which
///       are in turn dependent on the current imaging mode of the camera (e.g. LDR vs HDR),
///       as well as the camera model.
///       The API does its best to perform the necessary conversions automatically
///       when the modes are changed. It is recommended, however,  to make sure the 
///       desired exposure times are set after imaging modes have changed using this 
///       and its counterpart API function #FPROCtrl_GetExposure().
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_SetExposure(int32_t iHandle, uint64_t uiExposureTime, uint64_t uiFrameDelay, bool bImmediate);

//////////////////////////////////////////
///
/// @brief Sets the exposure time of the image sensor.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiExposureTime - Exposure time in nanosecond increments.
/// @param uiFrameDelay - Frame delay (end - to - start) time in nanoseconds.
///                       When performing multiple exposures with a single trigger, the frame 
///                       delay is the time from the end of exposure of a frame
///                       to the start of exposure of the next frame.
/// @param bImmediate - This parameter affects the way exposure starts when the 
///                     FPROFrame_CaptureStart() function is called.  The camera
///                     image sensor is continually exposing its pixels on a row
///                     by row basis. When this parameter is set to true, the exposure 
///                     for the frame begins at whatever image sensor row is currently
///                     being exposed.  The raw image data returned by the FPROFrame_GetVideoFrame()
///                     call begins with this row (most likely not row 0).  The row that
///                     starts the raw video frame is recorded in the meta data for the image frame.
///
///                     When this parameter is set to false, the camera waits until row 0 is
///                     being exposed before starting the frame exposure.  In this case, the
///                     image frame data returned by the FPROFrame_GetVideoFrame() call will
///                     start at row 0.
/// @param pActualExposureTime - If not NULL, the actual Exposure Time will be returned.  
///                              This is the same value that would be returned by #FPROCtrl_GetExposure().
///                              See NOTE below. 
/// @param pActualFrameDelay - If not NULL, the actual Frame Delay will be returned.
///                            This is the same value that would be returned by #FPROCtrl_GetExposure().
///                            See NOTE below.
///
/// <br>
/// NOTE: The Exposure Time and Frame Delay values are translated to camera specific units which
///       are in turn dependent on the current imaging mode of the camera (e.g. LDR vs HDR),
///       as well as the camera model.
///       The API does its best to perform the necessary conversions automatically
///       when the modes are changed. It is recommended, however,  to make sure the 
///       desired exposure times are set after imaging modes have changed using this 
///       and its counterpart API function #FPROCtrl_GetExposure().
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_SetExposureEx(int32_t iHandle, uint64_t uiExposureTime, uint64_t uiFrameDelay, bool bImmediate, uint64_t *pActualExposureTime, uint64_t *pActualFrameDelay);

//////////////////////////////////////////
///
/// @brief Enables or disables the external trigger of the camera.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param bEnable - true: enables the external trigger, false: disable the external trigger
/// @param eTrigType - Sets the behavior of the external trigger signal.  See #FPROEXTTRIGTYPE.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_SetExternalTriggerEnable(int32_t iHandle, bool bEnable, FPROEXTTRIGTYPE eTrigType);

//////////////////////////////////////////
///
/// @brief Turns the Fan on or off.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param bOn - true: turns the fan on, false: turns the fan off
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_SetFanEnable(int32_t iHandle, bool bOn);

//////////////////////////////////////////
///
/// @brief Turns the Heater on or off at the specified power level.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiPwrPercentage -Specifies the power level as a percentage (0-100)
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_SetHeaterPower(int32_t iHandle,uint32_t uiPwrPercentage);

//////////////////////////////////////////
///
/// @brief Sets the illumination delay.
///
/// The illumination delay is the time between setting the Illumination on/off via 
/// #FPROCtrl_SetIlluminationOn and when the illumination actually activates.  
/// Each increment is TBD msecs.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiOnDelay - Delay for turning the illumination on in TBD msec increments
/// @param uiOffDelay - Delay for turning the illumination off in TBD msec increments
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_SetIlluminationDelay(int32_t iHandle, uint16_t uiOnDelay, uint16_t uiOffDelay);

//////////////////////////////////////////
///
/// @brief Turns External Illumination on or off.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param bOn - true: turns illumination on, false: turns illumination off
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_SetIlluminationOn(int32_t iHandle, bool bOn);

//////////////////////////////////////////
///
/// @brief Turn the LED on or off.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param bOn - true: Turns the LED on, false: Turns the LED off
/// <br>
/// <br>
/// Based on the camera model, this function may work in conjunction with the #FPROCtrl_SetLEDDuration()
/// API.  In those cases, this call must be made with a value of TRUE in order for the 
/// #FPROCtrl_SetLEDDuration() to toggle the LED.
/// <br>
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_SetLED(int32_t iHandle, bool bOn);

//////////////////////////////////////////
///
/// @brief Set LED Duration during exposure.
///
///	@param iHandle - The handle to an open camera device returned from #FPROCam_Open()
/// @param uiDurationUSec - Duration in micro seconds.  0xFFFFFFFF = always on.
/// <br>
/// <br>
/// This call sets the duration of the LED flash during exposure. This call is not available on all 
/// camera models. It was introduced on the 4040 models.  This call works in conjunction with the #FPROCtrl_SetLED()
/// API.  In order for the camera to turn the LED on for the given duration, #FPROCtrl_SetLED() must have been called
/// with a value of TRUE.  
/// <br>
/// <br>
/// To simply turn the LED on and leave it on, pass a value of 0xFFFFFFFF in the uiDurationUSec parameter.  As with other
/// duration values, #FPROCtrl_SetLED() must be called with a value of TRUE.
/// <br>
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_SetLEDDuration(int32_t iHandle, uint32_t uiDurationUSec);

//////////////////////////////////////////
///
/// @brief Enables/disables physical reading of the image sensor temperature during exposures.  
///
/// The sensor temperature is read using the #FPROCtrl_GetSensorTemperature
/// API call.  If that call is made during an exposure, it will physically read
/// the sensor temperature only if this call was made prior to enable the reading.
/// If this 'read sensor temperature during exposure' is not enabled, then the
/// #FPROCtrl_GetSensorTemperature call will return the previous successful temperature
/// read from the imaging sensor.
/// <br>NOTE: This enable only pertains to requests during an exposure. If temperature 
/// readings are requested outside of an exposure boundary, this enable has no effect.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param bEnable - true: Enable 'read sensor temperature during exposure'.
///                  false: Disable 'read sensor temperature during exposure'.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_SetSensorTemperatureReadEnable(int32_t iHandle, bool bEnable);


//////////////////////////////////////////
///
/// @brief Opens/Close the shutter.
///
/// By default the camera controls the shutter during exposures.  In order for 
/// the #FPROCtrl_SetShutterOpen() API to correctly control the shutter,
/// the #FPROCtrl_SetShutterOverride() API must be called prior with the override 
/// parameter set to True.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param bOpen - true: opens the shutter, false: closes the shutter
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_SetShutterOpen(int32_t iHandle, bool bOpen);

//////////////////////////////////////////
///
/// @brief Sets the shutter control override.
///
/// By default the camera controls the shutter during exposures.  In order for 
/// the #FPROCtrl_SetShutterOpen() API to correctly control the shutter,
/// the shutter override must be set to True.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param bOverride - true: Allows user control of shutter, false: Camera controls shutter
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_SetShutterOverride(int32_t iHandle, bool bOverride);

//////////////////////////////////////////
///
/// @brief Sets the Base Temperature Set Point.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param dblSetPoint - The setpoint value to set in -75 to 70 degC.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROCtrl_SetTemperatureSetPoint(int32_t iHandle, double dblSetPoint);

//////////////////////////////////////////
// Sensor Functions
//////////////////////////////////////////
//////////////////////////////////////////
///
/// @brief Retrieves the current pixel bin settings.
///
/// The bin setting for horizontal (x direction) and vertical (Y direction) binning.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pXBin - For returned horizontal bin setting.
/// @param pYBin - For returned vertical bin setting.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_GetBinning(int32_t iHandle, uint32_t *pXBin, uint32_t *pYBin);

//////////////////////////////////////////
///
/// @brief Retrieves the Binning table capability from the camera.
///
/// The available bin settings for horizontal (x direction) and vertical (Y direction) binning.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pBinTable - User allocated buffer for the bin settings.  The size of the table is
///                    reported in the  Capabilities structure returned by #FPROSensor_GetCapabilities().
/// @param pTableSizeBytes - On entry, the size of the buffer.  On exit, the number of bytes used.
///                          
/// @return Greater than or equal to 0 on success, less than 0 on failure.
///         On success, the returned size may be 0 indicating no binning table exists and 
///         the only available binning is 1:1.
/// <br>
///         Each binning table entry is 32 bits wide.  The horizontal binning value is contained
///         in the upper 16 bits and the vertical binning value is contained in the lower 16 bits.  There
///         is a binning table entry for each of the horizontal and vertical binning combinations available
///         for the camera. One to one (1:1) binning is always allowed.  For example, if 2x2 and 2x4 binning 
///         (horizontal x vertical) is supported, the two binning table entries would be in the binning table as follows:
///         0x00020002, 0x00020004.
/// <br>
///         If the high bit is set for a given binning, then all binnings up to and including the value with the
///         high bit masked are valid.  For example, a binning table entry of 0x88008800 would allow all combinations
///         of binning values from 1:1 through 2048x2048.  A binning table entry of 0x88000001 indicates that all horizontal
///         binning values from 1 through 2048 are valid with a vertical binning value of 1;
/// <br>
///         If not enough room is given for the buffer, the function fails and the
///         size required is returned in pTableSizeBytes.  If a different failure occurs,
///         the returned size is set to zero (0).
LIBFLIPRO_API FPROSensor_GetBinningTable(int32_t iHandle, uint32_t *pBinTable, uint32_t *pTableSizeBytes);

//////////////////////////////////////////
///
/// @brief Retrieves the current Black Level Adjustment values.
///
/// For the ex (extended) function, a channel must be specified, on of the #FPROBLACKADJUSTCHAN
/// enumeration values.  Note that not all cameras support multiple channels for the
/// Black Level Adjustment values.  Consult your users manual for specifics on your device.
/// <br>
/// If you call the #FPROSensor_GetBlackLevelAdjust() API for a camera that does support
/// multiple channels, the channel defaults to the first channel on the device.
/// <br>
/// If you call the ex (extended) function on a camera that does not support multiple channels, 
/// the eChan parameter is ignored and the single supported channel is retrieved.
/// <br>
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pAdjustValue - For returned adjustment values.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_GetBlackLevelAdjust(int32_t iHandle, uint32_t *pAdjustValue);

//////////////////////////////////////////
///
/// @brief Retrieves the current Black Level Adjustment values for the given channel.
///
/// <br>
/// See #FPROSensor_GetBlackLevelAdjust().
/// <br>
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param eChan -	The adjustment channel to retrieve.
/// @param pAdjustValue - For returned adjustment values.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_GetBlackLevelAdjustEx(int32_t iHandle, FPROBLACKADJUSTCHAN eChan, uint32_t *pAdjustValue);

//////////////////////////////////////////
///
/// @brief Retrieves the current Black Sun Adjustment values.
///
/// For the ex (extended) function, a channel must be specified, on of the #FPROBLACKADJUSTCHAN
/// enumeration values.  Note that not all cameras support multiple channels for the
/// Black Sun Adjustment values.  Consult your users manual for specifics on your device.
/// If you call the #FPROSensor_GetBlackSunAdjust() API for a camera that does support
/// multiple channels, the channel defaults to the first channel on the device.
/// <br>
/// <br>
/// If you call the ex (extended) function on a camera that does not support multiple channels, 
/// the eChan parameter is ignored and the single supported channel is retrieved.
/// <br>
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pAdjustValue - For returned adjustment values.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_GetBlackSunAdjust(int32_t iHandle, uint32_t *pAdjustValue);

//////////////////////////////////////////
///
/// @brief Retrieves the current Black Sun Adjustment values for the given channel.
///
/// <br>
/// See #FPROSensor_GetBlackSunAdjust().
/// <br>
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param eChan -	The adjustment channel to retrieve.
/// @param pAdjustValue - For returned adjustment values.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_GetBlackSunAdjustEx(int32_t iHandle, FPROBLACKADJUSTCHAN eChan, uint32_t *pAdjustValue);

//////////////////////////////////////////
///
/// @brief Retrieves the sensor capabilities structure from the camera.  
///
/// Note that you
/// may pass in a generic buffer in which to store the capabilities rather than a 
/// strict FPROCAP structure pointer.  The pCapLength parameter is the length of
/// the buffer you are passing.  It is used to determine if there is enough space in 
/// the buffer prior to reading the capabilities.
/// <br><br>
/// The camera is asked for the size of the capabilities prior to retrieving them.
/// If sufficient space exists (as specified by the pCapLength parameter), then
/// the capabilities are retrieved.  This sequence allows older API's to work with
/// newer cameras and different capabilities structures.  The length and version fields
/// should be parsed by the caller in order to determine the proper structure format.
/// <br><br>
/// In the event of failure, if the *pCapLength value is > 0, the call failed because the buffer
/// passed in was too small.  In this case, tne *pCapLength value is the size of the buffer
/// required to read the capabilities successfully.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pCap - Buffer to store the capabilities structure
/// @param pCapLength - On entry the size of the buffer pointed to by pCap.  On exit,
///                     the actual size of the structure returned.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_GetCapabilities(int32_t iHandle, FPROCAP *pCap, uint32_t *pCapLength);

//////////////////////////////////////////
///
/// @brief Retrieves the current setting for the Gain for the specified table.
///
/// Note: The index returned is the index into the table as returned by 
///       FPROSensor_GetGainTable().
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param eTable - The table to retrieve.
/// @param pGainIndex - Buffer for the returned index.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_GetGainIndex(int32_t iHandle, FPROGAINTABLE eTable, uint32_t *pGainIndex);

//////////////////////////////////////////
///
/// @brief Retrieves the specified Gain Table. 
///
/// The pNumEntries command should be derived from the
/// uiLDRGain, uiHDRGain, or uiGlobalGain values in the #FPROCAP capabilities structure.
///
/// Note: Each gain that is returned is scaled to produce an integer number.
///       The scale factor is defined as #FPRO_GAIN_SCALE_FACTOR in the API.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param eTable - The table to retrieve.
/// @param pGainValues - Buffer for the returned values.
/// @param pNumEntries - On entry, the number of locations available in the buffer.
///                      On exit, the actual number of values inserted in the table.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_GetGainTable(int32_t iHandle, FPROGAINTABLE eTable, FPROGAINVALUE *pGainValues, uint32_t *pNumEntries);

//////////////////////////////////////////
///
/// @brief Retrieves the current setting for HDR enable.
///
/// The HDR setting is enabled/disabled by setting the appropriate mode using the #FPROSensor_SetMode
/// API.  As such there is no corresponding 'set' function for HDR enable.  This
/// API is simply a convenience function to allow a user to determine if the selected
/// mode has enabled HDR frames.  Knowing this is of course critical to determining how much
/// image data will be supplied by the camera for each exposure. When HDR is enabled, there will
/// be twice the image data returned for a frame (including dummy pixels).
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pEnable - Buffer for the returned HDR enable flag.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_GetHDREnable(int32_t iHandle, bool *pEnable);

//////////////////////////////////////////
///
/// @brief Retrieves the current mode name for the specified index.  
///
/// The number of available modes are retrieved using the #FPROSensor_GetModeCount API.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiModeIndex - The index of the mode to retrieve.
/// @param pMode - Buffer for the returned mode information.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_GetMode(int32_t iHandle, uint32_t uiModeIndex, FPROSENSMODE *pMode);

//////////////////////////////////////////
///
/// @brief Retrieves the current mode count and current mode index setting.
///
/// Mode information for a given index is retrieved using the 
/// #FPROSensor_GetMode() API.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pCount - Buffer for the number of available modes.
/// @param pCurrentMode - Buffer for index of the currently assigned mode.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_GetModeCount(int32_t iHandle, uint32_t *pCount,uint32_t *pCurrentMode);

//////////////////////////////////////////
///
/// @brief Retrieves the current sensor read out configuration on supported models.
///
/// For camera models that support sensor channel read out configuration, this API
/// retrieves the current setting.  For models that do not support this feature, this
/// function always returns success with a value of 0 for the configuration.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pReadCfg - Buffer for the configuration.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_GetReadoutConfiguration(int32_t iHandle, FPROSENSREADCFG *pReadCfg);

//////////////////////////////////////////
///
/// @brief Retrieves the Samples Per Pixel settings on the sensor.
/// <br><br>
/// NOTE: This function is not supported on on all camera models.  Consult
/// your documentation for your specfic camera.
/// <br>
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pSamplesPerPixel - Returned Samples Per Pixel Setting.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.  On devices that
/// do not support this setting, 0 is always returned with pSamplesPerPixel set to FPROCMS_1.
LIBFLIPRO_API FPROSensor_GetSamplesPerPixel(int32_t iHandle, FPROCMS *pSamplesPerPixel);

//////////////////////////////////////////
///
/// @brief Retrieves the current pixel scan direction settings on the sensor.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pHInverted - Returned horizontal scan direction: False = Normal, True = Inverted.
/// @param pVInverted - Returned vertical scan direction: False = Normal, True = Inverted.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_GetScanDirection(int32_t iHandle, bool *pHInverted,bool *pVInverted);

//////////////////////////////////////////
///
/// @brief Returns the sensor re-training setting.
///
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pEnable - true: Forces sensor to undergo training.  False - stops the sensor training.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_GetTrainingEnable(int32_t iHandle, bool *pEnable);

//////////////////////////////////////////
///
/// @brief Sets the desired horizontal and vertical binning.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiXBin - Horizontal bin setting.
/// @param uiYBin - Vertical bin setting.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_SetBinning(int32_t iHandle, uint32_t uiXBin, uint32_t uiYBin);

//////////////////////////////////////////
///
/// @brief Sets the current Black Level Adjustment values.
///
/// For the ex (extended) function, a channel must be specified, on of the #FPROBLACKADJUSTCHAN
/// enumeration values.  Note that not all cameras support multiple channels for the
/// Black Level Adjustment values.  Consult your users manual for specifics on your device.
/// <br>
/// If you call the #FPROSensor_SetBlackLevelAdjust() API for a camera that does support
/// multiple channels, the channel defaults to the first channel on the device.
/// <br>
/// If you call the ex (extended) function on a camera that does not support multiple channels, 
/// the eChan parameter is ignored and the single support channel is set.
/// <br>
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiAdjustValue - Value to set.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_SetBlackLevelAdjust(int32_t iHandle, uint32_t uiAdjustValue);


//////////////////////////////////////////
///
/// @brief Sets the current Black Level Adjustment value for the given channel.
///
/// See #FPROSensor_SetBlackLevelAdjust.
/// <br>
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param eChan -	The adjustment channel to set.
/// @param uiAdjustValue - Value to set.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_SetBlackLevelAdjustEx(int32_t iHandle, FPROBLACKADJUSTCHAN eChan, uint32_t uiAdjustValue);

//////////////////////////////////////////
///
/// @brief Sets the current Black Sun Adjustment value.
///
/// For the ex (extended) function, a channel must be specified, on of the #FPROBLACKADJUSTCHAN
/// enumeration values.  Note that not all cameras support multiple channels for the
/// Black Sun Adjustment values.  Consult your users manual for specifics on your device.
/// If you call the #FPROSensor_SetBlackSunAdjust() API for a camera that does support
/// multiple channels, the channel defaults to the first channel on the device.
/// <br>
/// If you call the ex (extended) function on a camera that does not support multiple channels, 
/// the eChan parameter is ignored and the single support channel is set.
/// <br>
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiAdjustValue - Value to set.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_SetBlackSunAdjust(int32_t iHandle, uint32_t uiAdjustValue);


//////////////////////////////////////////
///
/// @brief Sets the current Black Sun Adjustment value for the given channel.
///
/// See #FPROSensor_SetBlackSunAdjust.
/// <br>
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param eChan -	The adjustment channel to set.
/// @param uiAdjustValue - Value to set.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_SetBlackSunAdjustEx(int32_t iHandle, FPROBLACKADJUSTCHAN eChan, uint32_t uiAdjustValue);

//////////////////////////////////////////
///
/// @brief Sets the current setting for the Gain for the specified table.
///
/// Note: The index is the index into the table as returned by 
///       FPROSensor_GetGainTable().
/// Note: When setting an LDR gain table index, if the camera is in an LDR mode,
///       as set by #FPROSensor_SetMode(), the HDR gain index is set to match to maintain 
///       image integrity. If you attempt
///       to set an HDR index when in an LDR mode, the function will return an error.  Set the
///       mode first using #FPROSensor_SetMode(), then override the gain settings as desired
///       using this function.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param eTable - The table to retrieve.
/// @param uiGainIndex - Index value to set.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_SetGainIndex(int32_t iHandle, FPROGAINTABLE eTable, uint32_t uiGainIndex);

//////////////////////////////////////////
///
/// @brief Sets the current mode specified by the given index.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiModeIndex - The index of the mode to set.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_SetMode(int32_t iHandle, uint32_t uiModeIndex);

//////////////////////////////////////////
///
/// @brief Sets the sensor read out configuration on supported models.
///
/// For camera models that support sensor channel read out configuration, this API
/// sets the given setting.  The function will return failure if the given configuration
/// is invalid for the camera model connected.  For models that do not support this feature, this
/// function has no effect.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param eReadCfg - The confiugration to set.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_SetReadoutConfiguration(int32_t iHandle, FPROSENSREADCFG eReadCfg);

//////////////////////////////////////////
///
/// @brief Sets the Samples Per Pixel settings on the sensor.
/// <br><br>
/// NOTE: This function is not supported on on all camera models.  Consult
/// your documentation for your specfic camera.
/// <br>
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param eSamplesPerPixel - The Samples Per Pixel Setting to set.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.  On devices that
/// do not support this setting, 0 is always returned.
LIBFLIPRO_API FPROSensor_SetSamplesPerPixel(int32_t iHandle, FPROCMS eSamplesPerPixel);

//////////////////////////////////////////
///
/// @brief Retrieves the current pixel scan direction settings on the sensor.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param bHInverted - Horizontal scan direction: False = Normal, True = Inverted.
/// @param bVInverted - Vertical scan direction: False = Normal, True = Inverted..
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_SetScanDirection(int32_t iHandle, bool bHInverted, bool bVInverted);

//////////////////////////////////////////
///
/// @brief Enables/Disables sensor re-training.
///
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param bEnable - true: Forces sensor to undergo training.  False - stops the sensor training.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROSensor_SetTrainingEnable(int32_t iHandle, bool bEnable);


//////////////////////////////////////////
// Auxiliary I/O Support Functions
//////////////////////////////////////////
//////////////////////////////////////////
///
/// @brief Gets the direction and state for given Auxiliary I/O pin.
///
/// For Output pins, the state of the pin will be the value last set with the
/// #FPROAuxIO_GetPin() call.  For Input pins, the state of the pin reflects the 
/// state of the physical input signal.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param eAuxIO - Auxiliary I/O pin to retrieve.
/// @param pDirection - Pin direction.
/// @param pState - Pin state. May be NULL if you do not want the state.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROAuxIO_GetPin(int32_t iHandle, FPROAUXIO eAuxIO, FPROAUXIO_DIR *pDirection, FPROAUXIO_STATE *pState);

//////////////////////////////////////////
///
/// @brief Get Exposure Active Type Signal.
///
/// This function gets the Exposure Type Signal for the Exposure Type Auxiliary 
/// output pin.  Consult your documentation for signal timing details.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pType - Exposure Active Signal Type. 
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROAuxIO_GetExposureActiveType(int32_t iHandle, FPROAUXIO_EXPACTIVETYPE *pType);

//////////////////////////////////////////
///
/// @brief Sets the direction and state for given Auxiliary I/O pin.
///
/// Note that the state is only applicable to output pins.  It is ignored
/// for input pins.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param eAuxIO - Auxiliary I/O pin to configure.
/// @param eDirection - Pin direction to set.
/// @param eState - Pin state to set for output pins.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROAuxIO_SetPin(int32_t iHandle, FPROAUXIO eAuxIO, FPROAUXIO_DIR eDirection, FPROAUXIO_STATE eState);

//////////////////////////////////////////
///
/// @brief Exposure Active Type Signal.
///
/// This function sets the Exposure Type Signal for the Exposure Type Auxiliary 
/// output pin.  Consult your documentation for signal timing details.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param eType - Exposure Active Signal Type.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROAuxIO_SetExposureActiveType(int32_t iHandle, FPROAUXIO_EXPACTIVETYPE eType);

//////////////////////////////////////////
// Frame Acknowledgment Mode Support Functions
//////////////////////////////////////////
//////////////////////////////////////////
///
/// @brief Get Frame Acknowledgment Mode Enable.
///
/// This function gets the Frame Acknowledgment Mode Enable.  If true, Frame
/// Acknowledgment Mode is enabled.  
/// <br>
/// Frame Acknowledgment Mode is a camera mode that instructs the camera to store
/// each frame as it is exposed in an internal memory.  The frame in the memory
/// may be retransmitted to the host using the #FPROFAck_FrameResend() API.  Each frame -must- be
/// explicitly acknowledged by the user using the #FPROFAck_FrameAcknowledge() API.  This allows
/// the camera to delete the frame from its memory queue making it available for the next frame.
/// API function.
/// <br>
/// This mode is intended for users who require every image to be successully tramnsmitted to the host
/// even in the face of cable and unrecoverable transmission errors.  Because of the required acknowledgments,
/// this mode is significantly slower with respect to achievable frame rate and dependent on the host computer.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param pEnable - The Frame Acknowldgement Mode enable- true if enabled, false otherwise. 
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFAck_GetEnable(int32_t iHandle, bool *pEnable);

//////////////////////////////////////////
///
/// @brief Set Frame Acknowledgment Mode Enable.
///
/// This function sets the Frame Acknowledgment Mode Enable.  If true, Frame
/// Acknowledgment Mode is enabled.  See #FPROFAck_GetEnable() for a description
/// of this mode.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param bEnable - The Frame Acknowldgement Mode enable- True if enabled, False otherwise. 
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFAck_SetEnable(int32_t iHandle, bool bEnable);

//////////////////////////////////////////
///
/// @brief Acknowledge the last frame sent in Frame Acknowledgment Mode.
///
/// This function acknowledges the last from sent to the host.
/// See #FPROFAck_GetEnable() for a description of this mode.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFAck_FrameAcknowledge(int32_t iHandle);


//////////////////////////////////////////
///
/// @brief Resend the last frame in Frame Acknowledgment Mode.
///
/// This function instructs the camera to resend the last image frame to the
/// host.  Is expected to be called by an application in the event of transmission 
/// errors or errors detected during parsing of the image data.
/// See #FPROFAck_GetEnable() for a description of this mode.
/// <br>
/// The frame data will be available immediately after this call so it is important
/// to call #FPROFrame_GetVideoFrame() with the proper parameters immediately after this call 
/// returns.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFAck_FrameResend(int32_t iHandle);

//////////////////////////////////////////
///
/// @brief Flush the in memory frame queue in Frame Acknowledgment Mode.
///
/// This function instructs the camera to flush all of the image frames contained
/// in its internal image frame queue.
/// See #FPROFAck_GetEnable() for a description of this mode.
/// <br>
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPROFAck_FlushImageQueue(int32_t iHandle);

//////////////////////////////////////////
// NV Storage Functions
//////////////////////////////////////////
//////////////////////////////////////////
///
/// @brief Write the given data to the non volatile storage area on the camera.
///
/// This function simply writes the given data to the non volatile storage area on
/// the camera.  This API allows users to keep proprietary settings
/// linked with a given camera.  No structure is imposed on the data by this API nor the camera. 
/// That is, the data is ismply treated as a byte stream.  It is up to the user to format the
/// data as required for their application.  
/// <br>
/// Note that not all cameras may support a non-volatile memory area.  You can determine if
/// it is available and the size by reading the capabilities of the camera using the
/// #FPROSensor_GetCapabilities API.  The uiNVStorageAvailable field in this structure contains
/// the size in bytes of the NV storage area.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiOffset - The offset within the NV area to begin the write. 
/// @param pData - The data to write. 
/// @param uiLength - The number of bytes to write. 
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPRONV_WriteNVStorage(int32_t iHandle,uint32_t uiOffset, uint8_t *pData, uint32_t uiLength);

//////////////////////////////////////////
///
/// @brief Read the non volatile storage area on the camera.
///
/// This function simply reads the non volatile storage area on
/// the camera and returns it in the provided buffer.  See # FPRONV_WriteNVStorage
/// for more information.
///
///	@param iHandle - The handle to an open camera device returned from FPROCam_Open()
/// @param uiOffset - The offset within the NV area to begin the read. 
/// @param pData - The buffer for the data. 
/// @param uiLength - The number of bytes to read. 
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API FPRONV_ReadNVStorage(int32_t iHandle, uint32_t uiOffset, uint8_t *pData, uint32_t uiLength);

//////////////////////////////////////////
// Low level commands and functions
//////////////////////////////////////////
/// @private
LIBFLIPRO_API FPROCmd_SendRaw(int32_t iHandle, uint8_t *pData, uint32_t uiLength);
/// @private
LIBFLIPRO_API FPROCmd_SendRecvRaw(int32_t iHandle, uint8_t *pTxData, uint32_t uiTxLength, uint8_t *pRxData, uint32_t *pRxLength);
/// @private
LIBFLIPRO_API FPROCmd_ReadReg(int32_t iHandle, uint32_t uiReg, uint32_t *pValue);
/// @private
LIBFLIPRO_API FPROCmd_WriteReg(int32_t iHandle, uint32_t uiReg, uint32_t uiValue, uint32_t uiMask);

// Debug Functions
/// @cond DO_NOT_DOCUMENT
// Conversion strings to aid in debug printing
// The Linux part is different because of the way
// swprintf() works- when %s is used, the argument is
// assumed to be a char pointer.  Hence we do not make it wide.
#if defined(WIN32) || defined(_WINDOWS)
#define STRINGIFY(x) L##x
#define MAKEWIDE(x) STRINGIFY(x)
#else
#define MAKEWIDE(x) (x)
#endif
/// @endcond

//////////////////////////////////////////
///
/// Enables the given debug level and above.
///
///	@param bEnable - Overall enable for debug output
/// @param eLevel - The level to enable if bEnable is true;
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API  FPRODebug_EnableLevel(bool bEnable, FPRODBGLEVEL eLevel);
//////////////////////////////////////////
///
/// Sets the log file path to the given folder.  The file name is auto generated.
///
///	@param pPath - Path (folder) in which to place the log file.
///
/// @return Greater than or equal to 0 on success, less than 0 on failure.
LIBFLIPRO_API  FPRODebug_SetLogPath(const wchar_t *pPath);
#ifdef WIN32 
//////////////////////////////////////////
///
/// Writes the given information to the log file if the given level is enabled.
/// <br>The parameters support the basic printf type of formatting.
///
///	@param eLevel - Debug level of the log message.
/// @param format - printf style formatting string
/// @param ...    - printf arguments for the format string
///
/// @return None.
LIBFLIPRO_VOID _cdecl FPRODebug_Write(FPRODBGLEVEL eLevel, const wchar_t *format, ...);
#else
//////////////////////////////////////////
/// FPRODebug_Write
/// Writes the given information to the log file if the given level is enabled.
/// <br>The parameters support the basic printf type of formatting.
///
///	@param eLevel - Debug level of the log message.
/// @param format - printf style formatting string
/// @param ...    - printf arguments for the format string
///
/// @return None.
LIBFLIPRO_VOID FPRODebug_Write(FPRODBGLEVEL eLevel, const wchar_t *format, ...);
#endif




#endif   // _LIBFLIPRO_H_

#ifdef __cplusplus
}

#endif

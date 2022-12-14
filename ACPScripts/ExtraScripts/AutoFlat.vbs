'tabs=4
'------------------------------------------------------------------------------
'
' Script:       AutoFlat.vbs
' Authors:      Robert B. Denny <rdenny@dc3.com>
'               James R. McMillan <valueware@msn.com>
'               Eric V. Dose <astro@ericdose.com>
'               Geoffrey C. Stone <geofstone@earthlink.net>
'
' Version:      ==> 8.2.4 <==  CHANGE SCRIPTVERSION BELOW!
' Requires:     ACP 8.1 or later! (no kidding, needs UnsafeSlewToAltAz())
'               Windows Script 5.6 or later
'
' Environment:  This script is written to run under the ACP scripting
'               console. 
'
' Description:  Dual-purpose for sky flats and "Dome" flats using an EL panel
'               or lighted screen. For detailed information on this script, 
'               see ACP Help, Automatic Sky Flats section.
'
'               SKY FLATS
'
'               Acquires sky flats using the "minimum gradient" position in the
'               sky. This position is on the solar circle near the zenith, 
'               offset in the anti-solar direction by 15 degrees. This should
'               be "close enough" for most uses, including precision photometry.
'               For more information and the theory behind this selection, see
'               "The Flat Sky: Calibration and Background Uniformity in Wide-Field
'               Astronomical Images", Chromey & Hasselbacher, PASP 108: 944-949, 
'               October 1996.
'
'               The sequence starts with the Sun 1 degree above the horizon 
'               (evening) or 9 degrees below the horizon (morning). Exposure intervals
'               start with min or max and are automatically adjusted to achieve
'               a prescribed mean background ADU (as measured by PinPoint). A
'               minimum exposure interval is provided to avoid effects of shutter 
'               vignetting. These exposure limits are also adjustable in the 
'               user setup area below.
'
'               PANEL/SCREEN
'
'               Flat field panels such as those from Alnitak/Optec and Gerd Neumann
'               are supported. 
'
'
' User Setup:
'               Before using this script, you must do a ONE-TIME edit of the 
'               the config file AutoFlatConfig.txt (in the same folder as 
'               ACP.exe). See ACP Help, Automatic Sky Flats. and the comments 
'               in AutoFlatConfig.txt.
'
'               
' Revision History:
'
' Date      Who     Description
' --------- ---     --------------------------------------------------
' 02-Sep-04 rbd     Initial edit
' 07-Sep-04 rbd     Fix North/South error in WaitForTwilight(). Add logic 
'                   to slew to flat spot 3 min before start time. Add test 
'                   for "too late" and raise error. Fix boundary condition
'                   on start time (0 minutes...).
' 08-Sep-04 rbd     Fix morning "too late" logic. Change wait time cycle To
'                   5 sec to prevent people from assuming script is broken
'                   when close to start time. Change time to wait to show
'                   hh:mm:ss. Fix case where NumFilters = 0.
' 09-Sep-04 rbd     Open logfile before initializing AcquireSupport so 
'                   initialization info is logged. Make altitude of flat
'                   spot adjustable in user settings. Remove decimal digits 
'                   from background mean printout. Add exponential fading
'                   to simulation. Always recompute exposure after every
'                   image, to better follow changing illumination. Scale
'                   exposure interval for binning (oops). Cosmetic changes
'                   to logging.
' 23-Sep-04 jm      4.0 - Jim McMillan changes, awesome! Adapt to sky level.
'                   Wait for required sky level, start at max or min depending
'                   on morning or evening.
' 06-Oct-04 rbd     4.0/3.x - Allow use on ACP 3.3 by trapping errors on calls
'                   set SUP.ExposureActive (Property Let n/a on ACP3). Forgot
'                   to do this on the set-to-false call!
' 06-Oct-04 rbd     4.0.2 - Add user option to chain to AcquireImages.vbs 
'                   after EVENING flats.
' 07-Oct-04 rbd     4.0.2 - Add tracking control, change flat names to include
'                   sortable (local) date and AM/PM indicator, so they never
'                   overwrite. Change names so they sort by date, AM/PM, 
'                   filter, binning, then sequence. This makes it easy to 
'                   select flats in appropriate groups.
' 23-Oct-04 rbd     4.0.5 = Correct exposure scaling for binning level.
' 08-Nov-04 rbd     4.0.6 - Voice outputs.
' 15-Nov-04 rbd     4.0.7 - Completion message even if tracking not stopped.
'                   Optional observatory shutdown after morning flats.
'                   Folder control, update instructions. Trap MaxBin too high
'                   for camera. Use filter focus offsets if available.
' 17-Nov-04 rbd     4.0.7 - No more errors for too dark/light, just make best
'                   efforts. Add DawnScript, which overrides MorningShutdown.
' 18-Nov-04 rbd     4.0.7 - Errors are non-fatal, post-flat tasks still done.
' 19-Nov-04 rbd     4.0.7 - Fix Morning/Evening for raised errors
' 28-Feb-05 rbd     4.1.1 - Overhaul waiting logic, change terminology from
'                   morning/evening to dawn/dusk. Add dawn/dusk to logfile
'                   name so have separate logs. Make the pre-slew delay a
'                   user setting. Log the sun elevation if the 1-minute wait
'                   loops are entered, so the user can tweak the elevation
'                   limits more easily. Also log it at the end of the run
'                   for the same reason.
' 02-Feb-05 rbd     4.1.2 - Really turn tracking on after waiting.
' 04-Mar-05 rbd     4.1.3 - Tracks and saves the actual sun angles that allow
'                   exposures within limits to obtain ADUs within limits. 
'                   This eliminates the need to play with sun angles. 
' 15-Mar-05 rbd     4.1.4 - Save back sun angles for 1st filter only.
' 09-Apr-05 rbd     4.1.5 - Fix logic that detects parameter changes, and save
'                   back SUNHI/SUNLO for parameter resets.
' 25-Aug-05 rbd     4.1.6 - Reset sun angles on filter changes.
' 30-Sep-05 rbd     4.1.7 - Remove dynamic parameter saving and adjustment.
'                   This became problematic and it doesn't save much.
' 22-Oct-05 rbd     4.1.8 - Oops! Missed variable changes for sun angles.
'                   Move these into user config area too.
' 12-Jan-06 rbd     4.2.1 - Disable CA and slew settle time for AutoFlats
' 12-Jan-06 jrm/rbd 4.2.1 - Rotator support, acceleration factors for ADU
'                   prediction. Thanks to Jim McMillan (again!). Fix Error
'                   recovery for no-filters case.
' 15-Jan-06 rbd     4.2.2 - Significant overhaul. Overlapped slew/jog And
'                   image downloading to increase efficiency and allow more
'                   flats to ba acquired. Binning and filters loops are now
'                   located in the main() function. This will allow easy 
'                   changing of the logic. Variation of image location Now
'                   uses a uniform random variate in azimuth instead of
'                   bumping declination (which moves away from ideal 
'                   altitude). Log the version of this script. 
' 17-Jan-06         4.2.3 - More overhaul. Now read a "flat plan" as 
'                   described in comments above. Remove much user config
'                   data (filters, flat counts, binnings, PA). Simplify
'                   rotation support logic, don't needlessly rotate for 
'                   each flat. Revise comments above. First exposure at
'                   new bin/filter uses 64 x 64 subframe for speed And
'                   discards these. Any flat taken which fails for too dark
'                   (dusk) or too light (dawn) is also deleted as it will
'                   be out of spec!
' 19-Jan-06 rbd     4.2.4 - Fix some incorrect variable names. Don't pre-
'                   rotate in WaitForTwilight() too much pain figuring out
'                   the correct rotator PA at that point.
' 20-Jan-06 rbd     4.2.5 - Allow being chained-to with new Util.ChainParameter
'                   containing the flat plan to run :-). Also add an obs plan
'                   parameter to #CHAINACQUIRE. This allows the flat plan To
'                   chain to AcquireImages and run a specified plan!
' 22-Jan-06 rbd     4.2.6 - Fix #DAWNSHUTDOWN. 
' 23-Jan-06 rbd     4.2.6 - Add code to support use from the Web, enhance
'                   #DAWNSCRIPT to handle relative files, exit if can't
'                   find script. Add 5% ADU acceleration standard. Avoid 
'                   duplicate flat file names if script run multiple times
'                   on same date at same dawn or dusk.
' 24-Jan-06 rbd     4.2.7 - New process flow uses ACP.SequenceToken to manage
'                   sequencing of AutoFlat and AcquireImages. Remove (well,
'                   comment out) the #ACQUIREIMAGES directive and its vars.
'                   The right way to use AutoFlat with AcquireImages is now
'                   via the #DUSKFLATS directive in obs plan.  Also, the
'                   #DAWNSHUTDOWN is not needed when used from AcquireImages,
'                   a shutdown flag is passed in the SequenceToken.
' 28-Jan-06 rbd     4.2.8 - Remove filter from call to Camera.Expose(), to
'                   avoid needless MaxIm filter switch delays. Move Filter
'                   selection logic into AcquireFlats() and do it once for 
'                   each filter/binning combo. Test for filter existence
'                   and skip flat sets with bad filter names, instead of 
'                   letting SelectFilter default to the config-ed Clear.
'                   ** EXTERNAL CONFIG FILE ** - Fix err resignaling to 
'                   report correct source and message.
' 05-Feb-06 rbd     4.2.9 - Correct version, fix slew-overlap problem when 
'                   last image of one filter is done. Need to wait for slew
'                   to stop before starting next filter set. Uncomment line
'                   that allows subsequent sets to be tried after current one
'                   thinks it's too late.
' 06-Feb-06 rbd     4.2.10 - Remove trailing tabs after removing trailing
'                   quote. 
' 07-Feb-06 rbd     4.2.11 - New SUP.GetNextLiveLine() uses RegExp to do
'                   all the right things, including the above.
' 01-Nov-06 rbd     5.0.1 - Add RSS log journaling
' 03-Nov-06 rbd     5.0.1 - Remove web usage of console to read flat plan.
'                   ASP receiver now uses runflatplanonce.txt relay file.
' 17-Nov-06 rbd     5.0.2 - Web user 'localweb' is really local_user, so 
'                   adjust the default plans, logs, and images folders 
'                   accordingly
' 04-Dec-06 rbd     5.0.4 - Oops, acquire images script is .js
' 08-Dec-06 rbd     5.0.5 - Fix RSS journalling, change to new PinPoint
'                   SimpleBackgroundMean (saves 5 sec!). Don't slew after 
'                   a test exposure, nor between filters, saves more time!
' 10-Dec-06 rbd     5.0.5 - Fix call to SUP.Shutdown, no longer requires any
'                   parameters.
' 28-Sep-07 rbd     5.1.1 - Allow spaces in filter names. Add ROT_PA to FITS.
'                   Don't wait for dusk if simulating.
' 20-Nov-07 rbd     Allow dawn flats to return to AcquireImages. New feature
'                   #duskflats and #dawnflats are targets. Disable "wrong
'                   time" errors when simulating, use SEQTOK dawn/dusk mode
'                   when simulating.
' 11-Jan-08 rbd     5.1.3 (HF4) - Fix fencepost error slewing between filters.
' 16-Mar-08 rbd     5.1.3 (HF4) - Handle request for 1 flat but rotated GEM.
'                   Would rotate, then rotate again while still rotating!
'                   Warn when odd number of flats requested with rotated GEM.
' 28-Mar-08 rbd     5.1.4 (HF5) - Reduce test wait to 15 sec per J. Hobart.
' 24-Oct-08 rbd     5.1.5 (HF7) - Remove redundant camera init code that's 
'                   been in AcquireSupport for a long time. Adjust for New
'                   filter control logic.
' 07-Nov-08 jrm     5.1.6 (HF7A) - Reduce rotation time lossage when doing 
'                   E/W flats for GEM by doing e-w-w-e-e-w-w... instead of
'                   e-w-e-w-e-w-e-w... Assure even number of flats when 
'                   doing split E/W flats by adding one in west if needed.
'                   Simplified logic.
' 16-Jan-09 rbd     5.1.7 (HF8) Add new DomeFlat mode, use #DOMEFLATS in plan.
' 22-Jan-09 rbd     5.1.7 - Add logic to catch object-like chain string from
'                   .NET (Scheduler)
' 05-Feb-09 rbd     5.1.8 (HF8a) Reword "dome flat ready?" message. Oops,
'                   Re-set cleared Util.ChainParameter before chaining back
'                   to AcquireImages.
' 08-Mar-09 rbd     5.1.9 (HF8b) - Fix wait for twilight logic.
' 28-Mar-09 rbd/jrm 5.1.10 (HF9RC) - Fix dawn GEM west/east logic. Add file
'                   and folder naming template support.
' 11-Jun-09 rbd     5.1.10 (HF9RC) - Catch closed dome/roof at dawn, prevent
'                   waiting forever while too dark.  Fix SunsetOfRun() to return
'					sunset at +/- 65 degrees if site is above the (ant)arctic
'					circle. Slew scope to 20 deg elevation after flats.
' 15-Jun-09 rbd     5.1.11 (HF9RC) - Oops, Now() date in old style flat file name,
'                   not the "nite" date.
' 18-Jun-09 rbd     5.1.11 - (HF9RC) More polar region handling.
' 06-Jul-09 rbd     5.1.12 - (HF9) **** it! Fix SunsetOfRun() AGAIN!!
' 20-Oct-09 rbd     5.1.14 - (HF10) GEM:232 File and folder templates with
'                   spaces failed. Fixed.
' 16-Feb-10 rbd     5.1.15 - Add config option to compress flat files,
'                   leave uncompressed files.
' 28-Sep-10 rbd     5.1.16 (6.0) - GEM:455 Don't do post-flat slew if dome 
'                   active and not safe to slew.
' 06-Oct-10 rbd     5.1.17 (6.0) - GEM:131 Configurable post-flat slew.
' 19-Nov-10 rbd     6.1.0 (6.0) - GEM:479 Add note to fatal error that the
'                   problem is likely with the flat plan. OOPS! Fix script
'                   chaining to use only the ACP\Scripts folder per 6.0.
' 20-Nov-10 rbd     6.1.0 (6.0) - GEM:200 Add some globals for use by 
'                   asystemstatus.asp
' 03-Jan-11 rbd     6.1.1 (6.0) - GEM:543 Define missing variable ERR_DOMECLOSED.
'                   Skip "dome closed" test for dawn flats when simulating.
' 15-Jan-11 rbd     6.1.2 (6.0) - GEM:560 DropBox-friendly handling of images
' 16-Jan-11 rbd     6.1.2 (6.0) - GEM:560 Add config item for log folder.
' 17-Jan-11 rbd     6.1.3 (6.0) - GEM:552 Cache Lock properties
' 20-Apr-11 rbd     6.1.4 (6.0HF1) - GEM:606 stray reference to ~plan-acquire.
' 10-May-11 rbd     6.1.4 (6.0HF1) - GEM:636 Sanitize filter name for file name
' 18-May-11 rbd     6.1.4 (6.0HF1) - GEM:615 Chain back non-fatally if ran too 
'                   late for requested flats.
' 20-Oct-11 rbd     6.1.5 (6.0HF3) - GEM:644 Expand folder deprecation message.
' 23-Oct-11 rbd     6.1.5 (6.0HF3) - Change to put waiting information in the log.
' 20-Mar-12 rbd     7.0.1 (7.0) - GEM:667 Flat Panel support. Remove support For
'                   old FolderName token in AutoFlatConfig.
' 28-Mar-12 rbd     7.0.1 (7.0) - GEM:667 For light source flats, add dome 
'                   close/open, as well as optional separate dome azimuth For
'                   light source position. Lots of bugs fixed.
' 20-Jun-12 rbd     7.0.1 (7.0) - GEM:674 Do not do dew avoid slew if in
'                   dome flat mode.
' 26-Aug-12 rbd     7.0.1 (7.0) - GEM:525 Readout mode for flats. GEM:872
'                   ROT_PA changes to mechanical, add PA for sky.
' 15-Sep-12 rbd     7.0.1 (7.0) - GEM:857 AutoFlatConfig can be in old or New
'                   place.
' 13-Dec-12 rbd     7.0.2 (7.0) - No GEM, establish Sky flats as default mode.
' 29-Jan-13 rbd     7.0.2 (7.0) - No GEM, catch case for no light control program
' 13-Feb-13 rbd     7.0.2 (7.0) - No GEM, missing DoFlatAz or DoFLatAlt means
'                   "do not move scope". Allow DoFlatAlt down to -90
' 14-Mar-13 rbd     7.0.3 (7.0) - No GEM, don't ignore possible live first
'                   line in AutoflatConfig.
' 03-May-13 rbd     7.1.1 (7.1) - Fix post-flat slew for domes and roofs.
' 01-Dec-13 rbd     7.1.1 (7.1) - GEM:975 Turn tracking off during test exps
'                   so that will stay at the 70 deg altitude.
' 04-Jan-13 rbd     7.1.1 (7.1) - GEM:1067 correct PA in flat FITS headers,
'                   put PA and ROT_PA into FITS for all mount types.
' 07-Dec-13 ewb     7.1.1 (7.1) - Added configurable test image size, toggle for
'  (mg 23-Jan-14)   disabling automatic flipping of rotator PA with GEM and
'                   console display of flat number in sequence. Also fixed bug
'                   with PA and ROT_PA FITS output values. Also log the flat
'                   number, and finally add a missing WaitForRotator().
'                   (merged with 7.1 on 23-Jan-14 by rbd).
' 17-Feb-14 rbd     7.1.2 (7.1d) - GEM:975 (cont.) Fix tracking control for 
'                   DomeFlatMode = True
' 21-Jun-14 rbd     7.2.1 (7.2) - GEM:1117 no defaultdawn or defaultdusk plans
'                   when in domeflat mode. 
' 23-Jun-14 rbd     7.2.1 (7.2) - GEM:1117 Other changes for screen/panel 
'                   flats and new #screenflat directive. 
' 11-Jul-14 rbd     7.2.1 (7.2) - GEM:1116 Call new SUP.InitializeUnsafeWeather()
'                   for panel/screen flats.
' 04-Aug-14 rbd     7.2.1 (7.2) - GEM:985 Ignore compressFlats in AutoFlatConfig
'                   and instead honor the setting for web users making this 
'                   behave the same as for other images. Never compress For
'                   the local user.
' 06-Aug-14 rbd     7.2.1 (7.2) - GEM:1171 Add $TEMP substitution token
'                   GEM:973 Avoid long startup when max exposure is very long
'                   for panel flats with narrowband. GEM:1124 Home dome before
'                   rotating to position screen. This was from Adam. 
' 28-Mar-15 rbd     8.0.1 (8.0) - GEM:1110 Use fixed acceleration factors For
'                   test exposures (fast downloading subframes).
' 24-May-15 rbd     8.0.3 (8.0) - GEM:340 $TEMP is monsterous number if cooler
'                   is off, substitude "NoTemp" for that.
' 25-Jun-15 rbd     8.0.3 (8.0) - GEM:1356 Honor Andor 100x100 pix subframe limit.
' 26-Oct-15 rbd     8.0.4 (8.0HF1) - GEM:1397 Allow spaces between per-filter 
'                   brightness values for screen flats.
' 08-Jul-16 rbd     8.1.0 (8.1) - GEM:1470 Do not re-open dome after flats If
'                   the weather is unsafe. Also, disable weather unsafe 
'                   interrupts once the dome is closed for screen flats. Allow
'                   screen flats in unsafe weather. Depends on new 8.1 feature
'                   that enables unsafe interrupts at the end of the script.
' 10-Aug-16 rbd     8.1.0 (8.0) - GEM:1446 Add optional per filter panel 
'                   brightness arrays for binning 2 and higher. ALso, save the
'                   last used exposure interval for a given filter and binning,
'                   then start out with that value the next time flats are acquired.
' 02-Apr-18 rbd     8.2.0 (8.2) GEM:1586 Trim config lines before parsing.
' 02-Nov-18 rbd     8.2.0 (8.2) GEM:1623 Switch to stopping scope between flats
'                   to achieve dithering. 
' 03-Nov-18 rbd     8.2.0 (8.2) GEM:1609 Eliminate previews to improve the 
'                   cadence even though they were made faster. Not interesting
'                   to web users. 
' 03-Nov-18 gcs     8.2.0 (8.2) GEM:1538 (merged by rbd) Add subframe feature
'                   Improve logging (rbd)
' 03-Nov-18 evd     8.2.0 (8.2) GEM:1421 (merged by rbd) Improve exposure time 
'                   calculation and convergence. Dome flats, start short not
'                   long! Move test subframe half way from center to edge.
'                   Fix the logic for GEM:1446, was using a non-existent 
'                   CFloat() function. "How did it ever work?"
' 10-Nov-18 rbd     8.2.1 (8.2) Thanks to 'evd' the $MERSIDE for a GEM and no 
'                   rotator now reports NoGEM as it should. 
' 11-Nov-18 rbd     8.2.2 (8.2) Initialize DomeFlat Intv guess to MinExposure * 2 
'                   as before, but eariler, prior to AcquireFlats(). Then 
'                   the saved exposure for dome flats for the filter/binning
'                   can replace this guess at the time the light brigutness
'                   for that filter is being set. 
' 10-Jan-19 rbd     8.2.3 (8.2) GEM:1480 Ignore dawn/dusk for rotator if 
'                   panel flats.
' 14-Jan-19 rbd     8.2.4 (8.2) GEM:1480 More instances where RA forced east
'                   for panel flats. 
'----------------------------------------------------------------------------
'
Option Explicit

Const SCRIPTVERSION = "8.2.4"                                   ' Script version for logging

Const FlatModeDawn = "Dawn"                                     ' Manifest constants for flat mode used throughout
Const FlatModeDusk = "Dusk"
Const FlatModePanel = "Panel"
Const FlatModeScreen = "Screen"

'
' ============
' CONFIG ITEMS (read from AutoFlatConfig.txt)
' ============
'
' NOTE: FlatMode is also used by ASP pages and other externals!
Dim FlatMode                                                    ' Flat mode (see FlatModeXxx constants above)
Dim TargetBackgroundADU                                         ' Target flatfield mean In ADU
Dim TargetADUTolerance                                          ' Tolerance on the above
Dim MinExposure                                                 ' Exposure interval range
Dim MaxExposure 
Dim IRAF_FITS                                                   ' True for IRAF compatible IMAGETYP
Dim FolderNameTmpl                                              ' Template for folder name
Dim FileNameTmpl	                                            ' Template for file name
Dim LightCtrlProgram                                            ' Path to panel/screen control program
Dim LightOnCommand                                              ' Command/args for turning panel/screen light on
Dim LightOnDelay	                                            ' Time for light to stabilize after first being turned on (sec)
Dim LightOffCommand                                             ' Command/args for turning panel/screen light off
Dim LightBrightnessValues                                       ' Per filter array of EL panel brightness values
Dim LightBrightnessValuesBin2                                   '   Optional falues for bin-2
Dim LightBrightnessValuesBin3                                   '   Optional falues for bin-3
Dim LightBrightnessValuesBin4                                   '   Optional falues for bin-4
Dim LogFolder	                                                ' Log folder, "" means normal logs area
Dim CompressFlats                                               ' True to compress flats, leave uncompressed
Dim DoFlatAlt                                                   ' Altitude for dome/panel flats
Dim DoFlatAz	                                                ' Azimuth for dome/panel flats
Dim PostFlatAlt                                                 ' Post-Flat altitude
Dim PostFlatAz	                                                ' Post-Flat altitude 
Dim StarDriftSeconds                                            ' Tracking off for this long between flats
Dim DomeAz                                                      ' Dome azimuth or -1 of disabled
Dim TestImageSize                                               ' Size of test image in pixels
Dim NoAutoFlipRotatorPA                                         ' True to disable auto rotator flip with GEM

'
' Start/End sun angles. These are set purposely too wide,
' adjust after you get some experience.
'
Dim TwilightSunLo                                               ' Low elevation of Sun for flats (morning)
Dim TwilightSunHi                                               ' Hi elevation of Sun for flats (evening)
'
' Factors to improve exposure scaling process. The scaling process 
' assumes no additional time for downloads. For cameras with relatively 
' long download times (~20+ seconds), that assumption may not be accurate 
' enough to keep the ADU levels within TargetADUTolerance. The scaling 
' factor will be less than 1.0 in the morning and greater than 1.0 in 
' the evening. The original values are 0.95 and 1.05 respectively.
'
Dim ADUAcceleration_AM                                          ' Factors to improve exposure scaling accuracy
Dim ADUAcceleration_PM 

' === END OF CONFIG ITEMS ===

'
' Constants not for user modification
'
Const FlatSpotAltitude = 75                                     ' Altitude of flat spot (anti-solar azimuth)
Const AzDither = 1.0                                            ' Peak dithering distance, degrees

Const DEGRAD = 0.0174532925                                     ' PI/180
Const SLEWLABEL = "flat area"                                   ' Name of "target" for logging
Const ForReading = 1, ForWriting = 2
Const SaturationADU = 65000                                     ' (simulator only) Saturation ADU
Const PreSlewTime = #00:04:00#                                  ' Time allotted for pre-slew
Const ADUAcceleration_AM_Test = 0.95                            ' Reasonable for fast download of test thumbnails
Const ADUAcceleration_PM_Test = 1.05
Const ERR_TOOLATE = &H80040010                                  ' (vbObjectError + &H10) Special "too late" error code
Const ERR_BADLIGHTSOURCE = &H80040011
Const ERR_DOMECLOSED = &H80040012
Const ERR_DOMEFAILED = &H80040413
Const THUMB_FILE = "pvimage.png"                                ' Running plan thumbnail image for web
Const LSTPNG_FILE = "lastimage.png"                             ' Post-plan "last image" PNG for web
Const LSTDIM_FILE = "lastimage.txt"                             ' Companion file with image dimensions

'
' Script state variables
'
Dim SUP                                                         ' Required to be global in script
Dim FSO                                                         ' FileSystemObject, used in several places
Dim SEQTOK                                                      ' SequenceToken object for Flat/Acquire interaction
Dim KT                                                          ' Re-usable Kepler Earth ephemeris (for SunEphem)
Dim FlatFolder
Dim StartTime                                                   ' Start time for fading light simulation
Dim Dawn
Dim DateStr                                                     ' Sortable local date string yyyymmdd
Dim ADUAcceleration                                             ' Factor to improve exposure scaling
Dim ADUAcceleration_Test	                                    ' Used while testing with fast download subframes
Dim plnFile                                                     ' Plan file pathname
Dim plStream                                                    ' Plan file text stream
Dim FlatSpecs(100)                                              ' Array to hold up to 100 flat specs
Dim nFlatSpecs                                                  ' Count of live specs in FlatSpecs
Dim RotatorOrientationStatus                                    ' 0 = unknown, 1 = east, 2 = west
Dim PreviousPA                                                  ' Required to see if PA changed
Dim DateNight	                                                ' For $DATENITE - "night" date
Dim imgRootPath                                                 ' Where to put images for web UI
Dim TrackOffRemaining                                           ' Counts down seconds of track-off dither

'
' Cached Lock properties
'
Dim LockUser
Dim LockOwner

'
' Note: If DawnScript is non-blank it will override 
' DawnShutdown if that is True!
'
Dim DawnShutdown                                                ' True to shutdown obs. after dawn flats
Dim DawnScript                                                  ' If non-blank, do this afer dawn flats
'
' Dome flat mode assumes the scope and flatscreen/box is ready
'
Dim DomeFlatMode                                                ' Using an EL Panel, Screen. etc.
'
' Globals for use by ASP pages (asystemstatus)
' Note that FlatMode above is also one of these
' externally used variables.
'
Dim PlanName                                                    ' Base name of flat plan
Dim FlatState	                                                ' "Wait Sky" or "Acquire Flats"
Dim CurFilter                                                   ' Filter being used or "None"
Dim CurFiltNum                                                  ' # of filter/flatset
Dim MaxFiltNum	                                                ' Number of flat sets/filters
Dim CurFlatNum	                                                ' # of flat being acquired
Dim MaxFlatNum	                                                ' Count of flats in this set                                                

'
' --------------
' ACP Main entry
' --------------
'
Sub Main()
    Dim I, RX, CT, buf, Intv, PA, SF, logFile, j, z
    Dim bParamChange, bWasCA, iPrevSettle
    Dim runOnceFile, button, fns, bits
    Dim defPlanDir, defScriptDir, orig
    Dim wrongCall, ErrCode, ErrSource, ErrMsg
    Dim domeWasOpen, okToOpen
    
    FlatState = "Starting"
    PlanName = ""
    CurFilter = ""
    domeWasOpen = False
    FlatMode = "Sky"                                            ' This is default/old behavior
    
    LockUser = Lock.Username
    LockOwner = Lock.Owner
    
    Set FSO = CreateObject("Scripting.FileSystemObject")        ' Re-usable FileSystemObject
    If Not LoadUserPrefs() Then Exit Sub                        ' Quit if prefs not set up!
    Set KT = CreateObject("Kepler.Ephemeris")                   ' Re-usable Earth ephem (reverse = Sun!)
    KT.BodyType = 0                                             ' Planet
    KT.Number = 3                                               ' EARTH

    '
    ' We need some folders in several places, and
    ' make compression decision as we do for light
    ' and calibration frames. 
    '
    If LockUser = "local_user" Or LockUser = "localweb" Then    ' Local user (incl'g local browser)
        defPlanDir = Prefs.LocalUser.DefaultPlanDir
        CompressFlats = False                                   ' Never compress flats for locals
    Else                                                        ' Web user
        defPlanDir = Prefs.WebRoot & "\plans\" &  LockUser
        CompressFlats = Lock.WebUser.WantsCompress              ' Web users have an account setting
    End If
    defScriptDir = ACPApp.Path & "\Scripts"
    imgRootPath = Prefs.WebRoot + "\images\"                    ' NOTE TRAILING \
    
    '
    ' Get rid of any old web preview images
    '
    SafeDeleteFile imgRootPath + THUMB_FILE
    SafeDeleteFile imgRootPath + LSTPNG_FILE
    SafeDeleteFile imgRootPath + LSTDIM_FILE
    '
    ' Set up flat mode (a string really)
    '
    Dawn = IsDawn()
    If FlatMode = "Sky" Then                                    ' Sky in config changes to Dawn or Dusk
        If Dawn Then
            FlatMode = FlatModeDawn
        Else
            FlatMode = FlatModeDusk
        End If
        DomeFlatMode = False
    Else
        DomeFlatMode = True                                     ' Panel or Screen modes
    End If
    If DomeFlatMode And Not Telescope.CanSetTracking Then       ' Check this oopsie now
        Console.PrintLine "** Telescope tracking cannot be controlled. Cannot do screen/panel flats."
        Exit Sub
    End If
    
    '
    ' Establish chaining defaults
    '
    Set SEQTOK = Nothing
    DawnScript = ""
    DawnShutdown = False
    '
    ' Calculate "night" folder date
    '
    DateNight = SunsetOfRun()
    '
    ' We might have been chained-to with a SequenceToken object,
    ' or a string. In the latter case, assume it is an observing
    ' plan path/name. Accept only these two vartypes. If anything
    ' else, ignore it and show the file-open dialog. NOTE: When 
    ' .NET (Scheduler) assigns a string to ChainParameter, it 
    ' appears here as some crazy type of object. I discovered that
    ' it has a Length property and you can get the characters via
    ' "indexing" (though it is NOT an Array, probably via a default
    ' property that is NOT Item, and it is not a Collection). 
    ' Anyway, I found that I could collect the characters into a 
    ' string with the sleaze below. 
    '
    If VarType(Util.ChainParameter) = 9 Then                    ' Object, assume it's a SequenceToken
        Set SEQTOK = Util.ChainParameter                        ' Grab it for our uses (offload ACP.Util)
        On Error Resume Next                                    ' I really hate this error handling!
        buf = SEQTOK.ObservingPlan
        If Err.Number <> 0 Then                                 ' Not a Sequence Token, crazy string from .NET?
            On Error GoTo 0
            plnFile = ""                                        ' Assume if a crazyString, it's the flat plan file
            For j = 0 To SEQTOK.Length - 1                      ' This is a simple toString() in JScript
                plnFile = plnFile + Chr(SEQTOK(j))
            Next
            Set SEQTOK = Nothing
        Else
            On Error GoTo 0
            '
            ' If chained-to at the wrong time, leave a message on the console and bail out.
            ' In both cases we chain back to AcquireImages and just go on with observing
            '
            If Not Util.Prefs.PointingUpdates.Simulate Then     ' Don't do these checks if simulating
                If Not DomeFlatMode Then                        ' And skip for dome flats 
                    If Dawn And SEQTOK.DoDuskFlats Then 
                        Console.PrintLine "*Too late to do dusk flats, skipping"
                        Set FSO = Nothing
                        Set KT = Nothing
                        SEQTOK.AutoFlatResult = "Skipped (too dark)" ' Tell AcqImg we skipped the flat run
                        Util.ChainParameter = SEQTOK            ' Pass token back to AcquireImages
                        Util.ChainScript defScriptDir & "\AcquireImages.js"
                        Exit Sub                                ' *** BAIL OUT ***
                    Elseif Not Dawn And Not SEQTOK.DoDuskFlats Then
                        Console.PrintLine "*Too late to do dawn flats, skipping"
                        Set FSO = Nothing
                        Set KT = Nothing
                        SEQTOK.AutoFlatResult = "Skipped (too light)" ' Tell AcqImg we skipped the flat run
                        Util.ChainParameter = SEQTOK            ' Pass token back to AcquireImages
                        Util.ChainScript defScriptDir & "\AcquireImages.js"
                        Exit Sub                                ' *** BAIL OUT ***
                    End If
                End If
            Else
                Dawn = Not SEQTOK.DoDuskFlats                   ' Simulating, use token's mode to override real dawn
            End If
            '
            ' Chained-to at proper time, get the appropriate plan
            ' and shutdown flag if dawn.
            '
            If Dawn Or DomeFlatMode Then                        ' If doing dawn or screen flats
                plnFile = SEQTOK.DawnFlatPlan                   ' Get the dawn/screen plan (or "")
                DawnShutdown = SEQTOK.DoDawnShutdown            ' Pick up caller's shutdown command
            Else
                plnFile = SEQTOK.DuskFlatPlan                   ' Get the dusk plan (or "")
            End If
        End If
    Elseif VarType(Util.ChainParameter) = 8 Then                ' String, assume flat plan path!
        plnFile = Util.ChainParameter                           ' Just use the passed flat plan (may be "")
    Else
        runOnceFile = defPlanDir &  "\runflatplanonce.txt"      ' "run once" file (has actual plan path)
        If FSO.FileExists(runOnceFile) Then                     ' If "run once" file exists
            Set fns = FSO.OpenTextFile(runOnceFile)             ' Open it, And
            plnFile = fns.ReadLine()                            ' Read the path of the plan to run
            fns.Close                                           ' Close it
            FSO.DeleteFile runOnceFile                          ' Delete it
        ElseIf Not DomeFlatMode Then                            ' If no "run once", and if sky flats then
            If Dawn Then
                buf = "dawn"
            Else
                buf = "dusk"
            End If
            plnFile = defPlanDir & "\default" & buf & "flat.txt" ' Try for "default[dawn|dusk]flat.txt"
            If Not FSO.FileExists(plnFile) Then                 ' Nope, try for generic defaultflat.txt
                plnFile = defPlanDir & "\defaultflat.txt"
            End If
        Else
            plnFile = defPlanDir & "\defaultflat.txt"           ' Panel/screen, no dawn/dusk
        End If
        If Not FSO.FileExists(plnFile) Then                     ' If the run once or default plan isn't there...
            If LockUser = "local_user" Then                     ' If this is a local GUI (not browser) user
                FileDialog.DefaultExt = ".txt"                  ' Use a file browse box
                FileDialog.DialogTitle = "Select a flat plan file"
                FileDialog.Filter = "Text files (*.txt)|*.txt|All files (*.*)|*.*"
                FileDialog.FilterIndex = 1
                FileDialog.Flags = 4096 + 4                     ' Must exist and hide read only
                FileDialog.InitialDirectory = defPlanDir        ' Local user's default plans folder
                If Not FileDialog.ShowOpen Then                 ' Show the box
                    Exit Sub                                    ' (cancelled)
                End If
                plnFile = FileDialog.FileName                   ' Flat plan pathname
            Else                                                ' Browser user, must use default plan
                Console.PrintLine "**Cannot find a usable flat plan."
                Exit Sub
            End If
        End If
    End If
    Util.ChainParameter = Null
    
    PlanName = FSO.GetBaseName(plnFile)                         ' For ASP/system status
    
    '
    ' Create AcquireSupport here, for SUP.GetNextliveline()
    ' It is not initialized till below, after we validate.
    '
    Set SUP = CreateObject("ACP.AcquireSupport")                ' Create AcquireSupport
    '
    ' Open the flat plan, read into an array of strings. This array
    ' is used at dawn to execute the flat plan in reverse. Interpret
    ' directives and set appropriate globals from them.
    '
    Set plStream = FSO.OpenTextFile(plnFile, ForReading)        ' Open the plan now, catch errors here
    nFlatSpecs = 0                                              ' Spec counter (array index + 1)
    Set RX = New RegExp                                         ' Used to remove blanks
    RX.Pattern = "\s*,\s*"                                      ' Look for whitespace around commas
    RX.Global = True                                            ' Everywhere in the string
    Do While True
        buf = SUP.GetNextLiveLine(plStream, False)
        If buf = "" Then Exit Do                                ' No more flats in plan
        '
        ' Implement directives
        '
        If UCase(Left(buf, 13)) = "#DAWNSHUTDOWN" Or UCase(Left(buf, 9)) = "#SHUTDOWN"Then
            DawnShutdown = True
        ElseIf UCase(Left(buf, 11)) = "#DAWNSCRIPT" Or UCase(Left(buf, 11)) = "#SHUTSCRIPT" Then
            DawnScript = Trim(Mid(buf, 12))                     ' Get the script parameter
            If DawnScript = "" Then
                Console.PrintLine "** Must include a script to run!"
                Console.PrintLine "   Fix it and try again"
                Exit Sub                                        ' Bail out now
            End If
            If Not FSO.FileExists(DawnScript) Then              ' May be just script file name
                orig = DawnScript                               ' For error message
                DawnScript = defScriptDir & "\" & DawnScript    ' Try in Scripts folder
                If Not FSO.FileExists(DawnScript) Then          ' Bad news
                    plStream.Close
                    Console.PrintLine "** Specified non-existent script!"
                    Console.PrintLine "   " & orig
                    Console.PrintLine "   Fix it and try again"
                    Exit Sub
                End If
            End If
        ElseIf Left(buf, 1) = "#" Then                          ' Some unrecognized directive
            Console.PrintLine "** " & buf & " not recognized!"
            Console.PrintLine "   Fix it and try again"
            Exit Sub
        Else
            buf = Trim(RX.Replace(buf, ","))                    ' Remove all whitespace around commas and leading/trailing
            FlatSpecs(nFlatSpecs) = buf                         ' Add flat set to our array
            nFlatSpecs = nFlatSpecs + 1                         ' Bump set count
        End If
    Loop
    plStream.Close
    
    '
    ' Set up our environment
    '
    If DomeFlatMode Then
        SUP.InitializeUnsafeWeather                             ' Allow unsafe weather for panel/screen flats
    Else
        SUP.Initialize                                          ' Initialized after validation
    End If
    
    SUP.JournalForRSS "Flat Fields Started", LockOwner & " has started the " & FlatMode & _
             " flat field process."

    StartTime = Now()                                           ' Start time (also for simulation)
    DateStr = Util.FormatVar(StartTime, "yyyymmdd")             ' Use start time for sortable Date
    FlatFolder = MakeFlatFolder(FolderNameTmpl)
    
    '
    ' Log file starts here, since we need to know dawn/dusk
    ' If re-run at same date/dusk or date/dawn, add dash number
    ' like we do below for flat files themselves.
    '
    If LogFolder = "" Then                                      ' If didn't specify an autoflat log folder
        If LockUser = "local_user" Or LockUser = "localweb" Then 
            LogFolder = Prefs.LocalUser.DefaultLogDir & "\AutoFlat"
            SUP.CreateFolder LogFolder, False                   ' No ASP
        Else
            LogFolder = Prefs.WebRoot & "\logs\" &  LockUser & "\AutoFlat"
            SUP.CreateFolder LogFolder, True                    ' ASP files for web access
        End If
    Else
        SUP.CreateFolder LogFolder, False                       ' No ASP
    End If
    logFile = LogFolder & "\AutoFlat-" & DateStr
    If Not DomeFlatMode Then                                    ' If dome flats, don't sugar the log file name
        If Dawn Then
            logFile = logFile & "-Dawn"
        Else
            logFile = logFile & "-Dusk"
        End If
    End If
    If FSO.FileExists(logFile & ".log") Then                    ' If this log file already exists
        I = 1                                                   ' First dupe is -2
        do While True
            I = I + 1                                           ' > 1 used below to test if dupe used
            If Not FSO.FileExists(logFile & "-" & I & ".log") Then Exit do   ' Not yet used!
        Loop
    End If
    If I > 1 Then logFile = logFile & "-" & I                   ' Duped, add a sequence number
    Console.LogFile = logFile & ".log"                          ' This is -the- log file
    Console.Logging = True                                      ' Start logging

    '
    ' NOTE - THESE ARE SET IN THE LOOP BELOW ALSO
    '
    If DomeFlatMode Then                                        ' For dome flats, don't sugar the name
        DateStr = ""
        Intv = MinExposure * 2                                  ' Dome flats, start short (Eric Dose and Dean Salman)
        ADUAcceleration = 1.0                                   ' No acceleration
        ADUAcceleration_Test = 1.0
    ElseIf Dawn Then
        DateStr = DateStr & "-Dawn-"                            ' Add dawn/dusk for file name uniqueness
        Intv = MaxExposure                                      ' Start with maximum exposure
        ADUAcceleration = ADUAcceleration_AM                    ' And set the correct acceleration factors
        ADUAcceleration_Test = ADUAcceleration_AM_Test
    Else
        DateStr = DateStr & "-Dusk-"                            ' Add dawn/dusk for file name uniqueness
        Intv = MinExposure                                      ' Start wth minimum exposure
        ADUAcceleration = ADUAcceleration_PM                    ' And set the correct acceleration factors
        ADUAcceleration_Test = ADUAcceleration_PM_Test
    End If
    
    Console.PrintLine "This is AutoFlat version " & SCRIPTVERSION
    Console.PrintLine "Using flat plan " & FSO.GetFileName(plnFile) ' Log the plan file used
    If Util.Prefs.DisableSlewOverlap Then Console.PrintLine "**Overlapped slew/download disabled, cadence will be slower"
    
'   ----------------------
    If Not DomeFlatMode And Not Util.Prefs.PointingUpdates.Simulate Then
        FlatState = "Wait for " & FlatMode
        Call WaitForTwilight()                                  ' Wait for twilight (returns with tracking on)
    End If
'   ----------------------
    
    Console.PrintLine "Starting flat field acquisition."
    Voice.Speak "Starting flat field acquisition."

    If DomeFlatMode Then
        '
        ' DO THIS FIRST! LOW HANGING ROOF POSSIBILITY
        '
        If Dome.Available Then
            If Dome.CanSlew Then        
                Console.PrintLine "Disabling dome slaving"
                Dome.Slaved = False                             ' Unslave the dome 
            End If
        End If
        If DoFlatAz >= 0 And DoFlatAlt >= -90 Then
            Console.PrintLine "Aiming scope at light source or screen"
            Util.UnsafeSlewToAltAz DoFlatAz, DoFlatAlt          ' Position the scope (Synchronous)
        Else
            Console.PrintLine "Scope remains at current position"
        End If
        Telescope.Tracking = False                              ' Make sure tracking is off
        '
        ' Now manage the dome/roof
        '
        If Dome.Available Then
            If Dome.CanSetShutter And Dome.ShutterStatus <> 1 Then  ' If not already closed
                domeWasOpen = True                              ' If need to reopen when done
                Console.PrintLine "Closing dome/roof for light-source flats"
                Dome.CloseShutter                               ' Start the dome closing
                z = 0
                While Dome.ShutterStatus <> 1                       ' shutterClosed
                    If Dome.ShutterStatus = 4 Then
                        Err.Raise ERR_DOMEFAILED, Dome.Name, "Shutter error while closing. Cannot continue"
                    End If
                    If z > 300 Then                                 ' 5 minutes, plenty long
                        Err.Raise ERR_DOMEFAILED, Dome.Name, "Shutter failed to close after 5 minutes. Cannot continue"
                    End If
                    Util.WaitForMilliseconds 1000
                    z = z + 1
                Wend
                '
                ' Successfully closed. We can now allow the flat process to continue
                ' even if there is a weather unsafe interrupt.
                '
                If Weather.Available Then
'                   ===============================
                    Console.PrintLine "Disabling weather unsafe interrupts (dome is already closed)"
                    Weather.DisableUnsafeInterrupts 1440            ' Essentially "infinite"
'                   ===============================
                End If
            End If
            '
            ' Now that the dome is closed (it may have had do rotate to
            ' close (DDW), we'll do the rotate to needed dome az, if 
            ' requested. If the dome can be homes and isn't already at
            ' home, then home it to be sure of the rotation accuracy.
            ' This was requested by Adam, it's a %^&*( software victory
            ' over hardware).
            '
            If Dome.CanSlew And DomeAz <> -1 Then
                If Dome.CanFindHome Then                            ' No short circuit booleans
                    If Not Dome.AtHome Then                         ' May already be there from closing (e.g. DDW)
                        Console.PrintLine "Homing dome to assure azimuth accuracy"
                        Dome.FindHome
                        While Dome.Homing
                            Util.WaitForMilliseconds 1000
                        Wend
                        Util.WaitForMilliseconds 1000
                    End If
                End If
                Console.PrintLine "Rotating dome to azimuth " & DomeAz
                Dome.Slew DomeAz
                While Dome.Slewing
                    Util.WaitForMilliseconds 1000
                Wend
            End If
        End If
        '
        ' OK! The scope and dome are positioned for the light source!
        '
        If LightCtrlProgram <> "" Then
            Console.PrintLine "Turning flat light source on full brightness"
            DoLightCommand LightOnCommand, 255
            If Util.Prefs.PointingUpdates.Simulate Then
                Console.PrintLine "Simulating, skip " & LightOnDelay & " sec. light stabilization time"
            Else
                Console.PrintLine "Waiting " & LightOnDelay & " sec. for light to stabilize"
                Util.WaitForMilliseconds LightOnDelay * 1000
            End If
        Else
            Console.PrintLine "No light control program configured, continuing."
        End If
    ElseIf Not Telescope.CanSetTracking Then                    ' If no tracking control (???) then must use slewing
        Console.PrintLine "**Scope has no tracking control. Must slew to dither"
        bWasCA = Util.ConsistentApproachEnabled                 ' Remember current CA state
        If bWasCA Then
            Console.PrintLine "  Disabling consistent approach slewing"
            Util.ConsistentApproachEnabled = False              ' Turn off CA
        End If
        iPrevSettle = Telescope.SlewSettleTime                  ' Remember current slew settle Time
        If iPrevSettle > 0 Then
            Console.PrintLine "  Reducing slew settle time to 0 sec."
            Telescope.SlewSettleTime = 0
        End If
    End If

    If SUP.HaveReadoutModes Then 
        Camera.ReadoutMode = SUP.AutoflatReadoutMode
        Console.PrintLine "Flats will be acquired with " & _
            SUP.ReadoutModeName(SUP.AutoflatReadoutMode) & _
            " readout mode"
    End If

    ' =========
    ' MAIN LOOP
    ' =========
    '
    ' Note: Intv gets adjusted and passed back here by reference from
    ' AcquireSingleFlat(). Thus each subsequent flat group starts out 
    ' with the exposure value that ended up being right for the 
    ' previous group. If the current flat group fails because it's too
    ' late (too dark/light) stay in the loop and try the next flat
    ' group.
    '
    ' Intv has been initialized.
    '
    ' 
    MaxFiltNum = nFlatSpecs
    CurFiltNum = 1
    If Dawn And Not DomeFlatMode Then
        I = nFlatSpecs - 1                                      ' Dawn sky flats go backwards
    Else
        I = 0
    End If
    PreviousPA = -1                                             ' Force RotationOrientationStatus = 0 below
    Do While True
        bits = Split(FlatSpecs(I), ",")                         ' Get next flat spec, split fields
        PA = 0.0                                                ' Default to PA = 0
        SF = 1.0                                                ' Default to SubFrame 1.0
        If UBound(bits) >= 4 Then SF = CDbl(bits(4))
        If UBound(bits) >= 3 Then                               ' Allow ,,SF if no PA but SF
            If Trim(bits(3)) <> "" Then PA = CDbl(bits(3))      ' Use given PA
        End If
        
        If PA <> PreviousPA Then RotatorOrientationStatus = 0	' If PA changed, need to reinitialize rotator orientation
        PreviousPA = PA
        
        CurFilter = bits(1)                                     ' For ASP/asystemstatus
        'On Error Resume Next                                    ' Allow errors to print then continue
        Call AcquireFlats(bits(0), Intv, bits(1), bits(2), PA, SF)  ' May raise error (too dark/light)
        '
        ' Check errors. If too dark/too light, try the next flat set
        ' otherwise resignal the error, it's fatal to the script.
        '
        If Err.Number <> 0 Then                                 ' Some error...
            ErrCode = Err.Number                                ' Save the error info
            ErrMsg = Err.Description
            ErrSource = Err.Source
            Console.PrintLine ErrMsg                            ' Log it regardless
            If ErrCode <> ERR_TOOLATE Then                      ' Unless it's a "too late" Error
                ' Any exit of script will re-enable unsafe interrupts in ACP
'               ======================================================== ' (OK to do regardless of flat mode)
                If Weather.Available Then Weather.EnableUnsafeInterrupts ' Re-arm weather unsafe trapping
'               ========================================================
                On Error GoTo 0                                 ' Re-arm error trapping
                Err.Raise ErrCode, ErrSource, ErrMsg & vbCrLf & _
                        "Probably an error in the flat plan"    ' Resignal with the error, it's fatal
            Else                                                ' Too late for that filter, try next!
                On Error GoTo 0
                '
                ' NOTE THESE ARE SET ABOVE FOR THE INITIAL PASS TOO
                '
                If DomeFlatMode Then
                    Intv = MinExposure * 2                      ' Dome flats, start short (Eric Dose and Dean Salman)
                ElseIf Dawn Then
                    Intv = MaxExposure                          ' Start with maximum exposure
                Else
                    Intv = MinExposure                          ' Start wth minimum exposure
                End If
            End If
        End If
        On Error Goto 0                                         ' Error trapping back On
        If DomeFlatMode Or Not Dawn Then 
            I = I + 1
            If I >= nFlatSpecs Then Exit do
        Else
            I = I - 1
            If I < 0 Then Exit do
        End If
        CurFiltNum = CurFiltNum + 1                             ' Advancing to next filter/flatset
    Loop
    
    FlatState = "Finishing"
    
    '
    ' End of main loop
    ' Do post-flat tasks...
    '
    If Not DomeFlatMode Then
        If Not Telescope.CanSetTracking Then
            If bWasCA Then
                Console.PrintLine "Restore consistent approach slewing"
                Util.ConsistentApproachEnabled = True           ' Turn CA back On
            End If
            If iPrevSettle > 0 Then
                Console.PrintLine "Restore slew settle time to " & iPrevSettle & " sec."
                Telescope.SlewSettleTime = iPrevSettle          ' Restore previous slew settle Time
            End If
        End If
        Console.PrintLine " Sun is now at " & Util.FormatVar(SunElevation(), "0.0") &  " deg. elevation"
   Else 
        DoLightCommand LightOffCommand, 0
        If Weather.Available Then                               ' (no short-circuit bools...)
            okToOpen = Weather.Safe
        Else
            okToOpen = True
        End If
        If Dome.Available Then
            If domeWasOpen Then
                If okToOpen Then
                    Console.PrintLine "Reopening dome/roof"
                    Dome.OpenShutter
                    z = 0
                    While Dome.ShutterStatus <> 0               ' shutterOpen
                        If Dome.ShutterStatus = 4 Then
                            Err.Raise ERR_DOMEFAILED, Dome.Name, "Shutter error while opening. Cannot continue"
                        End If
                        If z > 300 Then                         ' 5 minutes, plenty long
                            Err.Raise ERR_DOMEFAILED, Dome.Name, "Shutter failed to open after 5 minutes. Cannot continue"
                        End If
                        Util.WaitForMilliseconds 1000
                        z = z + 1
                    Wend
                    If Dome.CanSlew Then
                        Console.PrintLine "Re-slaving the dome"
                        Dome.Slaved = True
                    End If
                Else
                    Console.PrintLine "Can't reopen the dome, the weather is no longer safe"
                End If
            End If
        End If
    End If
    '
    ' If did screen flats, the weather unsafe interrupts have been disabled. If the weather is safe
    ' the dome is already open (above) so now we'll release the lock and let unsafe interrupt again
    '
    If Weather.Available Then 
'       ==============================                          ' (OK to do regardless of flat mode)
        Weather.EnableUnsafeInterrupts                          ' Re-arm weather unsafe trapping
'       ==============================
        If DomeFlatMode Then Console.PrintLine "Re-enabling weather unsafe interrupts now"
    End If
    If Dawn And DawnScript <> "" Then                           ' If dawn and dawnscript script requested
        If Not SEQTOK Is Nothing Then                           ' If we have a sequence token
            SEQTOK.AutoFlatResult = "Completed OK"              ' Tell next script we ran OK
        End If
        Console.PrintLine "Dawn flats done. Chaining to " & FSO.GetFileName(DawnScript)
        Util.ChainScript DawnScript                             ' Run it
    Elseif Dawn And DawnShutdown Then                           ' If dawn and shutdown requested
        SUP.Shutdown                                            ' Shut down everything
    Else                                                        ' Otherwise, for dawn and dusk
        '
        ' At this point, if we have a SequenceToken in SEQTOK, Then
        ' we need to chain (back) to AcquireImages.
        '
        If Not SEQTOK Is Nothing Then
            SEQTOK.AutoFlatResult = "Completed OK"              ' Tell AcqImg we did a flat run
            If DomeFlatMode Then
                Console.PrintLine "Screen/panel flats done. Resuming observing run."
            Else
                If Dawn Then
                    Console.PrintLine "Dawn flats done. Resuming observing run."    ' (it turns tracking on anyway)
                Else
                    Console.PrintLine "Dusk flats done. Resuming observing run."    ' (it turns tracking on anyway)
                End If
            End If
            Util.ChainParameter = SEQTOK                        ' Pass token back to AcquireImages
            Util.ChainScript defScriptDir & "\AcquireImages.js"
        Else
            '
            ' Not chaining. If PostFlatAlt real and not doing Dome Flats, 
            ' slew to avoid dew/dust during wait. If dome/roof, do it only
            ' if the dome/roof is open. If PostFlatAz is given use it 
            ' else take scope's current Az.
            '
            If PostFlatAlt <> -1 And Not DomeFlatMode And _
                    (Not Dome.Available Or _
                    (Dome.Available And Dome.ShutterStatus = 0)) Then    ' 0 = shutterOpen
                Console.PrintLine "Moving telescope for dew avoidance..."
                Set CT = Util.NewCTHereAndNow()
                CT.RightAscension = Telescope.RightAscension
                CT.Declination = Telescope.Declination
                z = PostFlatAlt
                If Prefs.MinimumElevation > z Then z = Prefs.MinimumElevation + 1
                CT.Elevation = z 
                If PostFlatAz <> -1 Then CT.Azimuth = PostFlatAz
                SUP.StartSlewJ2000 "Post flat wait", CT.RightAscension, CT.Declination
                SUP.WaitForSlew
            End If
            '
            ' In any case, shut off tracking if needed
            '
            If Telescope.CanSetTracking Then
                If Telescope.Tracking Then                      ' Avoid needless change
                    Console.PrintLine "  Stop tracking"
                    Telescope.Tracking = False
                End If
            End If
        End If
    End If


    Console.PrintLine "Flat acquisition complete."
    SUP.JournalForRSS "Flat Fields Ended", LockOwner & "'s flat field process has completed."
    
    Set FSO = Nothing
    Set KT = Nothing
    SUP.Terminate
    Console.Logging = False

End Sub

' --------------
' AcquireFlats() 
' --------------
'
' Acquire Count flats for the given filter and binning. If Rotator
' support is enabled, and if the mount is a GEM, then divide the flats
' evenly into east and west, rotating 180 deg as appropriate.
'
' Inputs:   Count       Number of flats for this combo
'           Intv        Starting exposure interval, sec
'           Filt        Filter Name
'           Bin         Binning level (must be legal for imager!)
'           PA          Rotator equatorial PA (for GEM, PA when scope looks east)
'           SF          Subframe size (fractional)
'
' Outputs:  Intv        Final exposure interval that met ADU
'
Sub AcquireFlats(Count, Intv, Filt, Bin, PA, SF)
    Dim Buf, RA, Dec, FlatName, FlatFile, MerSide, I, N
    Dim PAEast, PAWest, CountEast, CountWest, LastIntv
    Dim PostSlew, LightBrightUse, FilterBrightness
    

    '
    ' Check if filter exists. If not, don't let SelectFilter substitute
    ' the ACP-configured "clear" filter, as this could lead to major flat
    ' lossage - it would  wait till conditions are right for Clear, at which
    ' time it would be too late to do subsequent filter sets. Detect at least
    ' -some- of the possible screwups and log message, skip flat set.
    '
    If Filt = "" Then
        If SUP.HaveFilters Then                                 ' Have filters, but no filter!
            Console.PrintLine "**Empty filter field. Skipping this flat set."
            Exit Sub
        Else                                                    ' No filters, no filter, OK
            Buf = "Doing " & Count & " unfiltered flats at binning " & Bin
            If Sup.HaveRotator Then Buf = Buf & " PA " & CInt(PA)
            If SF < 1.0 Then Buf = Buf & " Sub Frame " & CInt(SF * 100) & " percent"
            Console.PrintLine Buf
            Voice.Speak Buf
        End If
    Elseif Not SUP.HaveFilters Then
        Console.PrintLine "**Filter " & Filt & " given, but no filters installed. Skipping this flat set."
        Exit Sub
    Elseif Not SUP.FilterExists(Filt) Then
        Console.PrintLine "**Filter " & Filt & " does not exist. Skipping this flat set."
        Exit Sub
    Else
        Buf = "Doing " & Count & " flats in " & Filt & " at binning " & Bin
        If Sup.HaveRotator Then Buf = Buf & " PA " & CInt(PA)
        If SF < 1.0 Then Buf = Buf & " Sub Frame " & CInt(SF * 100) & " percent"
        Console.PrintLine Buf
        Voice.Speak Buf
    End If
    
    If Not DomeFlatMode Then                                    ' If Panel/Screen, scope already pointed
        '
        ' Start a slew to flat-spot
        '
        Call CalcFlatSpot(RA, Dec, True)                        ' Calculate dithered flat-spot RA/Dec
        Call SUP.StartSlewJ2000(SLEWLABEL, RA, Dec)             ' Slew to this spot (possibly dithered)
    Else
        '
        ' Set the light brightness, use optional binning-dependent table
        '
        LightBrightUse = LightBrightnessValues
        If Bin = 1 Then
           Console.PrintLine "  (using bin-1 panel brightness values)"
        End If   
        If Bin = 2 Then
            If IsNull(LightBrightnessValuesBin2) Then           ' Asking bin-2 but no brightness table
                Console.PrintLine "  (NOTE: bin-2 panel brightness values not specified. See ACP Help, Auto Flats)"
            Else
                LightBrightUse = LightBrightnessValuesBin2
                Console.PrintLine "  (using optional bin-2 panel brightness values)"
            End If
        End If
        If Bin = 3 Then
            If IsNull(LightBrightnessValuesBin3) Then           ' Asking bin-3 but no brightness table
                Console.PrintLine "  (NOTE: bin-3 panel brightness values not specified. See ACP Help, Auto Flats)"
            Else
                LightBrightUse = LightBrightnessValuesBin3
                Console.PrintLine "  (using optional bin-3 panel brightness values)"
            End If
        End If
        If Bin = 4 Then
            If IsNull(LightBrightnessValuesBin4) Then           ' Asking bin-4 but no brightness table
                Console.PrintLine "  (NOTE: bin-4 panel brightness values not specified. See ACP Help, Auto Flats)"
            Else
                LightBrightUse = LightBrightnessValuesBin4
                Console.PrintLine "  (using optional bin-4 panel brightness values)"
            End If
        End If
        If SUP.HaveFilters Then
            FilterBrightness = LightBrightUse(SUP.DecodeFilter(Filt))
        Else
            FilterBrightness = LightBrightUse(0)
        End If
        Console.PrintLine "  Setting brightness " & FilterBrightness & " for bin " & Bin & " cmd """ & LightOnCommand & """"
        DoLightCommand LightOnCommand, FilterBrightness
        '
        ' Now see if we have a saved exposure interval for this filter and binning.
        ' If so use this as the starting point (much better guess!)
        '
        LastIntv = GetPreviousIntv(Filt, Bin)
        If LastIntv > 0 Then Intv = LastIntv                    ' -1 if no saved value
    End If
    '
    ' Manage flats for rotator support. If GEM, half will be taken 
    ' at the given PA (these are the looking-east flats), and the 
    ' other half at 180 from given PA (these are for looking-west).
    ' The StartRotateToPA() function adds 180 to the given PA when 
    ' GEM is west, we want mechanical PAs against the OTA not the sky!
    '
    If Sup.HaveRotator Then                                     ' No Short Circuit Booleans
        If Telescope.AlignmentMode = 2 Then                     ' If Rotator and GEM
            If Not DomeFlatMode And Dawn Then                   ' This is for StartRotateToPA() adding 180 at dawn
                PAWest = PA
                PAEast = PA + 180
                If PAEast > 360 Then PAEast = PAEast - 360
            Else
                PAEast = PA
                PAWest = PA + 180
                If PAWest > 360 Then PAWest = PAWest - 360
                '
                ' For panel flats fudge the RA to guarantee east and thus no dawn 180 rollover
                '
                If DomeFlatMode Then
                    RA = Telescope.SiderealTime + 6.0           ' Guaranteed to be East LST for GEM
                    If RA >= 360.0 Then RA = RA - 360.0
                End If
            End If
            '
            ' Two ways to handle the flipping and PA (ewb)
            '
            If NoAutoFlipRotatorPA Then                         ' Rotate to explicit PA now
                Call SUP.StartRotateToPA(PAEast, RA)            ' this method will compensate for extra 180 when flipped at dawn
                SUP.WaitForRotator
            Else
                '
                ' If odd number given, add a flat. The extra one will be done in the west.
                '
                If Count Mod 2 <> 0 Then
                    Console.PrintLine "** Rotator, GEM, and odd number of flats."
                    Console.PrintLine "   Adding one more flat."
                    Count = Count + 1
                End If
                CountEast = Count / 2
                CountWest = Count - CountEast
            End If
        Else                                                    ' We're doing 1 PA, rotate there Now
            Call SUP.StartRotateToPA(PA, RA)
            SUP.WaitForRotator
        End If
    End If

    If Filt <> "" Then                                          ' If really filtered
        SUP.SelectFilter SUP.DecodeFilter(Filt)                 ' Specify imaging filter
        SUP.SetFilterForTask 1                                  ' Change filter and apply focus offset if possible
    End If
    
    '
    ' ===========
    ' REPEAT LOOP
    ' ===========
    '
    MaxFlatNum = Count
    For N = 1 To Count
        CurFlatNum = N
        
        If SUP.HaveRotator And Telescope.AlignmentMode = 2 Then ' For rotator and GEM
            '
            ' Two ways to treat flipping and PA (ewb)
            '
            If NoAutoFlipRotatorPA Then
                If Not DomeFlatMode And Dawn Then
                    MerSide = "West"        'scope looks west and mount is "flipped" in Southern Hemisphere
                Else                                                        
                    MerSide = "East"        'scope looks east -  mech and sky PA match - near PME home in Southern Hemisphere
                End If
            Else
                '
                ' If rotator and GEM, take half of the images with each  
                ' rotator orientation (west and east, 180 deg difference)
                '
                ' For dawn flats with GEM, Sup.StartRotateToPA will add 
                ' 180 degrees to the rotator PA because the mount is 
                ' pointing West and flipped. Count will always be even and 
                ' 2 or greater. CountEast will always equal CountWest and 
                ' be 1 or greater.
                '
                If RotatorOrientationStatus = 0 Then            ' First time through for that PA; initialize filename
                    MerSide = "East"                            ' and rotator to east orientation
                    RotatorOrientationStatus = 1
                    Call SUP.StartRotateToPA(PAEast, RA)
                ElseIf RotatorOrientationStatus = 1 Then        ' Rotator already in east orientation
                    If N = CountEast + 1 Then                   ' East orientation done; rotate to west orientation
                        Call SUP.StartRotateToPA(PAWest, RA)
                        RotatorOrientationStatus = 2            ' Set rotator orientation to west
                        MerSide = "West"                        ' Label filename
                    Else
                        MerSide = "East"                        ' Label filename
                    End If
                ElseIf RotatorOrientationStatus = 2 Then        ' Rotator already in west orientation
                    If N = CountWest + 1 Then                   ' West orientation done; rotate to east orientation
                        Call SUP.StartRotateToPA(PAEast, RA)
                        RotatorOrientationStatus = 1            ' set rotator orientation to east
                        MerSide = "East"		                ' Label filename
                     Else
                        MerSide = "West"		                ' Label filename
                     End If
                End If
                SUP.WaitForRotator
            End If
        End If
        '
        ' Finally, make the file name
        '
        FlatName =  Substitute(FileNameTmpl, "", Filt, Bin, PA, N, MerSide)
        '
        ' Add a serial number so that no flats ever get overwritten. This will
        ' come into effect only if AutoFlat is re-run on the same date more
        ' than once at dusk or more than once at dawn. The scenario is "I can get
        ' more flats, why not?". This assures that more flats are really gotten!
        '
        If FSO.FileExists(FlatFolder & "\" & FlatName & ".fts") Then ' If base file already exists
            I = 1                                               ' First dupe is -2
            do While True
                I = I + 1                                       ' > 1 used below to test if dupe used
                If Not FSO.FileExists(FlatFolder & "\" & FlatName & "-" & I & ".fts") Then Exit do   ' Not yet used!
            Loop
        End If
        If I > 1 Then FlatName = FlatName & "-" & I             ' Duped, add a sequence number

        If Not DomeFlatMode Then
            Call CalcFlatSpot(RA, Dec, True)                    ' Calculate next dithered flat-spot RA/Dec
        End If
        FlatFile = FlatFolder & "\" & FlatName & ".fts"         ' Final (possibly serialized) flat pathname
        If N = 1 Then
            If Not DomeFlatMode Then
                SUP.WaitForSlew
                Console.PrintLine "  Stop tracking for test exposures"
                Telescope.Tracking = False                      ' Leave scope at sweet spot during a LONG test phase
            End If
            Call AcquireSingleFlat(FlatFile, Intv, Bin, SF, Filt, RA, Dec, True, False, 0)  ' Test, get Intv into range, don't post-slew
            If Not DomeFlatMode Then
                Telescope.Tracking = True                       ' Done Testing, turn tracking back on
                Console.PrintLine "  Start tracking for real flats" ' Definitely track during live flats though!
            End If
        End If
        PostSlew = Not DomeFlatMode And (N < Count)             ' Don't slew between filters (or for panel flats)
        Call AcquireSingleFlat(FlatFile, Intv, Bin, SF, Filt, RA, Dec, False, PostSlew, N)  ' Do a real flat
        If SUP.HaveRotator And Telescope.AlignmentMode = 2 Then ' For rotator and GEM
            Console.PrintLine "  This just-acquired flat is for " & MerSide & " rotation"
        End If
    Next

    If Not DomeFlatmode Then 
        SUP.WaitForSlew                                         ' Wait for the slew after the last image
    Else
        Call SavePreviousIntv(Filt, Bin, Intv)
    End If
    
End Sub

'
' Acquire one flat. Cannot use SUP.TakePicture as it will auto-cal if that
' option is on, etc. Must directly control MaxIm here. After the shutter
' closes, slew to the "next" position, thus overlapping slewing And
' image downloading. This should be a decent win for time!
' 
' NOTE: ITERATES UNTIL MEAN ADU IS WITHIN THE SPECIFIED RANGE, AND ADJUSTS
'       EXPOSURE INTERVAL (Intv) ACCORDINGLY. THE CALLER GETS BACK THE 
'       ADJUSTED INTERVAL.
'
' If the Test parameter is true, will take small subframe exposures and 
' loop until the ADU is within range. The resulting flats are discarded.
' Use this to wait for the proper light level without incurring possibly
' long image download time.
'
' Uses currently selected filter.
'
' Inputs:   FlatFile    Full path to flat image file
'           Intv        Starting exposure interval, sec
'           Bin         Binning level (must be legal for imager!)
'           SF          Subframe (fractional, ignored for test exposures)
'           Filt        Name of current filter (used only for logging)
'           nxtRA       RA to move to after exposing
'           nxtDec      Dec to move to after exposing
'           Test        If true, this is a test flat (see note above)
'           PostSlew    If true, initiate a slew/dither after this one (safed here for DomeFlatMode = True)
'           FlatNumber  The number of the flat, just for logging
'
' Outputs:  Intv        Final exposure interval that met ADU
'
' Temporary work file used to make this DropBox friendly
'
Sub AcquireSingleFlat(FlatFile, Intv, Bin, SF, Filt, nxtRA, nxtDec, Test, PostSlew, FlatNumber)
    Dim workFile, P, BG, Fade, Level, minADU, maxADU, accADU, prevIntv, buf, x
    
    workFile = FSO.GetSpecialFolder(2).Path & "\" & FSO.GetBaseName(FSO.GetTempName()) & ".fts" ' 2 = temporary folder path
    If Test Then
        accADU = ADUAcceleration_Test
    Else
        accADU = ADUAcceleration
    End If
    '
    ' ========================
    ' EXPOSURE ADJUSTMENT LOOP
    ' ========================
    '
    Do While True
        If Not DomeFlatmode Then SUP.WaitForSlew                ' Wait for previous overlapped slew

        If Test Then
            buf = "TEST"
            If DomeFlatMode Then
                FlatState = "Testing brightness"
            Else
                FlatState = "Wait Sky"
            End If
        Else
            buf = "FLAT" & FlatNumber
            FlatState = "Acquire Flat"
        End If
        Intv = CDbl(Util.FormatVar(Intv, "0.00"))               ' Limit to 2 decimal places
        If Filt <> "" Then
            Console.PrintLine buf & " " & Filt & ":  " & Intv & " sec at bin " & Bin
        Else
            Console.PrintLine buf & " Unfiltered:  " & Intv & " sec at bin " & Bin
        End If
        
        Camera.BinX = Bin                                       ' Set binning level
        Camera.BinY = Bin
        Call Camera.SetFullFrame()                              ' Needed to reduce binning ???
        
        '
        ' Thanks to Eric Dose - Test subframe is half way from 
        ' center to edge of the frame. For vignetting. 
        '
        If Test Then                                            ' Test mode uses TestImageSize (ewb)
            Console.PrintLine "  Testing with " & CLng(TestImageSize) & " x " & CLng(TestImageSize) & " offset sub-frame"
            Camera.NumX = TestImageSize
            'Camera.StartX = ((Camera.CameraXSize / Bin) - TestImageSize) / 2.0
            Camera.StartX = (Camera.CameraXSize / Bin / 4.0) - (TestImageSize / 2.0)
			If Camera.StartX < 1 Then Camera.StartX = 1
            Camera.NumY = TestImageSize
            'Camera.StartY = ((Camera.CameraYSize / Bin) - TestImageSize) / 2.0
			Camera.StartY = (Camera.CameraYSize / Bin / 4.0) - (TestImageSize / 2.0)
			If Camera.StartY < 1 Then Camera.StartY = 1
        ElseIf SF < 1.0 Then
            Camera.NumX = (Camera.CameraXSize * SF) / Bin
            Camera.StartX = ((Camera.CameraXSize / Bin) - Camera.NumX) / 2.0
            Camera.NumY = (Camera.CameraYSize * SF) / Bin
            Camera.StartY = ((Camera.CameraYSize / Bin) - Camera.NumY) / 2.0
        End If
                
        '
        ' This mess handles the case where the (unfortunate) user's mount
        ' and imager combination cannot handle simultaneous slewing and
        ' image downloading. In this case the user will have selected the
        ' Prefs.DisableSlewOverlap preference. 
        '
        ' If overlapping is enabled, then the image is exposed and the 
        ' slew to the next dither spot is done simultaneous with the 
        ' image download, usually a significant time saver.
        '
        TrackOffRemaining = 0                                   ' [sentinel]
        SUP.ExposureActive = True                               ' Turn on the EXPOSE annunciator
        If Util.Prefs.DisableSlewOverlap Then                   ' If not overlapping
            Util.WaitForMilliseconds 500                        ' Give it time to come on before...
            Util.UserInterfaceLive = False                      ' Must put ACP UI to sleep for exposure AND download :=((
        End If
        Console.PrintLine "  Camera exposing"
        If Not Camera.Expose(Intv, 1) Then
            Err.Raise 32768, "MaxIm.CCDCamera", _
                        "**Failed to start the exposure"
        End If
        If Not Util.Prefs.DisableSlewOverlap Then               ' If overlapped slew/download
            Do While Not Camera.ReadyForDownload                ' Wait till image ready for download
                Util.WaitForMilliseconds 1000
            Loop
            SUP.ExposureActive = False                          ' Turn off EXPOSE light
            Util.WaitForMilliseconds 500                        ' Give EXPOSE light time to go off
            Console.PrintLine "  Exposure complete"
            If PostSlew And Not DomeFlatMode Then               ' If requested, dither
                If Telescope.CanSetTracking Then
                    TrackOffRemaining = StarDriftSeconds
                    Telescope.Tracking = False
                    Console.PrintLine "  Stop tracking for " & StarDriftSeconds & " sec..."
                Else
                    SUP.StartSlewJ2000 SLEWLABEL, nxtRA, nxtDec
                End If
            End If
            Console.PrintLine "  Downloading image..."
            Util.UserInterfaceLive = False                      ' Put ACP UI to sleep for download only
            Camera.StartDownload
        End If
        Do While Not Camera.ImageReady                          ' Wait for exposure or download
            Util.WaitForMilliseconds 1000
            If TrackOffRemaining > 0 Then                       ' Will be non-zero only if tracking crl and overlap enabled (typ)
                TrackOffRemaining = TrackOffRemaining - 1
                If TrackOffRemaining <= 0 Then
                    Telescope.Tracking = True
                    Console.PrintLine "  Start tracking"
                    TrackOffRemaining = 0
                End If
            End If
        Loop
        Util.UserInterfaceLive = True                           ' Wake ACP UI back up
        Util.Console.PrintLine "  Image downloaded"
        SUP.ExposureActive = False                              ' Turn off the EXPOSE annunciator
        If TrackOffRemaining > 0 Then
            Do While TrackOffRemaining > 0
                Util.WaitForMilliseconds 1000
                TrackOffRemaining = TrackOffRemaining - 1
            Loop
            Telescope.Tracking = True
            Console.PrintLine "  Start tracking"
            TrackOffRemaining = 0
        End If
        Util.WaitForMilliseconds 500                            ' Give EXPOSE light time to go off
        If Util.Prefs.DisableSlewOverlap And Not DomeFlatMode And PostSlew Then   ' Not overlapping, dither now
            If Telescope.CanSetTracking Then
                Telescope.Tracking = False
                Console.PrintLine "  Stop tracking (sync) for " & StarDriftSeconds & " sec..."
                Util.WaitForMilliseconds (StarDriftSeconds * 1000)
                Console.PrintLine "  Start tracking"
            Else
                SUP.StartSlewJ2000 SLEWLABEL, nxtRA, nxtDec 
            End If
        End If
        
        If Util.Prefs.PointingUpdates.Simulate Then             ' If "simulate images"
            Call Camera.Document.Subtract(Camera.Document)      ' Clear the image to black
            '
            ' For simulated images, start at 40% saturation.  
            ' Saturation will fade in the evening and increase 
            ' in the morning. Adjust to make it hit the 1-minute
            ' wait loops. 
            '
            If DomeFlatMode Then
                Fade = 0.0
                Level = ((Intv - MinExposure) / (MaxExposure - MinExposure)) * SaturationADU    ' Scale ADU with exposure time
            ElseIf Dawn Then
                Fade = Exp(((Now() - StartTime) * 72))          ' Exp((minutes since start / 20))
                Level = SaturationADU * (Intv * 0.4 / (1.05 * MaxExposure)) * Fade
            Else
                Fade = Exp(-((Now() - StartTime) * 72))         ' Exp(-(minutes since start / 20))
                Level = SaturationADU * (Intv * 0.4 / (0.7 * MinExposure)) * Fade
            End If
            If Level > SaturationADU Then Level = SaturationADU ' Clamp at saturation level
            Call Camera.Document.AddConstant(Level)
            Util.WaitForMilliseconds 3000                       ' Simulate image download
        End If

        Call Camera.SaveImage(workFile)                         ' Save the image

        Set P = CreateObject("PinPoint.Plate")
        Call P.AttachFITS(workFile)
        BG = P.SimpleBackgroundMean                              ' Get fast mean background ADU
        Console.PrintLine "  Background mean = " & CLng(BG) & " (ADU)"
        If IRAF_FITS Then
            Call P.WriteFITSString("IMAGETYP", "FLAT")          ' IRAF compatible
        Else
            Call P.WriteFITSString("IMAGETYP", "Flat Field")    ' MaxIm compatible
        End If
        If Not Test And SUP.HaveRotator Then                    ' For rotator (all mount types)
            x = SUP.RotatorPositionAngle	                    ' Very poor name, this is the SKY PA!!!
            If x >= 359.95 Then x = 0.0                         ' Prevent 360.0 (ugh)
            Call P.WriteFITSDouble("PA", x, 1)
            Call P.WriteFITSDouble("ROT_PA", Rotator.Position, 1)
        End If
        Call P.UpdateFITS()
        Call P.DetachFITS()
        Set P = Nothing
        If Test Then 
            FSO.DeleteFile workFile                             ' Discard test image!
        Else
            If FSO.FileExists(FlatFile) Then FSO.DeleteFile(FlatFile)
            FSO.MoveFile workFile, FlatFile                     ' Move to final place
            If CompressFlats Then
                Util.CompressFile FlatFile, FlatFile & ".zip"
                Console.PrintLine "  Flat frame ZIP-compressed"
                FSO.DeleteFile FlatFile                         ' Don't keep uncompressed (7.2 new)
            Else
                If FSO.FileExists(FlatFile & ".zip") Then       ' Not compressing, delete old zipfiles
                    FSO.DeleteFile FlatFile & ".zip"
                End If
            End If
        End If
        '
        ' If it's too dark in the morning or too light in the evening,
        ' scale the exposure. In the morning, this scaled exposure is 
        ' at the minimum acceptable ADU. In the evening, this scaled 
        ' exposure is at the maximum ADU. If the scaled exposure is 
        ' greater then MaxExposure (morning) or less than MinExposure
        ' (evening), wait 1 minute and try again.  Otherwise try again 
        ' immediately using the scaled exposure. If it is too light at
        ' MinExposure (morning) or too dark at MaxExposure (evening) 
        ' the script will fail.
        '
        ' Any files written will be over-written by this looping process 
        ' until a successful exposure is taken or the script fails.
        '
        minADU = TargetBackgroundADU - TargetADUTolerance       ' Shortcuts
        maxADU = TargetBackgroundADU + TargetADUTolerance
        If BG <= (maxADU) And  BG >= (minADU) Then
            '
            ' Adjust exposure interval but make sure it doesn't exceed Min/Max exposure times.
            '
            Intv = Intv * (TargetBackgroundADU / BG) * ADUAcceleration ' Adjust exposure interval
            If Intv < MinExposure Then Intv = MinExposure
            If Intv > MaxExposure Then Intv = MaxExposure
            Exit Do                                             ' Done! Image has tolerable mean ADU
        Else
            '            
            ' Add back failure logic if image ADU is outside acceptable range (see above).
            '
            If BG < (minADU) Then                               ' If it's too dark
                prevIntv = Intv                                  ' Save this for limiting below
                Intv = Intv * (TargetBackgroundADU / BG) * ADUAcceleration ' Scale exposure for target ADU
                If DomeFlatMode Then                            ' Dome flat mode
                    If Intv > 5 * prevIntv Then Intv = 5 * prevIntv ' Limit the increase
                    If Intv > MaxExposure Then
                        If FSO.FileExists(FlatFile) Then FSO.DeleteFile FlatFile   ' Delete this bad flat (if test, already gone!)
                        Err.Raise ERR_BADLIGHTSOURCE, "AutoFlat", "  **Light source is too faint!" ' it's too faint, so it fails
                    Else
                        Console.PrintLine "  Scaling exposure and trying again" ' scaled exposure should work
                    End If
                ElseIf Dawn Then                                ' In the morning
                    If Intv > MaxExposure Then                  ' and it's still too dark after scaling,
                    	x = SunElevation()
                        If x > TwilightSunHi And Not Util.Prefs.PointingUpdates.Simulate Then   ' Dome/Roof closed?
                            Err.Raise ERR_DOMECLOSED, "AutoFlat", "  ** Looks like dome/roof closed!"
                        End If
                        Intv = MaxExposure
                        Console.PrintLine "  Still too dark - waiting 15 sec. to try again..."
                        Util.WaitForMilliseconds 15000          ' wait 15 sec. and try again
                        Console.PrintLine "  ...wait complete. Sun is now at " & Util.FormatVar(x, "0.0") & _
                                                " deg. elevation"
                    Else                                        ' Otherwise...
                        Console.PrintLine "  Scaling exposure and trying again" ' scaled exposure should work
                    End If
                Else                                            ' If it's too dark in the evening (should NOT happen)
                    If Intv > MaxExposure Then                  ' and scaled exposure exceeds MaxExposure
                        If FSO.FileExists(FlatFile) Then FSO.DeleteFile FlatFile ' Delete this bad flat (if test, already gone!)
                        Err.Raise ERR_TOOLATE, "AutoFlat", "  **Sky is too dark" ' it's too late, so it fails
                    End If
                End If
            Elseif BG > (maxADU) Then                           ' If it's too light
                Intv = Intv * (TargetBackgroundADU / BG) * ADUAcceleration ' Scale exposure for target ADU
                If DomeFlatMode Then                            ' Dome flat mode
                    If Intv < MinExposure Then
                        If FSO.FileExists(FlatFile) Then FSO.DeleteFile FlatFile   ' Delete this bad flat (if test, already gone!)
                        Err.Raise ERR_BADLIGHTSOURCE, "AutoFlat", "  **Light source is too bright!" ' it's too bright, so it fails
                    Else
                        Intv = Intv / 2                         ' Accelerate the decrease for convergence
                        If Intv < MinExposure Then Intv = MinExposure   ' Limit to minimum though
                        Console.PrintLine "  Scaling exposure and trying again" ' scaled exposure should work
                    End If
                ElseIf Dawn Then                                ' In the morning
                    If Intv < MinExposure Then                  ' and scaled exposure is less than MinExposure
                        If FSO.FileExists(FlatFile) Then FSO.DeleteFile FlatFile   ' Delete this bad flat (if test, already gone!)
                        Err.Raise ERR_TOOLATE, "AutoFlat", "  **Sky is too bright" ' it's too late, so it fails
                    End If
                Else                                            ' If it's too light in the evening          
                    If Intv < MinExposure Then                  ' and it's still too light after scaling,
                        Intv = MinExposure
                        Console.PrintLine "  Still too light - waiting 15 sec. to try again..."
                        Util.WaitForMilliseconds 15000      ' wait 15 sec and try again
                        Console.PrintLine "  ...wait complete. Sun is now at " & Util.FormatVar(SunElevation(), "0.0") & _
                                            " deg. elevation"
                    Else                                        ' Otherwise,
                        Console.PrintLine "  Scaling exposure and trying again"    ' Scaled exposure should work
                    End If
                End If
            End If
        End If
    Loop
    ' Whew! 
End Sub

'
' Panel flat exposure persistence. These functions save/restore the last exposure
' interval used for panel flats given the filter name and binning. Uses separate
' files in the ACP Config folder, PanelFlatExposures subfolder. Crude yet effective.
'
' Parameters:
'   Filt = filter name
'   Bin = binning level
'
' Returns: exposure interval last used for this filter/bin combination, or -1 for N/A
'
Function GetPreviousIntv(Filt, Bin)
    Dim buf, intv, S

    buf = ACPApp.ConfigPath & "\PanelFlatExposures\LastExp" & Filt & Bin & ".txt"
    If Not FSO.FileExists(buf) Then
        GetPreviousIntv = -1
        Exit Function
    End If
    Set S = FSO.OpenTextFile(buf)
    On Error Resume Next
    buf = S.ReadLine
    intv = CInt(buf)
    If Err.Number <> 0 Then intv = -1
    Err.Clear
    If intv <> -1 Then Console.PrintLine "  (using last saved exposure of " & intv & " sec.)"
    S.Close
    Set S = Nothing
    GetPreviousIntv = intv

End Function

'
' Parameters:
'   Filt = filter name
'   Bin = binning level
'   Intv = exposure interval to remember (make integer)
'
Sub SavePreviousIntv(Filt, Bin, Intv)
    Dim buf, S
    buf = ACPApp.ConfigPath & "\PanelFlatExposures"
    If Not FSO.FolderExists(buf) Then FSO.CreateFolder buf
    buf = buf & "\LastExp" & Filt & Bin & ".txt"
    Set S = FSO.CreateTextFile(buf, True )
    S.WriteLine CStr(Cint(Intv))
    S.Close
    Set S = Nothing    
End Sub


'
' Determine if the current run will be for dawn or dusk
'
Function IsDawn()
    Dim EvTime(3)

    Select Case NextEventTimes(EvTime)
        Case 0: IsDawn = True
        Case 1: IsDawn = True
        Case 2: IsDawn = False
        Case 3: IsDawn = False
        Case Else: Err.Raise 32768, "AutoFlat", "Programmer error in dawn/dusk!"
    End Select
    
End Function

'
' Determine the next event times, and return the event code
' for the next event. Strange function!
'
Function NextEventTimes(EvTime)
    Dim CurTime, Forever, I, X, NextEv
    
    CurTime = Now()                                             ' Make a static copy of "Now()"
    Forever = CDate(CurTime + 5)                                ' Sleazy hack
    
    '
    ' Get the next 4 event times. These are always in the future!
    ' Back the start times up by 4 minutes for pre-slew logic.
    ' Mind polar region issues... this is really crazy!
    '
    ' DAWN
    '
    X = NextDawnDusk(TwilightSunLo, True)                       ' Next dawn start
    If X = "NA" Then
        Err.Raise 32768, "AutoFlat", "**It's not going to be bright enough for flats today"
    ElseIf X = "NB" Then
        EvTime(0) = Forever                                     ' Never below, there now!
    Else
        EvTime(0) = CDate(X - PreSlewTime)                      ' Next dawn start - pre-slew Time
    End If
    
    X = NextDawnDusk(TwilightSunHi, True)                       ' Next dawn end
    If X = "NA" Then
        EvTime(1) = Forever                                     ' Never above, there now!
    ElseIf X = "NB" Then
        Err.Raise 32768, "AutoFlat", "**It's going to be too bright for flats today"
    Else
        EvTime(1) = X                                           ' Next dawn End
    End If
    
    '
    ' DUSK
    '
    X = NextDawnDusk(TwilightSunHi, False)                      ' Next dusk start
    If X = "NA" Then
        EvTime(2) = Forever                                     ' Never above, there now!
    ElseIf X = "NB" Then
        Err.Raise 32768, "AutoFlat", "**It's going to be too bright for flats today"
    Else
        EvTime(2) = CDate(X - PreSlewTime)                      ' Next dusk start - pre-slew Time
    End If

    X = NextDawnDusk(TwilightSunLo, False)                      ' Next Dusk end
    If X = "NA" Then
        Err.Raise 32768, "AutoFlat", "**It's not going to be bright enough for flats today"
    ElseIf X = "NB" Then
        EvTime(3) = Forever                                     ' Never below, there now!
    Else
        EvTime(3) = X                                           ' Next dusk end - pre-slew Time
    End If

    '
    ' Find out which one is coming up Next
    '
    X = 2.0                                                     ' 2 days into future
    For I = 0 To 3
        If (EvTime(I) - CurTime) < X Then                       ' Subtraction produces fractional days
            NextEv = I                                          ' Remember this index
            X = EvTime(I) - CurTime                             ' And this time-to-event for next test
        End If
    Next
    
    NextEventTimes = NextEV                                     ' Return index
    
End Function


'
' Wait for the next twilight event. If the sun is within one of the 
' elevation bands for flats, return immmediately, otherwise wait For
' the next band. Turns tracking off if waiting, exits with tracking
' on.
'
' Return True if it's Dawn, else False. 
'
Function WaitForTwilight()                                      ' Returns True for Dawn
    Dim EvTime(3)
    Dim RA, Dec

    If Util.Prefs.PointingUpdates.Simulate Then                 ' Don't do this if simulating
        Console.PrintLine "Simulating, will not wait for dusk or dawn..."
        WaitForTwilight = True
        Exit Function
    End If
   
    Select Case NextEventTimes(EvTime)                          ' Depending on the next event...
        Case 0:                                                 ' Next dawn start
            Console.PrintLine "Waiting to start dawn flats at " & _
                            Util.FormatVar(EvTime(0) + PreSlewTime, "Long Time")
            If Telescope.CanSetTracking Then                    ' Turn off tracking while waiting
                Console.PrintLine "  Stop tracking while waiting"
                Telescope.Tracking = False
            End If
            Util.WaitUntil EvTime(0)                            ' Wait till time for pre-slew
            Call CalcFlatSpot(RA, Dec, False )
            If Telescope.CanSetTracking Then                    ' Tracking back on for slew
                Console.PrintLine "  Start tracking for upcoming slew"
                Telescope.Tracking = True
            End If
            SUP.StartSlewJ2000 SLEWLABEL, RA, Dec               ' Start the slew
            SUP.WaitForSlew
            Util.WaitUntil EvTime(0) + PreSlewTime              ' Wait till time to start
            Console.PrintLine "Starting dawn flats. High Sun at " & _
                            Util.FormatVar(EvTime(1), "Long Time")
            WaitForTwilight = True                              ' Done, it's dawn
            
        Case 1:                                                 ' Next dawn End
            ' Return immediately, already in dawn sweet spot!
            Console.PrintLine "Starting dawn flats. High Sun at " & _
                            Util.FormatVar(EvTime(1), "Long Time")
            If Telescope.CanSetTracking Then                    ' If needed, tracking On
                If Not Telescope.Tracking Then
                    Console.PrintLine "  Start tracking for next phase"
                    Telescope.Tracking = True
                End If
            End If
            WaitForTwilight = True                              ' It's dawn
            
        Case 2:                                                 ' Next dusk start
            Console.PrintLine "Waiting to start dusk flats at " & _
                            Util.FormatVar(EvTime(2) + PreSlewTime, "Long Time")
            If Telescope.CanSetTracking Then                    ' Turn off tracking while waiting
                Console.PrintLine "  Stop tracking while waiting"
                Telescope.Tracking = False
            End If
            Util.WaitUntil EvTime(2)                            ' Wait till time for pre-slew
            Call CalcFlatSpot(RA, Dec, False )
            If Telescope.CanSetTracking Then                    ' Tracking back on for slew
                Console.PrintLine "  Start tracking for upcoming slew"
                Telescope.Tracking = True
            End If
            SUP.StartSlewJ2000 SLEWLABEL, RA, Dec               ' Start the slew
            SUP.WaitForSlew
            Util.WaitUntil EvTime(2) + PreSlewTime              ' Wait till time to start
            Console.PrintLine "Starting dusk flats. Low Sun at " & _
                            Util.FormatVar(EvTime(3), "Long Time")
            WaitForTwilight = False                             ' Done, it's dusk
            
        Case 3:                                                 ' Next dusk End
            ' Return immediately, already in dusk sweet spot
            Console.PrintLine "Starting dusk flats. Low Sun at " & _
                            Util.FormatVar(EvTime(3), "Long Time")
            If Telescope.CanSetTracking Then                    ' If needed, tracking On
                If Not Telescope.Tracking Then
                    Console.PrintLine "  Start tracking for next phase"
                    Telescope.Tracking = True
                End If
            End If
            WaitForTwilight = False                             ' It's dusk
            
    End Select

End Function

'
' Compute next rise or set time - good to 1 second
'
' H0 = target solar altitude for rise/set
' DoDawn = True means calculate next dawn, else next dusk.
'
'
' Typically, this will converge to 1 second within 3-4 loops.
' Since SunEphem() produces J2000 coordinates, we use local
' MEAN sidereal time instead of APPARENT for the hour angle.
' These approximations will get us typically to within 
' 0.001 degree of the target sun elevation. PLENTY CLOSE! 
'
Function NextDawnDusk(H0, DoDawn)
    Dim JD, JDPrev, SunRA, SunDec, LMST, HA
    Dim SunDecRad, LatRad, H0Rad, Z

    LatRad = Telescope.SiteLatitude * DEGRAD                    ' Latiude in radians (constant)
    H0Rad = H0 * DEGRAD                                         ' Target altitude radians (constant)
    '
    ' Iteration loop
    '
    JD = Util.SysJulianDate                                     ' Start with current date/Time
    JDPrev = JD
    Do
        Call SunEphem(JD, SunRA, SunDec)
        SunDecRad = SunDec * DEGRAD
        Z = (Sin(H0Rad) - (Sin(LatRad) * Sin(SunDecRad))) / _
                        (Cos(LatRad) * Cos(SunDecRad))
        If Z < -1.0 Then
            NextDawnDusk = "NB"                                 ' Never below
            Exit Function
        ElseIf Z > 1.0 Then
            NextDawnDusk = "NA"                                 ' Never above
            Exit Function
        End If
        HA = Arccos(Z) / DEGRAD
        If DoDawn Then HA = -HA
        LMST = Util.Julian_GMST(JD) + (Telescope.SiteLongitude / 15) ' LOCAL MEAN Sidereal Time
        JD = JD + (((HA / 15.0) - Util.HourAngle12(SunRA, LMST)) / 24.0)
        If Util.SysJulianDate > JD Then 
            JD = JD + 1
        Elseif Abs(JD - JDPrev) < 0.0000115741 Then 
            Exit Do                                             ' Convergence = 1 Second
        End If
        JDPrev = JD
    Loop
    
    NextDawnDusk = Util.Julian_Date(JD)                         ' Local time of dawn or dusk

End Function

'
' Calculate current flat-spot with optional AzDither dithering
' (degrees), return RA/Dec by parameter pass-back.
'
Sub CalcFlatSpot(RA, Dec, Dither)
    Dim SunRA, SunDec, CT, X

    SunEphem Util.SysJulianDate, SunRA, SunDec                  ' Get Sun coordinates
    Set CT = Util.NewCTHereAndNow()                             ' ACP Coordinate Transform
    CT.RightAscension = SunRA
    CT.Declination = SunDec
    X = CT.Azimuth + 180
    If Dither Then
        X = X + AzDither - SUP.UnifRand(2 * AzDither)           ' Apply +/- uniform dithering
        If X < 0 Then X = X + 360
        If X > 360 Then X = X - 360                             ' Azimuth of flat spot
    End If
    CT.Azimuth = X
    '
    ' ?? SHOULD ALTITUDE BE DITHERED ??
    '
    CT.Elevation = FlatSpotAltitude                             ' Altitude of flat spot
    RA = CT.RightAscension                                      ' RA/Dec of flat spot
    Dec = CT.Declination

End Sub

'
' Pause telescope tracking for given number of seconds
'
Sub PauseTracking(secs)
    Console.PrintLine "Turning tracking off for " & secs & " sec..."
    Telescope.Tracking = False
    Util.WaitForMilliseconds secs * 1000
    Telescope.Tracking = True
    Console.PrintLine "... tracking back on"
End Sub


'
' Compute sunset time for a run - Good to 1 minute
'
' Typically, this will converge to 1 minute within 2-3 loops.
' Since the Sun ephem produces J2000 coordinates, we use local
' MEAN sidereal time instead of APPARENT for the hour angle.
' These approximations will get us typically to within 
' 0.001 degree of the target sun elevation. PLENTY CLOSE! 
'
' For polar regions, use the latitude of the Artic or 
' Antartic circle. This is good enough for the path subst.
' #DATENITE.
'
Function SunsetOfRun()
    Dim JD, JDPrev, SunRA, SunDec, LMST, HA0, HA
    Dim SunDecRad, Lat, LatRad, KT
    Dim tvec, KA

    Lat = Telescope.SiteLatitude
    If Lat > 65.0 Then Lat = 65.0
    If Lat < -65.0 Then Lat = -65.0
    LatRad = Lat * DEGRAD                                       ' Latiude in radians (constant)
    '
    ' Iteration Loop
    '
    JD = Util.SysJulianDate                                     ' Start with current date/Time
    JDPrev = JD
    Do
        Call SunEphem(JD, SunRA, SunDec)
        SunDecRad = SunDec * DEGRAD
        HA0 = Arccos((-(Sin(LatRad) * Sin(SunDecRad))) / _
                        (Cos(LatRad) * Cos(SunDecRad))) / DEGRAD
        LMST = Util.Julian_GMST(JD) + (Telescope.SiteLongitude / 15.0) ' LOCAL MEAN Sidereal Time
        HA = Util.HourAngle12(SunRA, LMST)                      ' Local hour angle of sun at JD (SIGN REVERSE, ACP BUG)
        JD = JD + (((HA0 / 15.0) - HA) / 24.0)
        If HA < 0 Then                                          ' If after local high noon
            JD = JD - 1                                         ' Back up to prev sunset
        Elseif Abs(JD - JDPrev) < 0.0006944 Then 
            Exit Do                                             ' Convergence = 1 Minute
        End If
        JDPrev = JD
    Loop
    
    SunsetOfRun = Util.Julian_Date(JD)                          ' Local time of run's sunset

End Function

'
' Given the JD, return (via parameter passback) the Sun's J2000 RA/Dec
' Close enough for Gov't work!
'
Sub SunEphem(JD, RA, Dec)
    Dim tvec, KA

    KA = KT.GetPositionAndVelocity(JD)                          ' Get earth from sun
    Set tvec = CreateObject("NOVAS.PositionVector")
    tvec.x = -KA(0)                                             ' Reveerse cartesian vector for sun from earth
    tvec.y = -KA(1)
    tvec.z = -KA(2)
    RA = tvec.RightAscension                                    ' J2000 coordinates of sun from earth
    Dec = tvec.Declination

End Sub

'
' Get current Sun elevation. Used to adjust the high And
' low angles if script waits in 1 minute loop.
'
Function SunElevation()
    Dim SunRA, SunDec, CT

    Call SunEphem(Util.SysJulianDate, SunRA, SunDec)            ' Get Sun coordinates
    Set CT = Util.NewCTHereAndNow()
    CT.RightAscension = SunRA
    CT.Declination = SunDec
    SunElevation = CT.Elevation
    
End Function

'
' VBS library doesn't  have arc-cosine
'
Function Arccos(x)

    If x = 1. Then
      Arccos = 0.
    ElseIf x = -1. Then
      Arccos = 4.*Atn(1.0)
    Else
      Arccos = 2.*Atn(1.) - Atn( x/sqr(1.-x*x) )
    End If

End Function

'
' Calculate, and if needed create, the folder for the images from this run.
' Supports relative paths (relative to local or web user's default images
' folder) or a full path including a drive letter. Creates the folder And
' any parent folders as needed. For web users, relative paths that require
' web folders to be created will have the ASP files needed for folder
' access copied into all newly created folders. If Path is "", simply
' returns the user's default images folder path.
'
Function MakeFlatFolder(FldTmpl)
    Dim defPath, needASP
    
    '
    ' Get default images folder, used in old and new methods
    '
    If LockUser = "local_user" Or LockUser = "localweb" Then 
        defPath = Prefs.LocalUser.DefaultImageDir & "\"
        needASP = False
    Else
        defPath = Prefs.WebRoot & "\images\" &  LockUser
        needASP = True
    End If
    MakeFlatFolder = Substitute(FldTmpl, defPath, "", 1, 0, 1, "")
    SUP.CreateFolder MakeFlatFolder, needASP

End Function

'
' Substitution for building file paths and names
'
Function Substitute(tmpl, defPath, filtName, binning, PA, imgSeq, merSide)
    Dim buf, duskDawn
    
    buf = Trim(tmpl)
    buf = Replace(buf, "$DEFPATH",  defPath)
    If filtName = "" Then
        buf = Replace(buf, "$FLATFILT",  "Unfiltered")
    Else
        buf = Replace(buf, "$FLATFILT",  SUP.MakeFileName(filtName))
    End If
    buf = Replace(buf, "$FLATBIN",  binning)
    buf = Replace(buf, "$FLATSEQ",  Util.FormatVar(imgSeq, "000"))
    If Dawn Then duskDawn = "Dawn" Else duskDawn = "Dusk"
    buf = Replace(buf, "$DUSKDAWN", duskDawn)
    If SUP.HaveRotator Then
        buf = Replace(buf, "$FLATPA", Util.FormatVar(PA, "000"))
        If Telescope.AlignmentMode = 2 Then
            buf = Replace(buf, "$MERSIDE", merSide)
        Else
            buf = Replace(buf, "$MERSIDE", "NoGEM")
        End If
    Else
        buf = Replace(buf, "$FLATPA", "NoRot")
        buf = Replace(buf, "$MERSIDE", "NoGEM")
    End If
    buf = Replace(buf, "$DATEUTC",  Util.FormatVar(Util.SysUTCDate, "yyyymmdd"))
    buf = Replace(buf, "$TIMEUTC",  Util.FormatVar(Util.SysUTCDate, "HhNnSs"))
    buf = Replace(buf, "$DATELOC",  Util.FormatVar(Now(), "yyyymmdd"))
    buf = Replace(buf, "$TIMELOC",  Util.FormatVar(Now(), "HhNnSs"))
    buf = Replace(buf, "$DATEJUL",  CStr(Fix(Util.SysJulianDate)))
    buf = Replace(buf, "$DATENITE", Util.FormatVar(DateNight, "yyyymmdd"))
    If Camera.CanSetTemperature Then
        If Camera.Temperature < 40 Then
            buf = Replace(buf, "$TEMP", CInt(Camera.Temperature))
        Else
            buf = Replace(buf, "$TEMP", "NoTemp")
        End If
    Else
        buf = Replace(buf, "$TEMP", "NoTemp")
    End If
    Substitute = buf
    
End Function

'
' Load user settings from AutoFlatConfig.txt. This file is shipped
' with ACP, and initially a phrase is set so user will be forced to
' edit it or AutoFlat.vbs won't run!
'
Function LoadUserPrefs()
    Dim fline, buf, f, I, bits, badVal
    Dim RX
    
    LoadUserPrefs = False                                       ' Assume failure
    buf = Util.GetConfigFilePath("AutoFlatConfig.txt")
    If buf = "" Then
        Console.PrintLine "** Missing AutoFlatConfig.txt"
        Exit Function
    End If
    Set f = FSO.OpenTextFile(buf, 1)                            ' Open AF info file
    On Error Resume Next
    fline = f.ReadLine()
    If Err.Number <> 0 Then
        f.Close
        Console.PrintLine "** Empty AutoFlatConfig.txt"
        Exit Function
    Elseif fline = ";REMOVE THIS LINE" Then
        f.Close
        Console.PrintLine "** AutoFlat not configured."
        Console.PrintLine "   See ACP Help, Automatic Sky Flats"
        Exit Function
    End If
    On Error GoTo 0
    '
    ' Looks like a valid config file, user edited.
    '
    Set RX = New RegExp                                         ' Trim() does not remove tabs (grr...)
    RX.Pattern = "\s+"                                          ' Match any whitespace sequence
    RX.Global = True                                            ' Everywhere in buf
    DomeFlatMode = False                                        ' Default to no DomeFlat mode
    FolderNameTmpl = ""
    FileNameTmpl = ""
    LogFolder = ""
    CompressFlats = False                                       ' Default to no flat compression
    DoFlatAlt = -100                                            ' [sentinel] No Scope Slew (flip flat or light box)
    DoFlatAz = -1                                               ' [sentinel] " " "
    PostFlatAlt = -1                                            ' [sentinel] No post-flat slew
    PostFlatAz = -1                                             ' [sentinel] Use current Azimuth
    StarDriftSeconds = 3                                        ' Default 3 seconds with tracking off between flats
    TestImageSize = 128                                         ' Default to fairly small (ANDOR > 100x100)
    NoAutoFlipRotatorPA = False
    DomeAz = -1                                                 ' [sentinel] Dome azimuth (-1 = ignore)
    LightCtrlProgram = ""
    LightOnCommand = ""
    LightOffCommand = ""
    LightOnDelay = 0
    LightBrightnessValuesBin2 = Null                            ' Optional higher binning light brightness arrays
    LightBrightnessValuesBin3 = Null                            ' [sentinels]
    LightBrightnessValuesBin4 = Null
    
    Do While Not f.AtEndOfStream                                ' Loop till End of stream
        If fline <> "" Then
            buf = fline                                         ' Pick up possible live first line in file
            fline = ""
        Else
            buf = Trim(RX.Replace(f.ReadLine(), " "))           ' Read, compress all whitespace to " ", remove lead/trail " " 
        End If 
        I = InStr(buf, ";")                                     ' Comment delimiter in line?
        Select Case I
            Case 0:                                             ' No comment, live line, we're done
            Case 1:                                             ' Entire line is comment, skip it
                buf = ""                                        ' Act like this never existed
            Case Else:                                          ' Comment embedded in line
                buf = Trim(Left(buf, (i - 1)))                  ' Remove comment and blanks
        End Select
        If buf <> "" Then                                       ' Skip blank or supressed lines
            bits = Split(buf)                                   ' Split into name and value
            If UBound(bits) < 1 Then                            ' Name with no value!
                Console.PrintLine "** No value in AutoFlatConfig.txt:"
                Console.PrintLine "   " & buf
                f.Close
                Exit Function
            End If
            ' At least two parts exist...
            badVal = False                                      ' Assume this is OK
            On Error Resume Next                                ' This is so crude...
            Select Case LCase(bits(0))
                Case "flatmode":
                    FlatMode = Trim(bits(1))
                    If Err.Number <> 0 Then badVal = True
                Case "targetbackgroundadu":
                    TargetBackgroundADU = CLng(bits(1))
                    If Err.Number <> 0 Then badVal = True
                Case "targetadutolerance":
                    TargetADUTolerance = CLng(bits(1))
                    If Err.Number <> 0 Then badVal = True
                Case "minexposure":
                    MinExposure = CDbl(bits(1))
                    If Err.Number <> 0 Then badVal = True
                Case "maxexposure":
                    MaxExposure = CDbl(bits(1))
                    If Err.Number <> 0 Then badVal = True
                Case "iraf_fits":
                    IRAF_FITS = CBool(bits(1))
                    If Err.Number <> 0 Then badVal = True
                Case "foldertemplate":
                    FolderNameTmpl = Trim(Mid(buf, Len(bits(0)) + 1))   ' May have spaces, so many bits! (typ.)
                    If Err.Number <> 0 Then badVal = True
                Case "filetemplate":
                    FileNameTmpl = Trim(Mid(buf, Len(bits(0)) + 1))
                    If Err.Number <> 0 Then badVal = True
                Case "logfolder":
                    LogFolder = Trim(Mid(buf, Len(bits(0)) + 1))
                    If Err.Number <> 0 Then badVal = True
                Case "lightctrlprogram":
                    LightCtrlProgram = Trim(Mid(buf, Len(bits(0)) + 1))
                    If Err.Number <> 0 Then badVal = True
                Case "lightoncommand":
                    LightOnCommand = Trim(Mid(buf, Len(bits(0)) + 1))
                    If Err.Number <> 0 Then badVal = True
                Case "lightoffcommand":
                    LightOffCommand = Trim(Mid(buf, Len(bits(0)) + 1))
                    If Err.Number <> 0 Then badVal = True
                Case "lightondelay":
                    LightOnDelay = CInt(bits(1))
                    If Err.Number <> 0 Then badVal = True
                Case "twilightsunlo":
                    TwilightSunLo = CDbl(bits(1))
                    If Err.Number <> 0 Then badVal = True
                Case "twilightsunhi":
                    TwilightSunHi = CDbl(bits(1))
                    If Err.Number <> 0 Then badVal = True
                Case "aduacceleration_am":
                    ADUAcceleration_AM = CDbl(bits(1))
                    If Err.Number <> 0 Then badVal = True
                Case "aduacceleration_pm":
                    ADUAcceleration_PM = CDbl(bits(1))
                    If Err.Number <> 0 Then badVal = True
                Case "compressflats":
                    Console.PrintLine "== OBSOLETE COMPRESSFLATS IN AUTOFLATCONFIG =="
                    Console.PrintLine "== Compression now uses web account setting =="
                Case "doflatalt":
                    DoFlatAlt = CDbl(bits(1))
                    If Err.Number <> 0 Then 
                        badVal = True
                    ElseIf DoFlatAlt < -90 Or DoFlatAlt > 90 Then
                        badVal = True
                    End If
                Case "doflataz":
                    DoFlatAz = CDbl(bits(1))
                    If Err.Number <> 0 Then 
                        badVal = True
                    ElseIf DoFlatAz < 0 Or DoFlatAz >= 360 Then
                        badVal = True
                    End If
                Case "postflatalt":
                    PostFlatAlt = CDbl(bits(1))
                    If Err.Number <> 0 Then 
                        badVal = True
                    ElseIf PostFlatAlt < 0 Or PostFlatAlt > 90 Then
                        badVal = True
                    End If
                Case "postflataz":
                    PostFlatAz = CDbl(bits(1))
                    If Err.Number <> 0 Then 
                        badVal = True
                    ElseIf PostFlatAz < 0 Or PostFlatAz >= 360 Then
                        badVal = True
                    End If
                Case "stardriftseconds":
                    StarDriftSeconds = CLng(bits(1))
                    If Err.Number <> 0 Then 
                        badVal = True
                    ElseIf StarDriftSeconds < 1 Or StarDriftSeconds > 30 Then
                        badVal = True
                    End If
                Case "testimagesize":
                    TestImageSize = CLng(bits(1))
                    If Err.Number <> 0 Then badVal = True
                Case "noautofliprotatorpa":
                    NoAutoFlipRotatorPA = CBool(bits(1))
                Case "domeaz":
                    DomeAz = CDbl(bits(1))
                    If Err.Number <> 0 Then 
                        badVal = True
                    ElseIf DomeAz < 0 Or DomeAz >= 360 Then
                        badVal = True
                    End If
                Case "perfilterbrightness":
                    LightBrightnessValues = Split(Trim(Mid(buf, Len(bits(0)) + 1)), ",")
                    If Err.Number <> 0 Then badVal = True
                Case "perfilterbrightnessbin2":
                    LightBrightnessValuesBin2 = Split(Trim(Mid(buf, Len(bits(0)) + 1)), ",")
                    If Err.Number <> 0 Then badVal = True
                Case "perfilterbrightnessbin3":
                    LightBrightnessValuesBin3 = Split(Trim(Mid(buf, Len(bits(0)) + 1)), ",")
                    If Err.Number <> 0 Then badVal = True
                Case "perfilterbrightnessbin4":
                    LightBrightnessValuesBin4 = Split(Trim(Mid(buf, Len(bits(0)) + 1)), ",")
                    If Err.Number <> 0 Then badVal = True
                Case "filter":                                  ' Skip Filter for AutoFlatConfig
                Case "foldername":                              ' Ignore this, checked later
                Case Else:
                    Console.PrintLine "** Misspelled name in AutoFlatConfig.txt:"
                    Console.PrintLine "   " & buf
                    f.Close
                    Exit Function
            End Select
            On Error GoTo 0
            If badVal Then 
                Console.PrintLine "** Bad value in AutoFlatConfig.txt:"
                Console.PrintLine "   " & buf
                f.Close
                Exit Function
            End If
        End If
    Loop
    f.Close
    '
    ' File/Folder template checks. We've removed FolderName support.
    '
    buf = " See ACP Help, Custom File and Folder Names, AutoFlat section!"
    If FileNameTmpl = "" Or FolderNameTmpl = "" Then
        Console.PrintLine "ERROR: Missing file or folder naming templates in your AutoFlatConfig.txt." & buf
    End If
    LoadUserPrefs = True                                        ' It's all good!
    
End Function


Sub SafeDeleteFile(f)
    On Error Resume Next
    FSO.DeleteFile f
    Err.Clear
End Sub

'
' Use command line program to control flat light source
'
Sub DoLightCommand(Command, Brightness)
    Dim FSO, FFLog, TID, ExitStat, LogStrm, CmdBuf, LogBuf, Tmo
    
    If LightCtrlProgram = "" Then Exit Sub                          ' Just a screen, no program to run!
    
    CmdBuf = Replace(Command, "#BRT#", Trim(CStr(Brightness)))      ' Assure no spaces 
    
    If Util.Prefs.PointingUpdates.Simulate Then                     ' Allow simulaton without hardware
        Console.PrintLine ""
        Console.PrintLine "  Simulating, " & FlatMode & " control info:"
        Console.PrintLine "    Command: " & CmdBuf
        Console.PrintLine "    Brightness: " & Brightness
        Console.PrintLine ""
        Exit Sub
    End If

    Set FSO = CreateObject("Scripting.FileSystemObject")
    ' =====================================================
    ' Docs say "same folder as control prog" but it's really the "current directory"
    ' whatever that is. For ACP, it's the ACP program directory. This needs to change
    ' in the control prog to be some safe place for Windows 7.
    '
    ''FFLog = FSO.GetParentFolderName(LightCtrlProgram) & "\FFLog.txt"  ' Alnitak log, if any
    FFLog = ACPApp.Path & "\FFLog.txt"                              ' Alnitak log, if any
    ' =====================================================
    On Error Resume Next
    FSO.DeleteFile FFLog
    On Error GoTo 0

    TID = Util.ShellExec(LightCtrlProgram, CmdBuf, 0)
    Tmo = 60
    While Util.IsTaskActive(TID)
        Util.WaitForMilliseconds 1000
        Tmo = Tmo - 1
        If Tmo <= 0 Then
            Console.PrintLine "Light control program never exited!"
            Exit Sub
        End If
    Wend
    ExitStat = Util.GetTaskExitStatus(TID)
    If ExitStat <> 0 Then
        Console.PrintLine "Light control command """ & CmdBuf & """ failed, exit status = " & ExitStat
        Exit Sub
    End If
    
    On Error Resume Next
    Set LogStrm = FSO.OpenTextFile(FFLog)
    If Err.Number <> 0 Then Exit Sub                                ' No Alnitak log, forget it
    On Error GoTo 0
    Console.PrintLine LogStrm.ReadAll()
    LogStrm.Close

End Sub

//tabs=4
/*jsl:option explicit*/
//------------------------------------------------------------------------------
//
// Script:       AcquireImages.js
// Author:       Robert B. Denny <rdenny@dc3.com>
// Version:      ===> 8.2.0 <=== CHANGE SCRIPTVERSION BELOW!
// Requires:     ACP 8.1 or later!
//               AcquireSupport 8.1.0 or later
//               Windows Script 5.6 or later
//
// Objects:      ACP.Scope, ACP.Util, ACP.Voice, ACP.FileDialog
//               NOVAS.*, MaxIm.CCDCamera, PinPoint.Plate, Kepler.*
//               ACP.AcquireSupport, ACP.SequenceToken, ACP.Plan,
//               ACP.Target.
//
// Environment:  This script is written to run under the ACP scripting
//               console. It assumes that the Scope, Util, and Voice 
//               objects are "built-in" and it assumes it has the use
//               of the ACP scripting console for I/O. It also assumes 
//               that it is being run via the WebServer and gets its
//               plans from the use's plans directory, and puts the log
//               to the user's logs directory.
//
//               NOTE: The Telescope, Util, Voice, and Console objects are
//                     pre-created by ACP and are usable by those names
//                     immediately upon entering any ACP-hosted script.
//
// Development Note:  Without JavaScriptLint this would not have been possible!
//
// Revision History:
//
// Date      Who    Description
// --------- ---    --------------------------------------------------
// xx-Jul-06 rbd    New script, rewritten from scratch in JS, using 
//                  external plan parser/container component.
// 30-Aug-06 rbd    4.3.2 - Improve error reporting for AcquireSupport init
//                  exceptions. Don't roll over cal images when GEM is looking 
//                  West. Add $MERSIDE to path/name substitution tokens. For cal
//                  images, change substitution for $TGTRA and friends from ""
//                  to "NoXxx".
// 12-Sep-06 rbd    4.3.3 - Fix no-filters case in file pathname construction.
// 30-Sep-06 rbd    5.0.1 - Last image JPEG support for new web pages
// 11-Oct-06 rbd    5.0.2 - Separate default file templates for web users
// 19-Oct-06 rbd    5.0.3 - For new ImageSet capabilities in Plan. Added $CNTNUM
//                  path token, changed templagtes to include this.
// 20-Oct-06 rbd    5.0.3 - Many small changes, move pointing update logic out of
//                  image set loops.
// 21-Oct-06 rbd    5.0.3 - Several changes to track mods to ACP.Plan which now  
//                  can be used from a separate plan checker script.
// 27-Oct-06 rbd    5.0.3 - Finish AcqCalImages() for new image sets feature,
//                  add count section to the cal file templates. Fix sequencing
//                  of cal images in several places.
// 01-Nov-06 rbd    5.0.3 - Add journal file for RSS feed
// 08-Nov-06 rbd    5.0.3 - Fix auto-flip before pointing update to use 1st
//                  exposure interval. Delete preview images before trying to
//                  create them, avoid MaxIm "File Exists" error. #chill now
//                  waits for up to 15 min, temp must be within 2 deg for 60 sec.
// 15-Nov-06 rbd    5.0.3 - Fix overlap slew/image download. File Open dialog for
//                  plans now recognized .pln and .plan and says "Obs plan files"
//                  Fix filter handling for no-filter case. Compiler gives NaN
//                  which chokes MaxIm.
// 17-Nov-06 rbd    5.0.3 - Display actual imaging time to one decimal place.
//                  Release Kepler and NOVAS objects in NearestSunset()
// 19-Nov-06 rbd    5.0.3 - Fix pre-slew for minor planet elements targets. New
//                  directive #calibrate. Change to SUP.TakePicture() for
//                  new #calibrate directive. 
// 20-Nov-06 rbd    5.0.3 - If the ImageSet length is 1, don't do requested AF 
//                  more than once per target. This preserves compatibility with
//                  old format plans that use #repeat and #autofocus, expecting
//                  that it will AF once for that target. Missed one place for
//                  post-focus pointing update.
// 23-Nov-06 rbd    5.0.4 - Added auto-resume, using new #completionstate.
//                  Handling of #startsetnum moved here, as it should be!
//                  Catch and display compiler exceptions (Plan.Read()). User
//                  actions that want to stop script no longer force a script
//                  error, the instead break out the same way that #quitat and
//                  friends do, allowing a clean wind-down and possible follow
//                  up tasks. UserActions.TargetStart() changed interface, now
//                  passes Plan and current Target object. Catch old UserActions
//                  in call to TargetStart() and TargetEnd().
// 24-Nov-06 rbd    5.0.4 - Implement chain-back for plan interrupts. Move target
//                  start UserAction call to the very beginning of the target 
//                  loop (but afer the "done" update!!!).
// 27-Nov-06 rbd    5.0.4 - Fix GetPlanStats(), wrong #repeat multiplication.
//                  Fix multiple places where target failures were breaking 
//                  out of the wrong looping level, terminating the plan. 
//                  Extend restart capability all the way down to the most inner
//                  (count) loop, giving restart down to the image! Change "image
//                  set" to "filter group". Remove "Calling target start/end"
//                  log messages.
// 28-Nov-06 rbd    5.0.4 - Explicitly release Plan and AcquireSupport objects,
//                  call new Plan.Term() method before releasing.
// 29-Nov-06 rbd    5.0.4 - Add logging of new #tags for targets
// 06-Dec-06 rbd    5.0.4 - Fix pre-slew logic to really wait for last image
//                  of current target. Wow!
// 07-Dec-06 rbd    5.0.5 - Prohibit non-admin web users from #shutdown
// 11-Dec-06 rbd    5.0.5 - Fix auto-cal for single image (misspelled)
// 12-Dec-06 rbd    5.0.5 - Fix finalImgSolveFail logic. Was not skipping
//                  subsequent attempts to solve after failing first one. 
//                  Add logic to carry final image solve skipping across targets
//                  which are within 1 arcmin of the previous (for old style
//                  plans). Fix case where the script errors out, leaving stale 
//                  restart info for inner loops in completionstatus. See note 
//                  at the start of the Target loop.
// 19-Dec-06 rbd    5.0.6 - Fix test for slew-distance pointiung update, no
//                  requirement for a next target.
// 20-Dec-06 rbd    5.0.6 - Oops, fix uncovered error, update current ephem
//                  in above case.
// 02-Jan-07 rbd    5.0.7 - Remove default exposure interval, no longer used.
// 19-Jan-07 rbd    5.0.8 - Change $DATENITE to switch dates at high noon
//                  instead of 12 hours after the sunset. NearestSunset() Is
//                  now called SunsetOfRun().
// 20-Jan-07 rbd    5.0.8 - $MERSIDE now subst's W/E/_ for brevity, $interval 
//                  now in whole degrees, zero-filled.
// 21-Jan-07 rbd    5.0.8 - Don't refocus between filters on one target if have
//                  filter info/focus offsets.
// 09-Feb-07 rbd    5.0.9 - Wrong test for more than one filter set in AG
//                  control. Turn off guider at target end if internal & filters.
//                  Fix target carry-over guiding for external guiders.
// 17-Jun-07 rbd    5.0.10 - TargetStart user action can now return an integer.
//                  To provide compatibility with old user actions, the first
//                  test is for true/false as before. But if True, then we test 
//                  for some non-zero numbers. See comments at TargetStart call
//                  site. Update ephemeris on start of target for TargetStart
//                  and slew closeness test. Catch case where all (or only) target 
//                  in a plan is skipped for any reason, #completionstate will
//                  end up with undefined for iRpt, iImgSet, and iCnt.
// 09-Aug-07 rbd    5.0.10 - Remove stray debugger statement. Reset the count, 
//                  imageset and repeat counters when the target completes,
//                  before calling TargetComplete. This assures the correct
//                  completion state if TargetComplete stops the run!
// 25-Sep-07 rbd    5.1.1 - For version 5.1. Fix WaitZenDist(). Fix #dir for
//                  relative paths. Autoguiding failure no longer stops plan, 
//                  will continue unguided.
// 26-Sep-07 rbd    5.1.1 - Fix AcqCalFrames for mixture of dark and bias (#dark
//                  but with zero and non-zero intervals in a count group.
// 27-Sep-07 rbd    5.1.1 - Adaptive AF logic moved here where it should be.
//                  Major reorganization of AutoFocus and AutoFlip logic. Now
//                  more efficient and simpler!
// 28-Sep-07 rbd    5.1.1 - Turn tracking off for #chill and #domexxxx. Add
//                  support for FlipConfig.txt to set pre/post flip margins.
// 05-Oct-07 rbd    5.1.2 - Add nominal/expected AF time to FlipConfig.
// 09-Oct-07 rbd    5.1.3 - Remove stray debugger statement.
// 17-Oct-07 rbd    5.1.4 (post 5.1) - Make relative #DIR relative to directory 
//                  template.
// 30-Oct-07 rbd    5.1.4 - Allow duskflats to be preceded by other directives.
// 01-Nov-07 rbd    5.1.4 - Use new SUP.GuiderRunning property, which works for
//                  both AO and conventional. Fix old reference to MaxAFTime
//                  instead of new MAXAFTIME from FlipConfig. Add missing
//                  WaitForSlews() after SafeSlewIf() calls for post AF return
//                  slew. Oops.
// 19-Nov-07 rbd    5.1.5 (HF3) Fix dusk/dawn flats to be real targets.
// 16-Mar-08 rbd    5.1.6 (HF4) Don't do FlipConfig if not GEM
// 03-Apr-08 rbd    5.1.7 (HF5) MINTRACKOFFSEC -> 600, do not turn off tracking
//                  for #waitfor. Turn off guider before doing dark/bias frames.
// 08-May-08 rbd    5.1.8 (HF6) Oops, TrackOffWaitFor() should not have long 
//                  MINTRACKOFFSEC. It was originally for Paramount which goofs
//                  if tracking turned off and on too quickly. So it now has its
//                  original meaning, and we have a new WUTRACKOFFSEC only for
//                  TrackOffWaitUntil(). TrackOffWaitFor() needed for AutoFlip!
//                  New ALWAYSSOLVEFINAL - if true, always try to solve final
//                  images instead of skipping after first failure. New RESUMEPLAN
//                  which can be set to false to prevent plans from starting where
//                  they left off.
// 16-Jun-08 rbd    5.1.9 (HF7) Add Voice global for user actions.
// 30-Sep-08 rbd    5.1.9 (HF7) Restart AO after every image. See comments.
//                  Change "horrendous" to "tricky" in comments. This could be
//                  seen by users on a script error, not so nice.
// 17-Oct-08 rbd    5.1.9 (HF7) Ignore, but report transient shutter errors 
//                  during opening and closing (DDW kludge).
// 22-Oct-08 rbd    5.1.9 - (HF7) Stop guider before stopping tracking in 
//                  TrackOffWaitxxx(). Set puDone flag after post-focus PU so
//                  final image plate solve won't update the corrector.
//                  Refactor Pointing Update logic so it happens after initial
//                  or per-target AF, avoiding needless PU at plan start, only
//                  to be followed by AF and another post-AF pointing update.
//                  Fix TargetCloseEnough() for case where slew settle time is 
//                  less than the longest possible telemetry poll time (5 sec)
//                  so there's enough time for the final destination coords in
//                  the scope to be read by ACP after a slew.
// 23-Oct-08 rbd    5.1.9 - (HF7) Final tweaks for filter logic and focus/pointing
//                  update refactoring. Adopt 0 as filter number for no-filter
//                  case throughout. Fix #domeopen so that it assues the dome
//                  is slaved in case it's parked or homed, or was unslaved by
//                  a rotation abort. "No filter" is now 0, used in AcqCalFrames
// 28-Oct-08 rbd    5.1.9 - (HF7) #domeopen and #domeclose, remove throws and 
//                  replace with T/F return from OpenDome() and CloseDome(). 
//                  Callers now see bool return and terminate run on false.
// 14-Jan-09 rbd    5.1.10 (HF8) - Avoid surprise flip during recenter after
//                  final image platesolve.
// 16-Jan-09 rbd    5.1.10 (HF8) - Change call to Plan.Init() now requires 
//                  ACPApp.Path for live mode. Allows existence checks for 
//                  #chainscript.
// 19-Jan-09 rbd    5.1.10 (HF8) - New SequenceToken (5.1) allows arbitrary 
//                  scripts to chain here to run a plan, then when done, chain 
//                  back to that calling script. Done to allow Scheduler shutdown
//                  script to run a dark/bias plan at the end of the night 
//                  (ShutdownObs).
// 22-Jan-09 rbd    5.1.10(HF8)  - Catch string ChainParameter from .NET which
//                  comes in here as a type of "object".
// 25-May-09 rbd    5.1.12 (HF9) - PathSubst() now handles multiple occurrences
//                  of tokens.
// 11-Jun-09 rbd    5.1.12 (HF9) Fix last/only image reporting of "Within max 
//                  error...". Force pointing updates above 70 dec if ptg corr off.
//                  Log ending UTC for flip wait. Fix SunsetOfRun() to return
//                  sunset at +/- 65 degrees if site is above the (ant)arctic
//                  circle.
// 10-Aug-09 rbd    5.1.13 (HF10) Fix image path substitution for localweb.
// 01-Oct-09 rbd    5.1.13 - Handle sub-polar (west-to-east) autoflipping (GEM:187).
//                  Add feature where #NOTIMECOMPRESS in comments for first
//                  target will disable the 10x time compression when running
//                  in simulator mode. This is mainly for me! Undocumented.
//                  Add fixed time needed for pointing update, for flip testing.
//                  This is to prevent a pointing update which is followed by
//                  a mount flip that we didn't do (and thus no post flip
//                  pointing update). This is GEM:185. More on this, Need to
//                  convert target coordinates to Local Topo to avoid tiny
//                  errors leading to flip failures when margins are zero!!!!
// 02-Oct-09 rbd    5.1.13 - Include post-flip pointing update time to auto-flip
//                  tests before auto-focus. Add pointing update time to flip
//                  config. Shorten default auto-flip parameters.
// 14-Oct-09 rbd    5.1.13 - GEM:211 Fix SafeSlerwIf() to always check for flip 
//                  then slew and rotate if will flip OR if not "close enough".
// 25-Oct-09 rbd    5.1.13 (HF10) - GEM:226, pick up places where J2000 scope
//                  was not handled, for example for Manual targets and in 
//                  AutoFlipIf(). GEM:129 PNG thumbnail and popup. GEM:258
//                  crosshatch avoidance is an option (from SUP.CrosshatchAvoidance).
//                  GEM:254 lightbox sizing, make text file with preview image
//                  dimensions for asystemstatus to construct a scaled lightbox.
// 08-Dec-09 rbd    5.1.14 (HF11) - GEM:333, GEM:339 - Fix #NOTIMECOMPRESS test
//                  for no targets and no comments.
// 02-Jan-10 rbd    5.1.14 (HF11) - GEM:357 Fix simulating PA. Oops, update 
//                  SCRIPTVERSION.
// 07-Jul-10 rbd    5.1.15 (6.0) - GEM:435 Fix subframing for dark/bias
// 08-Sep-10 rbd    5.1.15 (6.0) - GEM:436 Add tracing for auto-flip to help
//                  diagnose timing problems.
// 27-Sep-10 rbd    5.1.16 (6.0) - GEM 454 Fix completion state logic for case
//                  where loops are exited due to #quitat/#shutdownat, and the
//                  inner loop has reached its maximum. Reset to 0 was being 
//                  done at the wrong time.
// 01-Oct-10 rbd    5.1.16 (6.0) - GEM:406 Readout Mode control
// 01-Nov-10 rbd    6.0.1 (6.0) - GEM:408 Defocus option. Don't AG on sum of
//                  exposures if defocus != 0.
// 15-Nov-10 rbd    6.0.1 (6.0) - GEM:97 New global lastFWHM for ASP etc. Update
//                  this only after data image plate solves. GEM:118 add globals
//                  for set, repeat, and count an their max values, again for
//                  web System Status.
// 16-Nov-10 rbd    6.0.1 (6.0) - GEM:97, add comments to globals. Add guiding
//                  error arrays for asystemstatus.asp. Clear these arrays
//                  whenever the guider is stopped. This prevents old tracking
//                  data from being displayed. Update comment to that effect.
// 17-Nov-10 rbd    6.0.1 (6.0) GEM:118 (cont.), Add plan name to ASP globals.
//                  GEM:88 - Shared confoirmation thumbnails. Remove '~" from
//                  names, save to WebDocs\Images (parent of users' folders).
//                  GEM:493 Increase preview size to 1024 on long side.
// 18-Nov-10 rbd    6.0.1 GEM:388 Fix error reporting in TargetStart catch{}
//                  block 
// 21-Nov-10 rbd    6.0.1 - GEM:501 Honor new "disable aggregation" setting
//                  GEM:499 Avoid calling AutoFlipIf() during recenter if 
//                  mount is not GEM. Another instance of needless call to 
//                  AutoFliIf() as well. Fix a bunch of missing semicolons.
// 27-Nov-10 rbd    6.0.2 - No GEM, fix compress on/off for web users.
// 03-Jan-11 rbd    6.0.3 - GEM:543 Fix chaining to dusk/dawn flats and to scripts
//                  the webdocs\scripts folder is gone!
// 14-Jan-11 rbd    6.0.4 - GEM:560 DropBox friendly thumbnail/preview creation.
// 17-Jan-11 rbd    6.0.5 - GEM:552 Cache Lock properties at run start.
// 18-May-11 rbd    6.0.6 (6.0HF1) - GEM:597 report place in plan in the log
// 26-Jul-11 rbd    6.0.7 (6.0HF2) - GEM:670 Explicit flipping if flip-slew
//                  less than 0.5 deg, and mount reports CanSetPierSide = true;
// 08-Aug-11 rbd    6.0.8 (6.0HF2) - GEM:670 Reworked logic per Rob Hawley who
//                  found a hole. It's more robust now, no 0.5 deg hack.
// 25-Aug-11 rbd    6.0.8 (6.0HF2) - GEM:314 Move tracking graph history arrays
//                  and support code to AcquireSupport. Now shared with 
//                  AcquireScheduler. This refactor removed lots of little bits
//                  of code. Improvement!
// 17-Sep-11 rbd    6.0.8 (6.0HF2) - GEM:526 #waituntil for sun down angle
// 19-Sep-11 rbd    6.0.8 (6.0HF2) - GEM:703 #alwayssolve directive. GEM:677
//                  fix infinite recursion if only web template in ImageFileConfig.
// 21-Sep-11 rbd    6.0.8 (6.0HF2) - GEM:698 Reduce popup preview to max 640 pix.
// 21-Sep-11 rbd    6.0.8 (6.0HF2) - GEM:708 Prevent infinite recursion in 
//                  CreateFolder()
// 20-Oct-11 rbd    6.0.9 (6.0HF3) - GEM:719 throw needs an Error object to be
//                  properly trapped and reported.
// 23-Oct-11 rbd    6.0.9 (6.0HF3) Reduce PA slop to 0.2 deg (Adam Block)
// 29-Feb-12 rbd    7.0.1 (7.0) - GEM:810 Fix AutoFlipIf to use current image
//                  set exposure interval. 
// 30-Mar-12 rbd    7.0.1 (7.0) - GEM:826 Prefs.Autoguiding.ExternalGuider is gone
//                  use SUP.ExternalGuider (provided for convenience). 
// 20-Jun-12 rbd    7.0.1 (7.0) - GEM:823 Pre/Post flip info from new ACP properties
//                  which are in minutes. No more AF and PU times so make a bit
//                  more conservative here.
// 12-Jul-12 rbd    7.0.1 (7.0) - GEM:534, #chill now takes optional tolerance,
//                  failure to reach temp now stops plan with error.
// 13-Jul-12 rbd    7.0.1 (7.0) - GEM:530 add #nopointing and #nosolve directives.
//                  GEM:752 #afinterval now includes plan-start autofocus
// 18-Jul-12 rbd    7.0.1 (7.0) - GEM:774 New directive #noweather, Don't log
//                  PinPoint settings for pointing/final. Rarely used.
// 19-Jul-12 rbd    7.0.1 (7.0) - GEM:741 Fix AutoFlipIf logic to end plan on
//                  #quitat time.
// 30-Jul-12 rbd    7.0.1 (7.0) - GEM:690 Add additional logging at startup and
//                  at time of dither. Fix earlier mistake when disabling PinPoint
//                  logging.
// 01-Jul-12 rbd    7.0.1 (7.0) - GEM:829 Optimize guider starts and guide-noguide
//                  test (aggregation) for off-axis guiding (no filter changes).
// 12-Sep-12 rbd    7.0.1 (7.0) - GEM:857 Config files may  now reside in old or 
//                  new UAC-friendly locations, via Util.GetConfigFilePath().
// 21-Jan-13 rbd    7.0.2 (7.0) - No GEM Don't speak "===" when starting groups
// 04-Feb-13 rbd    7.0.2 (7.0) - NOMINAL times are MAX times. Change names. 
//                  Do not wait for entire image is PtgUpd will fit before flip
//                  point, including centering slew. Allow one more image which
//                  could track past the meridian. Do not allow next exposure to
//                  be started past the flip point without flipping, even if it
//                  would fit before "track past" limit. GEM:922 Finally, catch a
//                  wraparound condition on sub-polar flip wait. Wow!
// 13-Sep-13 rbd    7.1.1 (7.1) - GEM:998 process thumbnail and last image PNG
// 08-Oct-13 rbd    7.1.1 (7.1) - GEM:998 Add RemoveGradient() as step 3
// 25-Oct-13 rbd    7.1.1 (7.1) - GEM:1029 Fix defaulting to no-name template
//                  for web users. Fix template extraction of specifically named
//                  template.
// 29-Oct-13 rbd    7.1.1 (7.1) - GEM:996 Fix more '0' log lines (& vs +)
// 30-Oct-13 rbd    7.1.1 (7.1) - GEM:955 More speaking of equal signs!
// 04-Oct-13 rbd    7.1.1 (7.1) - GEM:1035 Correct printing of pointing updates
//                  disabled message, remove old commented out lines in the area.
// 23-Jun-14 rbd    7.2.1 (7.2) - GEM:1117 New logic for #screenflats directive.
// 11-Jul-14 rbd    7.2.1 (7.2) - No GEM, fix call to Dome.Slave() which is wrong.
// 12-Jul-14 rbd    7.2.1 (7.2) - GEM:1140 Util.IsGEMDestinationWest() needs Dec.
// 24-Jul-14 rbd    7.2.1 (7.2) - GEM:703 Allow new Prefs.AlwaysSolveDataImages
//                  to force solving after failure, like #alwayssolve in plan.
// 06-Aug-14 rbd    7.2.1 (7.2) - GEM:1153 Fix CreateFolder() to safe against 
//                  illegal characters, and to make the throw() actually report
//                  the error (more of same from GEM:719). Found three other
//                  incorrect throw() statements as well. GEM:838 Only final 
//                  images counted in FWHM stats. Change to SUP.SolvePlate().
// 07-Aug-14 rbd    7.2.1 (7.2) - GEM:1153 Use try/catch and report the error
//                  nicely guessing illegal chars.
// 19-Mar-15 rbd    8.0.1 (8.0) - GEM:841 redux - Turn off tracking even if it
//                  says it's off (avoid "tracking custom rate" in TheSky).
// 19-Mar-15 rbd    8.0.1 (8.0) - GEM:1212 Add support for #nopreview directive.
// 18-May-15 rbd    8.0.2 (8.0) - GEM:1346 Allow cal frames in unsafe weather
// 24-May-15 rbd    8.0.3 (8.0) - GEM:340 $TEMP is monsterous number if cooler
//                  is off, substitude "NoTemp" for that.
// 22-Oct-15 rbd    8.0.4 (8.0sr1) - GEM:1274 Remove old commented out BigDome code.
// 22-Apr-16 rbd    8.0.5 (cust) - GEM:956 Fix WaitForRise()
// 27-Apr-15 rbd    8.0.6 (cust) - GEM:1458 Add AcquireImage user action for 
//                  spectrograph and other specialized imaging.
// 28-Apr-16 rbd    8.0.7 (cust) - GEM:1459 Post focus PU after second and later
//                  AF on same target.
// 26-Jun-16 rbd    8.1.0 - GEM:962 Readout mode for dark and bias frames
//                  Fix multiple declaration of variable 'ret' (lint issue only)
// 08-Jul-16 rbd    8.1.0 - GEM:1458 Make missing new AcquireImage user action
//                  harmless. Otherwise everyone will need to edit their UA.
//                  Left ugly caution message in there for next time.
// 03-Aug-16 rbd    8.1.0 - GEM:925 for AutoFocus on Flip. Adds a parameter to 
//                  AutoFlipIf()
// 06-Aug-16 rbd    8.1.0 - GEM:1489 RESUMEPLAN constant now Prefs.DisablePlanResume
//                  GEM:1391 Add wait for flip status to the web System Status
// 10-Aug-16 rbd    8.1.0 - GEM:1437 Leave the preview until a new image is 
//                  completed.
// 14-Aug-16 rbd    8.1.0 - GEM:932 Fix obscure target sequencing bug when next
//                  next target is across flip point. Do not recenter on pointing
//                  error when last image of current target.
// 30-Sep-18 rbd    8.2.0 (8.2) - GEM:1564 Speed preview generation by doing 
//                  beautification afger downsizing.
//------------------------------------------------------------------------------

//
// Constants
//
var SCRIPTVERSION = "8.2.0";
var IMGPATH = 0;                                                            // Path substitution type codes (3)
var CALPATH = 1;
var LOGPATH = 2;
var MINTRACKOFFSEC = 30;                                                    // Wait must be this long for tracking off
var WUTRACKOFFSEC = 600;                                                    // TrackOffWaitUntil turns off tracking for waits longer than this
var DEGRAD = 0.0174532925;                                                  // Just PI/180
var SIDRATE = 0.9972695677;                                                 // synodic/solar seconds per sidereal second
var EXTMSG = " would extend past plan quit time, skipped";
var DEF_IMG_TMPL = "$DEFPATH\\$DATENITE\\$TGTNAME-S$SETNUM-R$RPTNUM-C$CNTNUM-$FILTER";
var DEF_CAL_TMPL = "$DEFPATH\\$DATENITE\\Calibration\\$TGTNAME-S$SETNUM-R$RPTNUM-C$CNTNUM-B$BINNING";
var DEF_LOG_TMPL = "$LOGPATH\\$DATENITE\\$DATEUTC@$TIMEUTC";
var DEF_IMG_TMPL_WEB = "$DEFPATH\\$DATENITE\\$TGTNAME-S$SETNUM-R$RPTNUM-C$CNTNUM-$FILTER";
var DEF_CAL_TMPL_WEB = "$DEFPATH\\$DATENITE\\Calibration\\$TGTNAME-S$SETNUM-R$RPTNUM-C$CNTNUM-B$BINNING";
var DEF_LOG_TMPL_WEB = "$LOGPATH\\$DATENITE\\$DATEUTC@$TIMEUTC";
var PREFLIPMARGIN = 300;                // Allow 3 minutes for image d/l, plate solving, guider start, and flip point errors
var POSTFLIPMARGIN = 120;               // Let target drift 2 min past flip point before flip-slewing
var MAXAFTIME = 180;                    // Maximum expected autofocus time (for flipping)
var MAXPUTIME = 120;                    // Maximum expected time to do a pointing update (for flipping)
var THUMB_FILE = "pvimage.png";                                             // Running plan thumbnail image for web
var NP_THUMB_FILE = "nppvimage.png";                                        // #nopreview thumbnail image for web
var LSTPNG_FILE = "lastimage.png";                                          // Post-plan "last image" PNG for web
var NP_LSTPNG_FILE = "nplastimage.png";                                     // #nopreview "last image" PNG for web
var LSTDIM_FILE = "lastimage.txt";                                          // Companion file with image dimensions
var NP_LSTDIM_FILE = "nplastimage.txt";                                     // Companion file with image dimensions
var NUMGUIDEPTS = 80;                                                       // Number of guide error points kept in history                  
var forReading = 1;                                                         // FileSystemObject file access codes
var forWriting = 2;
var AFI_NOFLIP = 0;                                                         // Return values for AutoFlipIf()
var AFI_DIDFLIP = 1;                                                        // See comments there
var AFI_QUITAT = 2;
//
// Enhance String with a trim() method
//
String.prototype.trim = function()
{
    return this.replace(/(^\s*)|(\s*$)/g, "");
};

//
// Enhance DateTime with a addSeconds() method
//
Date.prototype.addSeconds = function(sec)
{
    return new Date(this.getTime() + (sec * 1000));
};

//
// Enhance DateTime with a UTC time-only string conversion
//
Date.prototype.toUTCTimeString = function()
{
    var h = this.getUTCHours().toString();
    if(h.length == 1) h = "0" + h;
    var m = this.getUTCMinutes().toString();
    if(m.length == 1) m = "0" + m;
    var s = this.getUTCSeconds().toString();
    if(s.length == 1) s = "0" + s;
    return h + ":" + m + ":" + s + " UTC";
};

//
// Control variables
//
var FSO, SUP, SEQTOK;
var LockUser;                                                               // Cached lock properties, hack for lock lossage
var LockOwner;
var LocalUser;                                                              // True for local use, false for web
var LocalWeb;                                                               // True if web and special "localweb" user
var WebAdmin;                                                               // True if web and user is administrator
var ClearFilter;                                                            // Shortcut for config'd clear filter
var ImgDirTemplate, ImgFileTemplate;                                        // Used in file path/name construction
var CalDirTemplate, CalFileTemplate;
var LogDirTemplate, LogFileTemplate;
var PlanRunDate;
var DarkSeq, BiasSeq;                                                       // Sequence numbering for cal frames
var DoCompress = false;                                                     // true -> Compress image files
var InitPUDone = !Prefs.PointingUpdates.Enabled;                            // If PU enabled, request initial PU
var PerAFTime = null;                                                       // [sentinel] Date object: next periodic AF time
var tgtMinBrt, tgtSigma, tgtCatMax;                                         // Final image platesolve parameters, from prefs
var HardwarePierSide;                                                       // True if scope reports both pier side and destination
var CanExplicitlyFlip;                                                      // true if we can do a commanded flip on this scope

// ------------------------------------------------------------------------------------------------------------------------------------
//
// Globals used by ASP web pages (Util.Script.xxx). Mostly used in the 
// support ASP script for the web system status display, asystemstatus.asp.
//
var planName;                                                               // File name of current plan (no .txt)
var previewImage;                                                           // Physical path to preview image
var targetName;                                                             // Current plan target name
var targetRA;                                                               // RA/Dec of current target
var targetDec;
var lastFWHM;                                                               // FWHM from last DATA image plate solution
var curSet;                                                                 // Current plan set number
var maxSet;                                                                 // Total sets in the plan
var curTarget;                                                              // Current target NUMBER in the plan
var maxTarget;                                                              // Total number of targets in the plan
var curRepeat;                                                              // Current repeat number in the current target
var maxRepeat;                                                              // Total number of repeats for the target
var curFilter;                                                              // Name of filter for current image set
var curImgSet;                                                              // Current image set NUMBER
var maxImgSet;                                                              // Total number of image sets for this target
var curCount;                                                               // Current image number for this target/image set/repeat
var maxCount;                                                               // Total nuumber of images being acquired for the above
var isPointing;                                                             // True if a pointing update is being performed.
var isFlipWaiting;                                                          // True if waiting for a flip
//
// ------------------------------------------------------------------------------------------------------------------------------------

//
// Voice global for user actions
//
var voiceForUA;

// Unused for this, as aborting allows restart with context.
function alert()
{
    Console.PrintLine("== Alert == This has no effect on this script");
}

// ==========
// MAIN ENTRY
// ==========

function main()
{
    //
    // Control variables, scoped to main()
    //
    var InitPUDone = !Prefs.PointingUpdates.Enabled;                        // If PU enabled, request initial PU
    var PerAFTime = null;                                                   // [sentinel] Date object: next periodic AF time
    var iTgt0;                                                              // Target starting index
    var iRpt0;                                                              // Repeat starting index
    var iImgSet0;                                                           // Filter Group starting index
    var iCnt0;                                                              // Count starting index
    var plnFile;                                                            // Observing plan file path/name
    var plnName;
    var imgFile;                                                            // Full path/name of current image file
    var buf;                                                                // Used all over the place
    var imgRootPath;                                                        // Path to web preview images (webdocs\images)
    var ret;                                                                // Used locally several times

    FSO = new ActiveXObject("Scripting.FileSystemObject");
    SEQTOK = null;                                                          // [sentinel]
    LockUser = Lock.Username;                                               // Cache Lock properties (hack)
    LockOwner = Lock.Owner;
    LocalUser = (LockUser == "local_user");                                 // Shortcut for logic in multiple places
    LocalWeb = (LockUser == "localweb");                                    // Same here
    WebAdmin = !LocalUser && Lock.WebUser.IsAdministrator;                  // And here
    PlanRunDate = SunsetOfRun();                                            // Needed by path/name construction engine
    voiceForUA = Voice;
    isPointing = false;                                                     // For web system status
    isFlipWaiting = false;
    
    PREFLIPMARGIN = -Prefs.GEMTrackPastMinutes * 60;                        // Old units (sec.)/sign from new ACP7 UI/Prefs
    POSTFLIPMARGIN = Prefs.GEMPostFlipMargin * 60;                          // Old units (sec.) from new ACP7 UI/Prefs

    if(LocalUser || LocalWeb)
        DoCompress = false;
    else
        DoCompress = Lock.WebUser.WantsCompress;
    
    //
    // Set up plan path name.  Here, we also look for a 
    // ChainParameter, which may be a SequenceToken or a string 
    // observing plan file. Any SequenceToken MUST contain an
    // observing plan file! Use of a chain parameter is identical
    // for local and web users.
    //
    // NOTE: If a .NET program references ACP then assignes a System.String
    // to Util.ChainParameter, it appears here as type "object" instead
    // of "string". So if it is an object and doesn't have an ObservingPlan
    // property we assume it's a string from a .NET caller. 
    //
    if(Util.ChainParameter !== null && typeof Util.ChainParameter == "object")  // If true, this is a sequence token
    {
        SEQTOK = Util.ChainParameter;                                       // Grab it for our uses (offload ACP.Util)
        plnFile = SEQTOK.ObservingPlan;                                     // MUST have observing plan
        if(plnFile == undefined) {                                          // OOPS! Wasn't really a token, hmm...
            plnFile = SEQTOK.toString();                                    // Strings assigned to ChainParameter in .NET
            SEQTOK = null;
        }
    }
    else if(typeof Util.ChainParameter == "string")                         // String, assume it's the obs plan path
    {
        plnFile = Util.ChainParameter;                                      // Just use the passed plan
    }
    else
    {
        var fns;
        if(LocalUser)
        {
            //
            // Console-activated startup for local user only
            //
            var runOnceFile = Prefs.LocalUser.DefaultPlanDir + "\\runplanonce.txt"; // "run once" file (has actual plan path)
            if(FSO.FileExists(runOnceFile))                                 // If "run once" file exists
            {
                fns = FSO.OpenTextFile(runOnceFile, forReading);            // Open it, And
                plnFile = fns.ReadLine();                                   // Read the path of the plan to run
                fns.Close();                                                // Close it
                FSO.DeleteFile(runOnceFile);                                // Delete it
            }
            else                                                            // If no "run once", Then
                plnFile = Prefs.LocalUser.DefaultPlanDir + "\\default.txt"; // Try for default.txt
            if(!FSO.FileExists(plnFile))                                    // If the run once or default plan isn't there...
            {
                FileDialog.DefaultExt = ".txt";                             // Use the file browser
                FileDialog.DialogTitle = "Select a plan file";
                FileDialog.Filter = "Obs plan files (*.txt *.pln *.plan)|*.txt;*.pln;*.plan|All files (*.*)|*.*";
                FileDialog.FilterIndex = 1;
                FileDialog.Flags = 4096 + 4;                                // Must exist and hide read only
                FileDialog.InitialDirectory = Prefs.LocalUser.DefaultPlanDir;
                if(!FileDialog.ShowOpen()) return;                          // (cancelled)
                plnFile = FileDialog.FileName;                              // Plan pathname
            }
        }
        else
        {
            //
            // Startup from a web page. In this case, the plan path comes
            // from a known temporary file generated by the web page ASP
            // and which starts with ~ to hide it from web-generated
            // directory listings. It's deleted after use anyway so strictly
            // speaking it doesn't need the ~ but...
            //
            if(LocalWeb)                                                    // If "use web browser" user
                buf = Prefs.LocalUser.DefaultPlanDir;                       // Webserver maps to My Documents\Plans (typ.)
            else
                buf = Prefs.WebRoot + "\\plans\\" + LockUser;
            buf += "\\~plan-to-use.txt";
            fns = FSO.OpenTextFile(buf, forReading);                        // Open the relay file
            plnFile = fns.ReadLine();                                       // Read the actual plan file name
            fns.Close();
            FSO.DeleteFile(buf);                                            // Zap the relay file
        }
    }
    Util.ChainParameter = null;                                             // Assure no fossils here!
    //
    // We have the plan file, cache the name only for substitution & logging
    //
    planName = FSO.GetFileName(plnFile);
    
    //
    // Set up the log file path/name. The difference is handled by
    // the file path/name substitution engine.
    //
    InitFilePathName(LOGPATH);
    Console.LogFile = MakeFilePathName(LOGPATH, null, null, 0, 0, 0, 0, planName) + ".log";    
    Console.Logging = true;                                                 // === BEGIN LOGGING ===
    Console.PrintLine("Logging to " + Console.LogFile);                     // Above InitFilePathName() not logged!
    
    InitFilePathName(IMGPATH);                                              // Initialize the file path/name construction engine
    InitFilePathName(CALPATH);                                              // (for image, cal templates - log above)
    
    //
    // Initialize the support library
    //
    try {
        SUP = new ActiveXObject("ACP.AcquireSupport");
    } catch(e) {
        if(e.description.indexOf("can't create object") != -1)
        {
            Console.PrintLine("It appears that AcquireSupport is not registered with Windows");
            Console.PrintLine("Find AcquireSupport.wsc in the ACP install folder, right click");
            Console.PrintLine("on it, and select Register. Then try running your plan again");
        }
        else
        {
            Console.PrintLine("There is a problem with the script support library:");
            Console.PrintLine("    [" + e.description + "]");
            Console.PrintLine("If the above error message is not an obvious clue, contact");
            Console.PrintLine("DC-3 Dreams customer support on the Comm Center");
        }
        SUP = null;
        return;
    }
    try {
        //
        // We initialize here even in unsafe weather, so we can compile
        // the plan and check for darks/biases only. If the plan has no
        // light images, then it can run in unsafe weatrher (dome closed). 
        // Otherwise we check the weather and stop the run after that check.
        //
        SUP.InitializeUnsafeWeather();                                      // We check weather later 
    } catch(e) {
        if(e.number == 0x8004000A)                                          // Thrown from SUP.Initialize for config problems
            Console.PrintLine("Startup failed:");
        else
            Console.PrintLine("There was a problem initializing the support library:");
        Console.PrintLine("  " + e.description);
        SUP = null;
        return;
    }
    
    Console.PrintLine("This is AcquireImages V" + SCRIPTVERSION);

    if(Telescope.AlignmentMode == 2)                                        // If GEM
    {                                                                       // (SUP.Initialize() guarantees scope is connected)
        CanExplicitlyFlip = false;                                          // Assume we can't do a commanded flip
        try {
            var xyzzy = Telescope.SideOfPier;
            xyzzy = Telescope.DestinationSideOfPier(Telescope.RightAscension, Telescope.Declination);
            HardwarePierSide = true;
            CanExplicitlyFlip = Telescope.CanSetPierSide;                   // Final condition
            Console.PrintLine("Hardware pier side reporting is available.");
            if(CanExplicitlyFlip) Console.PrintLine("This mount can be flipped on command.");
        } catch(e) { }
            
    }

    // =============
    // COMPILE PHASE
    // =============
    //
    // **TODO** Pluggable plan readers for plans, RTML, 
    // other programs like CCDAP, CCDC ???)
    //
    Console.PrintLine("Compiling plan...");
    var Pl = new ActiveXObject("ACP.Plan");
    var pok = false;
    try {                                                                   // Catch errors in plan parser too
        Pl.Init(Util, SUP, LockUser, true, ACPApp.Path);                    // Initialize for live use
        pok = Pl.Read(plnFile);
    } catch(ex) {
        Console.PrintLine("Compiler error: " + (ex.description ? ex.description : ex));
    }
    if(!pok) {
        Console.PrintLine("Run ending due to plan errors");
        return;
    }
    Console.PrintLine("...plan OK!");
    //
    // Check the plan to see if it has any light images. If so then we must
    // enforce the safe weather requirement here.
    //
    var hasLight = false;
    if(Pl.Targets.length > 0)
    {
        for(var it = 0; it < Pl.Targets.length; it++)
        {
            if(!Pl.Targets[it].NonImage && !Pl.Targets[it].CalFrame)
            {
                hasLight = true;
                break;
            }
        }
    }
    if(hasLight && Weather.Available && !Weather.Safe)                      // Need safe weather
    {
        Console.PrintLine("** The weather is unsafe, cannot continue.");
        return;
    }
    //
    // Set inner loop indexer starting points based on completion state
    // Sets loop never recycles, it is monotonic increasing
    //
    iTgt0 = Pl.TargetsCompleted;
    iRpt0 = Pl.RepeatsCompleted;
    iImgSet0 = Pl.FilterGroupsCompleted;
    iCnt0 = Pl.CountsCompleted;
    if(iTgt0 || iRpt0 || iImgSet0 || iCnt0)
        Console.printLine("== Resuming interrupted plan ==");
        
    // =============
    // EXECUTE PHASE
    // =============
    
    //
    // Replace null QuitAt with some time way in the future for
    // the zillions of quit time checks...
    //
    if(Pl.QuitAt === null) Pl.QuitAt = new Date("01 Jan 2050 00:00:00 UTC");

    //
    // Check for #NOTIMECOMPRESS in comments, this will disable time compression
    // if simulated images are present. Used (e.g.) for meridian flip testing.
    //
    if(Pl.Targets.length > 0)
    {
        var cLines = Pl.Targets[0].Comments;                                // OK if cLines.length === 0
        for(i in cLines)
        {
            if(cLines[i].search(/#NOTIMECOMPRESS/g) != -1)
            {
                SUP.SimImageTimeCompress = false;
                break;
            }
        }
    }
    //
    // Log settings, etc. then announce start of run
    //
    var pso = GetPlanStats(Pl);
    var sot = pso.totTime / 60;
    if(sot ===  0) sot = 1;
    Console.PrintLine("This plan has " + pso.nTgt + " live target(s), " + pso.nImg + " images");
    Console.PrintLine("There are " + Util.FormatVar(sot, "0.0") + " min. of actual imaging time");
    if(Prefs.PointingUpdates.Simulate)
    {
        Console.PrintLine("Using simulated images.");
        if(SUP.SimImageTimeCompress)
            Console.PrintLine("Exposure times will be 10% of the real time.");
    }
    Console.PrintLine("Image file set-numbers start with " + Pl.StartSetNum);
    if(Pl.SetMinTime > 0)
        Console.PrintLine("Sets will take a minimum of " + Util.FormatVar(Pl.MinSetTime, "Hh:Nn:Ss"));
    if(Pl.AFinterval > 0)
    {
        Console.PrintLine("Periodic auto focus every " + Pl.AFinterval + " min.");
        Console.PrintLine("(includes a plan-start auto focus)");
    }
    if(Pl.AlwaysSolve)
        Console.PrintLine("Failure to solve a data image will not stop solving (always solve)");
    if(!Prefs.PointingUpdates.Enabled)
        Console.PrintLine("Automatic pointing updates are disabled");
    if(Prefs.DisableFinalSolve)
        Console.PrintLine("  (plate solving is disabled)");
    else
    {
        tgtMinBrt = parseFloat(Profile.GetValue("minbrt", "", 0));
        tgtSigma = parseFloat(Profile.GetValue("sigma", "", 3));
        tgtCatMax = parseFloat(Profile.GetValue("catmax", "", 18));
    }
        
    Console.PrintLine("Starting run for plan " + planName + "...");
    Voice.Speak("Starting run.");
    SUP.JournalForRSS("Run Started", LockOwner + " has started a run consisting of " + pso.nImg + 
            " image(s) of " + pso.nTgt + " target(s), with " + sot + " min. of actual imaging time.");
    
    //
    // Complete our setup
    //
    Camera.BinX = 1;
    Camera.BinY = 1;
    ClearFilter = Prefs.CameraPrefs.ClearFilterNumber;                      // Provide clear filter # for filter defaulting in plan
    try {
        Telescope.SlewSettleTime = Prefs.SlewSettleTime;                    // Scope may not supportt this
    } catch(e) { }
    
    if(Pl.AFinterval > 0) 
    {
        PerAFTime = new Date().addSeconds(-10);/*.addSeconds(Pl.AFinterval * 60);*/ // Per AF at plan start, now!
        Console.PrintLine("Autofocus will be done every " + Pl.AFinterval + " min.");
    }
    
    //
    // As of 6.0, preview images go into WebDocs\Images no matter who/what
    // is running the plan. The  web UI always looks there.
    //
    imgRootPath = Prefs.WebRoot + "\\images\\";
    previewImage = imgRootPath + THUMB_FILE;

//     SafeDeleteFile(previewImage);                                           // Zap any old preview thumbnail
//     SafeDeleteFile(imgRootPath + LSTPNG_FILE);                              // Zap any old "last image JPEG" (used by single-image web)
//     SafeDeleteFile(imgRootPath + LSTDIM_FILE);                              // Zap any old last image dims file (used by single-image web)

    // ========
    // Set Loop
    // ========
    //
    maxSet = Pl.Sets;                                                       // Global for web
    Sets: for(var iSet = Pl.SetsCompleted; iSet < Pl.Sets; iSet++)          // ==LABEL==
    {
        Pl.SetsCompleted = iSet;
        curSet = iSet + 1;                                                  // Global for web
        if(!Prefs.DisablePlanResume) Pl.UpdateCompletionState();            // Update completion status in plan file
        
        var nxtNeedPU = false;                                              // True if next target needs a PU (tgts may be skipped)
        var curNeedPU = false;                                              // True if this target needs a PU

        DarkSeq = BiasSeq = 0;                                              // Reset Dark/Bias sequence numbers
        
        var setEndTime = null;                                              // [sentinel] Assume no wait at set end
        if(Pl.Sets > 1)
        {
            Console.PrintLine("==== Starting set " + (iSet + 1) + " of " + Pl.Sets + " ====");
            //
            // Calculate earliest end-time for this set if a #setloopmintime
            // was given. Don't do this for the last set, of course. 
            //
            if(iSet < (Pl.Sets - 1) && Pl.MinSetTime > 0)                   // If a set loop min time given
            {
                setEndTime = new Date().addSeconds(Pl.MinSetTime * 3600);   // Don't end this set till this time
                Console.PrintLine("  Set will end at " + setEndTime.toUTCTimeString() + " or later");
            }
        }
        // ===========
        // Target Loop
        // ===========
        //
        var finalImgSolveFail = false;                                      // Start out doing final image solves
        maxTarget = Pl.Targets.length;                                      // Global for web
        Targets: for(var iTgt = iTgt0; iTgt < Pl.Targets.length; iTgt++)    // ==LABEL==
        {
            var i, j, z;
            var slewNext, rotNext;
            var puDone = false;                                             // Used to ask for corrector update
            
            // ------------
            // Target Setup
            // ------------
            var Tc = Pl.Targets[iTgt];                                      // Tc will be current target object
            Tc.UpdateEphem();                                               // Update ephemeris now for some initial checks and TargetStart
            var Tn;                                                         // Tn is next target or null
            if(iTgt < Pl.Targets.length - 1)
                Tn = Pl.Targets[iTgt + 1];
            else
                Tn = null;
            
            //
            // Restart handling (typ.) Must precede any break conditions!
            //
            Pl.TargetsCompleted = iTgt;
            curTarget = iTgt + 1;                                           // Global for web
            curRepeat = undefined;                                          // Not repeating yet
            curImgSet = undefined;                                          // Nice for web displays
            curCount = undefined;
            //
            // Here, we pick up the resets to zero of inner loops after
            // a restart with non-zero (re)starting points. After the non-zero
            // start of the inner loop, the starting point for that loop
            // is reset to 0 (like the iTgt0 = 0 below). This prevents stale
            // starting point counts in the inner loops (typ.)
            //
            Pl.RepeatsCompleted = iRpt0;
            Pl.ImageSetsCompleted = iImgSet0;
            Pl.CountsCompleted = iCnt0;
            if(!Prefs.DisablePlanResume) Pl.UpdateCompletionState();        // Update completion status in plan file
            iTgt0 = 0;                                                      // Recycle to start at 0 on next loop start
            
            if(new Date() >= Pl.QuitAt) break Sets;                         // Stop if QuitAt time reached
            
            //
            // Call the TargetStart user action. Catch old UserActions
            // and warn about change. Return of false means end plan,
            // 2 means skip target, anything else means press on.
            //
            if(SUP.UserActions !== null)
            {
                try {                                                       // Catch old UserActions
                    i = SUP.UserActions.TargetStart(Pl, Tc, Tn);            // Get return value (now may be numeric)
                    if(!i) {                                                // If false or 0, act as before
                        Console.PrintLine("**User action TargetStart returned False");
                        break Sets;
                    }
                    if(i == 2)                                              // If TargetStart returned 2, it's a "skip target"
                        continue Targets;                                   // Next target
                } catch(ex) {
                    Console.PrintLine("**" + ex.message + ". Cannot do TargetStart.");
                }
            }

            if(new Date() >= Pl.QuitAt) break Sets;                         // Stop if QuitAt time reached
            
            //
            // Target setup (cont.)
            //
            if(Tc.NonImage)
                Console.PrintLine("==== " + Tc.Name + " ====");             // The name describes the operation
            else if(Tc.CalFrame)
                Console.PrintLine("==== Calibration frame(s) ====");        // Log that this is a cal pseudo-target
            else
                Console.PrintLine("==== Starting target " + Tc.Name + " ===="); // Log start of this target
                
            for(i = 0; i < Tc.Comments.length; i++)                         // Echo this target's comments 
                Console.PrintLine(Tc.Comments[i]);
            if(Tc.Tags) {                                                   // Echo any tags for this target
                Console.PrintLine("Tags for " + Tc.Name + ":");
                for(var key in Tc.Tags)
                    Console.PrintLine("      " + key + "=" + Tc.Tags[key]);
            }
            
            //
            // Optimize skipping final image solves across old-style plans
            // where the same target appears multiple times in a row. The 
            // idea is to remember finalImageSolveFail across these targets
            // by comparing previous and current target's coordinates. If 
            // they are "close" don't reset the finalImgSolveFail flag for
            // this (same) target
            //
            if(iTgt > iTgt0)                                                // If on second or later (even after restart)
            {
                var Tp = Pl.Targets[iTgt - 1];                              // Previous target
                if(SUP.EquDist2(Tc.RA, Tc.Dec, Tp.RA, Tp.Dec) > 0.0166667)  // If more tnan one arcminute different
                    finalImgSolveFail = false;                              // Try at least one final image solve
                else if(finalImgSolveFail)
                    Console.PrintLine("  Same as prev target, continue skipping final image solves");
            }

            targetName = Tc.Name;                                           // Fill in globals for ASP pages
            targetRA = Tc.RA;
            targetDec = Tc.Dec;
            
            //
            // This may be a carry-over guiding if external guider
            //
            if(SUP.Guiding && (iTgt == iTgt0 || (Prefs.AutoGuiding.SensorType == 1))) // Stop guider the 1st target of the plan or always for internal guider
            {
                Console.PrintLine("  (internal guider, prepare for filter change)");
                SUP.AutoGuide(false);                                       // Assure guiding off
            }
            if(SUP.DoingOffsetTracking) SUP.SetTrackOffset(0, 0);           // Assure track offset off
            
            if(Tc.Stack && (Telescope.AlignmentMode == 2) && Prefs.DisableGEMImageFlip)
            {
                Console.PrintLine("**Cannot stack images, GEM Image Auto-Flip is disabled.");
                Tc.Stack = false;
                Tc.Align = false;
            }
    
            //
            // Tracking control: We attempt to keep tracking off for a possible
            // run of cal frames, leave it off or on for non-image pseudo targets
            // and make sure it is on for real light-frame targets. To further 
            // optimize tracking switches, we turn it off for cal frames BEFORE
            // the waits, and turn it on for live images AFTER the wait (see below)
            //
            if(Telescope.CanSetTracking && Telescope.Tracking)
            {
                if((Tc.CalFrame || (Tc.NonImage && Tc.Type != Tc.P_DUSKFLATS && Tc.Type != Tc.P_DAWNFLATS && Tc.Type != Tc.P_SCREENFLATS)))
                {
                    // This is confusing because it prints even if not doing the cal or
                    // dome op below. Track off DOES need to be here as explained above!
                    //Console.PrintLine("  (turning tracking off for cal image(s), chill, and dome ops)");
                    Telescope.Tracking = false;
                    Util.WaitForMilliseconds(1000);                         // **TODO** Remove after this is done inside ACP
                }
            }
            
            // ---------------
            // Wait processing
            // ---------------
            //
            // NOTE: The order is important for precedence, and MUST be
            //       reflected in the plan parser too!
            //
            // Test for null handles "sparse array" where there may be no 
            // #waituntiul defined for this set.
            //
            if(Tc.WaitUntil.length > iSet && Tc.WaitUntil[iSet] !== undefined)   // === WAITUNTIL ===
            {
                if(!WaitUntil(Tc, Pl, iSet)) continue Targets;              // Wait failed, skip this target
                if(new Date() >= Pl.QuitAt) break Sets;                     // Stop if QuitAt time reached
            }
            
            if(Tc.WaitFor > 0)                                              // === WAITFOR ===
            {
                if(!WaitFor(Tc, Pl)) continue Targets;                      // Wait failed, skip this target
                if(new Date() >= Pl.QuitAt) break Sets;                     // Stop if QuitAt time reached
            }
            
            //
            // The Plan checker logic guarantees that non-slewable targets
            // will not have #waitinlimits, #waitzendist, or #waitairmass.
            // Nonetheless, we check for CalFrame or NonImage.
            //
            if(!Tc.CalFrame && !Tc.NonImage)                                // These waits are only for slew-to (light) images
            {
                if(Tc.WaitInLimits > 0)                                     // === WAITINLIMITS ===
                {
                    if(!WaitInLimits(Tc, Pl)) continue Targets;             // Wait failed, skip this target
                    if(new Date() >= Pl.QuitAt) break Sets;                 // Stop if QuitAt time reached
                }
                
                if(Tc.WaitAirMass !== null)                                 // === WAITAIRMASS ===
                {
                    if(!WaitAirMass(Tc, Pl)) continue Targets;              // Wait failed, skip this target   
                    if(new Date() >= Pl.QuitAt) break Sets;                 // Stop if QuitAt time reached
                }
                
                if(Tc.WaitZenDist !== null)                                 // === WAITZENDIST ===
                {
                    if(!WaitZenDist(Tc, Pl)) continue Targets;              // Wait failed, skip this target   
                    if(new Date() >= Pl.QuitAt) break Sets;                 // Stop if QuitAt time reached
                }

            }
 
            //
            // If ReadoutMode control available, and the target specified 
            // a readout mode, set it. This iis a "carry-over" property.
            // NOTE: This affects the DARK and BIAS as well as light frames.
            //
            if(SUP.HaveReadoutModes && !isNaN(Tc.ReadoutMode))
                SUP.ReadoutMode = Tc.ReadoutMode;
           
            // --------------
            // Pseudo-Targets
            // --------------
            //
            switch(Tc.Type)
            {
                case Tc.P_CHILL:                                            // === #CHILL ===
                    if(iSet === 0)
                        ChangeCoolerTemp(Tc.ChillTemp, Tc.ChillTol);
                    continue Targets;                                       // Finished with this target
                    break;                                                  // Shut JavaScript Lint up
                    
                case Tc.P_DARK:                                             // === #DARK === (bias frames too)
                case Tc.P_BIAS:                                             // === #BIAS ===
                    if(Prefs.CalFramesInAllSets || (iSet >= Pl.Sets - 1)) { // Force all sets or last (or only) set
                        SUP.AutoGuide(false);                               // Stop guider for these
                        for(i = 0; i < Tc.Repeat; i++)
                            AcqCalFrames(Tc, Pl, iSet, planName);
                    }
                    else
                        Console.PrintLine("  (skipped until the last #set)");
                    continue Targets;                                       // Next target
                    break;                                                  // Shut JavaScript Lint up
                    
                case Tc.P_NOWEATHER:                                        // === #NOWEATHER ===
                    if(iSet >= Pl.Sets - 1) {                               // Last (or only) set
                        if(Weather.Available) {
                            var D = Util.Dome;
                            if(D.Available &&  D.CanSetShutter && D.ShutterStatus != 1)  // 1 = shutterClosed
                                Console.PrintLine("**refused - dome/roof is not closed!");
                            else
                                Util.WeatherConnected = false;
                        }
                        else
                            Console.PrintLine("**skipped, weather is not available");
                    }
                    else
                        Console.PrintLine("  (skipped until the last #set)");
                    continue Targets;                                       // Next target
                    break;                                                  // Shut JavaScript Lint up
                    
                case Tc.P_DOMEOPEN:                                         // === #DOMEOPEN ===
                    if(iSet === 0) {                                        // First (or only) set
                        if(!OpenDome())                                     // Really open it
                            break Sets;                                     // Failed, terminate run
                    }
                    else
                        Console.PrintLine("   (only in the first #set)");
                    continue Targets;                                       // Next target
                    break;                                                  // Shut JavaScript Lint up
                    
                case Tc.P_DOMECLOSE:                                        // === #DOMECLOSE ===
                    if(iSet >= Pl.Sets - 1) {                               // Last (or only) set
                        if(!CloseDome())                                    // Really close it
                            break Sets;                                     // Terminate run
                    }
                    else
                        Console.PrintLine("  (skipped till the last #set");
                    continue Targets;                                       // Next target
                    break;                                                  // Shut JavaScript Lint up
                    
                case Tc.P_DUSKFLATS:                                        // === #DUSKFLATS ===
                    if(iSet > 0) {
                        Console.PrintLine("   (only in the first #set)");
                        continue Targets;                          // Skip after first set
                    }
                    if(SEQTOK !== null) {                                   // If resuming from AutoFlat.vbs (duskflats)
                        Console.PrintLine("Dusk flats completed with status " + SEQTOK.AutoFlatResult);
                        SEQTOK = null;                                      // Dump this SEQTOK for poss. later #dawnflat
                        continue Targets;                                   // Skip this #duskflats (done)
                    }
                    Console.PrintLine("== Do dusk flats then resume this plan ==");
                    SEQTOK = new ActiveXObject("ACP.SequenceToken");        // Make a new SequenceToken
                    SEQTOK.DuskFlatPlan = Tc.FlatPlanName;                  // Set flat plan, may be ""
                    SEQTOK.DoDuskFlats = true;                              // Tell AutoFlat this is for dusk
                    SEQTOK.ObservingPlan = plnFile;                         // Our plan file, for when AutoFlat chains back to us
                    Util.ChainParameter = SEQTOK;                           // Pass SequenceToken to AutoFlat.vbs
                    SEQTOK = null;                                          // Null SEQTOK for wrapup logic
                    buf = ACPApp.Path + "\\scripts\\AutoFlat.vbs";          //  use AutoFlat.vbs in ACP scripts folder
                    Util.ChainScript(buf);                                  // Chain to autoflat.vbs
                    Pl.ChainPlan = "";                                      // Deactivate these for exit to flats
                    Pl.ChainScript = "";
                    Pl.Shutdown = false;
                    break Sets;                                             // (terminates this run)
                    
                case Tc.P_DAWNFLATS:                                        // === #DAWNFLATS ===
                    if(iSet < Pl.Sets - 1) continue Targets;                // Skip if not last set
                    if(SEQTOK !== null) {                                   // If resuming from AutoFlat.vbs (duskflats)
                        Console.PrintLine("Dawn flats completed with status " + SEQTOK.AutoFlatResult);
                        SEQTOK = null;                                      // Dump this SEQTOK for poss. later #dawnflat
                        continue Targets;                                   // Skip this #dawnflats (done)
                    }
                    Console.PrintLine("== Do dawn flats then resume this plan ==");
                    SEQTOK = new ActiveXObject("ACP.SequenceToken");        // Make a new SequenceToken
                    SEQTOK.DawnFlatPlan = Tc.FlatPlanName;                  // Set flat plan, may be ""
                    SEQTOK.DoDuskFlats = false;                             // Tell AutoFlat this is for dawn/screen
                    SEQTOK.ObservingPlan = plnFile;                         // Our plan file, for when AutoFlat chains back to us
                    Util.ChainParameter = SEQTOK;                           // Pass SequenceToken to AutoFlat.vbs
                    SEQTOK = null;                                          // Null SEQTOK for wrapup logic
                    buf = ACPApp.Path + "\\scripts\\AutoFlat.vbs";          //  use AutoFlat.vbs in ACP scripts folder
                    Util.ChainScript(buf);                                  // Chain to autoflat.vbs
                    Pl.ChainPlan = "";                                      // Deactivate these for exit to flats
                    Pl.ChainScript = "";
                    Pl.Shutdown = false;
                    break Sets;                                             // (terminates this run)

                case Tc.P_SCREENFLATS:                                      // === #SCREENFLATS ===
                    if(iSet < Pl.Sets - 1) continue Targets;                // Skip if not last set
                    if(SEQTOK !== null) {                                   // If resuming from AutoFlat.vbs (screenflats)
                        Console.PrintLine("Screen flats completed with status " + SEQTOK.AutoFlatResult);
                        SEQTOK = null;                                      // Dump this SEQTOK for poss. later #screenflat
                        continue Targets;                                   // Skip this #screenflats (done)
                    }
                    Console.PrintLine("== Do screen flats then resume this plan ==");
                    SEQTOK = new ActiveXObject("ACP.SequenceToken");        // Make a new SequenceToken
                    SEQTOK.DawnFlatPlan = Tc.FlatPlanName;                  // Set flat plan, may be ""
                    SEQTOK.DoDuskFlats = false;                             // Tell AutoFlat this is for dawn/screen
                    SEQTOK.ObservingPlan = plnFile;                         // Our plan file, for when AutoFlat chains back to us
                    Util.ChainParameter = SEQTOK;                           // Pass SequenceToken to AutoFlat.vbs
                    SEQTOK = null;                                          // Null SEQTOK for wrapup logic
                    buf = ACPApp.Path + "\\scripts\\AutoFlat.vbs";          //  use AutoFlat.vbs in ACP scripts folder
                    Util.ChainScript(buf);                                  // Chain to autoflat.vbs
                    Pl.ChainPlan = "";                                      // Deactivate these for exit to flats
                    Pl.ChainScript = "";
                    Pl.Shutdown = false;
                    break Sets;                                             // (terminates this run)
                    
                default:                                                    // hut JavaScript Lint up
                    break;
            }

            // ------------
            // Real Targets (and P_MANUAL)
            // ------------

            if(new Date() >= Pl.QuitAt) break Sets;                         // Stop if QuitAt time reached

            //
            // See comments above relating to optimizing tracking switches.
            //
            if(Telescope.CanSetTracking)
            {
                if(!Tc.NonImage && !Telescope.Tracking)
                {
                    Console.PrintLine("  (turning tracking on for live image(s))");
                    Telescope.Tracking = true;
                    Util.WaitForMilliseconds(1000);                         // **TODO** Remove after this is done inside ACP
                }
            }

            //
            // Set up scope and rotator positioning (slew or manual), and flag 
            // condition-triggered pointing updates (plan-start/initial or 
            // distance-from-last-PU, aka slew-distance).
            //
            if(Tc.Type == Tc.P_MANUAL)                                      // If manual target, capture scope J2000
            {
                if(iSet > 0)                                                // #manual valid only in 1st set
                {
                    Console.PrintLine("**Manual target skipped for sets 2 and after");
                    continue Targets;
                }
                if(Prefs.DoLocalTopo)
                {
                    SUP.LocalTopocentricToJ2000(Telescope.RightAscension, Telescope.Declination);
                    Tc.RA = SUP.J2000RA;
                    Tc.Dec = SUP.J2000Dec;
                }
                else
                {
                    Tc.RA = Telescope.RightAscension;
                    Tc.Dec = Telescope.Declination;
                }
                if(Prefs.PointingUpdates.Simulate)                          // If simulating
                    SUP.CalcSimImageCoordinates(Tc.RA, Tc.Dec);             // Calculate simulator image
                Tc.Pointing = false;                                        // Never do a PU on manual target
            }
            else                                                            // Slew-to target, check destination limits
            {
                //
                // -------
                // Slewing - If not pre-slewed from previous target
                // -------
                //
                WaitForSlews();                                             // In case pre-slew hasn't completed
                //
                // NOTE: The following can do an AF if the FocusAfterFlip option is set. 
                // It will do a pointing update for the focus star. This will establish a 
                // new base for "max slew w/o pointing update". So if it has to slew back
                // farther than that, you'll see a slew-distance pointing update.
                //
                if(!SafeSlewIf(Tc, "current", true))                        // If needed (waited, etc.) Slew now, AF on flip if requested
                    continue Targets;                                       // Slew failed, next target
                WaitForSlews();                                             // In any case, wait (possibly pre-slewed)
                //
                // -----------------------------
                // Pointing update request logic
                // -----------------------------
                //
                // Complex decision logic, cannot be done clearly in an 'if' statment!
                // Note that a per-target or initial AF in a nested loop may also set
                // curNeedPU = true.
                //
                if(Tc.Pointing)                                             // Overrides ACP preference setting
                {
                    curNeedPU = true;
                    Console.PrintLine("  (plan requested pointing update)");
                }
                if(Prefs.PointingUpdates.Enabled)
                {
                    if(!curNeedPU && !InitPUDone)                           // If PU not already requested & initial PU hasn't been done
                    {
                        Console.PrintLine("  (request plan-start pointing update)");
                        curNeedPU = true;
                    }
                    if(!curNeedPU && nxtNeedPU)                             // If PU not already requested and prev target asked
                    {
                        //
                        // Forced PU carry-over logic. If the nxtNeedPU flag is set, then
                        // it means that a previous target requested a forced PU for this
                        // target.
                        //
                        Console.PrintLine("  (prev target requested pointing update for this one)");
                        curNeedPU = true;                                   // Force the PU for this target
                        nxtNeedPU = false;                                  // Clear the flag (for now!)
                    }
                    if(!curNeedPU)                                          // If PU *STILL* not already requested, check slew dist
                    {                                                       // (might not get set true here!)
                        //
                        // This test depends on whether the scope can be synced, only in the
                        // source of the reference coordinates from which we measure our 
                        // distance. Some of the time, the two will be the same as the last
                        // solve coordinates are used as the sync coordinates. But final
                        // images may be solved for a target where there was no PU, and 
                        // therefore measuring the distance from this isn't a true 
                        // reflection of "how far from last PU", but it will have to do.
                        // 
                        Tc.UpdateEphem();                                   // Update our target ephemeris
                            curNeedPU = (SUP.EquDist(Tc.RA, Tc.Dec, SUP.LastSolveRAJ2000, SUP.LastSolveDecJ2000) > Prefs.PointingUpdates.MaximumSlew);
                        if(curNeedPU)
                            Console.PrintLine("  (request slew-distance pointing update)");
                    }
                    if(!Util.PointingCorrectionEnabled && Math.abs(Tc.Dec) > 70.0)
                    {
                        //
                        // Force a Pointing Update whenever the scope is above 70 deg and not using the 
                        // pointing corrector, since it will not sync the scope under this condition, so
                        // it needs to re-slew to center the target every time, even if it is less than
                        // MaximumSlew away.
                        //
                        curNeedPU = true;
                    }
//
// Obsolete? Slew has already been done!!
//                     if(!curNeedPU && Telescope.AlignmentMode == 2)
//                     {
//                         //
//                         // Request pointing update if the slew will flip a GEM
//                         // either way.
//                         //
//                         if(WouldFlip(Tc.RA, Tc.Dec))                    // If would flip either way
//                         {
//                             Console.PrintLine("  (request pier-flip pointing update)");
//                             curNeedPU = true;
//                         }
//                     }
                }
            }

            if(new Date() >= Pl.QuitAt) break Sets;                         // Stop if QuitAt time reached
            
            //
            // OK, we're ready to do this target now
            //
            Console.PrintLine("  Ready for " + Tc.Name + " (# " + (iTgt + 1).toString() + 
                        " of " + Pl.Targets.length + " in set " + (iSet + 1).toString() + ")");
            Voice.Speak("Doing " + Tc.Name + ". This is target " + (iTgt + 1).toString() + 
                        " of " + Pl.Targets.length + " in set " + (iSet + 1).toString() + ".");


            //
            // Scope and rotator are now positioned (slew or manual) with
            // updated ephemeris (if needed). Ready to start the acquisition
            // process. 

            if(Tc.Repeat > 1)
            {
                buf = "  " + Tc.Name + " will be repeated " + Tc.Repeat + " times.";
                Console.PrintLine(buf);
                Voice.Speak(buf);
            }
            if(Tc.ImageSets.length > 1)
            {
                buf = "  " + Tc.Name + " specifies " + Tc.ImageSets.length + " sets of images.";
                Console.PrintLine(buf);
                Voice.Speak(buf);
            }

            //
            // Plug in the (possibly changed) defocus count (carry over)
            //
            SUP.DefocusCount = Tc.Defocus;
            //
            // ===========
            // Repeat Loop
            // ===========
            //
            maxRepeat = Tc.Repeat;
            Repeat: for(var iRpt = iRpt0; iRpt < Tc.Repeat; iRpt++)
            {
                Pl.RepeatsCompleted = iRpt;
                Pl.ImageSetsCompleted = iImgSet0;                           // Prevent stale starting points (see note at Tgt loop)
                Pl.CountsCompleted = iCnt0;
                if(!Prefs.DisablePlanResume) Pl.UpdateCompletionState();    // Update completion status in plan file
                iRpt0 = 0;                                                  // Recycle to start at 0 on next loop start
                curRepeat = iRpt + 1;                                       // Global for web
                curImgSet = undefined;
                curCount = undefined;
                
                if(Tc.Repeat > 1)
                {
                    buf = "Starting target repeat " + (iRpt + 1) + " of " + Tc.Repeat;
                    Console.PrintLine("  === " + buf + " ===");
                    Voice.Speak(buf);
                }
                // =============
                // ImageSet Loop
                // =============
                //
                maxImgSet = Tc.ImageSets.length;
                ImageSets: for(var iImgSet = iImgSet0; iImgSet < Tc.ImageSets.length; iImgSet++)
                {
                    Pl.FilterGroupsCompleted = iImgSet;
                    Pl.CountsCompleted = iCnt0;                             // Prevent stale starting points (see note at Tgt loop)
                    if(!Prefs.DisablePlanResume) Pl.UpdateCompletionState(); // Update completion status in plan file
                    iImgSet0 = 0;                                           // Recycle to start at 0 on next loop start
                    curImgSet = iImgSet + 1;                                // Global for web
                    curCount = undefined;
                    
                    if(Tc.ImageSets.length > 1)
                    {
                        buf = "Starting filter group " + (iImgSet + 1) + " of " + Tc.ImageSets.length;
                        Console.PrintLine("  === " + buf + " ===");
                        Voice.Speak(buf);
                    }
                    var Is = Tc.ImageSets[iImgSet];                         // Get this image set
                    //
                    // NB: Filter selection MUST precede AutoFocus and Pointing Update!!
                    //
                    if(SUP.HaveFilters) {                                   // If we really have filters
                        SUP.SelectFilter(Is.FilterNum);                     // Select filter for this set
                        curFilter = SUP.FilterName(Is.FilterNum);
                        Console.PrintLine("  Selecting " + curFilter + " filter (" + 
                                            Is.FilterNum + ") for imaging");
                    } else {
                        Is.FilterNum = 0;                                   // Replace NaN from compiler with a valid number for MaxIm
                        curFilter = "None";
                    }
                    
                    if(new Date() >= Pl.QuitAt) break Sets;                 // Stop if QuitAt time reached
        
                    //
                    // Autofocus for this filter set. May be requested or per-filter.
                    // Any will reset the next periodic AF time if succeeds. See notes below for 
                    // imageset count of 1 (single filter) and for case where FilterInfo is
                    // available.
                    //
                    // **WARNING** SOME LOGIC LOGIC REPEATED BELOW FOR PERIODIC AND ADAPTIVE AF
                    //
                    if(Prefs.AutoFocus.Enabled && Tc.AutoFocus)
                    {
                        Console.PrintLine("  Do requested auto-focus...");
                        if(Telescope.AlignmentMode == 2)                    // GEM only...
                        {
                            z = Math.max(PREFLIPMARGIN, 0);                 // Allow negative PREFLIPMARGIN elsewhere
                            AutoFlipIf(MAXAFTIME + MAXPUTIME + z, Pl.QuitAt, Tc, false); // If AF + PU would cross meridian, do autoflip
                        }
                        if(SUP.AutoFocus(Tc.RA, Tc.Dec)) {                  // If successful (kills guiding/orbital tracking!)
                            if(PerAFTime !== null)                          // If periodic AF in effect
                                PerAFTime = new Date().addSeconds(Pl.AFinterval * 60);  // Next per AF at this time
                            //
                            // If just one filter, don't do requested AF until the next target.
                            // This preserves compatibility with older format plans which
                            // use #repeat instead of #count.
                            //
                            if(Tc.ImageSets.length == 1) Tc.AutoFocus = false;
                            //
                            // Same deal if have focus offsets and not forcing per-filter, 
                            // no more AF till next target.
                            //
                            if(SUP.HaveFilterInfo && !Prefs.Autofocus.ForcePerFilter)
                                Tc.AutoFocus = false;
                        }

                        if(!SafeSlewIf(Tc, "current", false))               // Track possible FMO. If fails, next target!
                            break Repeat;
                        WaitForSlews();                                     // Must wait now for slew/rotate

                        if(Prefs.PointingUpdates.Enabled) 
                        {
                            Console.PrintLine("  (doing post-focus pointing update...)");
                            curNeedPU = true;                               // We always must update pointing after AF
                            puDone = false;                                 // And it has not been done after the AF
                        }
                    }
                    
                    if(new Date() >= Pl.QuitAt) break Sets;                 // Stop if QuitAt time reached
            
                    //
                    // Pointing Update - May be requested or the initial (first targets
                    // may have been cal frames or non-image pseudo-targets). Before
                    // doing the PU, though, do an auto-flip for the exposure interval.
                    // If it does flip, that process will have done a post-flip PU,
                    // so there's no point in doing another here. By testing for
                    // auto-flip here, we also avoid the scenario where we do a PU
                    // here, only to do an auto-flip/PU inside the exposure repeat loop
                    // before the first exposure, rendering this PU redundant. Fine 
                    // points like this distinguish great programs from "good enough".
                    //
                    // But wait, there's more! We need to take into account the time it
                    // takes to do a pointing update when testing for AutoFlip here. If
                    // the pre-flip margin is negative (it can track mast the flip point)
                    // we must ignore it. In other words the pointing update MUST fit,
                    // including its post-solve correction slew BEFORE the target 
                    // coordinates reach the flip point. Failure to do this would leaves
                    // a hole where the autoflip would not occur before the PtgUpd, then 
                    // the scope would flip on the centering slew (unknown to us)!
                    //
                    // This will prevent a long wait on a target change as long as the 
                    // target is more than "pointing update time" before the flip point. 
                    // The next image can still be started as long as it can fit before 
                    // the "track past" time. Hence, for ACP 7, I have removed the image 
                    // exposure interval from this calculation.
                    //
                    // Finally (Apr 2016!) if we do an autofocus above, we must do another
                    // pointing update even if we are within the same target. Note puDone
                    // is set false at the start of the Target loop so we have forced
                    // it false after the autofocus above. 
                    //
                    // CAFEAT: MAXPUTIME MUST BE LONG ENOUGH FOR A POINTING UPDATE!
                    //
                    // puDone set false at start of target loop or on an autofocus above
                    //
                    if(curNeedPU)
                    {
                        if (Tc.NoPointing)
                        {
                            Console.PrintLine("  Pointing update prevented by #nopointing for this target");
                        }
                        else
                        {
                            if(Telescope.AlignmentMode == 2)                // GEM only...
                            {
                                Console.PrintLine("  Pointing update: Wait and flip if within " + 
                                        MAXPUTIME + " sec of flip point");
                                z = Math.max(0, PREFLIPMARGIN) + MAXPUTIME;
                                switch(AutoFlipIf(z, Pl.QuitAt, Tc, true))
                                {
                                    case AFI_NOFLIP: break;
                                    case AFI_DIDFLIP: puDone = true; break;
                                    case AFI_QUITAT: break Sets;            // ==== BREAK OUT ON QUITAT ==== (gotta love JavaScript!)
                                    default: break;
                                }
                            }
                            if(!puDone)
                            {
                                if(SUP.Guiding)
                                    SUP.AutoGuide(false);                   // Stop guiding if needed (should be in SUP)
                                isPointing = true;                          // For ASP (typ.)
                                puDone = SUP.UpdatePointing(Tc.Name, Tc.RA, Tc.Dec, Tc.PA);
                                isPointing = false;
                            }
                            if(puDone)                                      // If it succeeded
                            {
                                curNeedPU = false;                          // Indicate success
                                InitPUDone = true;                          // And also that the initial PU has been done
                            }
                            else                                            // This target's pointing update failed
                            {
                                if(Prefs.PointingUpdates.SkipOnFail)        // And if we should skip this one as a result
                                {
                                    Console.PrintLine("**Aiming failed, skipping " + Tc.Name);
                                    continue Targets;                       // Skip this target
                                }
                                
                                Console.PrintLine("**Aiming failed, request pointing update for next target");
                                curNeedPU = false;                          // Don't try for this target any more, but...
                                nxtNeedPU = true;                           // ... carry PU request to next live target
                            }
                        }
                    }
            
                    if(new Date() >= Pl.QuitAt) break Sets;                 // Stop if QuitAt time reached
            
                    //
                    // Slew-ahead logic. This will not slew-ahead from the last
                    // target of one set to the first target of the next set.
                    // That logic just got too complex, and has so little benefit.
                    // Consider the effect of a MinSetTime: Is this a wait or not?
                    // The slewNext and rotNext vars are passed to SUP.TakePicture()...
                    //
                    slewNext = rotNext = false;
                    if(Tn !== null)
                    {
                        //
                        // Slew-ahead
                        //
                        if(LightTargetImmediate(Tn))
                        {
                            slewNext = !TargetCloseEnough(Tn);
                            rotNext = !RotatorCloseEnough(Tn) || WouldFlip(Tn.RA, Tn.Dec);
                        }
                    }
                    
                    if(Tc.ImageSets.length > 1 && Is.Count > 1)
                    {
                        buf = "  This filter group has a count of " + Is.Count + " images.";
                        Console.PrintLine(buf);
                        Voice.Speak(buf);
                    }

                    //
                    // ===================
                    // ImageSet Count Loop
                    // ===================
                    //
                    maxCount = Is.Count;
                    var nImages = 0;                                        // Counts images actually acquired (see stacking logic)
                    Count: for(var iCnt = iCnt0; iCnt < Is.Count; iCnt++)
                    {
                        Pl.CountsCompleted = iCnt;
                        if(!Prefs.DisablePlanResume) Pl.UpdateCompletionState(); // Update completion status in plan file
                        iCnt0 = 0;                                          // Recycle to start at 0 on next loop start
                        curCount = iCnt + 1;                                // Global for Web;
                        
                        if(new Date() >= Pl.QuitAt) break Sets;             // Stop if QuitAt time reached
                        
                        //
                        // Limit check - may move below limits during a repeat loop
                        //
                        if(!TargetInLimits(Tc, "repeat"))
                        {
                            buf = "** " + Tc.Name + " went outside limits "; // Report appropriate message:
                            if(iRpt === 0 && iImgSet === 0 && iCnt === 0)   // If first image
                                Console.PrintLine(buf + "after slew-to.");
                            else                                            // Second or subsequent in set
                                Console.PrintLine(buf + "during repeated target imaging.");
                            break Repeat;                                  // Next target
                        }
                        
                        //
                        // If it's time for periodic or adaptive AF, do that. 
                        // This also kills AG and Orbital Tracking.
                        //
                        // **WARNING** SOME LOGIC REPEATED ABOVE FOR REQUESTED/PER-FILTER
                        //
                        if(Prefs.AutoFocus.Enabled)
                        {
                            var afPeriodic = (PerAFTime !== null && (new Date() > PerAFTime));
                            var afAdaptive = (Prefs.AutoFocus.AdaptiveAutoFocus && (SUP.LastAverageFWHM > 0) &&
                                            (SUP.LastAverageFWHM >= (Prefs.AutoFocus.MaxHFDGrowth * SUP.LastFocusFWHM)));
                            if(afPeriodic || afAdaptive)
                            {
                                if(afPeriodic) {
                                    Console.PrintLine("  Do periodic or plan-start auto-focus...");
                                } else if(afAdaptive) {
                                    Console.PrintLine("  Average FWHM limit (" +
                                        Util.FormatVar(SUP.LastAverageFWHM, "0.00") +
                                        " arcsec) reached. Refocusing...");
                                }
                                if(Telescope.AlignmentMode == 2)            // GEM only...
                                {
                                    z = Math.max(PREFLIPMARGIN, 0);         // Allow negative PREFLIPMARGIN elsewhere
                                    if(AutoFlipIf(MAXAFTIME + MAXPUTIME + z, Pl.QuitAt, Tc, false) == AFI_QUITAT)
                                        break Sets;
                                }
                                if(SUP.AutoFocus(Tc.RA, Tc.Dec) && PerAFTime !== null)  // If good focus and periodic AF in effect
                                    PerAFTime = new Date().addSeconds(Pl.AFinterval * 60);  // Re-up the periodic AF time
                                if(!SafeSlewIf(Tc, "current", false))       // Time has passed. Re-slew if needed, computing ephemeris.
                                    break Repeat;                           // Oops! Out of limits
                                WaitForSlews();                             // Must wait now for slew/rotate
                                if(Prefs.PointingUpdates.Enabled) 
                                {
                                    Console.PrintLine("  (doing post-focus pointing update...)");
                                    isPointing = true;
                                    puDone = SUP.UpdatePointing(Tc.Name, Tc.RA, Tc.Dec, Tc.PA);  // Do the post-AF pointing update
                                    isPointing = false;
                                }
                            }
                        }
                        
                        if(new Date() >= Pl.QuitAt) break Sets;             // Stop if QuitAt time reached

                        //
                        // Handle an auto-flip any time during the repeat sequence, including for the 1st 
                        // image. This kills AG and Orbital Tracking.
                        //
                        if(Telescope.AlignmentMode == 2)                    // For GEM
                        {
                            if(AutoFlipIf(Is.Interval + PREFLIPMARGIN, Pl.QuitAt, Tc, true) == AFI_QUITAT)      // Does pointing update
                                break Sets;                                 // Would have waited beyond QuitAt
                        }
        
                        if(new Date() >= Pl.QuitAt) break Sets;             // Stop if QuitAt time reached
                        
                        //
                        // Make the file path/name for this image
                        //
                        imgFile = MakeFilePathName(IMGPATH, Tc, Pl, iSet, iRpt, iImgSet, iCnt, planName);

                        // ------------------------
                        // AcquireImage User Action
                        // ------------------------
                        //
                        // Return "ok" to skip to the next target, responsible for logging errors. 
                        // Return True to continue as though nothing happened
                        // Return False to cause the entire script to just stop.
                        //
                        if(SUP.UserActions !== null)
                        {
                            //
                            // Make life easier on those who don't read the relnotes etc.
                            //
                            try {
                                ret = SUP.UserActions.AcquireImage(Pl, Tc, Is, imgFile + ".fts");   // Call with full name
                            } catch (ex) {
//                                 Console.PrintLine("** User action AcquireImage not implemented.     ***");
//                                 Console.PrintLine("** See ACP 8.1 Release Notes. You should migrate ***");
//                                 Console.PrintLine("** your UserActions to the newest template.      ***");
                                ret = true;                                 // Continue with no-op
                            }
                            if(ret === false) {                             // False -> stop script
                                Console.PrintLine("** User action AcquireImage returned False");
                                break Sets;
                            }
                            if(ret == "ok")                                // If "ok" This UA did handle it all, loop back
                            {
                                continue Count;
                            }
                        }
                              
                        //
                        // ---------------------------
                        // Autoguiding (re)start logic
                        // ---------------------------
                        //
                        // There's no code in a #COUNT sequence that checks whether guiding is running or not.
                        // If guiding fails to restart automatically after an image download (MaxIm error detected
                        // by ACP) or if the guider actually fails to restart after an #AFInterval or recentering
                        // slew, the remainder of the #REPEAT sequence will still be executed, but with no
                        // guiding.  This code restarts guiding if it's supposed to be on but isn't.  If it fails
                        // to restart, it doesn't abort the target.  It will just try to guide again on the next image
                        // in the #COUNT.   I have it this way because a passing cloud may have caused the problem
                        // and I don't want to lose the possiblity that the rest of the images in that #COUNT may
                        // be ok. If they all get acquired with no guiding, so be it. The night's lost to clouds
                        // anyway. Also, if the guider doesn't start, and it's an internal guider, then do a pointing
                        // update in case the guide star was lost to an imperfect meridian flip etc. (McMillan)
                        //
                        if(SUP.Guiding && !SUP.GuiderRunning)
                        {
                            SUP.AutoGuide(false);                           // Re-sync our logic with reality
                            Console.PrintLine("  (guider should be running, but isn't -- restarting...)");
                            if(!SUP.ExternalGuider && Prefs.PointingUpdates.Enabled) // Update pointing if internal/OAG guider
                            {
                                Console.PrintLine("  (int/OAG guider - attempt pointing update before guider restart)");
                                isPointing = true;
                                SUP.UpdatePointing(Tc.Name, Tc.RA, Tc.Dec, Tc.PA);
                                isPointing = false;
                            }
                        }
                        
                        // OK, if enabled and not orbital tracking, try to get AG (re) started if a single 
                        // exposure is "long" or if the sum of the intervals exceeds the unguided interval.
                        // Note that the test for sum of exposures is for the REMAINING exposures, not the
                        // whole thing.  This handles the case where guiding is being restarted during a 
                        // complex repeat/imageset/count plan, and won't do it of the sum of the remaining
                        // exposures doesn't warrant trying to guide.
                        //
                        // NOTE: If #defocus is active, and if using an internal/OAG guider, we do not
                        // aggregate. This allows defocusing with internal/OAG and short enough individual
                        // exposures without trying to guide through a defocused imaging train.
                        //
                        // NOTE: The test for OrbTrack and both rates 0 allows #TRACK to remain 
                        // in effect for mixed deep-sky and solar-system objects while allowing
                        // guiding for deep sky!
                        //
                        // NOTE: This logic gets executed EVERY TIME because calling SUP.AutoGuide(true)
                        // is OK/harmless if the guider is already running, and it restarts it if not.
                        //
                        var curAG = false;                                  // At least try to AG
                        var orbTrackRealRates = (Tc.OrbTrack && (Tc.RARate !== 0 || Tc.DecRate !== 0));
                        if((Prefs.Autoguiding.Enabled || Tc.AutoGuide) && !orbTrackRealRates)
                        {
                            curAG = (Is.Interval > Prefs.AutoGuiding.MaxUnguidedExposureInterval);  // This exp long enough?
                            curAG |= Tc.AutoGuide;                          // Always AG if requested for target
                            if(!Prefs.Autoguiding.DisableAggregation && !curAG) // Not yet, maybe sum of exposures...
                            {
                                if(Prefs.Autoguiding.SensorType != 1)       // Ext or OAG, Can sum across everything
                                {
                                    z = 0.0;
                                    for(i = (iImgSet + 1); i < Tc.ImageSets.length; i++)    // Remaining complete imageSets
                                        z += (Tc.ImageSets[i].Interval * Tc.ImageSets[i].Count);
                                    z += Is.Interval * (Is.Count - iCnt);   // Remaining in this imageSet
                                    z *= (Tc.Repeat - iRpt);                // Now total shutter-open time for target
                                }
                                else                                        // Internal/OAG
                                {
                                    //
                                    // Avoid aggregation if #defocus is active (see above note)
                                    //
                                    if(Tc.Defocus !== 0)
                                        z = Is.Interval;                    // Decision only on each exposure
                                    else
                                        z = Is.Interval * Is.Count;         // Shutter open time for this filter
                                }
                                curAG = (z > Prefs.AutoGuiding.MaxUnguidedExposureInterval);
                            }
                        }
                        if(curAG)
                        {
                            if(!SUP.Guiding)
                                Console.PrintLine("  (long exp(s) or requested, no orbital tracking, trying to autoguide)");
                            if(!SUP.AutoGuide(true))                        // MUST ALWAYS DO THIS FOR RECOVERY!
                            {
                                //
                                // The cause of guiding failing to start could be because 
                                // pointing is not "perfect." If using an internal/OAG guider, 
                                // do a pointing update, then try to start again.
                                //
                                if(!SUP.ExternalGuider && Prefs.PointingUpdates.Enabled)
                                {
                                    Console.PrintLine("  Doing pointing update to assure guide star on internal/OAG chip");
                                    isPointing = true;
                                    SUP.UpdatePointing(Tc.Name, Tc.RA, Tc.Dec, Tc.PA);
                                    isPointing = false;
                                    SUP.AutoGuide(true);                    // Try again
                                }
                            }
                            if(!SUP.Guiding)                                // If guiding failed
                            {
                                Console.PrintLine("**Guiding failed, continuing unguided. Will try again next image.");
                            }
                        }
                        
                        //
                        // If orbital tracking, adjust tracking rates. Will be 0 if non-solar-system
                        // even though curTrack may be True. This allows #TRACK to remain in effect
                        // across mixed solar-system and non-solar-system objects. Same test above for
                        // autoguiding, so here we cannot be autoguiding!
                        //
                        if(orbTrackRealRates)
                            SUP.SetTrackOffset(Tc.RARate, Tc.DecRate);      // Complier assures scope can do tracking

                        //
                        // Last check for QuitAt in the repeat loop. No point in throwing
                        // away an image that we actually took!!!!!
                        //
                        if(new Date() >= Pl.QuitAt) break Sets;             // Stop if QuitAt time reached
                        
                        //
                        // Hold the  user's hand, announce where we are in the plan now
                        //
                        Console.PrintLine("  === Place in plan ===");
                        if(curSet != undefined) 
                            Console.PrintLine("      Set " + curSet + " of " + maxSet);
                        Console.PrintLine("      Target is \"" + Tc.Name + "\" (" + curTarget + " of " + maxTarget + ")");
                        if(curRepeat != undefined)
                            Console.PrintLine("        Repeat " + curRepeat + " of " + maxRepeat + " for this target");
                        if(curImgSet != undefined)
                            Console.PrintLine("          Filter " + curFilter + " (" + curImgSet + " of " + maxImgSet + ")");
                        if(curCount != undefined)
                            Console.PrintLine("            Image " + curCount + " of " + maxCount + " for this filter");
                        Console.PrintLine("  Imaging to " + FSO.GetFileName(imgFile));
                        //
                        // TAKE THE IMAGE (can't compress in TakePicture, may be solving)
                        // Note that SlewNext is not passed true unless this is the last 
                        // image of the set. Also, the return from TakePicture will be True 
                        // if either slewNext was False, or if SlewNext was true AND if the 
                        // slew was actually done. Got it? :-) Same treatment with rotNext.
                        //
                        var fallBackUnguided = false;
                        var lastImgOfTgt = ((iCnt >= Is.Count - 1) && 
                                (iImgSet >= Tc.ImageSets.length - 1) &&
                                (iRpt >= Tc.Repeat - 1));
                        var pvOrNot = Tc.NoPreview ? "" : previewImage;     // No thumbnail if #nopreview
                        //
                        // Here, the evil "FocusAfterFlip" option will prevent pre-slew for
                        // sanity reasons. The logic would be outa control. 
                        //
                        var preSlew = false;
                        var preRot = false;
                        if(lastImgOfTgt && !Prefs.AutoFocus.FocusAfterFlip) {
                            preSlew = slewNext;
                            preRot = rotNext;
                        }
                        try                                                 // Prevent failures from killing script!
                        {
                            //
                            // Yeah, SUP.TakePicture() is God-awful complicated. Tn may be null, 
                            // and for that we need to avoid referencing it. In that case slew
                            // and rotate to next are never going to be true.
                            //
                            if(Tn === null) {
                                SUP.TakePicture(Is.Interval, Is.Binning, Is.SubFrame, Tc.Dither,
                                            Is.FilterNum, imgFile, pvOrNot, false, Tc.Calibrate, false, 
                                            false, LockOwner, Tc.Name, Tc.RA, Tc.Dec, false,
                                             Tc.Elements, "", 0, 0, false, 0);
                            } else {
                                SUP.TakePicture(Is.Interval, Is.Binning, Is.SubFrame, Tc.Dither,
                                            Is.FilterNum, imgFile, pvOrNot, false, Tc.Calibrate, false, 
                                            false, LockOwner, Tc.Name, Tc.RA, Tc.Dec, 
                                            preSlew, Tn.Elements, Tn.Name, Tn.RA, 
                                            Tn.Dec, preRot, Tn.PA);
                            }
                        }
                        catch(e)
                        {
                            Console.PrintLine("**Imaging error: " + e.description); // Log the error
                            Tc.Stack = false;                               // Prevent trying to stack
                            //
                            // This is tricky. We need to detect the error(s) resulting from 
                            // TakePicture's last-minute guiding checks. The 'folks' want imaging
                            // to continue unguided rather than skipping the target. If it's one of
                            // those errors, then we need to again call TakePicture with Dither false,
                            // and guiding shut off (which happens when one of those errors happens
                            // anyway) The ugly part is the detection of those two errors (well, and
                            // also the repeat of code similar to the above!).
                            //
                            buf = e.message;
                            if(buf.search(/^\*\*Guider stopped/) == -1 && buf.search(/^\*\*Excessive guiding/) == -1)
                                break Repeat;                               // Other error, stop the repeat set now!
                            else
                                fallBackUnguided = true;                    // Try again, but unguided (ugly, but...)
                        }
                        //
                        // If we need to try again, this time unguided, do it. This is the kind of stuff
                        // that causes clean code to have increasing entropy! Don't dither.
                        //
                        if(fallBackUnguided)
                        {
                            Console.PrintLine("  Will try image again, this time unguided.");
                            try {
                                if(Tn === null) {
                                    SUP.TakePicture(Is.Interval, Is.Binning, Is.SubFrame, false,
                                                Is.FilterNum, imgFile, pvOrNot, false, Tc.Calibrate, false, 
                                                false, LockOwner, Tc.Name, Tc.RA, Tc.Dec, false,
                                                 Tc.Elements, "", 0, 0, false, 0);
                                } else {
                                    SUP.TakePicture(Is.Interval, Is.Binning, Is.SubFrame, false,
                                                Is.FilterNum, imgFile, pvOrNot, false, Tc.Calibrate, false, 
                                                false, LockOwner, Tc.Name, Tc.RA, Tc.Dec, 
                                                preSlew, Tn.Elements, Tn.Name, Tn.RA, 
                                                Tn.Dec, preRot, Tn.PA);
                                }
                            }
                            catch(e)
                            {
                                Console.PrintLine("**Imaging error: " + e.description); // Log the error
                                break Repeat;                               // Stop the repeat set now!
                            }
                        }
                        //
                        // Make PNGs for every image - Thumbnail is hyperlinked to this
                        //
                        if (Tc.NoPreview)
                        {
                            // Suppress preview - No preview was produced in TakePicture() (pvOrNot)
                            FSO.CopyFile(imgRootPath + NP_THUMB_FILE, imgRootPath + THUMB_FILE, true);
                            FSO.CopyFile(imgRootPath + NP_LSTPNG_FILE, imgRootPath + LSTPNG_FILE, true);
                            FSO.CopyFile(imgRootPath + NP_LSTDIM_FILE, imgRootPath + LSTDIM_FILE, true);
                        }
                        else
                        {
                            MakeLastPng(imgFile, imgRootPath);              // Make the big PNG
                        }
                        
                        //
                        // If the guider is running,we have some decisions to make...
                        //
                        if(SUP.Guiding)
                        {
                            if(SUP.HaveAO) {
                                //
                                // If we have an AO, we always stop guiding here, forcing a restart before
                                // every image. This gives the AO a chance to start with a centered mirror
                                // plus you can't tell if the guider is really running anyway, so might as
                                // well do this. AO is used typically by astro-imagers who take relatively
                                // long images, so the efficiency impact is usually low.
                                //
                                SUP.AutoGuide(false);
                            } else {
                                //
                                // If this is the last image in the current image set and slewNext was false
                                // (next target is "close" to current) the guider will not have been stopped 
                                // by the start-slew in TakePicture() above. If this is an internal guider 
                                // and we have filters, we must stop guiding now anyway, to allow for a 
                                // filter change and the resulting need to restart guiding to adapt to the
                                // transmissivity change. For external guiders and systems with no filters, 
                                // if slewNext was false, we can leave the guider running across the target 
                                // change.
                                //
                                // Note that if there is only one filter set (Tc.ImageSets.length == 1) then 
                                // we DON'T have a filter change, so we let guiding continue across possible 
                                // Repeats.
                                //
                                if(Prefs.AutoGuiding.SensorType == 1 &&     // Internal only (not OAG or External)
                                            SUP.HaveFilters &&              // And only if have filters
                                            Tc.ImageSets.length > 1 &&      // (see note, be careful!)
                                            iCnt >= (Is.Count - 1))         // Last image in current set
                                {
                                    Console.PrintLine("  (internal guider, prepare for filter change)");
                                    SUP.AutoGuide(false);
                                }
                            }
                        }
                        
                        //
                        // Time for the final-image plate solution, etc. In this version, we'll
                        // attempt solving even if orbital tracking is enabled. PinPoint is pretty
                        // good at solving with trailed stars. We don't count solve failures here
                        // against the solve-fail limit. Also, if one of these final solves fails,
                        // we won't attempt to solve subsequent images in this repeat sequence.
                        //
                        // Update pointing corrector ONCE, AND ONLY IF WE DIDN'T JUST DO A POINTING 
                        // UPDATE ABOVE! ACP will replace any mapping point within 5 deg HA/Dec with 
                        // the new one, and If this is a long sequence, thr result will be a creeping 
                        // mapping point that may sweep through and delete several existing points. 
                        // Note use of puDone below (set above based on initial PU success/fail).
                        //
                        // We do this even if we're stacking, so creep during long sequence will
                        // still be caught. It also avoids all that recentering logic being repeated
                        // in the stacking function!
                        //
                        // NOTE: THIS MESS DESERVES A LONG LOOK SOMETINE FOR SIMPLIFICATION, BUT BE
                        //       VERY CAREFUL AS THERE ARE DRAGONS HERE...
                        //
                        var prevSolveFails = SUP.SolveFails;                // Remember solve-fails
                        var thisSolveOk;
                        lastFWHM = 0;                                       // Assume we won't get a FWHM
                        if(!Prefs.DisableFinalSolve)
                        {
                            if (Tc.NoSolve)
                            {
                                Console.PrintLine("  Final image plate solve prevented by #nosolve for this target.");
                            }
                            else
                            {
                                if(!finalImgSolveFail)                      // Unless we already failed a final image solve
                                {
                                    Console.PrintLine("  Plate-solve final image");
                                    try {
                                        thisSolveOk = SUP.SolvePlate(imgFile + ".fts", 
                                                        Tc.RA, Tc.Dec, Tc.PA, 
                                                        (SUP.PlateScaleH * Camera.BinX),
                                                        (SUP.PlateScaleV * Camera.BinY), 
                                                        tgtMinBrt, tgtSigma, 500, tgtCatMax, 
                                                        60, (!puDone), true)
                                    } catch(ex) {
                                        Console.PrintLine("**SERIOUS PLATE SOLVE ERROR**");
                                        Console.PrintLine("**Source: " + ex.source);
                                        Console.PrintLine("**Message: " + ex.message);
                                        ThisSolveOk = false;
                                    }
                                    if(thisSolveOk)
                                    {
                                        puDone = true;
                                        //
                                        // Pick up the FWHM for the web UI
                                        //
                                        lastFWHM = SUP.LastSolveFWHM;
                                        //
                                        // If too far off, recenter unless it is the last image for
                                        // this target. This is important as it may have pre-slewed
                                        // to the next target. BE CAREFUL HERE SEE GEM:932
                                        //
                                        if(SUP.LastSolvePosErr > Prefs.PointingUpdates.MaximumError)
                                        {
                                            if(Tc.Type != Tc.P_MANUAL && !SUP.DoingOffsetTracking)
                                            {
                                                if(!lastImgOfTgt)           // Don't do this for last image of this target
                                                {
                                                    try {
                                                        if(SUP.Guiding)
                                                            SUP.AutoGuide(false); // SUP will try to restart (old behavior)
                                                        var fbrc = false;
                                                        if(Telescope.AlignmentMode == 2) // GEM only...
                                                        {
                                                            switch(AutoFlipIf(0, Pl.QuitAt, Tc, true))  // Avoid surprise flip in RecenterTarget()
                                                            {
                                                                case AFI_NOFLIP: break;
                                                                case AFI_DIDFLIP: fbrc = true; break;
                                                                case AFI_QUITAT: break Sets; // ==== END FOR QUITAT ===
                                                                default: break;
                                                            }
                                                            
                                                        }
                                                        if(!fbrc)
                                                            SUP.RecenterTarget(Tc.Name, Tc.RA, Tc.Dec); // May fail below horizon!
                                                    } catch(e) {
                                                        Console.PrintLine("  **Recenter failed, ending this target");
                                                        break Repeat;       // Next target
                                                    }
                                                }
                                            }
                                            if(!nxtNeedPU)                  // Unless we already did this
                                            {
                                                nxtNeedPU = true;           // Request PU for next target
                                                Console.PrintLine("  Excessive pointing error, request pointing update for next target");
                                            }
                                        }
                                        else
                                        { 
                                            if(!lastImgOfTgt)               // Don't report on last/only image of a target
                                                Console.PrintLine("  Within max error tolerance, no recenter needed");
                                        }
                                    }
                                    else if(!Pl.AlwaysSolve && !Prefs.AlwaysSolveDataImages) // Unless always want final solves
                                    {
                                        if(!lastImgOfTgt)                   // Don't report on last/only image of a target
                                        {
                                            finalImgSolveFail = true;       // Failed final image solve, don't try again
                                            Console.PrintLine("  Will skip final image solves until target changes");
                                        }
                                    }
                                }
                                else
                                    Console.PrintLine("  First image plate-solve failed, skip solves until target changes");
                            }
                        }
//                      ================= END if(!Prefs.DisableFinalSolve) ==================

                        SUP.SolveFails = prevSolveFails;                    // Restore solve-fails
                        
                        //
                        // ImageCompete User Action
                        //
                        // Return true if no name change, false to stop script, and return a string 
                        // if you want to change the image path/name.
                        //
                        if(SUP.UserActions !== null)
                        {
                            ret = SUP.UserActions.ImageComplete(imgFile + ".fts");   // Call with full name
                            if(ret === false) {                             // False -> stop script
                                Console.PrintLine("** User action ImageComplete returned False");
                                break Sets;
                            }
                            if(ret !== true)                                // If not true, must be file path/name
                            {
                                imgFile = ret.substr(0, ret.length - 4);    // Strip .fts back off
                                if(Tc.Stack)                                // If asked to stack
                                {
                                    Tc.Stack = false;                       // Disable auto-stack
                                    Console.PrintLine("  ImageComplete changed file name, auto-stacking disabled");
                                }
                            }
                        }
                        //
                        // Compress image for web, unless stacking
                        //
                        if(DoCompress && !Tc.Stack)
                        {
                            Util.CompressFile(imgFile + ".fts", imgFile + ".fts.zip");
                            Console.PrintLine("  Image file ZIP-compressed");
                            FSO.DeleteFile(imgFile + ".fts");
                        }
                        else
                            SafeDeleteFile(imgFile + ".fts.zip");           // Delete fossil zipped w/same name
                        nImages += 1;                                       // Count an image actually acquired
                    }  // End count loop
                    
                    iCnt = 0;                                               // Counts completed, reset to 0
                    
                    //
                    // If requested, stack and optionally align the individual images 
                    // into one stacked image. If enabled plate solve and compress the 
                    // stacked image. DO NOT USE Is.Count HERE! It is possible that the 
                    // repeat loop terminated early due to below-limits or the QuitTime. 
                    // The actual number of images is nImages. This affects the stacking
                    // algorithm choice.
                    //
                    if(nImages > 1 && Tc.Stack)
                        StackImages(Tc, Pl, nImages, iSet, iRpt, iImgSet, planName);
                        
                }   // End ImageSet loop
                
                iImgSet = 0;                                                // ImageSets completed, reset to 0
            }   // End Repeat loop
            
            iRpt = 0;                                                       // Repeats completed, reset to 0

            // The next target will be either a new location (in which case slewNext
            // already stopped the guider) or another filter for the same target. If
            // we have an internal guider (only) and filters, we have to stop the guider
            // now for the (assumed) filter change.
            //
            if(SUP.Guiding && Prefs.AutoGuiding.SensorType == 1 && SUP.HaveFilters)
                SUP.AutoGuide(false);

            //
            // Call TargetEnd() user action. Catch old format.
            //
            if(SUP.UserActions !== null)
            {
                try {                                                       // Catch old UserActions
                    if(!SUP.UserActions.TargetEnd(Pl, Tc, Tn)) {
                        Console.PrintLine("**User action TargetEnd returned False");
                        break Sets;
                    }
                } catch(ex) {
                    Console.PrintLine("**Obsolete UserActions detected. Cannot do TargetEnd.");
                }
                    
            }
            
        }   // End target loop
        
        //
        // End of targets. Shut off guider and orbital tracking if needed
        //
        if(SUP.Guiding)
            SUP.AutoGuide(false);                                           // Assure guiding & offset tracking off

        if(SUP.DoingOffsetTracking) SUP.SetTrackOffset(0, 0);

        //
        // Enforce minimum set time
        //
        if(setEndTime !== null)
        {
            if(new Date() < setEndTime)                                     // If we have to wait
            {
                Console.PrintLine("  Set ended before minimum set time, wait until " + 
                            setEndTime.toUTCTimeString());
                TrackOffWaitUntil(setEndTime);
            }
        }
        
        iTgt = 0;                                                           // Targets completed, reset to 0
        
    }  // End Set Loop

    //
    // We may get here as a result of breaking from one of the loops, or
    // normal completion. The counters will reflect the correct
    // completion state in both cases (due to the end-of-target reset
    // logic above).
    //
    Pl.SetsCompleted = iSet;
    Pl.TargetsCompleted = iTgt;
    Pl.RepeatsCompleted = (iRpt == undefined ? 0 : iRpt);                   // Inner loops could be completely skipped (typ.)
    Pl.FilterGroupsCompleted = (iImgSet == undefined ? 0 : iImgSet);
    Pl.CountsCompleted = (iCnt == undefined ? 0 : iCnt);
    if(!Prefs.DisablePlanResume) Pl.UpdateCompletionState();                // Update completion status in plan file
    
    //
    // One way or another the run is ending
    //
    if(new Date() >= Pl.QuitAt)
        Console.PrintLine("**RUN STOPPED AT SPECIFIED QUIT TIME");
        
    if(SUP.Guiding) 
        SUP.AutoGuide(false);
    if(SUP.DoingOffsetTracking) SUP.SetTrackOffset(0.0, 0.0);
    if(Telescope.CanSetTracking)
    {
        Console.PrintLine("  (turning tracking off for safety)");
        Telescope.Tracking = false;
        Util.WaitForMilliseconds(1000);                                     // **TODO** Remove after this is done inside ACP
    }
    
    SUP.JournalForRSS("Run Ended", LockOwner + "'s run has ended.");        // Journal before exiting or chaining
    
    //
    // Plan termination directives (chain, chainscript, shutdown)
    // The plan parser/checker will not allow more than one of these in a plan, so we're safe 
    // here handling them in any order, however a chain-back always takes precedence, so do 
    // it first. 
    //
    if(SEQTOK !== null && (SEQTOK.ChainBackObsPlan !== "" || SEQTOK.ChainBackScript !== ""))  // If we were chained-to with a chain-back request
    {
        if(SEQTOK.ChainBackObsPlan !== "")                                  // Chain back to run an obs plan using ourselves
        {
            // THIS IS NOT YET IN THE PLAN LANGUAGE (e.g. #chainsubplan), SO UNUSED
            Console.PrintLine("== Chaining back to plan " + FSO.GetFileName(SEQTOK.ChainBackObsPlan) + " ==");
            SEQTOK.ObservingPlan = SEQTOK.ChainBackObsPlan;                 // Re-use this seq token, set up next plan
            SEQTOK.ChainBackObsPlan = "";                                   // Clear chain-back request
            Util.ChainParameter = SEQTOK;                                   // Must set this again, cleared by ACP
            Util.ChainScript(Console.Script);                               // Start ourselves again(!) when we exit
        }
        else if(SEQTOK.ChainBackScript !== "")                              // Chain back to script that ran the just completed plan
        {
            Console.PrintLine("== Chaining back to script " + FSO.GetFileName(SEQTOK.ChainBackScript) + " ==");
            SEQTOK.ObservingPlan = "";                                      // Re-use this seq token, clean it up
            buf = SEQTOK.ChainBackScript;                                   // Save the calling script's path, then
            SEQTOK.ChainBackScript = "";                                    // Clear chain-back request
            Util.ChainParameter = SEQTOK;                                   // Must set this again, cleared by ACP
            Util.ChainScript(buf);                                          // Chain back to the calling script
        }
        else
        {
            Console.PrintLine("**Malformed chaining sequence token. Contact the developer!");
        }
    }
    else if(Pl.ChainPlan !== "")
    {
        Console.PrintLine("== Chaining to plan " + FSO.GetFileName(Pl.ChainPlan) + " ==");
        if(FSO.GetParentFolderName(Pl.ChainPlan) === "")                    // If chain file has no path
            buf = FSO.GetParentFolderName(plnFile) + "\\" + Pl.ChainPlan;   // Prepend the just-completed plan's path
        else
            buf = Pl.ChainPlan;                                             // Full path/name given
        //
        // Implement chain-back. THIS IS NOT YET IN THE PLAN LANGUAGE (e.g. #chainsubplan), SO UNUSED
        //
        if(Pl.ChainBack) {                                                  // If chain-back set, we need a seq token
            Console.PrintLine("   (chain-back specified)");
            SEQTOK = new ActiveXObject("ACP.SequenceToken");                // Make a new SequenceToken
            SEQTOK.ObservingPlan = buf;                                     // Next plan to run
            SEQTOK.ChainBackObsPlan = plnFile;                              // Chain back to this (the current) plan
            Util.ChainParameter = SEQTOK;                                   // Chain with full sequence token
        } else {                                                            // Simple chain, just pass string plan file
            Util.ChainParameter = buf;                                      // Set up the chain
        }
        Util.ChainScript(Console.Script);                                   // Start ourselves again(!) when we exit
    }
    else if(Pl.ChainScript !== "")
    {
        Console.PrintLine("== Chaining to script " + FSO.GetFileName(Pl.ChainScript) + " ==");
        if(FSO.GetDriveName(Pl.ChainScript) === "")                         // If chain file has relative path
            buf = ACPApp.Path + "\\scripts\\" + Pl.ChainScript;             // use AutoFlat.vbs in ACP scripts folder
        else
            buf = Pl.ChainScript;                                           // Full path/name given
        Util.ChainScript(buf);                                              // Chain to given/resolved script
    }
    else if(Pl.Shutdown)
    {
        if(LocalUser || LocalWeb || WebAdmin) {
            SUP.JournalForRSS("Observatory Shutdown", LockOwner + " has shut down the observatory.");
            Console.PrintLine("== Requested observatory shutdown ==");
            SUP.Shutdown();
        } else {
            Console.PrintLine("**No permission to shut down the observatory. Skipped");
        }
    }
    
    Pl.Term();
    Pl = null;
    Console.PrintLine("End of run.");
    SUP.Terminate();
    SUP = null;
    FSO = null;
    Console.Logging = false;
}

// =========================
// DIRECTIVE IMPLEMENTATIONS
// =========================

// --------------
// AcqCalFrames() - Acquire calibration (dark/bias) frame(s)
// --------------
//
// Differentiates between bias and dark, bumps the appropriate
// in-set sequence number (for path/name construction). If an
// explicit cal image path/name was given with the #DARK/#BIAS 
// pseudo-target, compression is forced OFF, since the image is 
// likely being placed into a cal library and should not be zipped.
// Don't pay attention to Tc.Type, just look at the exposure and
// select from that, This avoids the problem of the compiler
// looking at just the first exposure interval in a count group.
//
function AcqCalFrames(Tc, Pl, iSet, planName)
{
    for(var i in Tc.ImageSets)
    {
        var iRpt, intv, fn, comp;

        if(Tc.ImageSets[i].Interval === 0) {
            Tc.Type = Tc.P_BIAS;                                            // Fix this up for this count group
            Tc.Name = "Bias";
            iRpt = BiasSeq;
            BiasSeq += 1;
            intv = 0;
        } else {
            Tc.Type = Tc.P_DARK;                                           // Fix this up for this count group
            Tc.Name = "Dark";
            iRpt = DarkSeq;
            DarkSeq += 1;
            intv = -Tc.ImageSets[i].Interval;
        }
        for(var j = 0; j < Tc.ImageSets[i].Count; j++)
        {
            if(Tc.ImageSets.length > 1 || Tc.CalPathName === "") {          // If multi cal sets or no explicit cal file path/name
                fn = MakeFilePathName(CALPATH, Tc, Pl, iSet, iRpt, i, j, planName);   // Make path/name per template
                comp = DoCompress;
            } else {                                                        // Got explicit path/name
                fn = Tc.CalPathName.replace(/\.fts/i, "");                  // Remove .fts extension
                comp = false;                                               // Force compression off
            }
            SUP.TakePicture(intv, Tc.ImageSets[i].Binning, Tc.ImageSets[i].SubFrame, 0.0, 0, fn,
                            "", false, false, comp, false, "", "", 0, 0, false, "", "", 
                            0, 0, false, 0);                                // AcqSup does not delete or log zip
        }
    }
}

//
// ChangeCoolerTemp() - Change the cooler temperature
//
// Waits up to 15 minutes for the temperature to reach within
// 2 deg C of the setpoint.
//
function ChangeCoolerTemp(temp, tol)
{
    if(Camera.CanSetTemperature)
    {
        if(!Camera.CoolerOn)
        {
            Camera.CoolerOn = true;
            Console.PrintLine("  Turning on imager cooler");
            Util.WaitForMilliseconds(5000);                                 // Wait for things to settle down
        }
        Camera.TemperatureSetpoint = temp;                                  // Change camera temperature
        Console.PrintLine("  Setting imager cooler to " +
                     Util.FormatVar(temp, "0.0") + " deg. C (+/- " +
                     Util.FormatVar(tol, "0.0") + ")");
        //
        // Wait up to 15 minutes for the imager to reach the new temperature
        // It must remain in tolerance for 30 sec straight.
        //
        var j = 0;                                                          // Counts times within tolerance
        for(var i = 0; i < 90; i++)
        {
            if(i % 6 === 0)                                                 // Report once a minute
                Console.PrintLine("   (temp is " + Math.floor(Camera.Temperature) + " deg. C)");
            Util.WaitForMilliseconds(10000);                                // Wait 10 sec
            if(Math.abs(Camera.Temperature - Camera.TemperatureSetpoint) <= tol) {
                j += 1;
                if(j >= 6) break;                                           // Been in tol for 60 sec, OK!
            } else {
                j = 0;                                                      // (back) out of tol
            }
        }
        if(i >= 90)
            throw new Error(0x80040001, "** #CHILL - imager failed to settle within " + tol + 
                    " deg of setpoint " + temp + " in 15 minutes.");
    }
    else
        Console.PrintLine("** #CHILL - Imager's temperature is not controllable, skipped.");
}

// ----------
// OpenDome() - Open the dome or roof if possible, assure slaving
// ----------
//
// Return true/false for success/failure
//
function OpenDome()
{
    if(Dome.Available && Dome.CanSetShutter)
    {
        if(Dome.ShutterStatus == 1)                                          // 1 = shutterClosed
        {
            Console.PrintLine("  Opening shutter");
            Dome.OpenShutter();
            for(var i = 0; i < 20; i++)                                      // Wait for up to 5  minutes
            {
                if(Dome.ShutterStatus === 0)
                {
                    Console.PrintLine("  Shutter now open.");
                    break;
                }
                else if(Dome.ShutterStatus == 4)
                    Console.PrintLine("  ?? Shutter error being reported, still waiting for open ??");
                Util.WaitForMilliseconds(15000);                            // Check every 15 seconds
            }
            if(i >= 20) 
            {
                Console.PrintLine("** #domeopen - Shutter failed to open after 5 minutes");
                return false;
            }
        }
        else if(Dome.ShutterStatus === 0) {                                 // 0 = shutterOpen
            Console.PrintLine("  (shutter already open)");
        } else {                                                            // Some other (bad) status
            Console.PrintLine("** #domeopen - Unexpected shutter status " + Dome.ShutterStatus);
            return false;
        }
        //
        // Assure the dome is slaved if it is rotatable
        //
        if(Dome.CanSlew)
        {
            if((Dome.CanFindHome && Dome.AtHome) || (Dome.CanPark && Dome.AtPark)) 
            {
                Console.PrintLine("  Dome was homed or parked - enabling slaving (wait 30)");
                Dome.UnParkHome();                                          // Will also slave it
                Util.WaitForMilliseconds(30000);                            // Make sure it's rotating (typ.)
            }
            else if(!Dome.Slaved)                                           // Unslaved maybe by rotation abort?
            {
                Console.PrintLine("  Dome is not slaved - enabling slaving (wait 30)");
                Dome.Slaved = true;
                Util.WaitForMilliseconds(30000);
            }
            WaitForSlews();                                                 // Don't proceed until dome is lined up
        }
    }
    else
        Console.PrintLine("** #domeopen - No dome or no shutter control available, skipped.");
    return true;
}

// -----------
// CloseDome() - Close the dome or roof if possible
// -----------
//
// Return true/false for success/failure
//
function CloseDome()
{
    if(Dome.Available && Dome.CanSetShutter)
    {
        var z;
        try {
            z = Telescope.AtPark;                                           // Not implemented in V1 scope driver
        } catch(e) {
            z = false;                                                      // Unknown, assume not parked
        }
        if(Dome.ScopeClearsClosedDome || z)                                 // If safe to close up
        {
            if(Dome.ShutterStatus === 0)                                    // 0 = shutterOpen
            {
                Console.PrintLine("  Closing shutter");
                Dome.CloseShutter();                                        // Open the shutter
                for(var i = 0; i < 20; i++)                                 // Wait for up to 5  minutes
                {
                    if(Dome.ShutterStatus == 1)
                    {
                        Console.PrintLine("  Shutter now closed.");
                        break;
                    }
                    else if(Dome.ShutterStatus == 4)
                        Console.PrintLine("  ?? Shutter error being reported, still waiting for close ??");
                    Util.WaitForMilliseconds(15000);                        // Check every 15 seconds
                }
                if(i >= 20)
                {
                    Console.PrintLine("** #domeopen - Shutter failed to close after 5 minutes");
                    return false;
                }
            }
            else if(Dome.ShutterStatus == 1) {                              // 0 = shutterOpen
                Console.PrintLine("  (shutter already closed)");
            } else {                                                        // Some other (bad) status
                Console.PrintLine("** #domeclose - Unexpected shutter status " + Dome.ShutterStatus);
                return false;
            }
        }
        else
            Console.PrintLine("** #domeclose - Unsafe to close shutter or roof, skipped.");
    }
    else
        Console.PrintLine("** #domeclose - No dome or no shutter control available, skipped.");
    return true;
}

// -----------
// WaitUntil()
// -----------
//
function WaitUntil(Tc, Pl, iSet)
{
    var t = Tc.WaitUntil[iSet];
    if(typeof t == 'number')                                                // Negative real, sun down angle
    {
        var tSaved = t;
        try {
            t = nearestDusk(t);                                             // Convert to sunset date/time
        } catch(ex) {
            Console.PrintLine("  #waituntil for " + Tc.Name + " failed. Sun never below " + t + " deg.");
            return false;                                                   // Skip this target;
        }
        if(t === null)                                                      // Sun always below given angle!
        {
            Console.PrintLine("  (no wait for dark, Sun always below " + tSaved + " degrees)");
            return true;
        }
        Console.PrintLine("  (wait until sun below " + tSaved + " degrees at " + t.toUTCTimeString() + ")");
    }
    else
    {
        t = new Date(t);                                                    // From compiler, toUTCTimeString() below fails w/o this ????
        Console.PrintLine("  (wait until " + t.toUTCTimeString() + ")");
    }
    if(t > Pl.QuitAt) 
    {
        Console.PrintLine("  #waituntil for " + Tc.Name + EXTMSG);
        return false;
    }
    
    if(Tc.Type == Tc.P_MANUAL)
        Util.WaitUntil(t.getVarDate());
    else
        TrackOffWaitUntil(t);
        
    return true;
}

// ---------
// WaitFor()
// ---------
//
function WaitFor(Tc, Pl)
{
    if(new Date().addSeconds(Tc.WaitFor) > Pl.QuitAt)
    {
        Console.PrintLine("  #waitfor for " + Tc.Name + EXTMSG);
        return false;
    }
    Console.PrintLine("  (pause for " + Tc.WaitFor + " sec.)");
    if(Tc.Type == Tc.P_MANUAL)
        Util.WaitForMilliseconds(Tc.WaitFor * 1000);                        // Never turn tracking off
    else
        TrackOffWaitFor(Tc.WaitFor);
    
    return true;
}

// --------------
// WaitInLimits()
// --------------
//
// Waits till target is within observatory limits. Returns false and logs
// skipping the target if it will not be within limits. This is a bit
// crude, but it's the only way as the horizon curve could be in the 
// shape of Bozo the Clown. Tc.WaitUntil already validated, not 0.
//
// Ephemeris is updated at start in case previous waits.
//
function WaitInLimits(Tc, Pl)
{
    var t, bInLimits;

    Tc.UpdateEphem();                                                       // Update target's RA/Dec (sol sys objs)
    
    var tNow = new Date();
    var tEnd = tNow.addSeconds(Tc.WaitInLimits * 60);                       // Wait in minutes -> sec

    var site = new ActiveXObject("NOVAS.Site");
    site.Latitude = Util.ScriptTelescope.SiteLatitude;
    site.Longitude = Util.ScriptTelescope.SiteLongitude;
    site.Height = Util.ScriptTelescope.SiteElevation;
    site.Temperature = Util.Prefs.SiteTemperature;

    var objv = new ActiveXObject("NOVAS.Star");

    for(t = tNow; t <= tEnd; t = t.addSeconds(60))                          // 1 minute steps
    {
        //
        // Project coordinates forward by rates
        //
        var dt = (t - tNow) / 1000;                                         // Time ahead, seconds
        var dRA = Tc.RARate * dt / 60.0;                                    // RA change, minutes
        var dDec = Tc.DecRate * dt / 60.0;                                  // Dec change, arcminutes
        var offsCoord = SUP.EquOffset(Tc.RA, Tc.Dec, dRA, dDec);            // Get future RA/Dec
        objv.RightAscension = offsCoord[0];                                 // Future RA
        objv.Declination = offsCoord[1];                                    // Future Dec
        //
        // Convert final coords to local topo
        //
        var ujd = Util.Date_Julian(t.getVarDate());
        var tjd = ujd + (Util.DeltaT(ujd) / 86400);
        var tvec = objv.GetTopocentricPosition(tjd, site, false);
        //
        // Do limit checks
        //
        bInLimits = true;                                                   // Assume success
        if(tvec.Elevation < Util.Prefs.MinimumElevation)
            bInLimits = false;
        else if(tvec.Elevation < Util.Prefs.GetHorizon(tvec.Azimuth))
            bInLimits = false;
        else
        {
            switch(Telescope.AlignmentMode)
            {
                case 0:                                                     // AltAz
                    if(tvec.Elevation >= Util.Prefs.TiltUpLimit) bInLimits = false;
                    break;
                case 1:                                                     // Non-German polar
                    if(Tc.Dec >= Util.Prefs.TiltUpLimit) bInLimits = false;
                    break;
                default:                                                    // for JSL
                    break;
            }
        }
        var t2 = t.addSeconds(10);                                          // Add 10 sec. slop time
        if(bInLimits)                                                       // If in limits now or in future
        {
            if(t2 > tNow)                                                   // If in limits in future
            {
                if((tNow + t2) > Pl.QuitAt) 
                {
                    Console.PrintLine("  #waitinlimits for " + Tc.Name + EXTMSG);
                    return false;
                }
                Console.PrintLine("  (wait for " + Tc.Name + " in limits at " + t.toUTCTimeString() + ")");
                TrackOffWaitUntil(t2);
            }
            return true;                                                    // Success, === EXIT FUNCTION ===
        }
    }
    Console.PrintLine("  " + Tc.Name + " will not be in limits within " +
                                            Tc.WaitInLimits + " minutes, skipped.");
    return false;                                                           // Wait failed. skip target
}

// -------------
// WaitAirMass() - Wait till target gets within air mass
// -------------
//
// Returns False if target should be skipped
//
function WaitAirMass(Tc, Pl)
{
    return WaitForRise(Tc, Pl, SUP.ZDFromAirMass(Tc.WaitAirMass.AirMass), Tc.WaitAirMass.TimeLimit, 
                    "air mass " + Util.FormatVar(Tc.WaitAirMass.AirMass, "0.00"));
}

// -------------
// WaitZenDist() - Wait till target gets within zenith distance
// -------------
//
// Returns False if target should be skipped
//
function WaitZenDist(Tc, Pl)
{
    return WaitForRise(Tc, Pl, Tc.WaitZenDist.ZenDist, Tc.WaitZenDist.TimeLimit,
                    "zenith distance " + Util.FormatVar(Tc.WaitZenDist.ZenDist, "0") + " deg");
}

// ===========================
// UTILITY & SUPPORT FUNCTIONS
// ===========================

// ------------
// SafeSlewIf() - Slew if needed
// ------------
//
// Start slew to target only if not already within the pointing
// limits. Returns false if fails for limits. If succeeds, and
// rotator is present, slew it if the error is > 1 degree. Before
// all of this, it updates the ephemeris if needed via 
// TargetInLimits(). FocusAfterFlip tells us whether we should do an
// AutoFocus here after a flip. This evil feature probably should
// not be here.
//
function SafeSlewIf(Tgt, Reason, FocusAfterFlip)
{
    
    var willFlip = WouldFlip(Tgt.RA, Tgt.Dec);                              // True if slew flips GEM, used to force rotator slew
    
    if(!TargetInLimits(Tgt, Reason)) return false;                          // Unsafe for limits (Update ephemeris)
    
    //
    // TargetCloseEnough() is slow!
    //
    if(willFlip || !TargetCloseEnough(Tgt))                                 // Flip requires slew regardless!
    {
        SUP.StartSlewJ2000(Tgt.Name, Tgt.RA, Tgt.Dec);
    }
    else
    {
        Console.PrintLine("  (no slew, scope already within max error of target)");
        if(Prefs.PointingUpdates.Simulate)                                  // If simulating (need for initial target)
            SUP.CalcSimImageCoordinates(Tgt.RA, Tgt.Dec);                   // Calculate simulator image
    }

    if(SUP.HaveRotator)
    {
        if(Prefs.PointingUpdates.Simulate || !RotatorCloseEnough(Tgt) || willFlip) // Flip & Simulate require rotation regardless!
            SUP.StartRotateToPA(Tgt.PA, Tgt.RA);                            // Rotate if > 1.0 deg error
        else
            Console.PrintLine("  (no rotate, already close enough to desired PA)");
    }
    if(Prefs.AutoFocus.FocusAfterFlip && FocusAfterFlip && willFlip)
    {
        Console.PrintLine("  (flipped: focus on flip, waiting here for slew/rotation...)");
        WaitForSlews();
        Console.PrintLine("  (forcing autofocus after GEM flip...)");
        if(SUP.AutoFocus(Tgt.RA, Tgt.Dec)) {                                // If successful
            if(PerAFTime !== null)                                          // If periodic AF in effect
                PerAFTime = new Date().addSeconds(Tgt.Plan.AFinterval * 60);  // Next per AF at this time
        }
    }
    return true;
}

// -------------------
// TargetCloseEnough() - Test if scope is already close enough to target
// -------------------
//
function TargetCloseEnough(Tgt)
{
    if(Prefs.SlewSettleTime < 5)                                            // Allow up to 5 sec for polling
        Util.WaitForMilliseconds((5 - Prefs.SlewSettleTime) * 1000);        // So scope coords valid below
    Tgt.UpdateEphem();                                                      // Update ephemeris
    if(Prefs.DoLocalTopo)
    {
        SUP.LocalTopocentricToJ2000(Telescope.RightAscension, Telescope.Declination);
        return (SUP.EquDist2(Tgt.RA, Tgt.Dec, SUP.J2000RA, SUP.J2000Dec) <= 
                (Prefs.PointingUpdates.MaximumError / 60));
    }
    else
    {
        return (SUP.EquDist2(Tgt.RA, Tgt.Dec, Telescope.RightAscension, Telescope.Declination) <= 
                (Prefs.PointingUpdates.MaximumError / 60));
    }
}

// --------------------
// RotatorCloseEnough() - Test if rotator is already close enough to target
// --------------------
//
function RotatorCloseEnough(Tgt)
{
    if(SUP.HaveRotator) 
        return (Math.abs(RangeAngle((Tgt.PA - SUP.RotatorPositionAngle), -180.0, 180.0)) <= 0.2);
    else
        return true;                                                        // No rotator, close enough!
}

// ----------------
// TargetInLimits() - Test limits at CURRENT time
// ----------------
//
function TargetInLimits(Tgt, Reason)
{
    Tgt.UpdateEphem();                                                      // Update ephemeris
    try {
        Util.EnforceSlewLimits(Tgt.RA, Tgt.Dec);
        return true;
    } catch(e) {
        Console.PrintLine("**(" + Reason + ") " + Tgt.Name + " skipped: " + e.description);
        return false;
    }
}

// ----------------------
// LightTargetImmediate() - Test if next target is a live/light frame and can be started any time
// ----------------------
//
// Used to control whether TakePicture() does slew-ahead, and only that!
//
function LightTargetImmediate(Tgt)
{
    return ((Tgt.WaitFor === 0) &&
            (Tgt.WaitAirMass === null) &&
            (Tgt.WaitInLimits === 0) &&
            (Tgt.WaitUntil.length === 0) &&
            (Tgt.WaitZenDist === null) &&
            !Tgt.NonImage && 
            !Tgt.CalFrame);
}
            
// --------------
// WaitForSlews() - Wait for scope and rotator slews to complete
// --------------
//
function WaitForSlews()
{
    SUP.WaitForSlew();
    if(SUP.HaveRotator) SUP.WaitForRotator();
}

// -------------
// WaitForRise() - Common function for WaitZenDist() and WaitAirMass()
// -------------
//
// Waits or skips target based on required zenith distance and max wait time.
// Returns False if target should be skipped.
//
// WARNING! DOES NOT ACCOUNT FOR ORBITAL MOTION OF SOLAR SYSTEM BODIES!
//
function WaitForRise(Tc, Pl, zd, tMax, TypeStr)
{
    Tc.UpdateEphem();                                                       // Update target's RA/Dec (sol sys objs)
    
    var rLST = SUP.LSTRise(Tc.RA, Tc.Dec, zd);                              // Rising LST
    switch(rLST)
    {
        case -2:                                                            // Always above
            return true;                                                    // == RET == It's ready to shoot
        case -1:                                                            // Never above
            Console.PrintLine("  " + Tc.Name + " never within " + TypeStr +", skipped.");
            return false;                                                   // == RET == Never rises
        default:                                                            // for JSL
            break;
    }
    var nLST = Util.NowLST();                                               // Current LST (apparent, but close enuf)
    //
    // First check if target has already set.
    //
    var haTgt = Util.HourAngle12(Tc.RA, nLST);                              // Current hour angle of the target
    var haSet = Range12(Tc.RA - rLST);                                      // Setting hour angle (careful on signs here)
    if(haTgt > haSet)
    {
        Console.PrintLine("  " + Tc.Name + " beneath " + TypeStr +" in west, skipped.");
        return false;                                                       // === RET === Already set in west
    }
    //
    // Now check if it has already risen
    //
    if(haTgt > -haSet) return true;                                         // === RET === Already risen
    //
    // Has not yet risen. ttRise is the Sidereal time till rise, hours.
    //
    var ttRise = Range12(rLST - nLST);                                      // Sidereal time to rise
    var ttWait = (ttRise / SIDRATE);                                        // Clock time to wait, hours
    if((ttWait * 60) > tMax)                                                // Too long till rise
    {
        Console.PrintLine("  " + Tc.Name + " not within " + TypeStr +" before time limit, skipped.");
        return false;                                                       // === RET === Wait exceeds limit, skip the target
    }
    //
    // Wow, we can actually wait!
    //
    var tNow = new Date();
    var t = tNow.addSeconds(ttWait * 3600);                                 // Rising clock time (hrs -> sec)
    if(t > tNow)                                                            // If not yet risen
    {
        if((tNow + t) > Pl.QuitAt)                                          // If wait past plan quit time
        {
            Console.PrintLine("  #waitxxx " + TypeStr + " for " + Tc.Name + EXTMSG);
            return false;
        }
        Console.PrintLine("  (wait for " + Tc.Name + " within " + TypeStr +" at " + t.toUTCString() + ")");
        TrackOffWaitUntil(t);
    }

    return true;                                                            // It's ready to shoot
}

// -----------
// WouldFlip()
// -----------
//
// Test if a slew will result in a flip. This handles both "normal" flips caused by 
// an east-to-west flip point crossing, as well as sub-polar west-to-east flips.
// Returns false for non-GEM. [8.1] WTF, this should indicate a flip no matter 
// what. I hope.
//
function WouldFlip(RA, Dec)
{
    if (Telescope.AlignmentMode != 2) return false;                         // Only GEMs flip
//     var absha = Math.abs(Util.HourAngle12(Telescope.RightAscension));
//     return ((absha < 6.0 && !Util.GemWestOfPier && Util.IsGEMDestinationWest(RA, Dec)) ||
//             (absha > 6.0 && Util.GemWestOfPier && !Util.IsGEMDestinationWest(RA, Dec)));
    return (Util.GemWestOfPier != Util.IsGEMDestinationWest(RA, Dec));
}

// ------------
// AutoFlipIf()      WARNING! REPEATED IN ACQUIRESCHEDULER.VBS
// ------------
//
// Given a time needed before flip, and some current state variables,
// perform an auto-flip if the time needed exceeds the time remaining
// before the mount reaches the westbound flip limit. TimeNeeded Is
// given in seconds.
//
// This checks to see of this exposure could cause the westbound flip 
// limit to be crossed. If so, wait for a safety time, then issue a 
// slew command to force the mount to flip. The slew command must be the
// whole fish, including CA... We test if TimeNeeded would end at or past 
// TimeNeeded sec short of of westbound limit, then wait the safety interval 
// plus POSTFLIPMARGIN to be sure, then do a slew to force the flip.
//
// NOTE: Because the coordinates are being bounced against the LST to get
// the HA, to avoid little holes where the flip would be missed, the target
// coordinates used in the calculations must be in local topo!
//
// NOTE: timeNeeded can be negative, indicating that the requested op can
// fit within the time before the mount reaches its 'track past" time. If
// this is the case, yet the mount/target has already crossed the flip point
// then flip anyway. In other words, don't start an exposure with the target
// past the flip point, even throogh it would fit before the "track past" HA;
// just go ahead and flip. 
//
// FInally, for the evil "focus on flip" feature for sh**ty mounts, if the
// FocusAfterFlip arg is true, then do a complete AutoFocus if the mount did
// flip. This may be called during AF operations and thus that action is
// not always wanted here!!
//
// Returns:
//  AFI_NOFLIP      No flip needed
//  AFI_DIDFLIP     Mount was flipped (after a possible wait) and pointing updated
//  AFI_QUITAT      The wait needed would have exceeded the #quitat time, not flipped.
//
function AutoFlipIf(timeNeeded, quitAtTime, Tgt, FocusAfterFlip)
{
    var RA, Dec, beginSideOfPier;
    if(Prefs.DoLocalTopo)                                                   // This must be done in scope coordinates
    {
        SUP.J2000ToLocalTopocentric(Tgt.RA, Tgt.Dec);
        RA = SUP.LocalTopoRA;
        Dec = SUP.LocalTopoDec;
    }
    else
    {
        RA = Tgt.RA;
        Dec = Tgt.Dec;
    }
    
    SUP.WaitForSlew();                                                      // In case called after starting a slew
    // Flip if exposure + margin crosses flip point or if it's aready past the flip point (see explanation above)
    var z = Range24(RA - (Math.max(0, timeNeeded) / 3600.0));               
    var wf = WouldFlip(z, Dec);
    Console.PrintLine("  [flip check: " + 
        " Tn=" + Math.ceil(timeNeeded) + "s" + 
        " HAc=" + Math.ceil(Util.HourAngle12(Telescope.RightAscension) * 3600) + "s" + 
        " GW=" + (Util.GemWestOfPier ? "T" : "F") + 
        " HAz=" +  Math.ceil(Util.HourAngle12(z) * 3600) + "s" +
        " DWz=" + (Util.IsGEMDestinationWest(z, Dec) ? "T" : "F") + 
        " WF=" + (wf ? "YES" : "no") + "]");

    if(!wf) return AFI_NOFLIP;                                              // ==== RETURNING FOR NO FLIP ====
    
    SUP.AutoGuide(false);                                                   // Stop guider for the wait
    if(SUP.DoingOffsetTracking) SUP.SetTrackOffset(0.0, 0.0);               // Shut it off for the wait (avoid trap if offs not supported!)
    Console.PrintLine("  (GEM must flip before next operation)");
    Console.PrintLine("  [FPw=" + Math.ceil(Prefs.GEMFlipWestbound * 240) + "s" + // Trace in seconds
        " FPe=" + Math.ceil(Prefs.GEMFlipEastbound * 240) + "s" + 
        " HAt=" + Math.ceil(Util.HourAngle12(RA) * 3600) + "s" + 
        " PFM=" + Math.ceil(POSTFLIPMARGIN) + "s") + "]";
    if(!Util.GemWestOfPier)                                                 // Normal flip
        z = Math.ceil((((Prefs.GEMFlipWestbound / 15.0) - Util.HourAngle12(RA)) * 3600.0) + POSTFLIPMARGIN);
    else                                                                    // Sub-polar flip
        z = Math.ceil((((Prefs.GEMFlipEastbound / 15.0) + 12.0 - Util.HourAngle12(RA)) * 3600.0) + POSTFLIPMARGIN);
    if(z > 43200) z = 86400 - z;                                            // Handle wraparound
    if(z > 0)
    {
        var endTime = new Date();
        endTime.setTime(endTime.getTime() + (z * 1000));
        if(endTime > quitAtTime)
        {
            Console.PrintLine("**Wait of " + z + " sec would go beyond #quitat time, cannot continue");
            return AFI_QUITAT;                                              // ==== RETURNING FOR QUITAT ====
        }
        Console.PrintLine("  (waiting " + z + " sec to pass flip limit)");
        Console.PrintLine("  (wait ends at " + endTime.toUTCTimeString() + ")");
        isFlipWaiting = true;                                               // For web UI status
//      ===================
        TrackOffWaitFor(z);                                                 // Wait with tracking off
//      ===================
        isFlipWaiting = false;
    }
    else
    {
        Console.PrintLine("  (no wait needed, already past flip limit)");
    }
    
    Tgt.UpdateEphem();                                                      // Update ephemeris as needed
    if(!TargetInLimits(Tgt, "auto-flip"))                                   // Check limits (can't use SafeSlewIf()!!!)
            throw new Error(0x80040001, "**Target went out of limits during auto-flip"); // **OOPS** FAILED!
    Console.PrintLine("  (flipping mount...)");
    if(HardwarePierSide) beginSideOfPier = Telescope.SideOfPier;            // See Gemini hack below
    SUP.StartSlewJ2000(Tgt.Name, Tgt.RA, Tgt.Dec);                          // MUST SLEW ALWAYS
    if(SUP.HaveRotator) 
    {
        Console.PrintLine("  (rolling rotator over 180 deg...)");           // This can be really slow so do it first
        SUP.StartRotateToPA(Tgt.PA, Tgt.RA);                                // Rotator will flip here
    }
    WaitForSlews();                                                         // Wait for all of that
    //
    // The following was added for the Gemini which will sometimes (?) not flip
    // despite reporting pier side and destination for the target being different.
    // We have already slewed to the target coordinates.
    //
    if(HardwarePierSide &&                                                  // Safe due to short-circuit boolean
        Telescope.SideOfPier == beginSideOfPier)
    {
        if(CanExplicitlyFlip)
        {
            Console.PrintLine("  (slew failed to flip!)");
            Console.PrintLine("  (doing explicit flip by command...)");
            if(Dome.Available) Dome.Slaved = false;
            Telescope.SideOfPier = (Telescope.SideOfPier === 0 ? 1 : 0);    // Flip it (either way)
            WaitForSlews();                                                 // Wait for flip and (maybe) rotator
            Console.PrintLine("  (commanded flip complete. Re-slewing to target...)");
            if(Dome.Available) Dome.Slaved = true;                          // Re-slave so upcoming slew will slew dome
            SUP.StartSlewJ2000(Tgt.Name, Tgt.RA, Tgt.Dec);                  // Just in case, re-slew to target after flip
            WaitForSlews();
            if(Telescope.SideOfPier == beginSideOfPier)
                throw new Error(0x80040001, "**Mount failed commanded pier side change or flipped back on target slew. This is a mount/driver bug.");
        }
        else
        {
            throw new Error(0x80040001, "**Mount failed to flip based on its reported pier side info. This is a mount/driver bug.");
        }
    }
    Console.PrintLine("  (flip completed)");
    //
    // Take care of Focus On Flip for the "in image series" case
    //
    if(Prefs.AutoFocus.FocusAfterFlip && FocusAfterFlip)
    {
        Console.PrintLine("  (forcing autofocus after GEM flip...)");
        if(SUP.AutoFocus(Tgt.RA, Tgt.Dec)) {                                // If successful
            if(PerAFTime !== null)                                          // If periodic AF in effect
                PerAFTime = new Date().addSeconds(Tgt.Plan.AFinterval * 60);  // Next per AF at this time
        }
    }
    if(Util.Prefs.PointingUpdates.Enabled)                                  // Do a PU even for #manual target
    {
        if(Prefs.AutoFocus.FocusAfterFlip)
            Console.PrintLine("  (doing post-flip-focus pointing update...)");
        else
            Console.PrintLine("  (doing post-flip pointing update...)");
        isPointing = true;
        SUP.UpdatePointing(Tgt.Name, Tgt.RA, Tgt.Dec, Tgt.PA);              // Flip can upset pointing!
        isPointing = false;
    }
    return AFI_DIDFLIP;
}

// -----------------
// TrackOffWaitFor()
// -----------------
//
// Waits with tracking off (if >= MINTRACKOFFSEC sec). Used in multiple places.
// Preserves current tracking state, which may be off upon entry.
//
function TrackOffWaitFor(Seconds)
{
    var rMsg = "  (wait finished";
    var wasTracking;
    if(Telescope.CanSetTracking)
    {
        wasTracking = Telescope.Tracking;
        if(Seconds >= MINTRACKOFFSEC && wasTracking)
        {
            if(SUP.Guiding) 
                SUP.AutoGuide(false);                                       // Stop guider if needed
            Console.PrintLine("  (turning tracking off)");
            Telescope.Tracking = false;
            rMsg += ", resuming tracking";
        }
    }
    Util.WaitForMilliseconds(Seconds * 1000);
    if(Telescope.CanSetTracking && wasTracking) 
    {
        Telescope.Tracking = true;
        Util.WaitForMilliseconds(1000);                                     // **TODO** Remove after this is done inside ACP
    }
    Console.PrintLine(rMsg + ")");
}

// -------------------
// TrackOffWaitUntil()
// -------------------
//
// Waits with tracking off (if > WUTRACKOFFSEC sec). Used in multiple places.
// Preserves current tracking state, which may be off upon entry.
//
function TrackOffWaitUntil(DateTime)
{
    var rMsg = "  (wait finished";
    var wasTracking;
    if(Telescope.CanSetTracking)
    {
        wasTracking = Telescope.Tracking;
        if(((DateTime.getTime() - new Date().getTime()) / 1000) >= WUTRACKOFFSEC && wasTracking)
        {
            if(SUP.Guiding) 
                SUP.AutoGuide(false);                                       // Stop guider if needed
            Console.PrintLine("  (turning tracking off)");
            Telescope.Tracking = false;
            rMsg += ", resuming tracking";
        }
    }
    Util.WaitUntil(DateTime.getVarDate());
    if(Telescope.CanSetTracking && wasTracking) 
    {
        Telescope.Tracking = true;
        Util.WaitForMilliseconds(1000);                                     // **TODO** Remove after this is done inside ACP
    }
    Console.PrintLine(rMsg + ")");
}


// -------------
// StackImages() - Stack and optionally align images from a repeat set
// -------------
//
// Note that MaxIm already adds up the exposure times in the FITS
// header, so we don't have to mess with it. As for the exposure start
// time, I'm just leaving it as the start time of the first image.
//
function StackImages(Tgt, Pl, n, iSet, iRpt, iImgSet, plnName)
{
    var wfn = MakeFilePathName(IMGPATH, Tgt, Pl, iSet, iRpt, iImgSet, -1, plnName);  // Get wildcard path for stacking
    var sfn = wfn.replace(/\*/, "STACK");                                   // Just replace * with STACK

    SafeDeleteFile(sfn + ".fts");                                           // Get rid of any fossils now!
    SafeDeleteFile(sfn + ".fts.zip");
    SafeDeleteFile(sfn + ".fts.stars");
    
    Console.PrintLine("  Combining " + n + " images into stacked image.");
    try
    {
        if(Tgt.Align)
            Camera.Document.CombineFiles(wfn + ".fts", 1, true, 0, false);  // Stack and align
        else
            Camera.Document.CombineFiles(wfn + ".fts", 2, false, 0, false); // Just stack
            
        Camera.Document.SaveFile(sfn + ".fts", 3, false, 3);                // Save IEEE Floating point (preserve dyn range)
        
        if(!Prefs.DisableFinalSolve)
        {
            //
            // Solve the plate, DO NOT UPDATE CORRECTOR OR FWHM STATS!!!
            //
            Console.PrintLine("  Plate-solve final image");
            var prevSolveFails = SUP.SolveFails;                            //  Don't count solve fail against limit count
            SUP.SolvePlate(sfn + ".fts", Tgt.RA, Tgt.Dec, Tgt.PA, (SUP.PlateScaleH * Camera.BinX),
                    (SUP.PlateScaleV * Camera.BinY), tgtMinBrt, tgtSigma, 500, tgtCatMax, 
                    60, false, false);
            SUP.SolveFails = prevSolveFails;
            if(!LocalUser)
                SafeDeleteFile(sfn + ".fts.stars");                         // Delete .stars file for web users
        }
        if(DoCompress)
        {
            Util.CompressFile(sfn & ".fts", sfn + ".fts.zip");
            Util.Console.PrintLine("  Stacked file ZIP-compressed for net transfer");
            FSO.DeleteFile(sfn & ".fts");
        }
    }
    catch(e)
    {
        Console.PrintLine("**Image stacking failed:");
        Console.PrintLine("  Error: " + e.description);
    }
}

// -------------
// MakeLastPng() - Create PNG of last image in images root
// -------------
//
// This is rather tricky in that images made by single-shot imagers
// will show cross-hatching unless the reduced image is an integral
// submultiple of the original image size. For example, for a 1600 
// pix original width, 400 pixels works (1600 = 4 * 400) but 512 
// does not! Best efforts, if it doesn't work, oh well. The max
// horizontal size is 512 and we go down from there. As of 5.1 HF10
// this crosshatch avoidance is optionsl, controlled from AcqSupt.
//
// This also produces a text file containing the dimensions of the 
// preview image. asystemstatus.asp uses this info to properly size
// its lightbox popup.
//
function MakeLastPng(file, rootPath)                                        // As usual, file without extension
{
    try {
        var fpf = rootPath + LSTPNG_FILE;
        SafeDeleteFile(fpf);                                                // Zap old preview
        var ftf = rootPath + LSTDIM_FILE;
        SafeDeleteFile(ftf);                                                // Zap old preview dimensions file
        var doc = new ActiveXObject("MaxIm.Document");
        doc.OpenFile(file + ".fts");                                        // Load last image into MaxIm
        var PScale;
        if(SUP.CrosshatchAvoidance)
            PScale = 1.0 / Math.ceil(doc.XSize / 640.0);                   // Honor cross-hatch limitation (see above)
        else
            PScale = 640.0 / doc.XSize;
        if(PScale > 1.0) PScale = 1.0;                                      // Don't inflate small images
        var xSize = Math.floor(doc.XSize * PScale);                         // Don't allow fractional pixels
        var ySize = Math.floor(doc.YSize * PScale);
        doc.Resize(xSize, ySize);
        doc.KernelFilter(5, 20);                                            // Process for beauty
        doc.DDP(0, true, true, 0, 0, 100);
        doc.RemoveGradient();
        doc.SaveFile(fpf, 7, true, 0, 0);                                   // Scaled, 8-bits/pix, PNG
        doc.Close();                                                        // Close it
        var dStrm = FSO.CreateTextFile(ftf, true);                          // Make new preview dimensions file
        dStrm.WriteLine(xSize);                                             // Dims one per line
        dStrm.WriteLine(ySize);
        dStrm.Close();
        Util.WaitForMilliseconds(500);                                      // [BUG/WORKAROUND] See 25-Oct-2004 edit track
        doc = null;                                                         // Release MaxIm
    } catch(e) {
        Console.PrintLine("**Failed to create PNG preview: " + 
            (e.Description ? e.Description : e));
    }

}

// ------------------
// MakeFilePathName() - Construct a file path/name from template and Target state
// ------------------
//
// Pass iCnt = -1 to construct a wildcard spec, where $CNTNUM is replaced by *.
//
function MakeFilePathName(typ, Tc, Pl, iSet, iRpt, iImgSet, iCnt, plnName)
{
    var bdir, dtmpl, ftmpl, lfn;
    
    switch(typ)
    {
        case IMGPATH:
            dtmpl = ImgDirTemplate;
            ftmpl = ImgFileTemplate;
            if(Tc.Stack && ftmpl.indexOf("$RPTNUM") == -1)                      // If template doesn't have repeat-number
            {                                                                   // (#stack illegal with cal frames)
                Tc.Stack = Tc.Align = false;                                    // Disable auto-stack/align
                Console.PrintLine("**CUSTOM FILE TEMPLATE HAS NO $RPTNUM (REPEAT NUMBER)");
                Console.PrintLine("**AUTO-STACKING CANNOT BE DONE - DISABLED");
            }
            break;
        case CALPATH:
            dtmpl = CalDirTemplate;
            ftmpl = CalFileTemplate;
            break;
        case LOGPATH:
            dtmpl = LogDirTemplate;
            ftmpl = LogFileTemplate;
            break;
        default:                                                            // for JSL
            break;
    }
    
    //
    // Construct/use folder path and create the folder if needed
    //
    if(Tc === null || (Tc !== null && Tc.Directory === ""))                 // If no specified directory
    {
        bdir = PathSubst(dtmpl, Tc, Pl, iSet, iRpt, iImgSet, iCnt, plnName); // Substitute for directory path
    }
    else                                                                    // ImageSet has override directory path
    {
        if(FSO.GetDriveName(Tc.Directory) !== "")                           // If full path
            bdir = Tc.Directory;                                            // Use it
        else                                                                // If relative
            bdir = PathSubst(dtmpl + "\\" + Tc.Directory, Tc, Pl, 0, 0, 0, 0, plnName); // Relative to directory template
    }
    CreateFolder(bdir);                                                     // Make sure folder exists
    
    //
    // Construct the file name safely (without the extension)
    //
    lfn = PathSubst(ftmpl, Tc, Pl, iSet, iRpt, iImgSet, iCnt, plnName);
    
    //
    // Combine folder and file names and munge the name to prevent 
    // inadvertent overwriting of old data
    //
    var z = 0;
    var fn = bdir + "\\" + lfn;                                             // Splice to full path/name
    while(FSO.FileExists(fn + ".fts") || FSO.FileExists(fn + ".fts.zip"))   // If file exists (comp'd or not)
    {
        z += 1;
        fn = bdir + "\\" + lfn + "_dupe-" + z;                              // Try for a _dupe-z
    }
    if(z > 0)                                                               // If had to dupe
    {
        lfn = lfn + "_dupe-" + z;                                           // make final dupe name
        Console.PrintLine("**DUPLICATE IMAGE NAME - ADDED _dupe-" + z);     // Warn about dupe
        if(Tc.Stack)
        {                                                                   // If stack requested
            Console.PrintLine("**AUTO-STACKING CANNOT BE DONE - DISABLED"); // Warn can't do it
            Tc.Stack = Tc.Align = false;                                    // Disable auto-stack/align
        }
    }

    return bdir + "\\" + lfn;                                               // Return final path/name (without extension)
}


// ------------------
// InitFilePathName() - Initialize the file path/name constructors
// ------------------
//
// Type is IMGPATH, CALPATH, or LOGPATH (constants section at top)
//
function InitFilePathName(typ)
{
    var k;
    var cfFile, tmpl, dtmpl, ftmpl;
    var buf = "";                                                           // Assume no XxxFileConfig.txt

    switch(typ)
    {
        case IMGPATH:
            cfFile = Util.GetConfigFilePath("ImageFileConfig.txt");
            tmpl = LocalUser ? DEF_IMG_TMPL : DEF_IMG_TMPL_WEB;
            break;
        case CALPATH:
            cfFile = Util.GetConfigFilePath("CalFileConfig.txt");
            tmpl = LocalUser ? DEF_CAL_TMPL : DEF_CAL_TMPL_WEB;
            break;
        case LOGPATH:
            cfFile = Util.GetConfigFilePath("LogFileConfig.txt");
            tmpl = LocalUser ? DEF_LOG_TMPL : DEF_LOG_TMPL_WEB;
            break;
        default:
            throw new Error(0x80040001, "Programmer error: Unknown type in call to InitFilePathname()");
    }
        
    if(cfFile !== "")                                                       // Try for config file
    {
        var cfStream = FSO.OpenTextFile(cfFile, forReading);                // Exists, open it
        k = LocalUser ? 0 : LockUser.length;
        while(!cfStream.AtEndOfStream)                                      // Read lines, skipping blank lines and comments
        {
            buf = cfStream.ReadLine().trim();                               // Get rid of leading/trailing blanks!
            if(buf !== "" && buf.substr(0, 1) != ";")                       // If non-blank and not a comment
            {
                if(!LocalUser)                                              // For web users
                {
                    if(buf.substr(0, k + 2) == "[" + LockUser + "]")        // Found a user-specific template
                    {
                        buf = buf.substr(k + 2).trim();                     // Return trimmed remainder
                        break;
                    }
                    else if(buf.substr(0, 3) == "[*]")                      // Found "all web users" template
                    {
                        buf = buf.substr(3).trim();                         // Return trimmed remainder
                        break;
                    }
                }
                if(buf.substr(0, 1) != "[")                                 // Found a no-name template
                    break;                                                  // Stop reading file, we got it
                buf = "";                                                   // Zap [...] template now, local user
            }
            else                                                            // Otherwise...
                buf = "";                                                   // Zap comment for post-loop test
        }
        cfStream.Close();                                                   // Done reading config file, close it
    }
    if(buf !== "")                                                          // If got a template
    {
        tmpl = buf;                                                         // Replace default with the template
        switch(typ)
        {
            case IMGPATH:
                Console.PrintLine("Custom image file path/names are in use");
                break;
            case CALPATH:
                Console.PrintLine("Custom calibration file path/names are in use");
                break;
            case LOGPATH:
                Console.PrintLine("Custom log file path/names are in use");
                break;
            default:                                                        // for JSL
                break;
        }
    }
    k = tmpl.lastIndexOf("\\");                                             // Position of last '\'
    if(k == -1)                                                             // If no path part
    {
        dtmpl = "$DEFPATH";                                                 // Use the default image path
        ftmpl = tmpl;                                                       // The whole thing is a file template
    }
    else
    {
        dtmpl = tmpl.substr(0, k);                                          // Path part of template
        ftmpl = tmpl.substr(k + 1);                                         // File part of template
    }
    switch(typ)
    {
        case IMGPATH:
            ImgDirTemplate = dtmpl;
            ImgFileTemplate = ftmpl;
            break;
        case CALPATH:
            CalDirTemplate = dtmpl;
            CalFileTemplate = ftmpl;
            break;
        case LOGPATH:
            LogDirTemplate = dtmpl;
            LogFileTemplate = ftmpl;
            break;
        default:                                                            // for JSL
            break;
    }
    if(buf !== "") {
        Console.PrintLine("  Folders: " + dtmpl);
        Console.PrintLine("  Files  : " + ftmpl);
    }
}

// -----------
// PathSubst() - File path/name template substitution engine
// -----------
//
// This may be called with Tc and Pl = null, and iRpt and 
// iSet = 0 (for the log path). NOTE: For wildcard path
// construction, passing iCnt = -1 will cause a * to be 
// substituted. 
//
function PathSubst(templ, Tc, Pl, iSet, iRpt, iImgSet, iCnt, plnName)
{
    var tfilt, tdec, tseq;
    
    var buf = templ;
    if(LocalUser)                                                           // Default directory
    {
        buf = buf.replace(/\$DEFPATH/gi, Prefs.LocalUser.DefaultImageDir);    // (local user)
        buf = buf.replace(/\$LOGPATH/gi, Prefs.LocalUser.DefaultLogDir);
        buf = buf.replace(/\$USRNAME/gi, SafeFileName(Prefs.LocalUser.Name));
    }
    else
    {
        if(LocalWeb) {                                                      // Special "use web browser" user?
            buf = buf.replace(/\$DEFPATH/gi, Prefs.LocalUser.DefaultImageDir); // (act like local user)
            buf = buf.replace(/\$LOGPATH/gi, Prefs.LocalUser.DefaultLogDir);
            buf = buf.replace(/\$USRNAME/gi, SafeFileName(Prefs.LocalUser.Name));
        } else {
            buf = buf.replace(/\$DEFPATH/gi, Prefs.WebRoot + "\\images\\" + LockUser); // (web user)
            buf = buf.replace(/\$LOGPATH/gi, Prefs.WebRoot + "\\logs\\" + LockUser);
            buf = buf.replace(/\$USRNAME/gi, SafeFileName(LockUser));
        }
    }
    //
    // These are not valid for log paths!
    //
    if(Tc !== null)                                                         // If called for image/cal targets
    {
        if(Tc.NonImage)
            throw new Error(0x80040001, "ASSERT: PathSubst() called for non-image target");        // Programmer error trap
        
        if(Tc.CalFrame)                                                     // Cal (dark/bias) frames have no coordinates
        {
            buf = buf.replace(/\$TGTRA/gi,    "NoRA");                      // Not applicable...
            buf = buf.replace(/\$TGTDEC/gi,   "NoDec");
            buf = buf.replace(/\$TGTPA/gi,    "NoPA");
            buf = buf.replace(/\$FILTER/gi,   "NoFilt");
            buf = buf.replace(/\$MERSIDE/gi,  "_");
        }
        else                                                                // Live image, Telescope.Xxx and Camera.Xxx valid now!
        {
            if(SUP.HaveFilters)
                tfilt = Tc.ImageSets[iImgSet].FilterName;
            else
                tfilt = "NoFilt";
            buf = buf.replace(/\$FILTER/gi, SafeFileName(tfilt));
            buf = buf.replace(/\$TGTRA/gi, Util.Hours_HMS(Tc.RA, "", "", ""));
            tdec =  Util.Degrees_DMS(Tc.Dec, "", "", "");
            if(tdec.substr(0, 1) != "-") 
                tdec = "+" + tdec;                                          // Assure Dec has a sign
            buf = buf.replace(/\$TGTDEC/gi, tdec);
            buf = buf.replace(/\$TGTPA/gi, Util.FormatVar(Tc.PA, "000"));
        }
        if(iCnt == -1)                                                      // Handle request for wildcard sequence
            buf = buf.replace(/\$CNTNUM/gi, "*");
        else
            buf = buf.replace(/\$CNTNUM/gi, Util.FormatVar(iCnt + 1, "000"));
        buf = buf.replace(/\$RPTNUM/gi, Util.FormatVar(iRpt + 1, "000"));
        if(Camera.CanSetTemperature) {
            if(Camera.Temperature < 40)
                buf = buf.replace(/\$TEMP/gi, Math.floor(Camera.Temperature));
            else
                buf = buf.replace(/\$TEMP/gi, "NoTemp");
        } else {
            buf = buf.replace(/\$TEMP/gi, "NoTemp");
        }
        if(Telescope.AlignmentMode == 2)                                    // If GEM...
        {
            if(Telescope.SideOfPier === 0)                                  // pierEast (looking west)
                buf = buf.replace(/\$MERSIDE/gi, "W");                      // Substitute W (where it is looking)
            else                                                            // pierWest (looking east)
                buf = buf.replace(/\$MERSIDE/gi, "E");                      // Substitute E (where it is looking)
        }
        else
            buf = buf.replace(/\$MERSIDE/gi, "_");                          // Should not be using this anyway!
        buf = buf.replace(/\$INTERVAL/gi, Util.FormatVar(Math.round(Tc.ImageSets[iImgSet].Interval), "000")); // Deciseconds
        buf = buf.replace(/\$SETNUM/gi,   Util.FormatVar(iSet + Pl.StartSetNum, "000"));
        buf = buf.replace(/\$BINNING/gi,  Tc.ImageSets[iImgSet].Binning);
        buf = buf.replace(/\$TGTNAME/gi,  SafeFileName(Tc.Name));
    }
    //
    // Valid for any type of path
    //
    buf = buf.replace(/\$DATEUTC/gi,  Util.FormatVar(Util.SysUTCDate, "yyyymmdd"));
    buf = buf.replace(/\$TIMEUTC/gi,  Util.FormatVar(Util.SysUTCDate, "HhNnSs"));
    buf = buf.replace(/\$DATELOC/gi,  Util.FormatVar(new Date().getVarDate(), "yyyymmdd"));
    buf = buf.replace(/\$TIMELOC/gi,  Util.FormatVar(new Date().getVarDate(), "HhNnSs"));
    buf = buf.replace(/\$DATEJUL/gi,  Math.floor(Util.SysJulianDate));      // Do not round!
    buf = buf.replace(/\$DATENITE/gi, Util.FormatVar(PlanRunDate.getVarDate(), "yyyymmdd"));
    buf = buf.replace(/\$PLANNAME/gi, plnName);
    
   return buf;
}

//
// --------------
// SafeFileName()
// --------------
//
// Make a legal file name from a raw name. This removes not only the characters that
// are illegal in Windows file names, but also the parentheses that would otherwise 
// trigger special file operations in PinPoint if present. An attempt is made to make 
// the resulting file name recognizeable from the target name. 
//
// Returns legal file path/name, safe to use with PinPoint.
//
//
function SafeFileName(name)
{
    //
    // (1) Remove <([])> completely
    //
    var buf = name.replace(/[\<\(\[\]\)\>]/g, "");
    //
    // (2) Replace other illegal characters with "-"
    //
    buf = buf.replace(/[\\\/\:\*\?\"\|]/g, "-");

    return buf;
}

// -------------
// nearestDusk() - Compute nearest dusk - Good to 1 minute
// -------------
//
// Typically, this will converge to 1 minute within 2-3 loops.
// Since the Sun ephem produces J2000 coordinates, we use local
// MEAN sidereal time instead of APPARENT for the hour angle.
// These approximations will get us typically to within 
// 0.001 degree of the target sun elevation. PLENTY CLOSE! 
//
// Returns null if the sun never gets above h0 (polar regions),
// and throws if the sun never gets BELOW h0 (never dark, polar
// regions).
//
function nearestDusk(h0)
{
    var DEGRAD = 0.0174532925;
    var KT = new ActiveXObject("Kepler.Ephemeris");                         // Re-usable Earth ephem (reverse = Sun!)
    KT.BodyType = 0;                                                        // Planet
    KT.Number = 3;                                                          // EARTH
    var tvec = new ActiveXObject("NOVAS.PositionVector");
    
    var LatRad = Telescope.SiteLatitude * DEGRAD;                           // Latitude in radians (constant)
    var h0Rad = h0 * DEGRAD;                                                // Sun altitude, radians
    //
    // Iteration Loop
    //
    var JD = Util.SysJulianDate;                                            // Start with current date/Time
    var JDPrev = JD;
    do
    {
        var KA = KT.GetPositionAndVelocity(JD).toArray();                   // Get earth from sun
        tvec.x = -KA[0];                                                    // Reverse cartesian vector for sun from earth
        tvec.y = -KA[1];
        tvec.z = -KA[2];
        var SunRA = tvec.RightAscension;                                    // J2000 coordinates of sun from earth
        var SunDec = tvec.Declination;
        var SunDecRad = SunDec * DEGRAD;
        var z = (Math.sin(h0Rad)-(Math.sin(LatRad) * Math.sin(SunDecRad))) /
                    (Math.cos(LatRad) * Math.cos(SunDecRad));
        if(z < -1.0) throw new Error(0x80040001, "Never gets dark enough");
        if(z > 1.0) return null;                                            // **NOTE** RETURNING NULL!
        var HA = Math.acos(z) / DEGRAD;
        var LMST = Util.Julian_GMST(JD) + (Telescope.SiteLongitude / 15.0); // LOCAL MEAN Sidereal Time
        JD = JD + (((HA / 15.0) - Util.HourAngle12(SunRA, LMST)) / 24.0);
        if(Util.SysJulianDate < (JD - 0.5))
            JD = JD - 1;                                                    // Back up a day
        else if(Math.abs(JD - JDPrev) < 0.0006944)
            break;                                                          // Convergence = 1 Minute
        JDPrev = JD;
    } while(true);
    
    KT = null;                                                              // Explicitly release these
    tvec = null;
    
    return new Date(Util.Julian_Date(JD));                                  // Local time of nearest sunset
}

// -------------
// SunsetOfRun()
// -------------
//
// Compute nearest sunset - Good to 1 minute
//
// Typically, this will converge to 1 minute within 2-3 loops.
// Since the Sun ephem produces J2000 coordinates, we use local
// MEAN sidereal time instead of APPARENT for the hour angle.
// These approximations will get us typically to within 
// 0.001 degree of the target sun elevation. PLENTY CLOSE! 
//
// For polar regions, use the latitude of the Artic or 
// Antartic circle. This is good enough for the path subst.
// #DATENITE.
//
function SunsetOfRun()
{
    var KT = new ActiveXObject("Kepler.Ephemeris");                         // Re-usable Earth ephem (reverse = Sun!)
    KT.BodyType = 0;                                                        // Planet
    KT.Number = 3;                                                          // EARTH
    var tvec = new ActiveXObject("NOVAS.PositionVector");
    
    var lat = Telescope.SiteLatitude;
    lat = Math.min(lat, 65.0);                                              // Just below the Arctic circle.
    lat = Math.max(lat, -65.0);                                             // Just below Antarctic circle
    var LatRad = lat * DEGRAD;                                              // Latitude in radians (constant)
    //
    // Iteration Loop
    //
    var JD = Util.SysJulianDate;                                            // Start with current date/Time
    var JDPrev = JD;
    do
    {
        var KA = KT.GetPositionAndVelocity(JD).toArray();                   // Get earth from sun
        tvec.x = -KA[0];                                                    // Reverse cartesian vector for sun from earth
        tvec.y = -KA[1];
        tvec.z = -KA[2];
        var SunRA = tvec.RightAscension;                                    // J2000 coordinates of sun from earth
        var SunDec = tvec.Declination;
        var SunDecRad = SunDec * DEGRAD;
        var HA0 = Math.acos((-(Math.sin(LatRad) * Math.sin(SunDecRad))) /
                    (Math.cos(LatRad) * Math.cos(SunDecRad))) / DEGRAD;
        var LMST = Util.Julian_GMST(JD) + (Telescope.SiteLongitude / 15.0); // LOCAL MEAN Sidereal Time
        var HA = Util.HourAngle12(SunRA, LMST);
        JD = JD + (((HA0 / 15.0) - HA) / 24.0);
        if(HA < 0) 
            JD -= 1.0;
        else if(Math.abs(JD - JDPrev) < 0.0006944)
            break;                                                          // Convergence = 1 Minute
        JDPrev = JD;
    } while(true);
    
    KT = null;                                                              // Explicitly release these
    tvec = null;
    
    return new Date(Util.Julian_Date(JD));                                  // Local time of nearest sunset

}

// ---------
// Range24() - Force argument into range 0 <= h < 24
// ---------
//
function Range24(h)
{
    while(h < 0.0)
        h += 24.0;
    while(h >= 24.0)
        h -= 24.0;
    return h;
}

// ---------
// Range12() - Force argument into range -12 <= h <= +12
// ---------
//
function Range12(h)
{
    while(h < -12.0)
        h += 24.0;
    while(h > 12.0)
        h -= 24.0;
    return h;
}

// ------------
// RangeAngle() - Force angular value to fall into the given range
// ------------
//
// Modular arithmetic support. Used to re-range angles, etc. after arithmetic.
// Works for 0 to 360 or -180 to 180.
//
function RangeAngle(val, lo, hi)
{
    var ret = val;
    while(ret < lo) ret += 360.0;
    while(ret >= hi) ret -= 360.0;
    return(ret);
}

// --------------
// CreateFolder() - Create a folder with recursion
// --------------
//
// For web users, this will copy the ASP pages that implement
// directory listings, etc. to the new folder.
function CreateFolder(f)
{
    if(FSO.FolderExists(f)) return;                                         // Already exists, no-op
    var p = FSO.GetParentFolderName(f);                                     // Get parent name (may not exist)
    if(p === "")                                                            // Non-existent drive letter
        throw new Error(0x80040001, "Creating folder: Non-existent drive letter or root name " + f); //   (prevent infinite recursion)
    try {                                                                   // Catch bad names (like in ImageFileConfig etc. typ.)
        if(!FSO.FolderExists(p))                                            // If doesn't exist
            CreateFolder(p);                                                // Call ourselves recursively to create it
    } catch(ex) {
        Console.PrintLine("**Can't create parent folder " + p);
        Console.PrintLine("**Probably an illegal character in custom file/folder name");
        throw new Error(0x80040001, ex.message);
    }
    try {
        FSO.CreateFolder(f);                                                // Now create the given folder
    } catch(ex) {
        Console.PrintLine("**Can't create folder " + f);
        Console.PrintLine("**Probably an illegal character in custom file/folder name");
        throw new Error(0x80040001, ex.message);
    }
    if(!LocalUser)                                                          // If web user
    {
        var fld = FSO.GetFolder(p);
        var e = new Enumerator(fld.Files);                                  // Enumerate immediate parent folder's files
        for(; !e.atEnd(); e.moveNext())
        {
            var fn = e.item().Name;                                         // These are file names only
            if(fn.search(/.asp$/i) >= 0)                                    // If this is an ASP page
                FSO.CopyFile(p + "\\" + fn, f + "\\" + fn);                 // Copy to new folder
        }
    }
}

// ----------------
// SafeDeleteFile() - Delete a file whether it exists or not
// ----------------
//
function SafeDeleteFile(f)
{
    try {
        FSO.DeleteFile(f);
    } catch(e) {  }
}

// --------------
// GetPlanStats() - Return plan stats
// --------------
//
// Return an object containing nTgt = total targets, nImg = total images, 
// and totTime = total shutter open time (sec). 
//
function GetPlanStats(Pl)
{
    var ret = new Object();
    ret.nTgt = 0;
    ret.nImg = 0;
    ret.totTime = 0;
    var ni;
    var tt;
    for(var iTgt = 0; iTgt < Pl.Targets.length; iTgt++) {
        var Tc = Pl.Targets[iTgt];
        ni = 0;
        tt = 0;
        if(!Tc.NonImage) {
            ret.nTgt += 1;
            for(var iImgSet = 0; iImgSet < Tc.ImageSets.length; iImgSet++) {
                var Is = Tc.ImageSets[iImgSet];
                ni += Is.Count;
                tt += Is.Interval * Is.Count;
            }
            ret.nImg += ni * Tc.Repeat;
            ret.totTime += tt * Tc.Repeat;
        }
    }
    ret.nImg *= Pl.Sets;
    ret.totTime *= Pl.Sets;
    return ret;
}


//------------------------------------------------------
//
// Global variables for script
//
//
var ForReading = 1;
var ForAppending = 8;
var Mode = 8;
var USE_TOPOCENTRIC_SLEWS = true;
var elevationLimit = 10;
var slewAttempt = 0;
var fso, f1, ts;
//------------------------------------------------------

//------------------------------------------------------------------------------
// OccultationPointing.js
// Manual closed-loop pointing script for occultation target star.
// Run from ACP console.
//------------------------------------------------------------------------------

// ===== USER INPUT FROM OCCULT WATCHER =====
// Replace these with the Occult Watcher target occulting star coordinates, NOT asteroid coordinates.

var TARGET_NAME = "2000QW151_occultation_star";

// RA in j2000 hours/min/sec from OW:
var TARGET_RA_H = 18;
var TARGET_RA_M = 38;
var TARGET_RA_S = 36.1;


// Dec in j2000 deg/arcmin/arcsec from OW:
var TARGET_DEC_SIGN = -1;
var TARGET_DEC_D = 22;
var TARGET_DEC_M = 50;
var TARGET_DEC_S = 47.7;

// Event timing notes only:
var EVENT_UTC = "2026-07-07 07:04:00 UTC";

var EVENT_UTC = "2026-07-12 02:18:07 UTC";
var LogFile = "D:\\Logs\\ACP\\" + Util.FormatVar(Util.SysUTCDate, "yyyymmdd_HhNnSs") + "-OccultationPointing.log";

fso = new ActiveXObject("Scripting.FileSystemObject");

if (!fso.FolderExists("D:\\Logs\\ACP"))
{
    fso.CreateFolder("D:\\Logs\\ACP");
}

if (!fso.FileExists(LogFile))
{
    fso.CreateTextFile(LogFile);
}

f1 = fso.GetFile(LogFile);
ts = f1.OpenAsTextStream(Mode, true);

Console.PrintLine("Log file ready: " + LogFile);
ts.WriteLine(Util.SysUTCDate + " INFO: Log file ready.");


String.prototype.trim = function()
{
    return this.replace(/(^\s*)|(\s*$)/g, "");
}

function hmsToHours(h, m, s)
{
    return Number(h) + Number(m) / 60.0 + Number(s) / 3600.0;
}

function dmsToDeg(sign, d, m, s)
{
    var val = Math.abs(Number(d)) + Number(m) / 60.0 + Number(s) / 3600.0;
    return sign < 0 ? -val : val;
}

///////////////////////////
// Function to connect the telescope
// MJM -
///////////////////////////

function connectScope()
{
    // Check to see if telescope is connected. If not, try to connect to it.
    if (Telescope.Connected)
    {
        Console.PrintLine("Telescope is connected!")
    }
        
    else
    {
        Console.PrintLine("Telescope is not connected. Attempting to connect...")
        Telescope.Connected = true;
        
        if (Telescope.Connected)
        {
            Console.PrintLine("Telescope is now connected!")
        } 

        else
        {
            Console.PrintLine("Telescope is still not connected. There must be a problem. :-(")
            abort()
        }
    }
        
    Console.PrintLine(" ")
}

//////////////////////////////////////////////////////////////
// Function to turn tracking on. Liberated from BJD scripts.
//
//////////////////////////////////////////////////////////////
function trkOn()
{
    if (Telescope.CanSetTracking)
    {
        Telescope.Unpark()
        Telescope.Tracking = true;
        Console.PrintLine("--> Tracking is turned on :-)");
    }
    else if (Telescope.Tracking && !Telescope.CanSetTracking)
    {
        Console.PrintLine("Failed to enable tracking")
        ts.WriteLine(" WARNING: Failed to enable telescope tracking")
    }
}

///////////////////////////////////////////////////////////////
// Function to turn tracking off. Liberated from BJD scripts.
// 
///////////////////////////////////////////////////////////////
function trkOff()
{
    if (Telescope.CanSetTracking)
    {
        Telescope.Tracking = false;
        Console.PrintLine("--> Tracking is turned off.");
    }
    else if (Telescope.Tracking && !Telescope.CanSetTracking)
    {
        Console.PrintLine("Failed to disable tracking")
        ts.WriteLine(" WARNING: Failed to disable telescope tracking")

    }
}

///////////////////////////
// Function to open dome.
// MJM
///////////////////////////
function domeOpen()
{
    switch (Dome.ShutterStatus)
    {
        // Dome is open
        case 0:
        Console.PrintLine("--> Dome shutter is already open :-P");
        break;

        // Dome is closed
        case 1:
        Console.PrintLine("--> Dome shutter is closed.");
        Dome.OpenShutter();
        Util.WaitForMilliseconds(2000); // Wait a bit for the dome to start opening

        while (Dome.ShutterStatus == 2)
        {
            Console.PrintLine("*** Dome shutter is opening...");
            Util.WaitForMilliseconds(2000);
        }

        if (Dome.ShutterStatus == 0)
        {
            Console.PrintLine("--> Dome shutter is opening...");
        }
        else
            Console.PrintLine("--> Dome is NOT open.");
        break;

        case 2:
        while (Dome.ShutterStatus == 2)
        {
            Console.PrintLine("*** Dome shutter is opening...");
            Util.WaitForMilliseconds(2000);
        }
        Console.PrintLine("--> Dome shutter is opened...");
        break;

        // Dome is closing. Let it close and then open it.
        case 3:
        while (Dome.ShutterStatus == 3)
        {
            Console.PrintLine("*** Dome shutter is closing. Waiting for it close...");
            Util.WaitForMilliseconds(2000);
        }
        
        Dome.OpenShutter();
        Util.WaitForMilliseconds(500);

        while (Dome.ShutterStatus == 2)
        {
            Console.PrintLine("*** Dome Shutter is opening.");
            Util.WaitForMilliseconds(60000);
        }
        Console.PrintLine("--> Dome shutter is open...");
        break;

        // Houston, we have a problem.
        case 4:
        Console.PrintLine("There was a problem with the shutter control...")
        break;
    }

    // Home the dome if not already done.
    //if (!Dome.AtHome)
    //{
    //    Dome.FindHome();
    //    while (!Dome.AtHome)
    //    {
    //        Console.PrintLine("*** Homing dome...");
    //        Util.WaitForMilliseconds(2000);
    //    }
    //    Console.PrintLine("--> Dome is homed... Bigly.");
    //}
}

///////////////////////////
// Function to close dome
// MJM -
///////////////////////////
function domeClose()
{
    switch (Dome.ShutterStatus)
    {
        //////////////////
        // Dome is open //
        //////////////////
        case 0:
        Console.PrintLine("--> Dome shutter is open.");
        Dome.CloseShutter();
        Util.WaitForMilliseconds(4000);

        while (Dome.ShutterStatus == 3)
        {
            Console.PrintLine("*** Dome shutter is closing...");
            Util.WaitForMilliseconds(2000);
        }

        if (Dome.ShutterStatus == 0)
        {
            Console.PrintLine("--> Dome shutter is open...");
            
        }
        else
        {
            Console.PrintLine("--> Dome is NOT open.");
        }
        break;

        ////////////////////
        // Dome is closed //
        ////////////////////
        case 1:
        Console.PrintLine("--> Dome shutter is already closed :-P");
        break;

        ////////////////////////
        // Shutter is opening //
        ////////////////////////
        case 2:
        while (Dome.ShutterStatus == 2)
        {
            Console.PrintLine("*** Dome shutter is opening...");
            Util.WaitForMilliseconds(2000);
        }
        Console.PrintLine("--> Dome shutter is opened...");
        Util.WaitForMilliseconds(500);

        Dome.CloseShutter();
        Util.WaitForMilliseconds(4000);

        while (Dome.ShutterStatus == 3)
        {
            Console.PrintLine("*** Dome shutter is closing...");
            Util.WaitForMilliseconds(2000);
        }
        break;

        ////////////////////////////////////
        // Dome is closing. Let it close. //
        ////////////////////////////////////
        case 3:
        while (Dome.ShutterStatus == 3)
        {
            Console.PrintLine("*** Dome shutter is closing. Waiting for it close...");
            Util.WaitForMilliseconds(2000);
        }
        Console.PrintLine("--> Dome shutter is closed...");
        break;

        /////////////////////////////////
        // Houston, we have a problem. //
        /////////////////////////////////
        case 4:
        Console.PrintLine("There was a problem with the shutter control...")
        return;
        break;
    }

    // Check to see if the dome is closed or in error
    if (Dome.ShutterStatus != 1)
    {
        Console.PrintLine("Dome is not closed. Trying again...")
        Util.WaitForMilliseconds(1000)
        domeClose()
    }
}

///////////////////////////
// Function to home dome.
// MJM -
///////////////////////////
function domeHome()
{
    ////////////////////////////////////////
    // Home the dome if not already done. //
    ////////////////////////////////////////
    if (!Dome.AtHome)
    {
        Util.WaitForMilliseconds(2000);

        Dome.FindHome();

        while (!Dome.AtHome)
        {
            Console.PrintLine("*** Homing dome...");
            Util.WaitForMilliseconds(2000);
        }
        Console.PrintLine("--> Dome is homed... Bigly.");
    }
    Dome.UnparkHome()
}

///////////////////////////
// Function to park dome.
// Prefer ASCOM Park() if supported.
// If not supported, fall back to homing the dome.
///////////////////////////
function domePark()
{
    Console.PrintLine("Parking dome...");
    ts.WriteLine(Util.SysUTCDate + " INFO: Parking dome...");

    try
    {
        if (Dome.CanPark)
        {
            Dome.Park();
            Util.WaitForMilliseconds(2000);

            while (!Dome.AtPark)
            {
                Console.PrintLine("*** Dome is parking...");
                ts.WriteLine(Util.SysUTCDate + " INFO: Dome is parking...");
                Util.WaitForMilliseconds(2000);
            }

            Console.PrintLine("--> Dome is parked.");
            ts.WriteLine(Util.SysUTCDate + " INFO: Dome is parked.");
        }
        else
        {
            Console.PrintLine("Dome driver does not report CanPark. Homing dome instead.");
            ts.WriteLine(Util.SysUTCDate + " WARNING: Dome driver does not report CanPark. Homing dome instead.");

            Dome.FindHome();
            Util.WaitForMilliseconds(2000);

            while (!Dome.AtHome)
            {
                Console.PrintLine("*** Homing dome...");
                ts.WriteLine(Util.SysUTCDate + " INFO: Homing dome...");
                Util.WaitForMilliseconds(2000);
            }

            Console.PrintLine("--> Dome is homed.");
            ts.WriteLine(Util.SysUTCDate + " INFO: Dome is homed.");
        }
    }
    catch (e)
    {
        Console.PrintLine("WARNING: Dome park/home failed: " + (e.message || e.description || e));
        ts.WriteLine(Util.SysUTCDate + " WARNING: Dome park/home failed: " + (e.message || e.description || e));
    }
}

///////////////////////////////////////////////////////////////
// Function to shut down telescope at end of the night
// MJM - June 23, 2022
// Updated by CM - June 27, 2026
///////////////////////////////////////////////////////////////
function shutDown()
{
    Console.PrintLine("Shutting down observatory...");
    ts.WriteLine(Util.SysUTCDate + " INFO: Shutting down observatory...");

    trkOff()

    Console.PrintLine("Tracking turned off. Parking telescope now...")
    ts.WriteLine(Util.SysUTCDate + " INFO: Tracking turned off. Parking telescope now.")
    try{
        Telescope.Park();
        while (!Telescope.AtPark)
        {
            Console.PrintLine("Waiting for telescope to park...");
            ts.WriteLine(Util.SysUTCDate + " INFO: Waiting for telescope to park...");
            Util.WaitForMilliseconds(2000);
        }
    }
    catch (e)
    {
        Console.PrintLine("WARNING: Telescope park failed: " + (e.message || e.description || e));
        ts.WriteLine(Util.SysUTCDate + " WARNING: Telescope park failed: " + (e.message || e.description || e));
        
    }

    trkOff();

    Console.PrintLine("Telescope parked. Closing dome now...");
    ts.WriteLine(Util.SysUTCDate + " INFO: Telescope parked. Closing dome now.");

    domeClose();

    Console.PrintLine("Dome shutter closed. Parking/homing dome now...");
    ts.WriteLine(Util.SysUTCDate + " INFO: Dome shutter closed. Parking/homing dome now.");

    domePark();

    Console.PrintLine("Observatory shutdown complete. Good night/morning.")
    ts.WriteLine(Util.SysUTCDate + " INFO: Observatory shutdown complete. Good night/morning.")
    
}


///////////////////////////////////////////
// Coordinate sanity checks (defense against corrupted scheduler fields)
// Returns true only for finite, in-range coordinates.
///////////////////////////////////////////
function isFiniteNum(x)
{
    return (typeof x === "number") && isFinite(x) && !isNaN(x);
}

// RA/Dec in DEGREES (as delivered by the scheduler CSV)
function isValidRaDecDeg(raDeg, decDeg)
{
    if (!isFiniteNum(raDeg) || !isFiniteNum(decDeg)) { return false; }
    if (raDeg < 0 || raDeg >= 360) { return false; }
    if (decDeg < -90 || decDeg > 90) { return false; }
    return true;
}

// RA in HOURS, Dec in DEGREES (as passed into gotoRADec)
function isValidRaHoursDecDeg(raHours, decDeg)
{
    if (!isFiniteNum(raHours) || !isFiniteNum(decDeg)) { return false; }
    if (raHours < 0 || raHours >= 24) { return false; }
    if (decDeg < -90 || decDeg > 90) { return false; }
    return true;
}

function convertJ2000ToTopocentric(raJ2000, decJ2000)
{
    var transform = null;

    try
    {
        transform = new ActiveXObject(
            "ASCOM.Astrometry.Transform.Transform"
        );

        transform.SiteLatitude  = Telescope.SiteLatitude;
        transform.SiteLongitude = Telescope.SiteLongitude;

        try
        {
            transform.SiteElevation = Telescope.SiteElevation;
        }
        catch (e)
        {
            // Elevation is a minor contribution for distant stellar fields.
            transform.SiteElevation = 0;
        }

        // Use the current UTC time.
        transform.JulianDateUTC = Util.SysJulianDate;

        // ASCOM topocentric coordinates normally exclude refraction.
        transform.Refraction = false;

        // Input RA is hours; Dec is degrees.
        transform.SetJ2000(raJ2000, decJ2000);

        var result = {
            ra:  Number(transform.RATopocentric),
            dec: Number(transform.DECTopocentric)
        };

        if (!isValidRaHoursDecDeg(result.ra, result.dec))
        {
            throw new Error(
                "Invalid transformed coordinates: RA=" +
                result.ra + " Dec=" + result.dec
            );
        }

        return result;
    }
    finally
    {
        if (transform != null)
        {
            try
            {
                transform.Dispose();
            }
            catch (e) {}
        }
    }
}

function getMountCoordinates(raJ2000, decJ2000)
{
    // Preserve the current behaviour for the baseline test.
    if (!USE_TOPOCENTRIC_SLEWS)
    {
        return {
            ra: raJ2000,
            dec: decJ2000,
            mode: "DIRECT J2000"
        };
    }

    // The conversion test is only appropriate when the driver reports
    // that it expects topocentric coordinates.
    if (Number(Telescope.EquatorialSystem) != 1)
    {
        throw new Error(
            "Topocentric slew requested, but EquatorialSystem=" +
            Telescope.EquatorialSystem
        );
    }

    var topo = convertJ2000ToTopocentric(raJ2000, decJ2000);

    return {
        ra: topo.ra,
        dec: topo.dec,
        mode: "TOPOCENTRIC"
    };
}

///////////////////////////////////////////
// Sends scope to a particular RA and DEC
// MJM
///////////////////////////////////////////
function gotoRADec(ra, dec)
{
    if (!isValidRaHoursDecDeg(ra, dec))
    {
        Console.PrintLine("WARNING: refusing to slew to invalid coordinates RA(h)=" + ra + " Dec=" + dec);
        ts.WriteLine(Util.SysUTCDate + " WARNING: refusing to slew to invalid coordinates RA(h)=" + ra + " Dec=" + dec);
        return false;
    }

    Console.PrintLine("RA in gotoRADec function " + ra.toFixed(4));
    ts.WriteLine("RA in gotoRADec " + ra.toFixed(4));
    Console.PrintLine("Dec in gotoRADec function " + dec);
    ts.WriteLine("Dec in gotoRADec function " + dec);

    targetCt = Util.NewCThereAndNow();
    targetCt.RightAscension = ra
    targetCt.Declination = dec

    // Print target elevation to screen
    Console.PrintLine("Elevation of field " + targetCt.Elevation.toFixed(4));
    ts.WriteLine("Elevation of field " + targetCt.Elevation.toFixed(4));

    breakme: if (targetCt.Elevation < elevationLimit)
    {
        Console.PrintLine("Tried to move to an unsave elevation of " + targetCt.Elevation.toFixed(4));
        ts.WriteLine(Util.SysUTCDate + " WARNING: Tried to move to an unsave elevation of " + targetCt.Elevation.toFixed(4));
        ts.WriteLine(Util.SysUTCDate + " INFO: Closing up shop!");
        shutDown();
        ts.WriteLine(Util.SysUTCDate + " INFO: Finished closing up shop!");
        break breakme;
    }

    if (Telescope.tracking)
    {
        var mountCoords;

        try
        {
            mountCoords = getMountCoordinates(ra, dec);
        }
        catch (conversionError)
        {
            Console.PrintLine(
                "ERROR: Coordinate conversion failed. Slew refused: " +
                (conversionError.message || conversionError.description || conversionError)
            );

            ts.WriteLine(
                Util.SysUTCDate +
                " ERROR: Coordinate conversion failed. Slew refused: " +
                (conversionError.message || conversionError.description || conversionError)
            );

            return false;
        }

        Console.PrintLine("Slew coordinate mode: " + mountCoords.mode);
        Console.PrintLine(
            "J2000 request: RA=" + ra.toFixed(8) +
            "h Dec=" + dec.toFixed(8)
        );
        Console.PrintLine(
            "Mount command: RA=" + mountCoords.ra.toFixed(8) +
            "h Dec=" + mountCoords.dec.toFixed(8)
        );

        ts.WriteLine(
            Util.SysUTCDate +
            " INFO: Slew coordinate mode: " + mountCoords.mode
        );
        ts.WriteLine(
            Util.SysUTCDate +
            " INFO: J2000 request RA=" + ra.toFixed(8) +
            "h Dec=" + dec.toFixed(8)
        );
        ts.WriteLine(
            Util.SysUTCDate +
            " INFO: Mount command RA=" + mountCoords.ra.toFixed(8) +
            "h Dec=" + mountCoords.dec.toFixed(8)
        );

        try
        {
            Telescope.SlewToCoordinates(
                mountCoords.ra,
                mountCoords.dec
            );
        }
        
        catch(e)
        {
            if (slewAttempt < 10)
            {
                Console.PrintLine("Error on attempt" + slewAttempt + "to slew. Waiting 5 seconds and trying again.");
                ts.WriteLine("Error on attempt" + slewAttempt + "to slew. Waiting 5 seconds and trying again.");
                Util.WaitForMilliseconds(5000);
                gotoRADec(ra, dec);
                slewAttempt += 1;
            }
            else
            {
                Console.PrintLine("Reached maximum number of tries to slew");
                ts.WriteLine("ERROR: Reached maximum number of slew attempts");
            }
            
        }
        
        Console.PrintLine("Done slewing.");
        ts.WriteLine("Finished slewing.")
        return true;
    }

    return false;
}

function execAstrometry(bestRaDeg, bestDecDeg, timeoutMs) {
    var sh = new ActiveXObject("WScript.Shell");
    var cmd = 'cmd /c python -u ExtraScripts\\astrometry_correction.py ' +
              bestRaDeg + ' ' + bestDecDeg + ' 2>&1';

    var p = sh.Exec(cmd);
    var start = new Date().getTime();
    var out = "";

    while (p.Status === 0) {
        while (!p.StdOut.AtEndOfStream) out += p.StdOut.Read(1024);
        Util.WaitForMilliseconds(100);

        var elapsed = new Date().getTime() - start;
        if (elapsed > timeoutMs) {
            try { sh.Run("taskkill /PID " + p.ProcessID + " /T /F", 0, true); } catch (e) {}
            throw new Error("astrometry_correction timed out after " + Math.floor(timeoutMs/1000) + "s");
        }
    }

    while (!p.StdOut.AtEndOfStream) out += p.StdOut.Read(1024);

    return {
        code: p.ExitCode,
        stdout: out
    };
}

function parseOffsets(text) {
    // Find the last line that contains at least two floats also added functionality in case scientific notation is detected it can now handle this
    var lines = text.replace(/\r/g, "").split("\n");
    var numberPattern =
        "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][+-]?\\d+)?";

    var offsetPattern = new RegExp(
        "^\\s*(" + numberPattern + ")\\s+(" + numberPattern + ")\\s*$"
    );

    for (var i = lines.length - 1; i >= 0; i--) {
        var match = lines[i].match(offsetPattern);
        if (match)
        {
            var raOff  = parseFloat(match[1]);
            var decOff = parseFloat(match[2]);

            if (isFinite(raOff) && isFinite(decOff))
            {
                return {
                    ra: raOff,
                    dec: decOff
                };
            }
        }
    }

    return null;
}

//////////////////////////////////////////////////////////////
// Function to adjust telescope pointing. Repeatedly calls the
// astrometry_correction.py subprocess to plate-solve and correct.
//////////////////////////////////////////////////////////////
function adjustPointing(target_ra, target_dec) {

    var TOLERANCE_DEG = 10 / 3600;  // 10 arcsec in degrees
    var MAX_ITERATIONS = 10;
    var LAMBDA = 1.0;               // uniform damping, applied every iteration
    var SETTLE_MS = 2500;           // mount settle time (ms) after each corrective slew
    var TIMEOUT_MS = 5 * 60 * 1000;

    // target_ra arrives in hours (ACP convention); convert to degrees for Python
    var target_ra_deg = target_ra * 15;

    // Track best achieved position for fallback if we never converge
    var closest_ra_deg = target_ra_deg;
    var closest_dec    = target_dec;
    var min_sep_deg    = Infinity;  // sky-plane separation, degrees

    Console.PrintLine("== Pointing Correction ==");
    ts.WriteLine(Util.SysUTCDate + " INFO: == Pointing Correction ==");
    Console.PrintLine("Target: RA " + target_ra.toFixed(4) + " h  Dec " + target_dec.toFixed(4) + " deg");
    ts.WriteLine(Util.SysUTCDate + " INFO: Target RA=" + target_ra.toFixed(4) + "h Dec=" + target_dec.toFixed(4) + "deg");

    var iterations  = 0;
    var current_sep = Infinity;     // sky-plane separation after each solve, degrees

    var cmd_ra_deg = target_ra_deg;    // initialize before the loop
    var cmd_dec = target_dec;

    while (current_sep > TOLERANCE_DEG && iterations < MAX_ITERATIONS) {
        iterations++;
        Console.PrintLine(Util.SysUTCDate + " INFO: Pointing iteration " + iterations + "/" + MAX_ITERATIONS);
        ts.WriteLine(Util.SysUTCDate + " INFO: Pointing iteration " + iterations);

        // ---- Run astrometry ------------------------------------------------
        var res, off;
        var astrometry_failed = false;

        try {
            // Always pass the science target so Python returns (target - image_center),
            // which is the exact pointing error we need to correct.
            res = execAstrometry(target_ra_deg, target_dec, TIMEOUT_MS);
        } catch (e) {
            Console.PrintLine("WARNING: Astrometry timed out: " + e.message);
            ts.WriteLine(Util.SysUTCDate + " WARNING: Astrometry timed out: " + e.message);
            astrometry_failed = true;
        }

        if (!astrometry_failed) {
            if (!res || typeof(res.stdout) === "undefined" || res.stdout === null) {
                Console.PrintLine("WARNING: Astrometry returned no result.");
                ts.WriteLine(Util.SysUTCDate + " WARNING: Astrometry returned no result.");
                astrometry_failed = true;
            }
        }

        if (!astrometry_failed) {
            off = parseOffsets(res.stdout);
            if (res.code !== 0 || !off) {
                var tail = res.stdout ? res.stdout.slice(-400) : "";
                ts.WriteLine(Util.SysUTCDate + " WARNING: Astrometry failed. Exit=" + res.code + " tail: " + tail);
                Console.PrintLine("WARNING: Astrometry failed (exit " + res.code + ").");
                astrometry_failed = true;
            }
        }

        if (astrometry_failed) {
            break;  // fall through to fallback slew below
        }

        // ---- Offsets from Python (coordinate-space degrees) -----------------
        // ra_offset  = target_ra_deg - image_center_ra_deg  (positive = scope is west of target)
        // dec_offset = target_dec    - image_center_dec_deg (positive = scope is south of target)
        var ra_offset  = off.ra;
        var dec_offset = off.dec;

        // Sanity check: offsets larger than the FOV (~0.5 deg) likely indicate a bad solve
        // if (Math.abs(ra_offset) > 1.0 || Math.abs(dec_offset) > 1.0) {
        //     Console.PrintLine("WARNING: Implausibly large offset ("
        //         + (ra_offset * 3600).toFixed(0) + " arcsec RA, "
        //         + (dec_offset * 3600).toFixed(0) + " arcsec Dec). Likely bad solve. Stopping.");
        //     ts.WriteLine(Util.SysUTCDate + " WARNING: Offset exceeds 1 deg — likely bad solve.");
        //     break;
        // }

        // ---- Sky-plane angular separation (SPHERICAL GEOMETRY) -------------
        // RA coordinate difference must be scaled by cos(dec) to obtain the true
        // sky-plane angular offset.  Without this factor the RA contribution is
        // over-stated by 1/cos(dec): e.g. at dec=45 deg a 14.4 arcsec RA
        // coordinate offset is only 10.2 arcsec on the sky.
        var dec_rad    = target_dec * Math.PI / 180;
        var ra_sky_off = ra_offset * Math.cos(dec_rad);   // sky-plane RA component (degrees)
        current_sep    = Math.sqrt(ra_sky_off * ra_sky_off + dec_offset * dec_offset);  // degrees

        Console.PrintLine("  Pointing error: " + (current_sep * 3600).toFixed(1) + " arcsec"
            + "  (RA_sky=" + (ra_sky_off * 3600).toFixed(1) + " arcsec"
            + "  Dec=" + (dec_offset * 3600).toFixed(1) + " arcsec)");
        ts.WriteLine(Util.SysUTCDate + " INFO: Pointing error " + (current_sep * 3600).toFixed(1)
            + " arcsec  RA_sky=" + (ra_sky_off * 3600).toFixed(1)
            + " Dec=" + (dec_offset * 3600).toFixed(1));

        // Check convergence before commanding another slew
        if (current_sep <= TOLERANCE_DEG) {
            Console.PrintLine("  Within tolerance (" + (TOLERANCE_DEG * 3600).toFixed(0) + " arcsec). Done.");
            ts.WriteLine(Util.SysUTCDate + " INFO: Pointing within tolerance after " + iterations + " iteration(s).");
            break;
        }

        // ---- Compute corrected commanded position ---------------------------
        // Add the raw coordinate-space offset (not sky-plane) scaled by lambda.
        // Coordinate-space offsets are correct here: the mount accepts RA/Dec
        // coordinates, not sky-plane angular displacements.
        var prev_cmd_ra_deg = cmd_ra_deg;
        var prev_cmd_dec    = cmd_dec;

        var cmd_ra_deg = cmd_ra_deg + LAMBDA * ra_offset;
        var cmd_dec    = cmd_dec    + LAMBDA * dec_offset;

        // RA wrap-around (modulo-safe)
        cmd_ra_deg = ((cmd_ra_deg % 360) + 360) % 360;

        // Update closest-position tracker
        //if (current_sep < min_sep_deg) {
        //    min_sep_deg    = current_sep;
        //    closest_ra_deg = cmd_ra_deg;
        //    closest_dec    = cmd_dec;
        //}


        // Store the commanded position that produced the best solved result.
        if (current_sep < min_sep_deg) {
            min_sep_deg    = current_sep;
            closest_ra_deg = prev_cmd_ra_deg;
            closest_dec    = prev_cmd_dec;
        }

        // ---- Slew to corrected position ------------------------------------
        //var cmd_ra_hours = cmd_ra_deg / 15;
        //Console.PrintLine("  Slewing to RA " + cmd_ra_hours.toFixed(4) + " h  Dec " + cmd_dec.toFixed(4) + " deg");
        //ts.WriteLine(Util.SysUTCDate + " INFO: Slewing to RA=" + cmd_ra_hours.toFixed(4) + "h Dec=" + cmd_dec.toFixed(4));

        //gotoRADec(cmd_ra_hours, cmd_dec);

        //while (Telescope.Slewing) {
        //    Util.WaitForMilliseconds(500);
        //}
        var cmd_ra_hours = cmd_ra_deg / 15;
        var prev_cmd_ra_hours = prev_cmd_ra_deg / 15;
        Console.PrintLine("  Previous commanded position: RA " + prev_cmd_ra_hours.toFixed(4) + " h  Dec " + prev_cmd_dec.toFixed(4) + " deg");
        ts.WriteLine(Util.SysUTCDate + " INFO: Previous commanded position: RA=" + prev_cmd_ra_hours.toFixed(4) + "h Dec=" + prev_cmd_dec.toFixed(4));

        var testCt = Util.NewCThereAndNow();
        testCt.RightAscension = cmd_ra_hours;
        testCt.Declination = cmd_dec;

        if (testCt.Elevation < elevationLimit) {
            Console.PrintLine("WARNING: corrective slew rejected; unsafe elevation "
                + testCt.Elevation.toFixed(4) + " deg");
            ts.WriteLine(Util.SysUTCDate + " WARNING: corrective slew rejected; unsafe elevation "
                + testCt.Elevation.toFixed(4) + " deg");

            break;   // stop iterating and fall through to fallback logic
        }

        Console.PrintLine("  Slewing to RA " + cmd_ra_hours.toFixed(4) + " h  Dec " + cmd_dec.toFixed(4) + " deg");
        ts.WriteLine(Util.SysUTCDate + " INFO: Slewing to RA=" + cmd_ra_hours.toFixed(4) + "h Dec=" + cmd_dec.toFixed(4));

        gotoRADec(cmd_ra_hours, cmd_dec);

        while (Telescope.Slewing) {
            Util.WaitForMilliseconds(500);
        }

        // Allow mount to settle before next plate solve
        Util.WaitForMilliseconds(SETTLE_MS);
    }

    // ---- Final outcome -----------------------------------------------------
    if (current_sep <= TOLERANCE_DEG) {
        Console.PrintLine("Pointing correction achieved within " + (TOLERANCE_DEG * 3600).toFixed(0)
            + " arcsec after " + iterations + " iteration(s).");
        ts.WriteLine(Util.SysUTCDate + " INFO: Pointing converged in " + iterations + " iteration(s).");
     //else {
        // Max iterations reached or astrometry failed — slew to closest measured position
      //  var fallback_ra_hours = closest_ra_deg / 15;
      //  Console.PrintLine("Pointing did not converge. Best achieved: "
      //      + (min_sep_deg === Infinity ? "N/A" : (min_sep_deg * 3600).toFixed(1) + " arcsec")
      //      + ". Slewing to best position.");
      //  ts.WriteLine(Util.SysUTCDate + " WARNING: Pointing not converged. Slewing to best: "
      //      + (min_sep_deg === Infinity ? "N/A" : (min_sep_deg * 3600).toFixed(1) + " arcsec"));
      //  gotoRADec(fallback_ra_hours, closest_dec);
      //  while (Telescope.Slewing) {
      //      Util.WaitForMilliseconds(500);
      //  }
    } else {

        // No valid plate solve was obtained.
        // If this occured on Iter 1. then the telescope is already at the position reached
        // by the initial slew or pier flip. Do not issue another slew to the original target,
        // especially near the meridian where that could retrigger flip logic.
        if (min_sep_deg === Infinity) {
            Console.PrintLine(
                "Pointing correction failed before any valid solve. " +
                "Staying at the current telescope position."
            );

            ts.WriteLine(
                Util.SysUTCDate +
                " WARNING: Pointing correction obtained no valid astrometric solve. " +
                "No fallback slew performed."
            );

            return false;
        }

        var fallback_ra_hours = closest_ra_deg / 15;
        Console.PrintLine("Pointing did not converge. Best achieved: "
            + (min_sep_deg === Infinity ? "N/A" : (min_sep_deg * 3600).toFixed(1) + " arcsec")
            + ". Attempting slew to best safe position.");
        ts.WriteLine(Util.SysUTCDate + " WARNING: Pointing not converged. Best achieved: "
            + (min_sep_deg === Infinity ? "N/A" : (min_sep_deg * 3600).toFixed(1) + " arcsec"));

        var fallbackCt = Util.NewCThereAndNow();
        fallbackCt.RightAscension = fallback_ra_hours;
        fallbackCt.Declination = closest_dec;

        if (fallbackCt.Elevation >= elevationLimit) {
            gotoRADec(fallback_ra_hours, closest_dec);
            while (Telescope.Slewing) {
                Util.WaitForMilliseconds(500);
            }
        } else {
            Console.PrintLine("WARNING: best-position fallback is below elevation limit. Staying on current/original position.");
            ts.WriteLine(Util.SysUTCDate + " WARNING: best-position fallback is below elevation limit.");

            var targetCt = Util.NewCThereAndNow();
            targetCt.RightAscension = target_ra;
            targetCt.Declination = target_dec;

            if (targetCt.Elevation >= elevationLimit) {
                Console.PrintLine("Attempting return to original target coordinates instead.");
                ts.WriteLine(Util.SysUTCDate + " INFO: Returning to original target coordinates.");
                gotoRADec(target_ra, target_dec);
                while (Telescope.Slewing) {
                    Util.WaitForMilliseconds(500);
                }
            } else {
                Console.PrintLine("Original target is also below elevation limit. No corrective slew performed.");
                ts.WriteLine(Util.SysUTCDate + " WARNING: original target also below elevation limit. No corrective slew performed.");
            }
        }
    }
}

function getDate()
{
    var d = new Date();
    var s = d.getUTCFullYear();
    var month = (d.getUTCMonth() + 1).toString();
    var day = d.getUTCDate().toString();

    if (month.length == 1)
    {
        s += "0" + month;
    }
    else
    {
        s += month;
    }

    if (day.length == 1)
    {
        s += "0" + day;
    }
    else
    {
        s += day;
    }

    return s;
}

function appendAndDeleteColibriGrabLog(colibriLogFile, LogFile)
{
    try
    {
        if (fso.FileExists(colibriLogFile))
        {
            var colibriLog = fso.OpenTextFile(colibriLogFile, ForReading, false);

            while (!colibriLog.AtEndOfStream)
            {
                var logLine = colibriLog.ReadLine();
                ts.WriteLine(Util.SysUTCDate + " " + logLine);
            }

            colibriLog.Close();
            fso.DeleteFile(colibriLogFile);

            Console.PrintLine(Util.SysUTCDate + " INFO: Deleted ColibriGrab log file after appending.");
            ts.WriteLine(Util.SysUTCDate + " INFO: Deleted ColibriGrab log file after appending.");
        }
        else
        {
            Console.PrintLine(Util.SysUTCDate + " WARNING: ColibriGrab log file does not exist.");
            ts.WriteLine(Util.SysUTCDate + " WARNING: ColibriGrab log file does not exist.");
        }
    }
    catch (e)
    {
        Console.PrintLine(Util.SysUTCDate + " ERROR appending ColibriGrab log: " + e.message);
        ts.WriteLine(Util.SysUTCDate + " ERROR appending ColibriGrab log: " + e.message);
    }
}

function runOccultationDarkCollection(targetName, eventUTC, darkFrames, exposureMs)
{
    var wshShell = new ActiveXObject("WScript.Shell");

    var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");
    var colibriGrabPath = userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";

    var today = getDate();

    var safeTargetName = targetName.replace(/[^A-Za-z0-9_\\-]/g, "_");
    var safeEventUTC = eventUTC.replace(/[^0-9A-Za-z]/g, "");

    var outDir = "D:\\ColibriOccultationData\\" + today.toString() +
                 "\\Occultations\\" + safeTargetName + "\\Dark";

    wshShell.Run('cmd /c if not exist "' + outDir + '" mkdir "' + outDir + '"', 0, true);

    var prefix = "Dark_" + safeTargetName + "_" + safeEventUTC +
             "_" + exposureMs.toString() + "ms";

    // This closely mirrors RunColibri's darkCollection() command:
    // -n 10 -p Dark_25ms -e 0 -t -10 -f dark -l 1 -w ...
    var command = "\"" + colibriGrabPath + "\"" +
                  " -n " + darkFrames.toString() +
                  " -p " + prefix +
                  " -e " + exposureMs.toString() +
                  " -t -10" +
                  " -f dark" +
                  " -l 1" +
                  " -w " + outDir;

    Console.PrintLine(Util.SysUTCDate + " INFO: Starting occultation dark collection.");
    Console.PrintLine(Util.SysUTCDate + " INFO: Dark frames: " + darkFrames.toString());
    Console.PrintLine(Util.SysUTCDate + " INFO: Output: " + outDir);
    Console.PrintLine(Util.SysUTCDate + " INFO: Executing command: " + command);

    ts.WriteLine(Util.SysUTCDate + " INFO: Starting occultation dark collection.");
    ts.WriteLine(Util.SysUTCDate + " INFO: Executing command: " + command);

    wshShell.Run(command, 1, true);

    Util.WaitForMilliseconds(50);

    appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);

    Console.PrintLine(Util.SysUTCDate + " INFO: Occultation dark collection finished.");
    ts.WriteLine(Util.SysUTCDate + " INFO: Occultation dark collection finished.");
}

function runOccultationColibriGrab(targetName, eventUTC, exposureMs, durationSeconds, pierside)
{
    var wshShell = new ActiveXObject("WScript.Shell");
    var fso = new ActiveXObject("Scripting.FileSystemObject");

    var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");
    var colibriGrabPath = userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";

    var today = getDate();

    // Colibri normal mode: 25 ms = 40 FPS.
    // Generalized so 50 ms gives 20 FPS, 100 ms gives 10 FPS, etc.
    var frames = Math.ceil(durationSeconds * 1000.0 / exposureMs);

    var safeTargetName = targetName.replace(/[^A-Za-z0-9_\\-]/g, "_");
    var safeEventUTC = eventUTC.replace(/[^0-9A-Za-z]/g, "");

    var outDir = "D:\\ColibriOccultationData\\" + today.toString() +
                 "\\Occultations\\" + safeTargetName;

    // Windows mkdir creates intermediate folders automatically.
    wshShell.Run('cmd /c if not exist "' + outDir + '" mkdir "' + outDir + '"', 0, true);

    var prefix = "Occ_" + safeTargetName + "_" + safeEventUTC +
                 "_" + exposureMs.toString() + "ms-" + pierside;

    var command = "\"" + colibriGrabPath + "\"" +
                  " -n " + frames.toString() +
                  " -p " + prefix +
                  " -e " + exposureMs.toString() +
                  " -t -10" +
                  " -f normal" +
                  " -l 0" +
                  " -w " + outDir;

    Console.PrintLine(Util.SysUTCDate + " INFO: Starting occultation ColibriGrab run.");
    Console.PrintLine(Util.SysUTCDate + " INFO: Frames: " + frames.toString());
    Console.PrintLine(Util.SysUTCDate + " INFO: Duration: " + durationSeconds.toString() + " s");
    Console.PrintLine(Util.SysUTCDate + " INFO: Exposure: " + exposureMs.toString() + " ms");
    Console.PrintLine(Util.SysUTCDate + " INFO: Output: " + outDir);
    Console.PrintLine(Util.SysUTCDate + " INFO: Executing command: " + command);

    ts.WriteLine(Util.SysUTCDate + " INFO: Starting occultation ColibriGrab run.");
    ts.WriteLine(Util.SysUTCDate + " INFO: Executing command: " + command);

    // Blocking call, same as RunColibri.
    wshShell.Run(command, 1, true);

    Util.WaitForMilliseconds(50);

    appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);

    Console.PrintLine(Util.SysUTCDate + " INFO: Occultation ColibriGrab run finished.");
    ts.WriteLine(Util.SysUTCDate + " INFO: Occultation ColibriGrab run finished.");
}

function main()
{
    var targetRAHours = hmsToHours(TARGET_RA_H, TARGET_RA_M, TARGET_RA_S);
    var targetDecDeg  = dmsToDeg(TARGET_DEC_SIGN, TARGET_DEC_D, TARGET_DEC_M, TARGET_DEC_S);

    Console.PrintLine("========================================");
    Console.PrintLine("Manual Occultation Pointing");
    Console.PrintLine("Target: " + TARGET_NAME);
    Console.PrintLine("Event UTC: " + EVENT_UTC);
    Console.PrintLine("Target RA:  " + targetRAHours.toFixed(8) + " h");
    Console.PrintLine("Target Dec: " + targetDecDeg.toFixed(8) + " deg");
    Console.PrintLine("========================================");

    ts.WriteLine(Util.SysUTCDate + " INFO: Manual occultation pointing start.");
    ts.WriteLine(Util.SysUTCDate + " INFO: Target " + TARGET_NAME);
    ts.WriteLine(Util.SysUTCDate + " INFO: Event UTC " + EVENT_UTC);
    ts.WriteLine(Util.SysUTCDate + " INFO: Target RA=" + targetRAHours.toFixed(8) + "h Dec=" + targetDecDeg.toFixed(8));

    connectScope();

    Console.PrintLine("Opening dome...");
    domeOpen();

    // Sanity check to see if the dome is still opening before proceeding---we don't want to image the inside of the dome.
    while (Dome.ShutterStatus == 2 || Dome.ShutterStatus != 0)
    {
        Console.PrintLine("*** Dome shutter is still opening...");
        Util.WaitForMilliseconds(2000);
    }

    // Slave the dome to the scope
        
    if (Dome.slave == false)
    {
        Dome.slave = true;
    }

    Console.PrintLine("Dome opened and slaved...");

    Console.PrintLine("Unparking telescope...");
    Telescope.Unpark();

    trkOn();

    Console.PrintLine("Initial slew to OW target star coordinates...");
    ts.WriteLine(Util.SysUTCDate + " INFO: Initial slew to occultation target.");


    while (Telescope.Slewing)
    {
        Console.PrintLine("Waiting for telescope slew...");
        Util.WaitForMilliseconds(500);
    }

    while (Dome.Slewing)
    {
        Console.PrintLine("Waiting for dome slew...");
        Util.WaitForMilliseconds(500);
    }

    // Create coordinate transform for the occultation target.
    var targetCt = Util.NewCThereAndNow();
    targetCt.RightAscension = targetRAHours;  // already decimal hours
    targetCt.Declination = targetDecDeg;      // decimal degrees

    Console.PrintLine("");
    Console.PrintLine("Slewing to occultation target...");
    Console.PrintLine("RA:  " + targetCt.RightAscension.toFixed(8) + " h");
    Console.PrintLine("Dec: " + targetCt.Declination.toFixed(8) + " deg");
    Console.PrintLine("Alt: " + targetCt.Elevation.toFixed(4) + " deg");
    Console.PrintLine("Az:  " + targetCt.Azimuth.toFixed(4) + " deg");

    ts.WriteLine(Util.SysUTCDate + " INFO: Slewing to occultation target...");
    ts.WriteLine(Util.SysUTCDate + " INFO: RA: " + targetCt.RightAscension.toFixed(8) + " h");
    ts.WriteLine(Util.SysUTCDate + " INFO: Dec: " + targetCt.Declination.toFixed(8) + " deg");
    ts.WriteLine(Util.SysUTCDate + " INFO: Alt: " + targetCt.Elevation.toFixed(4) + " deg");
    ts.WriteLine(Util.SysUTCDate + " INFO: Az: " + targetCt.Azimuth.toFixed(4) + " deg");

    if (!gotoRADec(targetCt.RightAscension, targetCt.Declination))
    {
        Console.PrintLine("ERROR: Initial slew failed/refused.");
        ts.WriteLine(Util.SysUTCDate + " ERROR: Initial slew failed/refused.");
        return;
    }

    while (Telescope.Slewing)
    {
        Console.PrintLine("Waiting for telescope slew...");
        Util.WaitForMilliseconds(500);
    }

    while (Dome.Slewing)
    {
        Console.PrintLine("Waiting for dome slew...");
        Util.WaitForMilliseconds(500);
    }

    Console.PrintLine("Initial slew complete. Starting astrometric pointing correction...");
    ts.WriteLine(Util.SysUTCDate + " INFO: Starting adjustPointing().");

    var ok = adjustPointing(targetCt.RightAscension, targetCt.Declination);

    while (Telescope.Slewing)
    {
        Console.PrintLine("Waiting for final telescope slew...");
        Util.WaitForMilliseconds(500);
    }

    while (Dome.Slewing)
    {
        Console.PrintLine("Waiting for final dome slew...");
        Util.WaitForMilliseconds(500);
    }

    Console.PrintLine("========================================");
    Console.PrintLine("Pointing phase complete.");
    Console.PrintLine("Target should now be centered in the field.");
    Console.PrintLine("DO NOT shut down. DO NOT reslew during event.");
    Console.PrintLine("Starting ColibriGrab automatically for the occultation run.");
    Console.PrintLine("========================================");

    ts.WriteLine(Util.SysUTCDate + " INFO: Pointing phase complete. Telescope left tracking on target. Starting ColibriGrab for occultation run.");

    // Higher level camera settings are handled in the ColibriGrab configuration file. 
    // Here you'll only need to set the exposure time time of and duration of the observation.
    var exposureMs = 25;
    var durationSeconds = 30 * 60; // 30 minute run: Start at 06:49 UT if you want +/- 15 min from the event time of 07:04 UT.

    var pierside; // Pier side for logging

    if (Telescope.SideOfPier == 0)
    {
        pierside = "E";
    }
    else
    {
        pierside = "W";
    }

    Console.PrintLine("Pier side: " + pierside);
    ts.WriteLine(Util.SysUTCDate + " INFO: Pier side: " + pierside);

    var EVENT_UTC_COMPACT = "20260712T021807UT";

    runOccultationDarkCollection(
        TARGET_NAME,
        EVENT_UTC_COMPACT,
        10,
        exposureMs
    );
    
    runOccultationColibriGrab(
        TARGET_NAME,
        EVENT_UTC_COMPACT,
        exposureMs,
        durationSeconds,
        pierside
    );

    Console.PrintLine("Finished observing all occultations for the night. Shutting down now..");
    ts.WriteLine(Util.SysUTCDate + " INFO: Finished observing all occultations for the night. Shutting down now.");

    shutDown();
}
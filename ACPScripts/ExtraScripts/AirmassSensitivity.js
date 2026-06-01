/////////////////////////////
// Filename:   AirmassSensitivity_withRandomSkyDither.js
// Author(s):  Peter Quigley (original), modified by ChatGPT
// Based on:   AirmassSensitivity.js
// Description:
// Script for measuring sensitivity at different airmasses
// plus sky-frame acquisition using 7 RANDOM dither positions.
//
// For each science pointing:
//   1. Acquire the normal science image sets
//   2. Move to 7 random dithered sky positions
//   3. At each sky position, acquire 1 image for each exposure time
//   4. Save those images in a "sky" directory
//
// Random sky dither rule:
//   dAlt ~ Uniform[-10, +10] arcmin
//   dAz  ~ Uniform[-10, +10] arcmin
/////////////////////////////


/*------------------------------global vars----------------------------------*/

// Safety Parameters
var elevationLimit = 10; // minimum elevation of field in degrees
var runUnsafe = false;   // if true, will disable weather checks

// Scheduler Lists
var airmassList = [1.0001, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]; // list of airmasses to observe
var exposureList = [25, 33, 50, 100, 200, 500, 1000, 2000]; // exposure times in ms

// Misc Variables
var azimuthTarget = 200;        // azimuth of target in degrees
var observationTime = 60000;  // time to observe in milliseconds

// File paths
var baseDataPath = "D:\\tmp\\AirmassSensitivity_dither\\";
var colibriGrabPath = "";

// Sky dithering parameters
var nSkyDitherPositions = 7;
var skyDitherStepArcmin = 10.0; // random offsets in [-10, +10] arcmin


/*-------------------------------functions-----------------------------------*/

/////////////////////////////
// Utility Functions
/////////////////////////////

function padZero(num) {
    return num < 10 ? '0' + num : num;
}

function getDateString() {
    var date = new Date();
    return date.getFullYear() +
           padZero(date.getMonth() + 1) +
           padZero(date.getDate());
}

function freeDiskSpace(driveLetter) {
    try {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var drive = fso.GetDrive(driveLetter);
        return drive.FreeSpace / 1000000000; // Return GB
    } catch (e) {
        Console.PrintLine("Error checking disk space: " + e.message);
        return -1;
    }
}

function setupDataDirectory() {
    try {
        var dateString = getDateString();
        var fullPath = baseDataPath + dateString + "\\";
        var darkPath = fullPath + "Dark\\";
        var skyPath  = fullPath + "sky\\";

        var fso = new ActiveXObject("Scripting.FileSystemObject");

        if (!fso.FolderExists(fullPath)) {
            fso.CreateFolder(fullPath);
        }
        if (!fso.FolderExists(darkPath)) {
            fso.CreateFolder(darkPath);
        }
        if (!fso.FolderExists(skyPath)) {
            fso.CreateFolder(skyPath);
        }

        return {
            dataPath: fullPath,
            darkPath: darkPath,
            skyPath: skyPath
        };
    } catch (e) {
        Console.PrintLine("Error creating directories: " + e.message);
        throw e;
    }
}

function getColibriGrabPath() {
    try {
        var wshShell = new ActiveXObject("WScript.Shell");
        var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");
        return userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";
    } catch (e) {
        Console.PrintLine("Error finding ColibriGrab: " + e.message);
        throw e;
    }
}


/////////////////////////////
// Mazur Instrument Functions
/////////////////////////////

// Turn on tracking
function trkOn() {
    if (Telescope.CanSetTracking) {
        Telescope.Unpark();
        Telescope.Tracking = true;
        Console.PrintLine("--> Tracking is turned on :-)");
    }
    else if (Telescope.Tracking && !Telescope.CanSetTracking) {
        Console.PrintLine("Failed to enable tracking");
    }
}

// Turn off tracking
function trkOff() {
    if (Telescope.CanSetTracking) {
        Telescope.Tracking = false;
        Console.PrintLine("--> Tracking is turned off.");
    }
    else if (Telescope.Tracking && !Telescope.CanSetTracking) {
        Console.PrintLine("Failed to disable tracking");
    }
}

// Close the dome
function domeClose() {
    switch (Dome.ShutterStatus) {
        case 0:
            Console.PrintLine("--> Dome shutter is open.");
            Dome.CloseShutter();
            Util.WaitForMilliseconds(4000);

            while (Dome.ShutterStatus == 3) {
                Console.PrintLine("*** Dome shutter is closing...");
                Util.WaitForMilliseconds(2000);
            }

            if (Dome.ShutterStatus == 0) {
                Console.PrintLine("--> Dome shutter is open...");
            }
            else {
                Console.PrintLine("--> Dome is NOT open.");
            }
            break;

        case 1:
            Console.PrintLine("--> Dome shutter is already closed :-P");
            break;

        case 2:
            while (Dome.ShutterStatus == 2) {
                Console.PrintLine("*** Dome shutter is opening...");
                Util.WaitForMilliseconds(2000);
            }
            Console.PrintLine("--> Dome shutter is opened...");
            Util.WaitForMilliseconds(500);

            Dome.CloseShutter();
            Util.WaitForMilliseconds(4000);

            while (Dome.ShutterStatus == 3) {
                Console.PrintLine("*** Dome shutter is closing...");
                Util.WaitForMilliseconds(2000);
            }
            break;

        case 3:
            while (Dome.ShutterStatus == 3) {
                Console.PrintLine("*** Dome shutter is closing. Waiting for it close...");
                Util.WaitForMilliseconds(2000);
            }
            Console.PrintLine("--> Dome shutter is closed...");
            break;

        case 4:
            Console.PrintLine("There was a problem with the shutter control...");
            break;
    }
}

// Open the dome
function domeOpen() {
    switch (Dome.ShutterStatus) {
        case 0:
            Console.PrintLine("--> Dome shutter is already open :-P");
            break;

        case 1:
            Console.PrintLine("--> Dome shutter is closed.");
            Dome.OpenShutter();
            Util.WaitForMilliseconds(500);

            while (Dome.ShutterStatus == 2) {
                Console.PrintLine("*** Dome shutter is opening...");
                Util.WaitForMilliseconds(2000);
            }

            if (Dome.ShutterStatus == 0) {
                Console.PrintLine("--> Dome shutter is open...");
            }
            else {
                Console.PrintLine("--> Dome is NOT open.");
            }
            break;

        case 2:
            while (Dome.ShutterStatus == 2) {
                Console.PrintLine("*** Dome shutter is opening...");
                Util.WaitForMilliseconds(2000);
            }
            Console.PrintLine("--> Dome shutter is opened...");
            break;

        case 3:
            while (Dome.ShutterStatus == 3) {
                Console.PrintLine("*** Dome shutter is closing. Waiting for it close...");
                Util.WaitForMilliseconds(2000);
            }

            Dome.OpenShutter();
            Util.WaitForMilliseconds(500);

            while (Dome.ShutterStatus == 2) {
                Console.PrintLine("*** Dome Shutter is opening.");
                Util.WaitForMilliseconds(60000);
            }
            Console.PrintLine("--> Dome shutter is open...");
            break;

        case 4:
            Console.PrintLine("There was a problem with the shutter control...");
            break;
    }

    if (!Dome.AtHome) {
        Dome.FindHome();
        while (!Dome.AtHome) {
            Console.PrintLine("*** Homing dome...");
            Util.WaitForMilliseconds(2000);
        }
        Console.PrintLine("--> Dome is homed... Bigly.");
    }
}

// Move dome to the home position
function domeHome() {
    if (!Dome.AtHome) {
        Util.WaitForMilliseconds(2000);
        Dome.FindHome();

        while (!Dome.AtHome) {
            Console.PrintLine("*** Homing dome...");
            Util.WaitForMilliseconds(2000);
        }
        Console.PrintLine("--> Dome is homed... Bigly.");
    }
    Dome.UnparkHome();
}

// Connect to the telescope and turn on tracking
function connectScope() {
    if (Telescope.Connected) {
        Console.PrintLine("Telescope is connected!");
        trkOn();
    }
    else {
        Console.PrintLine("Telescope is not connected. Attempting to connect...");
        Telescope.Connected = "True";
        trkOn();

        if (Telescope.Connected) {
            Console.PrintLine("Telescope is now connected!");
            trkOn();
        }
        else {
            Console.PrintLine("Telescope is still not connected. There must be a problem. :-(");
            Util.AbortScript();
        }
    }
    Console.PrintLine(" ");
}

// Error/EOF shutdown
function shutDown() {
    trkOff();
    Console.PrintLine("Tracking turned off. Parking telescope now...");
    Telescope.Park();
    trkOff();
    Console.PrintLine("Telescope parked. Closing dome now...");
    domeClose();
    Console.PrintLine("Dome closed. Good night/morning.");
}

// Send telescope to specific RA and Dec
function gotoRADec(ra, dec) {
    Console.PrintLine("RA in gotoRADec function " + ra.toFixed(4));
    Console.PrintLine("Dec in gotoRADec function " + dec);

    var targetCt = Util.NewCThereAndNow();
    targetCt.RightAscension = ra;
    targetCt.Declination = dec;

    breakme: if (targetCt.Elevation < elevationLimit) {
        Console.PrintLine("Tried to move to an unsafe elevation of " + targetCt.Elevation.toFixed(4));
        Util.AbortScript();
        break breakme;
    }

    var trkOnAttempt = 0;
    while (!Telescope.Tracking) {
        trkOn();
        trkOnAttempt += 1;

        if (trkOnAttempt > 5) {
            Console.PrintLine("Failed to turn on tracking after 5 attempts. Aborting script.");
            Util.AbortScript();
        }
    }

    Dome.UnparkHome();
    if (Dome.slave == false) {
        Dome.slave = true;
    }

    var slewToStatus = false;
    var slewToAttempt = 0;
    while (!slewToStatus) {
        try {
            Telescope.SlewToCoordinates(ra.toFixed(4), dec.toFixed(4));
            Console.PrintLine("Done slewing.");
            slewToStatus = true;
        }
        catch (e) {
            if (slewToAttempt < 10) {
                Console.PrintLine("Error on attempt " + slewToAttempt + " to slew. Waiting 2 seconds and trying again.");
                Util.WaitForMilliseconds(2000);
                slewToAttempt += 1;
            }
            else {
                Console.PrintLine("Reached maximum number of tries to slew");
                Util.AbortScript();
            }
        }
    }

    while (Dome.Slewing == true) {
        Console.PrintLine("Dome is still slewing. Give me a minute...");
        Util.WaitForMilliseconds(500);
    }
}

function gotoAltAz(alt, az) {
    var ct = Util.NewCThereAndNow();
    ct.Elevation = alt;
    ct.Azimuth = az;

    Console.PrintLine("Alt in gotoAltAz function " + alt.toFixed(4));
    Console.PrintLine("Az in gotoAltAz function " + az.toFixed(4));

    breakme: if (ct.Elevation < elevationLimit) {
        Console.PrintLine("Tried to move to an unsafe elevation of " + ct.Elevation.toFixed(4));
        Util.AbortScript();
        break breakme;
    }

    Console.PrintLine("At Unpark...");
    Dome.UnparkHome();
    if (Dome.slave == false) {
        Console.PrintLine("Unparking dome and slaving to telescope...");
        Dome.slave = true;
    }

    Console.PrintLine("Skipped it...");
    while (Dome.Slewing == true) {
        Console.PrintLine("Dome is still slewing. Give me a minute...");
        Util.WaitForMilliseconds(500);
    }

    var slewToStatus = false;
    var slewToAttempt = 0;
    Console.PrintLine("slewToStatus: " + slewToStatus);
    Console.PrintLine("..." + !slewToStatus);

    while (!slewToStatus) {
        try {
            Console.PrintLine("Slewing...");
            trkOff();
            Telescope.SlewToAltAz(az.toFixed(3), alt.toFixed(3));
            trkOn();
            Console.PrintLine("Done slewing.");
            slewToStatus = true;
        }
        catch (e) {
            if (slewToAttempt < 10) {
                Console.PrintLine("Error on attempt " + slewToAttempt + " to slew. Waiting 2 seconds and trying again.");
                Console.PrintLine(e);
                Util.WaitForMilliseconds(2000);
                slewToAttempt += 1;
            }
            else {
                Console.PrintLine("Reached maximum number of tries to slew");
                Util.AbortScript();
            }
        }
    }
}

function adjustPointing(ra, dec) {
    ra = ra * 15;

    Console.PrintLine("== Pointing Correction ==");
    var SH = new ActiveXObject("WScript.Shell");
    var BS = SH.Exec("python astrometry_correction.py " + ra + " " + dec);
    var python_output = "";

    while (BS.Status != 1) {
        while (!BS.StdOut.AtEndOfStream) {
            python_output += BS.StdOut.Read(1);
        }
        Util.WaitForMilliseconds(100);
    }

    var py_lines = python_output.split("\n");
    var radec_offset = py_lines[py_lines.length - 2].split(" ");

    var new_ra = (ra + parseFloat(radec_offset[0])) / 15;
    var new_dec = dec + parseFloat(radec_offset[1]);
    Console.PrintLine("New RA: " + new_ra.toString() + " New Dec: " + new_dec.toString());

    if (isNaN(new_ra) || isNaN(new_dec)) {
        Console.PrintLine("New pointing is not a number. Ignoring new pointing and continuing with current pointing.");
        return;
    }
    else if ((new_ra > 24 || new_ra < 0) || (new_dec > 90 || new_dec < -90)) {
        Console.PrintLine("New pointing is not reasonable. Ignoring new pointing and continuing with current pointing.");
        return;
    }

    gotoRADec(new_ra, new_dec);
}


/////////////////////////////
// Script Functions
/////////////////////////////

function userInputRADEC() {
    var RA = parseFloat(Util.Prompt("RA coordinate (in decimal degrees): ", "NaN"));
    var DEC = parseFloat(Util.Prompt("Dec coordinate (in decimal degrees): ", "NaN"));
    Console.PrintLine("RA: " + RA + " DEC: " + DEC);

    if (isNaN(RA) || isNaN(DEC)) {
        throw new Error("Coordinates could not be parsed. Exiting.");
    }
    else if (RA < 0 || RA > 360 || DEC < -90 || DEC > 90) {
        throw new Error("Coordinates exceed expected bounds. Exiting.");
    }
    else {
        return [RA, DEC];
    }
}

// Translate airmass to elevation
function airmassToElevation(airmass) {
    var elevation = 90 - (Math.acos(1 / airmass) * (180 / Math.PI));
    Console.PrintLine("Elevation of target: " + elevation.toFixed(4));

    if (isNaN(elevation)) {
        throw new Error("Elevation is not a number. Exiting.");
    }
    else if (elevation < 0 || elevation > 90) {
        throw new Error("Elevation is not reasonable. Exiting.");
    }
    else {
        return elevation;
    }
}

function runColibriGrab(params) {
    try {
        var wsh = new ActiveXObject("WScript.Shell");
        var command = "\"" + colibriGrabPath + "\" " + params;
        Console.PrintLine("Executing: " + command);
        return wsh.Run(command, 1, true);
    } catch (e) {
        Console.PrintLine("Error running ColibriGrab: " + e.message);
        throw e;
    }
}


/////////////////////////////
// Sky Dithering Functions
/////////////////////////////

function ditherAltAzFromBase(baseAlt, baseAz, stepArcmin) {
    var stepDeg = stepArcmin / 60.0;

    // Random offset in [-1, +1] times 10 arcmin
    var dAlt = (Math.random() * 2 - 1) * stepDeg;
    var dAz  = (Math.random() * 2 - 1) * stepDeg;

    var newAlt = baseAlt + dAlt;
    var newAz  = baseAz + dAz;

    Console.PrintLine("Random sky dither:");
    Console.PrintLine("  Base Alt = " + baseAlt.toFixed(4) + " deg");
    Console.PrintLine("  Base Az  = " + baseAz.toFixed(4) + " deg");
    Console.PrintLine("  dAlt     = " + (dAlt * 60.0).toFixed(3) + " arcmin");
    Console.PrintLine("  dAz      = " + (dAz  * 60.0).toFixed(3) + " arcmin");
    Console.PrintLine("  New Alt  = " + newAlt.toFixed(4) + " deg");
    Console.PrintLine("  New Az   = " + newAz.toFixed(4) + " deg");

    gotoAltAz(newAlt, newAz);

    while (Dome.Slewing == true) {
        Console.PrintLine("Waiting for dome to finish slewing after sky dither...");
        Util.WaitForMilliseconds(500);
    }

    Util.WaitForMilliseconds(1000);
}

function acquireSkyFrames(baseAlt, baseAz, skyPath) {
    Console.PrintLine("=== Starting RANDOM sky dither sequence ===");

    for (var k = 0; k < nSkyDitherPositions; k++) {
        Console.PrintLine("Sky dither position " + (k + 1).toString() + " / " + nSkyDitherPositions.toString());

        // Random dither around the original science pointing
        ditherAltAzFromBase(baseAlt, baseAz, skyDitherStepArcmin);

        // Take one sky image for each exposure time at this dither position
        for (var j = 0; j < exposureList.length; j++) {
            var expMs = exposureList[j];
            var prefix = "Sky_D" + (k + 1).toString() + "_Alt" + baseAlt.toFixed(1) + "_" + expMs + "ms-";

            var skyParams = "-n 1 -p " + prefix +
                            " -e " + expMs +
                            " -t 0 -f normal -w " + skyPath;

            Console.PrintLine("Acquiring sky frame at position " +
                              (k + 1).toString() +
                              " with exposure " + expMs.toString() + " ms");

            runColibriGrab(skyParams);
            Util.WaitForMilliseconds(250);
        }
    }

    Console.PrintLine("Returning to original science pointing...");
    gotoAltAz(baseAlt, baseAz);

    while (Dome.Slewing == true) {
        Console.PrintLine("Waiting for dome to finish slewing after return...");
        Util.WaitForMilliseconds(500);
    }

    Util.WaitForMilliseconds(1000);
    Console.PrintLine("=== Finished RANDOM sky dither sequence ===");
}


/*---------------------------------main--------------------------------------*/

function main() {
    try {
        // Setup paths and directories
        colibriGrabPath = getColibriGrabPath();
        var paths = setupDataDirectory();
        var dataPath = paths.dataPath;
        var darkPath = paths.darkPath;
        var skyPath  = paths.skyPath;

        // Check disk space
        var freeSpace = freeDiskSpace("D");
        if (freeSpace < 10) {
            throw new Error("Low disk space on D: drive (" + freeSpace.toFixed(2) + "GB remaining)");
        }
        Console.PrintLine("Available disk space: " + freeSpace.toFixed(2) + "GB");

        /*--------------------------Safety Checks----------------------------*/
        if (Weather.Available) {
            Console.PrintLine("Weather server is connected.");
            Console.PrintLine("Continuing with operations.");
            Util.WaitForMilliseconds(1000);
        }
        else if (runUnsafe) {
            Console.PrintLine("Weather server is not connected, but unsafe mode is enabled.");
            Console.PrintLine("Continuing with operations.");
            ignoreWeather = true;
            Util.WaitForMilliseconds(1000);
        }
        else {
            if (Util.Confirm("No weather server! Do you want to continue? Choose wisely...")) {
                Console.PrintLine("Ok, you've chosen to proceed with no weather server. 8-O");
                ignoreWeather = true;
                Util.WaitForMilliseconds(1000);
            }
            else {
                Util.AbortScript();
            }
        }

        while (Weather.Available && !Weather.safe) {
            if (Dome.ShutterStatus != 1) {
                Console.PrintLine("Unsafe weather conditions. Closing the dome...");
                domeClose();
            }
            else {
                Console.PrintLine("Unsafe weather conditions. Waiting a minute...");
                Util.WaitForMilliseconds(60000);
            }
        }

        Console.PrintLine("Connecting to dome & telescope...");
        connectScope();
        domeOpen();
        trkOff();

        /*------------------------Begin Script Operations--------------------*/
        for (var i = 0; i < airmassList.length; i++) {
            var elevation = airmassToElevation(airmassList[i]);

            if (elevation < elevationLimit) {
                Console.PrintLine("Elevation of target is below elevation limit. Skipping this target.");
                continue;
            }

            // Slew to the science pointing
            gotoAltAz(elevation, azimuthTarget);

            while (Dome.Slewing) {
                Console.PrintLine("Waiting for dome to finish slewing...");
                Util.WaitForMilliseconds(1000);
            }
            Console.PrintLine("Dome has finished slewing. Proceeding to capture science images...");

            // Normal science images
            for (var j = 0; j < exposureList.length; j++) {
                var numExposures = Math.floor(observationTime / exposureList[j]);
                var prefix = "Alt" + elevation.toFixed(1) + "_" + exposureList[j] + "ms-";

                // Light frames
                var lightParams = "-n " + numExposures + " -p " + prefix +
                                  " -e " + exposureList[j] +
                                  " -t 0 -f normal -w " + dataPath;
                runColibriGrab(lightParams);

                Util.WaitForMilliseconds(250);

                // Dark frames
                var darkPrefix = "Dark_" + prefix;
                var darkParams = "-n 10 -p " + darkPrefix +
                                 " -e " + exposureList[j] +
                                 " -t 0 -f dark -w " + darkPath;
                runColibriGrab(darkParams);

                Console.PrintLine("Done exposing science run #" + j.toString());
                Util.WaitForMilliseconds(250);
            }

            // After all science sets for this pointing, collect dithered sky frames
            acquireSkyFrames(elevation, azimuthTarget, skyPath);
        }

        shutDown();

    } catch (e) {
        Console.PrintLine("Fatal error: " + e.message);
        shutDown();
        Util.AbortScript();
    }
}

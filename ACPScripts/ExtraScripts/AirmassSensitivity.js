/////////////////////////////
// Filename:   AirmassSensitivity.js
// Author(s):  Peter Quigley
// Contact:    pquigle@uwo.ca
// Created:    Oct 30, 2023
// Updated:    June 23, 2025
//    
// Description:
// Script for measuring sensitivity at different airmasses
//
// Usage:
// Run script and follow prompts
/////////////////////////////


/*------------------------------global vars----------------------------------*/

// Safety Parameters
var elevationLimit = 10; // minimum elevation of field in degrees
var runUnsafe = false; // if true, will disable weather checks

// Scheduler Lists
var airmassList = [1.0001, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0]; // list of airmasses to observe
var exposureList = [25, 33, 50, 100, 200, 500, 1000]; // list of exposure times to use (in ms)

// Misc Variables
var azimuthTarget = 180; // azimuth of target in degrees

var observationTime = 60000; // time to observe in milliseconds

// File paths
var baseDataPath = "D:\\tmp\\AirmassSensitivity\\";
var colibriGrabPath = "";

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
        
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        if (!fso.FolderExists(fullPath)) {
            fso.CreateFolder(fullPath);
        }
        if (!fso.FolderExists(darkPath)) {
            fso.CreateFolder(darkPath);
        }
        
        return fullPath;
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
        // Dome is open
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

        // Dome is closed
        case 1:
            Console.PrintLine("--> Dome shutter is already closed :-P");
            break;

        // Shutter is opening
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

        // Dome is closing
        case 3:
            while (Dome.ShutterStatus == 3) {
                Console.PrintLine("*** Dome shutter is closing. Waiting for it close...");
                Util.WaitForMilliseconds(2000);
            }
            Console.PrintLine("--> Dome shutter is closed...");
            break;

        // Error state
        case 4:
            Console.PrintLine("There was a problem with the shutter control...");
            break;
    }
}

// Open the dome
function domeOpen() {
    switch (Dome.ShutterStatus) {
        // Dome is open
        case 0:
            Console.PrintLine("--> Dome shutter is already open :-P");
            break;

        // Dome is closed
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

        // Dome is closing
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

        // Error state
        case 4:
            Console.PrintLine("There was a problem with the shutter control...");
            break;
    }

    // Home the dome if not already done
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
    // Check to see if telescope is connected
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
    // Print input coordinates to screen
    Console.PrintLine("RA in gotoRADec function " + ra.toFixed(4));
    Console.PrintLine("Dec in gotoRADec function " + dec);

    // Create a new coordinate object with the input coordinates
    targetCt = Util.NewCThereAndNow();
    targetCt.RightAscension = ra;
    targetCt.Declination = dec;

    // Check that the elevation of the field is above the elevation limit
    breakme: if (targetCt.Elevation < elevationLimit) {
        Console.PrintLine("Tried to move to an unsafe elevation of " + targetCt.Elevation.toFixed(4));
        Util.AbortScript();
        break breakme;
    }

    // Check that the telescope is tracking
    trkOnAttempt = 0;
    while (!Telescope.Tracking) {
        // If the telescope is not tracking, try to turn it on
        trkOn();
        trkOnAttempt += 1;

        // If the telescope is still not tracking after 5 attempts, abort the script
        if (trkOnAttempt > 5) {
            Console.PrintLine("Failed to turn on tracking after 5 attempts. Aborting script.");
            Util.AbortScript();
        }
    }

    // Check that the dome is tracking
    Dome.UnparkHome();
    if (Dome.slave == false) {
        Dome.slave = true;
    }

    // Try to slew to the target coordinates
    slewToStatus = false;
    slewToAttempt = 0;
    while (!slewToStatus) {
        try {
            Telescope.SlewToCoordinates(ra.toFixed(4), dec.toFixed(4));
            Console.PrintLine("Done slewing.");
            slewToStatus = true;
        }
        catch(e) {
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

    // Wait for the dome to finish slewing
    while (Dome.Slewing == true) {
        Console.PrintLine("Dome is still slewing. Give me a minute...");
        Util.WaitForMilliseconds(500);
    }
}

function gotoAltAz(alt, az) {
    // Set up coordinate transform
    ct = Util.NewCThereAndNow();
    ct.Elevation = alt;
    ct.Azimuth = az;

    // Print input coordinates to screen
    Console.PrintLine("Alt in gotoAltAz function " + alt.toFixed(1));
    Console.PrintLine("Az in gotoAltAz function " + az.toFixed(1));
    
    // Check that the elevation of the field is above the elevation limit
    breakme: if (ct.Elevation < elevationLimit) {
        Console.PrintLine("Tried to move to an unsafe elevation of " + ct.Elevation.toFixed(4));
        Util.AbortScript();
        break breakme;
    }

    // Check that the dome is tracking
    Console.PrintLine("At Unpark...");
    Dome.UnparkHome();
    if (Dome.slave == false) {
        Console.PrintLine("Unparking dome and slaving to telescope...");
        Dome.slave = true;
    }

    // Wait for the dome to finish slewing
    Console.PrintLine("Skipped it...");
    while (Dome.Slewing == true) {
        Console.PrintLine("Dome is still slewing. Give me a minute...");
        Util.WaitForMilliseconds(500);
    }

    // Try to slew to the target coordinates
    slewToStatus = false;
    slewToAttempt = 0;
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
        catch(e) {
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
    // Convert RA to decimal degrees
    ra = ra*15;

    // Call astrometry_correction.py to get pointing offset
    Console.PrintLine("== Pointing Correction ==");
    var SH = new ActiveXObject("WScript.Shell");
    var BS = SH.Exec("python astrometry_correction.py " + ra + " " + dec);
    var python_output = "";

    while(BS.Status != 1) {
        while(!BS.StdOut.AtEndOfStream) {
            python_output += BS.StdOut.Read(1);
        }
        Util.WaitForMilliseconds(100);
    };

    // Parse output from astrometry_correction.py
    var py_lines = python_output.split("\n");
    var radec_offset = py_lines[py_lines.length-2].split(" ");

    // Calculate new RA and Dec pointing
    new_ra = (ra + parseFloat(radec_offset[0]))/15;
    new_dec = dec + parseFloat(radec_offset[1]);
    Console.PrintLine("New RA: " + new_ra.toString() + " New Dec: " + new_dec.toString());

    // Check that new pointing is reasonable
    if (isNaN(new_ra) || isNaN(new_dec)) {
        Console.PrintLine("New pointing is not a number. Ignoring new pointing and continuing with current pointing.");
        return;
    }
    else if ((new_ra > 24 || new_ra < 0) || (new_dec > 90 || new_dec < -90)) {
        Console.PrintLine("New pointing is not reasonable. Ignoring new pointing and continuing with current pointing.");
        return;
    }

    // Call gotoRADec() to slew to new pointing
    gotoRADec(new_ra, new_dec);
}

/////////////////////////////
// Script Functions
/////////////////////////////

// Ask user for RA and Dec in the terminal 
function userInputRADEC() {
    // Take user input for coordinates
    var RA = parseFloat(Util.Prompt("RA coordinate (in decimal degrees): ", "NaN"));
    var DEC = parseFloat(Util.Prompt("Dec coordinate (in decimal degrees): ", "NaN"));
    Console.PrintLine("RA: " + RA + " DEC: " + DEC);

    // Check that these coordinates are valid
    if (isNaN(RA) || isNaN(DEC)) {
        throw new Error("Coordinates could not be parsed. Exiting.");
        Util.AbortScript();
    }
    else if (RA < 0 || RA > 360 || DEC < -90 || DEC > 90) {
        throw new Error("Coordinates exceed expected bounds. Exiting.");
        Util.AbortScript();
    }
    else {
        return [RA, DEC];
    }
}

// Translate airmass to elevation
function airmassToElevation(airmass) {
    // Calculate elevation of target
    var elevation = 90 - (Math.acos(1/airmass) * (180/Math.PI));
    Console.PrintLine("Elevation of target: " + elevation.toFixed(4));

    // Check that elevation is reasonable
    if (isNaN(elevation)) {
        throw new Error("Elevation is not a number. Exiting.");
        Util.AbortScript();
    }
    else if (elevation < 0 || elevation > 90) {
        throw new Error("Elevation is not reasonable. Exiting.");
        Util.AbortScript();
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
        return wsh.Run(command, 1, true); // 1: normal window, true: wait for completion
    } catch (e) {
        Console.PrintLine("Error running ColibriGrab: " + e.message);
        throw e;
    }
}

/*---------------------------------main--------------------------------------*/

function main() {
    /*--------------------------Initial Setup--------------------------------*/
    try {
        // Setup paths and directories
        colibriGrabPath = getColibriGrabPath();
        var dataPath = setupDataDirectory();
        var darkPath = dataPath + "Dark\\";
        
        // Check disk space
        var freeSpace = freeDiskSpace("D");
        if (freeSpace < 10) { // Less than 10GB
            throw new Error("Low disk space on D: drive (" + freeSpace.toFixed(2) + "GB remaining)");
        }
        Console.PrintLine("Available disk space: " + freeSpace.toFixed(2) + "GB");
        
        /*--------------------------Safety Checks----------------------------*/
        // Check to see if the weather server is connected
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

        // If the weather server is connected and the weather is not safe, wait
        while (Weather.Available && !Weather.safe) {
            // If the weather is unsafe, close the dome and wait a minute
            if (Dome.ShutterStatus != 1) {
                Console.PrintLine("Unsafe weather conditions. Closing the dome...");
                domeClose();
            }
            else {
                Console.PrintLine("Unsafe weather conditions. Waiting a minute...");
                Util.WaitForMilliseconds(60000);
            }
        }

        // Monitor the weather status, if the weather script is active
        Console.PrintLine("Connecting to dome & telescope...");
        connectScope();
        domeOpen();
        trkOff();

        /*------------------------Begin Script Operations--------------------*/
        for (var i = 0; i < airmassList.length; i++) {
            // Calculate elevation of target
            var elevation = airmassToElevation(airmassList[i]);

            // Check that elevation is above elevation limit
            if (elevation < elevationLimit) {
                Console.PrintLine("Elevation of target is below elevation limit. Skipping this target.");
                continue;
            }

            // Slew to target
            gotoAltAz(elevation, azimuthTarget);

            // Wait for the dome to finish slewing before continuing
            while (Dome.Slewing) {
                Console.PrintLine("Waiting for dome to finish slewing...");
                Util.WaitForMilliseconds(1000);
            }
            Console.PrintLine("Dome has finished slewing. Proceeding to capture images...");

            // Iterate over all exposures in the exposure list
            for (var j = 0; j < exposureList.length; j++) {
                // Calculate number of images to take
                var numExposures = Math.floor(observationTime/exposureList[j]);
                var prefix = "Alt" + elevation.toFixed(1) + "_" + exposureList[j] + "ms-";
                
                // Take light frames
                var lightParams = "-n " + numExposures + " -p " + prefix + 
                                 " -e " + exposureList[j] + 
                                 " -t 0 -f normal -w " + dataPath;
                runColibriGrab(lightParams);
                
                Util.WaitForMilliseconds(250);

                // Take dark frames
                var darkPrefix = "Dark_" + prefix;
                var darkParams = "-n 10 -p " + darkPrefix + 
                                " -e " + exposureList[j] + 
                                " -t 0 -f dark -w " + darkPath;
                runColibriGrab(darkParams);
                
                Console.PrintLine("Done exposing run #" + j.toString());
                Util.WaitForMilliseconds(250);
            }
        }

        // Close up shop
        shutDown();
        
    } catch (e) {
        Console.PrintLine("Fatal error: " + e.message);
        shutDown();
        Util.AbortScript();
    }
}
var SUP;
var ForReading = 1;
var ForAppending = 8;
var finalFields = [];
// Ensure the FileSystemObject is available
var fso = new ActiveXObject("Scripting.FileSystemObject");

// Define log file paths and modes
var logFilePath = "d:\\Logs\\ACP\\" + Util.FormatVar(Util.SysUTCDate, "yyyymmdd_HhNnSs_DayTime_SimTest") + "-ACP.log";
var logMode = 8; // Append mode

String.prototype.trim = function() {
    return this.replace(/(^\s*)|(\s*$)/g, "");
}

// Aborts script
function abort() {
    Console.PrintLine("Aborting script!")
    Console.PrintLine(Util.SysUTCDate + "ERROR: Aborting script!")
    shutDown();
    while (Dome.ShutterStatus != 1 || Telescope.AtPark != true) {
        Util.WaitForMilliseconds(5000);
        Console.PrintLine("Waiting 5 seconds for shutter to close and telescope to park...");
    }
    if (Util.ScriptActive) {
        Console.PrintLine("Aborting...")
        Util.AbortScript();
    }
    while (Util.ScriptActive) {
        Console.PrintLine("Waiting for script to finish...")
    }
}

function abortAndRestart() {
    Console.PrintLine("Aborting script!");
    Console.PrintLine(Util.SysUTCDate + "ERROR: Aborting and restarting script!")
    shutDown();
    while (Dome.ShutterStatus != 1 || Telescope.AtPark != true) {
        Util.WaitForMilliseconds(5000)
        Console.PrintLine("Waiting 5 seconds for shutter to close and telescope to park...")
    }
    if (Util.ScriptActive) {
        Console.PrintLine("Aborting...")
        Util.AbortScript();
    }
    while (Util.ScriptActive) {
        Console.PrintLine("Waiting for script to finish...")
    }
    main();
}

function andRestart() {
    Console.PrintLine("Shutting down and restarting!");
    shutDown();
    while (Dome.ShutterStatus != 1 || Telescope.AtPark != true) {
        Util.WaitForMilliseconds(5000)
        Console.PrintLine("Waiting 5 seconds for shutter to close and telescope to park...")
    }
    main();
}

// Function called when Alert button is pressed
function alert() {
    Console.alert(consIconWarning, "Quiting script!")
    shutDown()
    abort()
}

// Function to append the ColibriGrab log file to the ACP log file and delete it
function appendAndDeleteColibriGrabLog(colibriLogFile, LogFile) {
    try {
        if (fso.FileExists(colibriLogFile)) {
            var colibriLog = fso.OpenTextFile(colibriLogFile, ForReading, false);
            while (!colibriLog.AtEndOfStream) {
                var logLine = colibriLog.ReadLine();
                Console.PrintLine(Util.SysUTCDate + " " + logLine);
            }
            colibriLog.Close();
            fso.DeleteFile(colibriLogFile);
            Console.PrintLine(Util.SysUTCDate + " INFO: Deleted ColibriGrab log file after appending.");
        } else {
            Console.PrintLine(Util.SysUTCDate + " ERROR: ColibriGrab log file does not exist.");
    } catch (e) {
        Console.PrintLine(Util.SysUTCDate + " ERROR: " + e.message);
    }
}

// Function to collect bias data
function biasCollection(today, LogFile) {
    var wshShell = new ActiveXObject("WScript.Shell");
    var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");
    var colibriGrabPath = userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";
    Console.PrintLine("Starting bias frame collection...");
    var wsh = new ActiveXObject("WScript.Shell");
    var command = "\"" + colibriGrabPath + "\" -n 50 -p Bias_25ms -e 0 -t 0 -f bias -w D:\\ColibriData\\" + today.toString() + "\\Bias";
    Console.PrintLine('Executing command: ' + command);
    wsh.Run(command, 1, true);
    Util.WaitForMilliseconds(100)
    Console.PrintLine("Finished collecting bias frames...");
    appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);
}

// Function to collect dark data
function darkCollection(today, LogFile) {
    var wshShell = new ActiveXObject("WScript.Shell");
    var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");
    var colibriGrabPath = userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";
    Console.PrintLine("Starting dark frame collection...");
    var wsh = new ActiveXObject("WScript.Shell");
    var command = "\"" + colibriGrabPath + "\" -n 10 -p Dark_25ms -e 0 -t 0 -f dark -w D:\\ColibriData\\" + today.toString() + "\\Dark";
    wsh.Run(command, 1, true);
    Util.WaitForMilliseconds(100)
    Console.PrintLine("Finished collecting dark frames...");
    appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);
}

// Function to connect the telescope
function connectScope() {
    if (Telescope.Connected) {
        Console.PrintLine("Telescope is connected!")
        trkOn()
    } else {
        Console.PrintLine("Telescope is not connected. Attempting to connect...")
        Telescope.Connected = true;
        trkOn()
        if (Telescope.Connected) {
            Console.PrintLine("Telescope is now connected!")
            trkOn()
        } else {
            Console.PrintLine("Telescope is still not connected. There must be a problem. :-(")
            abort()
        }
    }
    Console.PrintLine(" ")
}

// Function to close dome
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
            } else {
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
            Console.PrintLine("There was a problem with the shutter control...")
            return;
            break;
    }
    if (Dome.Status != 1) {
        Console.PrintLine("Dome is not closed. Trying again...")
        Util.WaitForMilliseconds(1000)
        domeClose()
    }
}

// Function to home dome
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
    Dome.UnparkHome()
}

// Function to open dome
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
            } else
                Console.PrintLine("--> Dome is NOT open.");
            break;
        case 2:
            while (Dome.ShutterStatus == 2) {
                Console.PrintLine("*** Dome shutter is open...");
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
            Console.PrintLine("There was a problem with the shutter control...")
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

// Returns available disk space
function freeDiskSpace() {
    var AX = new ActiveXObject("WScript.Shell");
    var SE = AX.Exec(ACPApp.Path + "\\freespace.bat");
    var size = "";
    size = SE.StdOut.Read(25);
    size = size / 1000000000000;
    return (size)
}

// Returns date as yyyymmdd
function getDate() {
    var d = new Date();
    var s = d.getUTCFullYear();
    var month = (d.getUTCMonth() + 1).toString();
    var day = (d.getUTCDate()).toString();
    if (month.length == 1) {
        s += "0" + month;
    } else {
        s += month;
    }
    if (day.toString().length == 1) {
        s += "0" + day;
    } else {
        s += day;
    }
    return s;
}

function JDtoUTC(JulianDate) {
    var millis = (JulianDate - 2440587.5) * 86400000
    var toUTC = new Date(millis)
    var s = toUTC.getUTCFullYear();
    var month = (toUTC.getUTCMonth() + 1).toString()
    var day = (toUTC.getUTCDate()).toString()
    if (month.length == 1) {
        s += "0" + month;
    } else {
        s += month;
    }
    if (day.toString().length == 1) {
        s += "0" + day;
    } else {
        s += day;
    }
    return s;
}

// Return the coordinates of the moon in RA and Dec
function getMoon() {
    Util.Console.PrintLine("== Moon Coordinates ==");
    Console.PrintLine(Util.SysUTCDate + " INFO: == Moon Coordinates ==");
    var SH = new ActiveXObject("WScript.Shell");
    var BS = SH.Exec(ACPApp.Path + "\\aa.exe -moon");
    var coords = "";
    while (BS.Status != 1) {
        while (!BS.StdOut.AtEndOfStream) {
            coords += BS.StdOut.Read(1);
        }
        Util.WaitForMilliseconds(100);
    }
    coords = coords.trim();
    Util.Console.PrintLine("== " + coords + " ==");
    Console.PrintLine(Util.SysUTCDate + " INFO: " + coords);
    var bits = coords.split(" ");
    ct = Util.NewCThereAndNow();
    ct.RightAscension = bits[0];
    ct.Declination = bits[1];
    return ct;
}

function getRADEC() {
    var ras, des;
    if (Prefs.DoLocalTopo) {
        SUP.LocalTopocentricToJ2000(Telescope.RightAscension, Telescope.Declnation);
        ras = SUP.J2000RA;
        des = SUP.J2000Dec;
    } else {
        ras = Telescope.RightAscension;
        des = Telescope.Declination;
    }
    return { ra: ras, dec: des };
}

// Sends scope to a particular Alt and Az
function gotoAltAz(alt, az) {
    breakme: if (ct.Elevation < elevationLimit) {
        Console.PrintLine("Tried to move to an unsave elevation of " + ct.Elevation.toFixed(4));
        Console.PrintLine(Util.SysUTCDate + " WARNING: Tried to move to an unsave elevation of " + ct.Elevation.toFixed(4));
        Console.PrintLine(Util.SysUTCDate + " WARNING: Closing up shop!");
        shutDown();
        Console.PrintLine("Finished closing up shop.");
        Console.PrintLine(Util.SysUTCDate + " INFO: Finished closing up shop!");
        break breakme;
    }
    if (Telescope.tracking) {
        Telescope.SlewToAltAz(alt, az);
        Util.WaitForMilliseconds(100);
        while (Telescope.Slewing) {
            Console.PrintLine("Going to...");
            Util.WaitForMilliseconds(2000);
        }
        Console.PrintLine("Done.");
    }
}

// Sends scope to a particular RA and DEC
function gotoRADec(ra, dec) {
    Console.PrintLine("RA in gotoRADec function " + ra.toFixed(4));
    Console.PrintLine("Dec in gotoRADec function " + dec);
    targetCt = Util.NewCThereAndNow();
    targetCt.RightAscension = ra
    targetCt.Declination = dec
    Console.PrintLine("Elevation of field " + targetCt.Elevation.toFixed(4));
    breakme: if (targetCt.Elevation < elevationLimit) {
        Console.PrintLine("Tried to move to an unsave elevation of " + targetCt.Elevation.toFixed(4));
        shutDown();
        Console.PrintLine(Util.SysUTCDate + " INFO: Finished closing up shop!");
        break breakme;
    }
    if (Telescope.tracking) {
        Console.PrintLine("Slewing to declination " + dec + " and right ascension " + ra.toFixed(4));
        Console.PrintLine(Util.SysUTCDate + " INFO: Slewing to declination " + dec + " and right ascension " + ra.toFixed(4));
        try {
            Telescope.SlewToCoordinates(ra.toFixed(4), dec.toFixed(4));
        } catch (e) {
            if (slewAttempt < 10) {
                Console.PrintLine("Error on attempt" + slewAttempt + "to slew. Waiting 5 seconds and trying again.");
                Util.WaitForMilliseconds(5000);
                gotoRADec(ra, dec);
                slewAttempt += 1;
            } else {
                Console.PrintLine("Reached maximum number of tries to slew");
            }
        }
        Console.PrintLine("Done slewing.");
        Console.PrintLine("Finished slewing.")
    }
}

// Function to adjust telescope pointing
function adjustPointing(ra, dec) {
    ra = ra * 15;
    Console.PrintLine("== Pointing Correction ==");
    Console.PrintLine(Util.SysUTCDate + " INFO: == Pointing Correction ==");
    var SH = new ActiveXObject("WScript.Shell");
    var BS = SH.Exec("python ExtraScripts\\astrometry_correction.py " + ra + " " + dec);
    var python_output = "";
    var python_error = "";
    var start = new Date().getTime();
    var timeout = 300000;
    Console.PrintLine("Script started at: " + start);
    Console.PrintLine(Util.SysUTCDate + " INFO: Script started at: " + start);
    while (BS.Status == 0) {
        while (!BS.StdOut.AtEndOfStream) {
            python_output += BS.StdOut.Read(1);
        }
        while (!BS.StdErr.AtEndOfStream) {
            python_error += BS.StdErr.Read(1);
        }
        Util.WaitForMilliseconds(100);
        var currentTime = new Date().getTime();
        Console.PrintLine("Current Time: " + currentTime);
        Console.PrintLine(Util.SysUTCDate + " INFO: Current Time: " + currentTime);
        if (currentTime - start > timeout) {
            Console.PrintLine("Python script timed out.");
            Console.PrintLine(Util.SysUTCDate + " ERROR: Python script timed out.");
            BS.Terminate();
            return;
        }
    }
    var end = new Date().getTime();
    Console.PrintLine("Script ended at: " + end);
    Console.PrintLine("Script duration: " + (end - start) + " ms");
    if (python_error) {
        Console.PrintLine("Python script error output: " + python_error);
    }
    var py_lines = python_output.split("\n");
    var radec_offset = py_lines[py_lines.length - 2].split(" ");
    var new_ra = (ra + parseFloat(radec_offset[0])) / 15;
    var new_dec = dec + parseFloat(radec_offset[1]);
    Console.PrintLine("New RA: " + new_ra.toString() + " New Dec: " + new_dec.toString());
    Console.PrintLine(Util.SysUTCDate + " INFO: New RA: " + new_ra.toString());
    Console.PrintLine(Util.SysUTCDate + " INFO: New Dec: " + new_dec.toString());
    if (isNaN(new_ra) || isNaN(new_dec)) {
        Console.PrintLine("New pointing is not a number. Ignoring new pointing and continuing with current pointing.");
        return;
    } else if ((new_ra > 24 || new_ra < 0) || (new_dec > 90 || new_dec < -90)) {
        Console.PrintLine("New pointing is not reasonable. Ignoring new pointing and continuing with current pointing.");
        return;
    }
    targetCt = Util.NewCThereAndNow();
    targetCt.RightAscension = new_ra;
    targetCt.Declination = new_dec;
    if (targetCt.Elevation < elevationLimit) {
        Console.PrintLine("Tried to move to an unsafe elevation of " + targetCt.Elevation.toFixed(4));
        Console.PrintLine("Ignoring new pointing and continuing with current pointing.");
    } else {
        gotoRADec(new_ra, new_dec);;
    }
}

// Function to shut down telescope at end of the night
function shutDown() {
    trkOff()
    Console.PrintLine("Tracking turned off. Parking telescope now...");
    Telescope.Park();
    trkOff();
    Console.PrintLine("Telescope parked. Closing dome now...");
    domeClose();
    Console.PrintLine("Dome closed. Good night/morning.");
}

// Function to turn tracking off
function trkOff() {
    if (Telescope.CanSetTracking) {
        Telescope.Tracking = false;
        Console.PrintLine("--> Tracking is turned off.");
    } else if (Telescope.Tracking && !Telescope.CanSetTracking) {
        Console.PrintLine("Failed to disable tracking");
        Console.PrintLine(" WARNING: Failed to disable telescope tracking");
    }
}

// Function to turn tracking on
function trkOn() {
    if (Telescope.CanSetTracking) {
        Telescope.Unpark();
        Telescope.Tracking = true;
        Console.PrintLine("--> Tracking is turned on :-)");
    } else if (Telescope.Tracking && !Telescope.CanSetTracking) {
        Console.PrintLine("Failed to enable tracking");
        Console.PrintLine(" WARNING: Failed to enable telescope tracking");
    }
}

// Returns JD of sunrise and sunset for current day
function twilightTimes(jDate) {
    lat = Telescope.SiteLatitude;
    lon = Telescope.SiteLongitude;
    n = Math.floor(jDate - 2451545.0 + 0.0008);
    Jstar = n - (lon / 360.0);
    M = (357.5291 + 0.98560028 * Jstar) % 360;
    C = 1.9148 * Math.sin(Util.Degrees_Radians(M)) + 0.02 * Math.sin(2 * Util.Degrees_Radians(M)) + 0.0003 * Math.sin(3 * Util.Degrees_Radians(M));
    lam = (M + C + 180 + 102.9372) % 360;
    Jtransit = 2451545.0 + Jstar + 0.0053 * Math.sin(Util.Degrees_Radians(M)) - 0.0069 * Math.sin(2 * Util.Degrees_Radians(lam));
    sindec = Math.sin(Util.Degrees_Radians(lam)) * Math.sin(Util.Degrees_Radians(23.44));
    cosHA = (Math.sin(Util.Degrees_Radians(-12)) - (Math.sin(Util.Degrees_Radians(lat)) * sindec)) / (Math.cos(Util.Degrees_Radians(lat)) * Math.cos(Math.asin(sindec)));
    Jrise = Jtransit - (Util.Radians_Degrees(Math.acos(cosHA))) / 360;
    Jset = Jtransit + (Util.Radians_Degrees(Math.acos(cosHA))) / 360;
    return [Jrise, Jset];
}

// Causes program to wait until sunset
function waitUntilSunset(updatetime) {
    var currentJD = Util.SysJulianDate
    while (currentJD < sunset) {
        Console.Clear()
        if (currentJD > sunrise && currentJD < sunset) {
            Console.PrintLine("Sun is up");
            Console.PrintLine("It has been up for " + Util.Hours_HMS((currentJD - sunrise) * 24, "h ", "m ", "s"));
            Console.PrintLine("It will set in " + Util.Hours_HMS(-1 * (currentJD - sunset) * 24, "h ", "m ", "s"));
            Console.PrintLine("Waiting " + -1 * (currentJD - sunset) * 24 + " hours to start operations.");
            Util.WaitForMilliseconds(updatetime);
            currentJD = Util.SysJulianDate;
        }
    }
}

function sortFields(fieldtosort) {
    sortedFields = fieldtosort.sort(function(a, b) {
        return b[10] - a[10]
    });
    return sortedFields;
}

function whichField(timeJD) {
    const elevationLimit = 10; // Define a safe minimum elevation limit
    nextField = 0;
    Console.PrintLine("Called whichField function...");
    Console.PrintLine("Number of fields in finalFields: " + finalFields.length);

    if (finalFields.length === 0) {
        Console.PrintLine("No fields to observe. Aborting...");
        return [-1, 0, 0, 0, 0, "None", 999];
    }

    if (timeJD < finalFields[0][12]) {
        Console.PrintLine("\r\n  Earlier than first observation time.");
        Console.PrintLine("************************************");
        targetJD = finalFields[0][12];
        targetDur = finalFields[0][12] - timeJD;
        targetLoops = Math.ceil(targetDur * 86400 / 0.025 / numExposures);
        targetRA = finalFields[0][2][0];
        targetDec = finalFields[0][2][1];
        if (finalFields[0][0] < elevationLimit) {
            Console.PrintLine("First field elevation is too low. Aborting...");
            return [-1, 0, 0, 0, 0, "None", 999];
        }
        Console.PrintLine("\r\nThe JD start time is " + targetJD.toFixed(4));
        Console.PrintLine("We'll run for " + targetLoops + " loops of " + numExposures + " exposures.");
        Console.PrintLine("Which means that we're on target for " + targetDur.toFixed(3) + " hours.");
        currField = -1;
        nextField = 0;
        fieldName = "TooEarly";
        return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD];
    }

    if (finalFields.length == 1) {
        Console.PrintLine("Only one field to observe!");
        targetJD = finalFields[0][12] + finalFields[0][13];
        targetDur = targetJD - timeJD;
        targetLoops = Math.ceil(targetDur * 86400 / 0.025 / numExposures);
        currField = 0;
        nextField = -999;
        targetRA = finalFields[0][2][0];
        targetDec = finalFields[0][2][1];
        if (finalFields[0][0] < elevationLimit) {
            Console.PrintLine("Field elevation is too low. Aborting...");
            return [-1, 0, 0, 0, 0, "None", 999];
        }
        fieldName = finalFields[0][3].toString();
        Console.PrintLine("target JD: " + targetJD);
        Console.PrintLine("Number of loops: " + targetLoops);
        Console.PrintLine("Target duration: " + targetDur);
        Console.PrintLine("finalFields: " + finalFields[0][12]);
        return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD];
    }

    for (i = 0; i < finalFields.length - 1; i++) {
        if ((timeJD > finalFields[i][12]) && (timeJD < finalFields[i + 1][12])) {
            targetJD = finalFields[i + 1][12];
            targetDur = finalFields[i + 1][12] - timeJD;
            targetLoops = Math.ceil(targetDur * 86400 / 0.025 / numExposures);
            currField = i;
            nextField = i + 1;
            targetRA = finalFields[i][2][0];
            targetDec = finalFields[i][2][1];
            if (finalFields[i][0] < elevationLimit) {
                Console.PrintLine("Field elevation is too low. Skipping to next field...");
                continue; // Skip to the next field
            }
            fieldName = finalFields[i][3].toString();
            return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD];
        }
    }

    if (timeJD > finalFields[finalFields.length - 1][12]) {
        Console.PrintLine("At last field");
        targetJD = finalFields[finalFields.length - 1][12] + finalFields[finalFields.length - 1][13];
        targetDur = targetJD - timeJD;
        targetLoops = Math.ceil(targetDur * 86400 / 0.025 / numExposures);
        currField = finalFields.length - 1;
        nextField = 999;
        targetRA = finalFields[finalFields.length - 1][2][0];
        targetDec = finalFields[finalFields.length - 1][2][1];
        if (finalFields[finalFields.length - 1][0] < elevationLimit) {
            Console.PrintLine("Last field elevation is too low. Aborting...");
            return [-1, 0, 0, 0, 0, "None", 999];
        }
        fieldName = finalFields[finalFields.length - 1][3].toString();
        return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD];
    }

    Console.PrintLine("No valid fields");
    targetJD = 999;
    targetDur = 999;
    targetLoops = 0;
    currField = 999;
    nextField = 999;
    targetRA = 37.75;
    targetDec = 89.15;
    fieldName = "NoFields";
    Console.PrintLine(Util.SysUTCDate + " WARNING: No valid fields. Closing up shop.");
    Telescope.Park();
    trkOff();
    domeClose();
    return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD];
}

// ACP Variables
var logconsole = true;
var firstRun = true;
var isAfterSunset = false;
var fso, f1, ts;
var Mode = 8;
var currentDate = getDate();
var pierside = "E";

// Magic numbers
var curTarget = null;
var elevationLimit = 10; // minimum elevation of field in degrees
var minMoonOffset = 15; // angular seperation from moon in degrees
var numExposures = 2400; // exposures/min
var timestep = 1.0; // time between fields in hours
var minDiff = 2; // minimum difference between fields to justify a switch
var magnitudeLimit = 12; // dimmest visible star
var extScale = 0.4; // extinction scaling factor
var darkInterval = 15; // Number of minutes between dark series collection


// Iterables
var slewAttempt = 0;
// Field coordinates
var field1  = [273.736, -18.640];
var field2  = [92.419,  23.902];
var field3  = [287.740, -17.914];
var field4  = [105.436, 22.379];
var field5  = [254.789, -27.225];
var field6  = [129.972, 19.312];
var field7  = [75.678,  23.580];
var field8  = [306.006, -14.551];
var field9  = [239.923, -25.287];
var field10 = [56.973,  23.942];
var field11 = [318.700, -11.365];
var field12 = [226.499, -22.274];
var field13 = [334.365, -10.910];
var field14 = [212.040, -17.675];
var field15 = [39.313,  17.413];
var field16 = [143.292, 10.261];
var field17 = [348.814, -0.699];
var field18 = [155.530, 5.914];
var field19 = [1.693,   3.707];
var field20 = [15.529,  2.557];
var field21 = [25.171,  14.130];
var field22 = [198.755, -11.953];
var field23 = [184.631, -3.816];
var field24 = [172.488, 0.500];

// Create new coordinate transform objects and fill with RA/Dec for each of the fields
// ct1 = Util.NewCThereAndNow(); ct1.RightAscension = field1[0] / 15; ct1.Declination = parseFloat(field1[1]);
// ct2 = Util.NewCThereAndNow(); ct2.RightAscension = field2[0] / 15; ct2.Declination = parseFloat(field2[1]);
// ct3 = Util.NewCThereAndNow(); ct3.RightAscension = field3[0] / 15; ct3.Declination = parseFloat(field3[1]);
// ct4 = Util.NewCThereAndNow(); ct4.RightAscension = field4[0] / 15; ct4.Declination = parseFloat(field4[1]);
// ct5 = Util.NewCThereAndNow(); ct5.RightAscension = field5[0] / 15; ct5.Declination = parseFloat(field5[1]);
// ct6 = Util.NewCThereAndNow(); ct6.RightAscension = field6[0] / 15; ct6.Declination = parseFloat(field6[1]);
// ct7 = Util.NewCThereAndNow(); ct7.RightAscension = field7[0] / 15; ct7.Declination = parseFloat(field7[1]);
// ct8 = Util.NewCThereAndNow(); ct8.RightAscension = field8[0] / 15; ct8.Declination = parseFloat(field8[1]);
// ct9 = Util.NewCThereAndNow(); ct9.RightAscension = field9[0] / 15; ct9.Declination = parseFloat(field9[1]);
// ct10 = Util.NewCThereAndNow(); ct10.RightAscension = field10[0] / 15; ct10.Declination = parseFloat(field10[1]);
// ct11 = Util.NewCThereAndNow(); ct11.RightAscension = field11[0] / 15; ct11.Declination = parseFloat(field11[1]);

// Elevation, Azimuth, field, field name, moon angle, HA, airmass, # of M13 stars, a, b, # of stars visible, rank, ct time #
// TODO: update a,b parameters for all new fields
fieldInfo = [
    [0, 0, field1, "field1",   0, 0, 1.0, 5005, 0.0005, 1.0, 5005, 0, 0],
    [0, 0, field2, "field2",   0, 0, 1.0, 1696, 0.0005, 1.0, 1696, 0, 0],
    [0, 0, field3, "field3",   0, 0, 1.0, 1696, 0.0005, 1.0, 1696, 0, 0],
    [0, 0, field4, "field4",   0, 0, 1.0, 967,  0.0005, 1.0, 967, 0, 0],
    [0, 0, field5, "field5",   0, 0, 1.0, 2442, 0.0005, 1.0, 2442, 0, 0],
    [0, 0, field6, "field6",   0, 0, 1.0, 495,  0.0005, 1.0, 495, 0, 0],
    [0, 0, field7, "field7",   0, 0, 1.0, 840,  0.0005, 1.0, 840, 0, 0],
    [0, 0, field8, "field8",   0, 0, 1.0, 588,  0.0005, 1.0, 588, 0, 0],
    [0, 0, field9, "field9",   0, 0, 1.0, 754,  0.0005, 1.0, 754, 0, 0],
    [0, 0, field10, "field10", 0, 0, 1.0, 489,  0.0005, 1.0, 489, 0, 0],
    [0, 0, field11, "field11", 0, 0, 1.0, 394,  0.0005, 1.0, 394, 0, 0],
    [0, 0, field12, "field12", 0, 0, 1.0, 387,  0.0005, 1.0, 387, 0, 0],
    [0, 0, field13, "field13", 0, 0, 1.0, 251,  0.0005, 1.0, 251, 0, 0],
    [0, 0, field14, "field14", 0, 0, 1.0, 305,  0.0005, 1.0, 305, 0, 0],
    [0, 0, field15, "field15", 0, 0, 1.0, 269,  0.0005, 1.0, 269, 0, 0],
    [0, 0, field16, "field16", 0, 0, 1.0, 258,  0.0005, 1.0, 258, 0, 0],
    [0, 0, field17, "field17", 0, 0, 1.0, 247,  0.0005, 1.0, 247, 0, 0],
    [0, 0, field18, "field18", 0, 0, 1.0, 213,  0.0005, 1.0, 213, 0, 0],
    [0, 0, field19, "field19", 0, 0, 1.0, 226,  0.0005, 1.0, 226, 0, 0],
    [0, 0, field20, "field20", 0, 0, 1.0, 218,  0.0005, 1.0, 218, 0, 0],
    [0, 0, field21, "field21", 0, 0, 1.0, 238,  0.0005, 1.0, 238, 0, 0],
    [0, 0, field22, "field22", 0, 0, 1.0, 231,  0.0005, 1.0, 231, 0, 0],
    [0, 0, field23, "field23", 0, 0, 1.0, 184,  0.0005, 1.0, 184, 0, 0],
    [0, 0, field24, "field24", 0, 0, 1.0, 184,  0.0005, 1.0, 184, 0, 0]
];


// Call to initialize the log file at the start of the script
// Main function
function main() 
{
    // Get times of sunrise and sunset
    sunset = twilightTimes(Util.SysJulianDate)[1];
    sunrise = twilightTimes(Util.SysJulianDate + 1)[0];
    sunsetLST = (Util.Julian_GMST(sunset) + Telescope.SiteLongitude / 15).toFixed(1);
    sunriseLST = (Util.Julian_GMST(sunrise) + Telescope.SiteLongitude / 15).toFixed(1);

    var darkHours = (sunrise - sunset) * 24;
    var timeUntilSunset = (sunset - Util.SysJulianDate) * 24; // hours
    var timeUntilSunrise = (sunrise - Util.SysJulianDate) * 24; // hours
    var darkHoursLeft = Math.min(darkHours, timeUntilSunrise);

    Console.PrintLine("Sunrise GMST: " + Util.Julian_GMST(sunrise));
    Console.PrintLine("Sunset GMST: " + Util.Julian_GMST(sunset));
    Console.PrintLine("Current GMST: " + Util.Julian_GMST(Util.SysJulianDate));

    Console.PrintLine("Sunrise UTC: " + Util.Julian_Date(sunrise));
    Console.PrintLine("Sunset UTC: " + Util.Julian_Date(sunset));

    Console.PrintLine("Sunset JD: " + sunset);
    Console.PrintLine("Sunrise JD: " + sunrise);
    Console.PrintLine("Current JD: " + Util.SysJulianDate);

    Console.PrintLine("Length of the Night: " + darkHours + " hours");
    Console.PrintLine("Time until sunset: " + timeUntilSunset + " hours");
    Console.PrintLine(Util.SysUTCDate + " INFO: Dark hours left: " + darkHoursLeft + " hours");

    Console.PrintLine("");
    Console.PrintLine("It is after sunset... Creating observation plan now.");

    // Create directory for today's data and collect dark frames
    if (firstRun == true) {
        var today = JDtoUTC(sunset);
        Util.ShellExec("cmd.exe", "/c mkdir -p d:\\ColibriData\\" + today.toString() + "\\Dark");
        Console.PrintLine("Created today's data directory at d:\\ColibriData\\" + today.toString());
        Console.PrintLine(Util.SysUTCDate + " INFO: Created today's data directory at d:\\ColibriData\\" + today.toString());
        firstRun = false;
    }

    // Calculate field-moon angle for each field.
    var moonAngles = [];
    var moonct = getMoon();
    for (i = 0; i < fieldInfo.length; i++) {
        var b = (90 - fieldInfo[i][2][1]) * Math.PI / 180;
        var c = (90 - moonct.Declination) * Math.PI / 180;
        var aa = Math.abs(fieldInfo[i][2][0] - moonct.RightAscension) * Math.PI / 180;
        var moonAngle = Math.acos((Math.cos(b) * Math.cos(c)) + (Math.sin(b) * Math.sin(c) * Math.cos(aa))) * 180 / Math.PI;
        moonAngles.push(moonAngle);
        fieldInfo[i][4] = moonAngle;
    }

    var fieldsToObserve = [];
    var n = Math.round(darkHours.toFixed(2) / timestep);
    Console.PrintLine("# of samples tonight: " + n);
    var prevField = "";
    for (k = 0; k < n; k++) {
        var newLST = parseFloat(sunsetLST) + k * timestep;
        var newJD = sunset + k * timestep / 24;
        var ct = Util.NewCT(Telescope.SiteLatitude, newLST);
        for (j = 0; j < fieldInfo.length; j++) 
        {
            ct.RightAscension = fieldInfo[j][2][0] / 15;
            ct.Declination = parseFloat(fieldInfo[j][2][1]);
            var lat = ct.Latitude;
            var alt = ct.Elevation;
            var LST = ct.SiderealTime;
            var HA = LST - ct.RightAscension;
            fieldInfo[j][0] = ct.Elevation;
            fieldInfo[j][1] = ct.Azimuth;
            fieldInfo[j][5] = HA;
            fieldInfo[j][12] = newJD;
            var airmass = 1 / Math.cos((90 - alt) * Math.PI / 180);
            fieldInfo[j][6] = airmass;
            var extinction = (airmass - 1) * extScale;
            var numVisibleStars = parseInt(fieldInfo[j][8] * Math.exp(fieldInfo[j][9] * (magnitudeLimit - extinction)));
            fieldInfo[j][10] = numVisibleStars;
        }
        var goodFields = [];
        for (j = 0; j < fieldInfo.length; j++) {
            if (fieldInfo[j][0] > elevationLimit && moonAngles[j] > minMoonOffset) {
                goodFields.push([fieldInfo[j][0], fieldInfo[j][1], fieldInfo[j][2], fieldInfo[j][3], fieldInfo[j][4], fieldInfo[j][5], fieldInfo[j][6], fieldInfo[j][7], fieldInfo[j][8], fieldInfo[j][9], fieldInfo[j][10], fieldInfo[j][11], fieldInfo[j][12]]);
            }
        }
        sortFields(goodFields);
        if (sortedFields.length == 1) {
            fieldsToObserve.push([sortedFields[0][0], sortedFields[0][1], sortedFields[0][2], sortedFields[0][3], sortedFields[0][4], sortedFields[0][5], sortedFields[0][6], sortedFields[0][7], sortedFields[0][8], sortedFields[0][9], sortedFields[0][10], sortedFields[0][11], sortedFields[0][12]]);
            prevField = sortedFields[0][3];
        } else if ((sortedFields[0][3] != prevField) && (sortedFields[1][3] == prevField) && (sortedFields[0][10] - sortedFields[1][10] < minDiff)) {
            fieldsToObserve.push([sortedFields[1][0], sortedFields[1][1], sortedFields[1][2], sortedFields[1][3], sortedFields[1][4], sortedFields[1][5], sortedFields[1][6], sortedFields[1][7], sortedFields[1][8], sortedFields[1][9], sortedFields[1][10], sortedFields[1][11], sortedFields[1][12]]);
            prevField = sortedFields[1][3];
        } else {
            fieldsToObserve.push([sortedFields[0][0], sortedFields[0][1], sortedFields[0][2], sortedFields[0][3], sortedFields[0][4], sortedFields[0][5], sortedFields[0][6], sortedFields[0][7], sortedFields[0][8], sortedFields[0][9], sortedFields[0][10], sortedFields[0][11], sortedFields[0][12]]);
            prevField = sortedFields[0][3];
        }
    }

    Console.PrintLine("# of selected time blocks: " + fieldsToObserve.length)
    Console.PrintLine("")
    finalFields.push(fieldsToObserve[0]);
    for (i = 0; i < fieldsToObserve.length - 1; i++) {
        if (fieldsToObserve[i][3] != fieldsToObserve[i + 1][3]) {
            finalFields.push(fieldsToObserve[i + 1]);
        }
    }
    for (i = 0; i < finalFields.length - 1; i++) {
        finalFields[i].push(finalFields[i + 1][12] - finalFields[i][12]);
    }
    finalFields[finalFields.length - 1].push(sunrise - finalFields[finalFields.length - 1][12]);

    Console.PrintLine("");
    Console.PrintLine("=== finalFields ===");
    for (k = 0; k < finalFields.length; k++) {
        Console.PrintLine(Util.SysUTCDate + " " + finalFields[k]);
        Console.PrintLine(finalFields[k]);
    }

    Console.PrintLine("");
    Console.PrintLine("=== Final Field Short List ===");
    for (i = 0; i < finalFields.length - 1; i++) {
        Console.PrintLine(finalFields[i][3] + " starts " + finalFields[i][12].toFixed(3) + " ends " + finalFields[i + 1][12].toFixed(3) + " for " + (finalFields[i][13] * 24).toFixed(2) + " hours");
        Console.PrintLine(" with " + finalFields[i][10].toString() + " visible stars");
        Console.PrintLine(Util.SysUTCDate + " INFO: " + finalFields[i][3] + " starts " + finalFields[i][12].toFixed(3) + " ends " + finalFields[i + 1][12].toFixed(3) + " for " + (finalFields[i][13] * 24).toFixed(2) + " hours with " + finalFields[i][10].toString() + " visible stars");
    }
    Console.PrintLine(finalFields[finalFields.length - 1][3] + " starts " + finalFields[finalFields.length - 1][12].toFixed(3) + " ends " + sunrise + " for " + (finalFields[finalFields.length - 1][13] * 24).toFixed(2) + " hours");
    Console.PrintLine(" with " + finalFields[finalFields.length - 1][10].toString() + " visible stars");
    Console.PrintLine(Util.SysUTCDate + " INFO: " + finalFields[finalFields.length - 1][3] + " starts " + finalFields[finalFields.length - 1][12].toFixed(3) + " ends " + sunrise.toFixed(3) + " for " + (finalFields[finalFields.length - 1][13] * 24).toFixed(2) + " hours with " + finalFields[finalFields.length - 1][10].toString());
    Console.PrintLine(Util.SysUTCDate + " INFO: === Final Field Coordinates ===");
    for (i = 0; i < finalFields.length; i++) {
        Console.PrintLine(Util.SysUTCDate + "Field: " + finalFields[i][3] + " Elev: " + finalFields[i][0] + " Az: " + finalFields[i][1]);
    }

    runNum = 0;
    currentField = [0, 0, 0, 0, 0, "None", 0];
    while (currentField[0] > -1 && currentField[0] < 999) {
        currentJD = Util.SysJulianDate;
        currentField = whichField(Util.SysJulianDate);
        endJD = currentField[6];
        Console.PrintLine("");
        Console.PrintLine(Util.SysUTCDate + " INFO: Field Info");
        Console.PrintLine("Field index: " + currentField[0]);
        Console.PrintLine("Time until end of field: " + currentField[1]);
        Console.PrintLine("Number of loops: " + currentField[2]);
        Console.PrintLine("Field RA: " + currentField[3]);
        Console.PrintLine("Field Dec: " + currentField[4]);
        Console.PrintLine("Field Name: " + currentField[5]);
        while (Util.SysJulianDate < sunset) {
            Console.PrintLine("");
            Console.PrintLine("It's still too early to begin... Waiting for " + ((sunset - Util.SysJulianDate) * 86400).toFixed(0) + " seconds.");
            Util.WaitForMilliseconds(5000);
        }
        if (Util.SysJulianDate > sunrise) {
            Console.PrintLine("");
            Console.PrintLine("Too late. Nothing left to observe.");
            andRestart();
        } else if (currentField[2] < 0 && currField[0] != -1) {
            Console.PrintLine("Negative loops remaining. Past last field. Closing up.");
            andRestart();
        }
        if ((Weather.Available && Weather.safe) || (ignoreWeather == true)) {
            Console.PrintLine("Checking Weather");
            connectScope();
            domeOpen();
            trkOn();
        }
        currentFieldCt = Util.NewCThereAndNow();
        currentFieldCt.RightAscension = currentField[3] / 15;
        currentFieldCt.Declination = currentField[4];
        Console.PrintLine("");
        Console.PrintLine("Slewing to...");
        Console.PrintLine("RA: " + currentFieldCt.RightAscension);
        Console.PrintLine("Dec: " + currentFieldCt.Declination);
        Console.PrintLine(Util.SysUTCDate + " INFO: Slewing to...");
        Console.PrintLine(Util.SysUTCDate + " INFO: RA: " + currentFieldCt.RightAscension);
        Console.PrintLine(Util.SysUTCDate + " INFO: Dec: " + currentFieldCt.Declination);
        Console.PrintLine(Util.SysUTCDate + " INFO: Alt: " + currentFieldCt.Elevation);
        Console.PrintLine(Util.SysUTCDate + " INFO: Az: " + currentFieldCt.Azimuth);
        gotoRADec(currentFieldCt.RightAscension, currentFieldCt.Declination);
        while (Telescope.Slewing == true) {
            Console.PrintLine("Huh. Still Slewing...");
            Util.WaitForMilliseconds(500);
        }
        Dome.UnparkHome();
        if (Dome.slave == false) {
            Dome.slave = true;
        }
        while (Dome.Slewing == true) {
            Console.PrintLine("Dome is still slewing. Give me a minute...");
            Util.WaitForMilliseconds(500);
        }
        Console.PrintLine("At target.");
        Console.PrintLine("Target Alt/Az is: Alt. =" + currentFieldCt.Elevation.toFixed(2) + " Az.= " + currentFieldCt.Azimuth.toFixed(2));

        adjustPointing(currentFieldCt.RightAscension, currentFieldCt.Declination);
        while (Telescope.Slewing == true) {
            Console.PrintLine("Huh. Still Slewing...");
            Util.WaitForMilliseconds(500);
        }
        Dome.UnparkHome()
        if (Dome.slave == false) {
            Dome.slave = true;
        }
        while (Dome.Slewing == true) {
            Console.PrintLine("Dome is still slewing. Give me a minute...");
            Util.WaitForMilliseconds(500);
        }
        if (Telescope.SideOfPier == 0) {
            pierside = "E";
            Console.PrintLine("Pier side: " + pierside);
        } else {
            pierside = "W"
            Console.PrintLine("Pier side: " + pierside);
        }
        Console.PrintLine("");
        Console.PrintLine("Starting data collection...");
        Console.PrintLine("Running from " + Util.SysJulianDate + " until " + endJD);

        var darkCounter = darkInterval;
        var runCounter = 1;
        while (Util.SysJulianDate < endJD) {
            if (Telescope.SideOfPier != Telescope.DestinationSideOfPier(currentFieldCt.RightAscension, currentFieldCt.Declination)) {
                Console.PrintLine("Flipping sides of pier...");
                gotoRADec(currentFieldCt.RightAscension, currentFieldCt.Declination);
                adjustPointing(currentFieldCt.RightAscension, currentFieldCt.Declination);

                while (Telescope.Slewing == true) {
                    Console.PrintLine("Huh. Still Slewing...");
                    Util.WaitForMilliseconds(500);
                }
                Dome.UnparkHome()
                if (Dome.slave == false) {
                    Dome.slave == true;
                }
                while (Dome.Slewing == true) {
                    Console.PrintLine("Dome is still slewing. Give me a minute...");
                    Util.WaitForMilliseconds(500);
                }
                if (Telescope.SideOfPier == 0) {
                    pierside = "E";
                    Console.PrintLine("Pier side: " + pierside);
                } else {
                    pierside = "W";
                    Console.PrintLine("Pier side: " + pierside);
                }
            } else {
                Console.PrintLine("Already on the right side of the pier");
            }
            if (darkCounter == darkInterval) {
                darkCollection(today, LogFile);
                darkCounter = 0;
            }
            darkCounter++;
            Console.PrintLine("Dark counter = " + darkCounter.toString());
            var wshShell = new ActiveXObject("WScript.Shell");
            var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");
            var colibriGrabPath = userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";
            var wsh = new ActiveXObject("WScript.Shell");
            var command = "\"" + colibriGrabPath + "\" -n " + numExposures.toString() + " -p " + currentField[5].toString() + "_25ms-" + pierside + " -e 25 -t 0 -f normal -w D:\\ColibriData\\" + today.toString()
            Console.PrintLine('Executing command: ' + command);
            Console.PrintLine(Util.SysUTCDate + " INFO: Executing command: " + command);
            wsh.Run(command, 1, true);
            Util.WaitForMilliseconds(1000);
            appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);
            Console.PrintLine("Done exposing run # " + runCounter.toString());
            runCounter++;
        }
    }
    shutDown();
}


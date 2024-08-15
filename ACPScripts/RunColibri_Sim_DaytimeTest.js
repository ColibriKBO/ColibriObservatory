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

function getSimulatedJulianDate(offsetHours)
{
    // Get the current Julian Date
    var currentJD = Util.SysJulianDate;

    // Offset the Julian Date by the specified number of hours
    var offsetJD = offsetHours / 24; // Convert hours to days (since Julian Date is in days)
    var simulatedJD = currentJD + offsetJD;

    return simulatedJD;
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
            }

            colibriLog.Close();

            // Delete the ColibriGrab log file after appending its contents
            fso.DeleteFile(colibriLogFile);
            Console.PrintLine(Util.SysUTCDate + " INFO: Deleted ColibriGrab log file after appending.");
        } else {
            Console.PrintLine(Util.SysUTCDate + " ERROR: ColibriGrab log file does not exist.");
        }
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

function sortFields(fieldtosort) {
    sortedFields = fieldtosort.sort(function(a, b) {
        return b[10] - a[10]
    });
    return sortedFields;
}

function calculateFieldElevation(fieldRA, fieldDec, lst) {
    var ct = Util.NewCT(Telescope.SiteLatitude, lst);
    ct.RightAscension = fieldRA / 15; // Convert RA from degrees to hours
    ct.Declination = fieldDec; // Declination in degrees
    var elevation = ct.Elevation;  // Returns the elevation angle

    // Force elevation to be above the limit for simulation purposes
    if (elevation < elevationLimit) {
        elevation = elevationLimit + 5; // or set it to any value you prefer
    }

    return elevation;
}



function whichField(timeJD, newLST) {
    nextField = 0;
    Console.PrintLine("Called whichField function...");
    Console.PrintLine("Number of fields in finalFields: " + finalFields.length);

    for (i = 0; i < finalFields.length - 1; i++) {
        // Calculate the elevation using the simulated LST
        var fieldElevation = calculateFieldElevation(finalFields[i][2][0], finalFields[i][2][1], newLST);

        // Ensure we only return a field with a safe elevation (REMOVE THIS IF NEEDED)
        // if (fieldElevation >= elevationLimit) {
            if ((timeJD > finalFields[i][12]) && (timeJD < finalFields[i + 1][12])) {
                targetJD  = finalFields[i + 1][12];
                targetDur = finalFields[i + 1][12] - timeJD;
                targetLoops = Math.ceil(targetDur * 86400 / 0.025 / numExposures);
                currField = i;
                nextField = i + 1;
                targetRA = finalFields[i][2][0];
                targetDec = finalFields[i][2][1];
                fieldName = finalFields[i][3].toString();

                return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD];
            }
        // }
    }

    // Default if no valid fields are found (for any reason)
    Console.PrintLine("No valid fields found with safe elevation.");
    return [-1, 0, 0, 0, 0, "None", 0];
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
var elevationLimit = 5; // minimum elevation of field in degrees
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

function adjustFieldRAForSimulatedTime(fields, actualLST, simulatedLST) {
    var LSTDifference = simulatedLST - actualLST;
    var adjustedFields = [];

    for (var i = 0; i < fields.length; i++) {
        var adjustedRA = fields[i][0] + LSTDifference * 15.0;  // LST difference in degrees
        if (adjustedRA >= 360) adjustedRA -= 360;
        if (adjustedRA < 0) adjustedRA += 360;
        adjustedFields.push([adjustedRA, fields[i][1]]);
    }
    return adjustedFields;
}


function getSimulatedJulianDateAndLST(offsetHours) {
    var currentJD = Util.SysJulianDate;
    var offsetJD = offsetHours / 24;
    var simulatedJD = currentJD + offsetJD;

    var currentLST = Util.NowLST();
    var simulatedLST = currentLST + offsetHours;

    // Make sure simulatedLST is within 0-24 hours range
    if (simulatedLST >= 24) simulatedLST -= 24;
    if (simulatedLST < 0) simulatedLST += 24;

    return { simulatedJD: simulatedJD, simulatedLST: simulatedLST };
}

function calculateGMST(julianDate) {
    var T = (julianDate - 2451545.0) / 36525.0;
    var GMST = 280.46061837 + 360.98564736629 * (julianDate - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0;
    return GMST % 360;
}

function calculateLST(gmst, longitude) {
    var LST = (gmst + longitude) % 360;
    if (LST < 0) LST += 360;
    return LST / 15.0;  // Convert to hours
}


// Call to initialize the log file at the start of the script
// Main function
function main()
{
    var offSetHours = 8;
    var simulation = getSimulatedJulianDateAndLST(offSetHours);  // Offset by 8 hours
    var currentJD = simulation.simulatedJD;
    var simulatedLST = simulation.simulatedLST;

    // Calculate the actual sunset and sunrise times using the simulated Julian Date
    var sunset = twilightTimes(currentJD)[1];
    var sunrise = twilightTimes(currentJD + 1)[0];

    // Apply the same offset to simulate sunset and sunrise times
    var simulatedSunsetJD = sunset + (offSetHours / 24); 
    var simulatedSunriseJD = sunrise + (offSetHours / 24);  

    // Manually calculate GMST for these simulated times
    var simulatedSunsetGMST = calculateGMST(simulatedSunsetJD);  // GMST for simulated sunset
    var simulatedSunriseGMST = calculateGMST(simulatedSunriseJD);  // GMST for simulated sunrise

    // Convert GMST to LST for the observer's location
    var sunsetLST = calculateLST(simulatedSunsetGMST, Telescope.SiteLongitude);
    var sunriseLST = calculateLST(simulatedSunriseGMST, Telescope.SiteLongitude);

    Console.PrintLine("Simulated Sunset LST: " + sunsetLST);
    Console.PrintLine("Simulated Sunrise LST: " + sunriseLST);

    // Length of night
    var darkHours = (sunrise - sunset) * 24;

    // Skip the check for time until sunset and sunrise

    Console.PrintLine("Sunrise JD: " + sunrise);
    Console.PrintLine("Sunset JD: " + sunset);
    Console.PrintLine("Current JD: " + currentJD);

    Console.PrintLine("Length of the Night: " + darkHours + " hours");

    /*-----------------------------Prestart Checks-------------------------------*/

    // Check if there is enough space for this to run
    var spaceneeded = darkHours * 3600 * 40 * 12600000 / 1000000000000;
    var freespace = freeDiskSpace();
    if (freespace > spaceneeded)
    {
        Console.PrintLine("We need " + spaceneeded + " TB of space to run tonight.");
        Console.PrintLine("And we have " + freespace + " TB of free space available.");
        Console.PrintLine("So, we're good to go!");
    }
    else
    {
        abort();
    }

    // Add check for simulation mode
    if (!Util.Confirm("Are you running this script with the dome in simulated mode? Running this script without simulation mode could cause serious damage to the telescope. \n\nDo you confirm the dome is in simulated mode?")) {
        abort();
    } else {
        Console.PrintLine("User confirmed that the dome is in simulated mode. Continuing...");
    }
    // Skip the waiting for sunset check

    // Ready to go. Print alert that we will start observations now.
    Console.PrintLine("It is after sunset... Creating observation plan now.");

    /*-----------------------------Observing Plan--------------------------------*/

    // Create directory for tonight's data and collect dark frames
    var today = JDtoUTC(sunset); // Today's UTC date to be used to define data directory
    Util.ShellExec("cmd.exe", "/c mkdir -p d:\\ColibriData\\" + today.toString() + "\\Dark");

    Console.PrintLine("Created today's data directory at d:\\ColibriData\\" + today.toString());

    // Calculate field-moon angle for each field.
    var moonAngles = [];
    var moonct = getMoon();
    var actualLST = Util.NowLST();

    // Print original RAs for debugging
    Console.PrintLine("Original Field RAs:");
    for (var i = 0; i < fieldInfo.length; i++) {
        Console.PrintLine("Field " + fieldInfo[i][3] + " RA: " + fieldInfo[i][2][0]);
    }

    // Adjust field RAs for the simulated time
    var adjustedFields = [];  // Array to hold adjusted fields
    for (var i = 0; i < fieldInfo.length; i++) {
        var originalRA = fieldInfo[i][2][0];
        var adjustedRA = originalRA + (simulatedLST - actualLST) * 15.0; // LST difference in degrees

        // Wrap around if RA goes beyond 0-360 degrees
        if (adjustedRA >= 360) adjustedRA -= 360;
        if (adjustedRA < 0) adjustedRA += 360;

        // Store the adjusted RA back into fieldInfo and log it
        fieldInfo[i][2][0] = adjustedRA;
        Console.PrintLine("Field " + fieldInfo[i][3] + " Adjusted RA: " + adjustedRA);

        adjustedFields.push([adjustedRA, fieldInfo[i][2][1]]);  // Storing for further use if needed
    }

    // Update fieldInfo with adjusted RAs and calculate moon angles
    for (var i = 0; i < fieldInfo.length; i++) {
        fieldInfo[i][2][0] = adjustedFields[i][0];  // Update RA with the adjusted RA based on simulated LST

        var b = (90 - fieldInfo[i][2][1]) * Math.PI / 180;
        var c = (90 - moonct.Declination) * Math.PI / 180;

        var aa = Math.abs(fieldInfo[i][2][0] - moonct.RightAscension) * Math.PI / 180;

        var moonAngle = Math.acos((Math.cos(b) * Math.cos(c)) + (Math.sin(b) * Math.sin(c) * Math.cos(aa))) * 180 / Math.PI;
        moonAngles.push(moonAngle);
        fieldInfo[i][4] = moonAngle;
    }

    // Print the updated elevations for each field
    Console.PrintLine("Field Elevations after Adjustment:");
    for (var i = 0; i < fieldInfo.length; i++) {
        var elevation = calculateFieldElevation(fieldInfo[i][2][0], fieldInfo[i][2][1], simulatedLST);
        Console.PrintLine("Field " + fieldInfo[i][3] + " Elevation: " + elevation.toFixed(2) + " degrees");
    }

    var fieldsToObserve = []; // Array containing best field info in 6 minute increments

    // n is the number of samples in one observing block (length = timestep)
    // that will be computed.
    var n = Math.round(darkHours.toFixed(2) / timestep);
    Console.PrintLine("# of samples tonight: " + n);

    // Calculate the local coordinates of each field at each timestep and the
    // number of visible stars in each field when accounting for extinction
    var prevField = "";
    for (k = 0; k < n; k++)
    {
        var simulatedLST = parseFloat(sunsetLST) + k * timestep;
        var newJD  = sunset + k * timestep / 24;
        var ct = Util.NewCT(Telescope.SiteLatitude, simulatedLST);

        for (j = 0; j < fieldInfo.length; j++)
        {
            ct.RightAscension = fieldInfo[j][2][0] / 15; // in hours
            ct.Declination = parseFloat(fieldInfo[j][2][1]); // in degrees

            var lat = ct.Latitude;
            var alt = ct.Elevation;
            var HA = simulatedLST - ct.RightAscension;

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
            if (moonAngles[j] > minMoonOffset) {
                // Since we're simulating, assume all fields are above the elevation limit.
                goodFields.push([fieldInfo[j][0],fieldInfo[j][1],fieldInfo[j][2],fieldInfo[j][3],fieldInfo[j][4],fieldInfo[j][5],fieldInfo[j][6],fieldInfo[j][7],fieldInfo[j][8],fieldInfo[j][9],fieldInfo[j][10],fieldInfo[j][11],fieldInfo[j][12]]);
            }
        }

        // Sort the good fields based on their rankings or other criteria
        goodFields = sortFields(goodFields);
        
        if (goodFields.length > 0) {
            if (goodFields.length == 1 || (goodFields[0][3] != prevField && goodFields.length > 1)) {
                fieldsToObserve.push(goodFields[0]);
                prevField = goodFields[0][3];
            } else if (goodFields[1][3] == prevField && (goodFields[0][10] - goodFields[1][10] < minDiff)) {
                fieldsToObserve.push(goodFields[1]);
                prevField = goodFields[1][3];
            } else {
                fieldsToObserve.push(goodFields[0]);
                prevField = goodFields[0][3];
            }
        }
    }

    /*---------------------------Order & Print Plan------------------------------*/

    // Push first field, then check if the following field is the same. If it
    // is, move onto the next field. Repeat until the end of the list and
    // then push the final field
    finalFields.push(fieldsToObserve[0]);
    for (i = 0; i < fieldsToObserve.length - 1; i++)
    {
        if (fieldsToObserve[i][3] != fieldsToObserve[i + 1][3])
        {
            finalFields.push(fieldsToObserve[i + 1]);
        }
    }

    // Calculate the duration of each field and append it onto the end of its
    // finalFields object. The last element goes to sunrise
    for (i = 0; i < finalFields.length - 1; i++)
    {
        finalFields[i].push(finalFields[i + 1][12] - finalFields[i][12]);
    }
    finalFields[finalFields.length - 1].push(sunrise - finalFields[finalFields.length - 1][12]);

    /*-----------------------------Begin Operations------------------------------*/

    // Initialize the current field
    runNum = 0;
    currentField = [0, 0, 0, 0, 0, "None", 0];

    while (currentField[0] > -1 && currentField[0] < 999)
    {
        // Identify the current field in the finalFields list based on the time
        var currentGMST = calculateGMST(currentJD);
        var newLST = calculateLST(currentGMST, Telescope.SiteLongitude);

        currentField = whichField(currentJD, newLST);
        endJD = currentField[6];

        // Log outputs of whichField
        Console.PrintLine("");
        Console.PrintLine("Field index: " + currentField[0]);
        Console.PrintLine("Time until end of field: " + currentField[1]);
        Console.PrintLine("Number of loops: " + currentField[2]);
        Console.PrintLine("Field RA: " + currentField[3]);
        Console.PrintLine("Field Dec: " + currentField[4]);
        Console.PrintLine("Field Name: " + currentField[5]);

        // Skip any time checks for sunrise/sunset since we're in simulation mode

        // Create coordinate transform for the current field
        currentFieldCt = Util.NewCThereAndNow();
        currentFieldCt.RightAscension = currentField[3] / 15;
        currentFieldCt.Declination = currentField[4];

        // Monitor and log the coordinates which the telescope slews to
        Console.PrintLine("");
        Console.PrintLine("Slewing to...");
        Console.PrintLine("RA: " + currentFieldCt.RightAscension);
        Console.PrintLine("Dec: " + currentFieldCt.Declination);

        // Slew to the current field without any elevation checks
        gotoRADec(currentFieldCt.RightAscension, currentFieldCt.Declination);

        // Slave the dome to the telescope and wait until they are both in
        // the correct position to begin observing
        while (Telescope.Slewing == true)
        {
            Console.PrintLine("Still Slewing...");
            Util.WaitForMilliseconds(500);
        }

        Dome.UnparkHome();
        if (Dome.slave == false)
        {
            Dome.slave = true;
        }

        while (Dome.Slewing == true)
        {
            Console.PrintLine("Dome is still slewing. Please wait...");
            Util.WaitForMilliseconds(500);
        }

        Console.PrintLine("At target.");
        Console.PrintLine("Target Alt/Az is: Alt. =" + currentFieldCt.Elevation.toFixed(2) + "   Az.= " + currentFieldCt.Azimuth.toFixed(2));

        // Readjust the telescope pointing using child script
        adjustPointing(currentFieldCt.RightAscension, currentFieldCt.Declination);

        while (Telescope.Slewing == true)
        {
            Console.PrintLine("Still Slewing...");
            Util.WaitForMilliseconds(500);
        }

        Dome.UnparkHome();
        if (Dome.slave == false)
        {
            Dome.slave = true;
        }

        while (Dome.Slewing == true)
        {
            Console.PrintLine("Dome is still slewing. Please wait...");
            Util.WaitForMilliseconds(500);
        }

        // Check pier side
        if (Telescope.SideOfPier == 0)
        {
            pierside = "E";
            Console.PrintLine("Pier side: " + pierside);
        }
        else
        {
            pierside = "W";
            Console.PrintLine("Pier side: " + pierside);
        }

        /*-----------------------------Data Collection-------------------------------*/

        Console.PrintLine("Starting data collection...");
        Console.PrintLine("Running from " + currentJD + " until " + endJD);

        // Iterables
        var darkCounter = darkInterval;
        var runCounter = 1;

        while (currentJD < endJD)
        {
            // Check pier side
            if (Telescope.SideOfPier != Telescope.DestinationSideOfPier(currentFieldCt.RightAscension, currentFieldCt.Declination))
            {
                Console.PrintLine("Flipping sides of pier...");
                gotoRADec(currentFieldCt.RightAscension, currentFieldCt.Declination);

                // Readjust the telescope pointing using child script
                adjustPointing(currentFieldCt.RightAscension, currentFieldCt.Declination);

                while (Telescope.Slewing == true)
                {
                    Console.PrintLine("Still Slewing...");
                    Util.WaitForMilliseconds(500);
                }

                Dome.UnparkHome();
                if (Dome.slave == false)
                {
                    Dome.slave = true;
                }

                while (Dome.Slewing == true)
                {
                    Console.PrintLine("Dome is still slewing. Please wait...");
                    Util.WaitForMilliseconds(500);
                }

                if (Telescope.SideOfPier == 0)
                {
                    pierside = "E";
                    Console.PrintLine("Pier side: " + pierside);
                }
                else
                {
                    pierside = "W";
                    Console.PrintLine("Pier side: " + pierside);
                }
            }
            else 
            { 
                Console.PrintLine("Already on the right side of the pier."); 
            }

            if (darkCounter == darkInterval) {
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
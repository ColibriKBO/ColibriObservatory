//tabs=4
//------------------------------------------------------------------------------
//
// Script:      RunColibri.js
// Authors:     Ridhee Gupta, Mike Mazur <mjmazur@gmail.com>
// Version:     0.1.0
// Requires:    ACP 7.1 or later (PinPoint 6 or later)
//              Windows Script 5.6 or later
//
// Environment: This script is written to run under the ACP scripting
//              console. 
//
// Description: Schedules and runs automated observations with the 
//              Colibri telesopes
//
// Revision History:
//
// Date      Who    Description
// --------- ---    --------------------------------------------------
// 15/04/20  mjm    Creation of script. Basic functions (trkOff, trkOn, domeOpen,
//                  domeClose, domeHome, getRADEC)
// ???-???   rg     Nautical twilight, field determination, moon offset
//                  Functions: gotoRADec, gotoAltAz, biasCollection
// ??/??/??  mjm    Running aa.exe and extracting output, add String.prototype.trim
// 02/04/21  mjm    Auto directory creation and file naming
// 24/06/21  mjm    Added abort() function
// 14/07/21  mjm    Added new moon check
// 09/11/21  mjm    Added code to grab biases every n minutes
// 11/11/21  mjm    Cleaned up print statements and checked for proper field selection
// 03/03/22  mjm    So much... Added dome/telescope slave/slewing checks, added catch
//                  for only one 'finalField', added delays to try to prevent camera from
//                  being killed early
//                  Created connectScope() function
// 31/10/22 mjm     Added free space check

var SUP;
var ForReading = 1;
var ForAppending = 8;
var finalFields = [];
String.prototype.trim = function()
{
    return this.replace(/(^\s*)|(\s*$)/g, "");
}

/////////////////////
// Aborts script
// MJM - 2021-06-24
/////////////////////
function abort(){
    Console.PrintLine("Aborting script!")
    ts.WriteLine(Util.SysUTCDate + "ERROR: Aborting script!")
    shutDown();
    while (Dome.ShutterStatus !=1 || Telescope.AtPark != true)
        {
            Util.WaitForMilliseconds(5000);
            Console.PrintLine("Waiting 5 seconds for shutter to close and telescope to park...");
        }
    if (Util.ScriptActive)
    {
        Console.PrintLine("Aborting...")
        Util.AbortScript();
    }

    while (Util.ScriptActive)
    {
        Console.PrintLine("Waiting for script to finish...")
        // Util.WaitForMilliseconds(1000);
    }
    
}

function abortAndRestart(){
    Console.PrintLine("Aborting script!");
    ts.WriteLine(Util.SysUTCDate + "ERROR: Aborting and restarting script!")
    shutDown();
    while (Dome.ShutterStatus != 1 || Telescope.AtPark != true)
    {
        Util.WaitForMilliseconds(5000)
        Console.PrintLine("Waiting 5 seconds for shutter to close and telescope to park...")
    }

    if (Util.ScriptActive)
    {
        Console.PrintLine("Aborting...")
        Util.AbortScript();
    }

    while (Util.ScriptActive)
    {
        Console.PrintLine("Waiting for script to finish...")
        // Util.WaitForMilliseconds(1000);
    }    // WScript.Quit
    main();

}

function andRestart(){
    Console.PrintLine("Shutting down and restarting!");
    ts.WriteLine("Shutting down and restarting!");
    shutDown();
    while (Dome.ShutterStatus != 1 || Telescope.AtPark != true)
    {
        Util.WaitForMilliseconds(5000)
        Console.PrintLine("Waiting 5 seconds for shutter to close and telescope to park...")
    }

    // if (Util.ScriptActive)
    // {
    //     Console.PrintLine("Aborting...")
    //     Util.AbortScript();
    // }

    // while (Util.ScriptActive)
    // {
    //     Console.PrintLine("Waiting for script to finish...")
    //     // Util.WaitForMilliseconds(1000);
    // }    // WScript.Quit

    main();

}

//////////////////////////////////////////////////
// Function called when Alert button is pressed
//////////////////////////////////////////////////
function alert(){
    Console.alert(consIconWarning, "Quiting script!")
    shutDown()
    abort()
}

///////////////////////////////////////////////////////////////////////////////////////////////////////
//This function appends the ColibriGrab log file to the ACP log file and then deletes it afterwards
///////////////////////////////////////////////////////////////////////////////////////////////////////
function appendAndDeleteColibriGrabLog(colibriLogFile, LogFile) {
    try {
        if (fso.FileExists(colibriLogFile)) {
            var colibriLog = fso.OpenTextFile(colibriLogFile, ForReading, false);
            
            while (!colibriLog.AtEndOfStream) {
                var logLine = colibriLog.ReadLine();
                ts.WriteLine(Util.SysUTCDate + " " + logLine);
            }

            colibriLog.Close();

            // Delete the ColibriGrab log file after appending its contents
            fso.DeleteFile(colibriLogFile);
            Console.PrintLine(Util.SysUTCDate + " INFO: Deleted ColibriGrab log file after appending.");
            ts.WriteLine(Util.SysUTCDate + " INFO: Deleted ColibriGrab log file after appending.");
        } else {
            Console.PrintLine(Util.SysUTCDate + " ERROR: ColibriGrab log file does not exist.");
            ts.WriteLine(Util.SysUTCDate + " ERROR: ColibriGrab log file does not exist.");
        }
    } catch (e) {
        Console.PrintLine(Util.SysUTCDate + " ERROR: " + e.message);
        ts.WriteLine(Util.SysUTCDate + " ERROR: " + e.message);
    }
}

////////////////////////////////////////////////////
// Does the dirty work of collecting bias data.
// RG
// MJM - Added naming of directory to today's date
////////////////////////////////////////////////////
function biasCollection(today, LogFile) {
    // Get the user's home directory and construct the path to ColibriGrab.exe in Github!
    var wshShell = new ActiveXObject("WScript.Shell");
    var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");
    var colibriGrabPath = userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";
    // var today = getDate();
    // Console.Printline(today.toString());

    Console.PrintLine("Starting bias frame collection...");
    Console.PrintLine("d:\\ColibriData\\" + today.toString() + "\\Bias");

    

    var wsh = new ActiveXObject("WScript.Shell");
    var command = "\"" + colibriGrabPath + "\" -n 50 -p Bias_25ms -e 0 -t 0 -f bias -w D:\\ColibriData\\" + today.toString() + "\\Bias";
    Console.PrintLine('Executing command: ' + command);       
    // Run ColibriGrab.exe

    wsh.Run(command, 1, true); // 1: normal window, true: wait for completion

    Util.WaitForMilliseconds(100)
    Console.PrintLine("Finished collecting bias frames...");
    // Append and delete ColibriGrab log to ACP log after collecting bias frames
    appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);
}

////////////////////////////////////////////////////
// Does the dirty work of collecting dark data.
// RG
// MJM - Added naming of directory to today's date
////////////////////////////////////////////////////
function darkCollection(today, LogFile) {
    var wshShell = new ActiveXObject("WScript.Shell");
    var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");
    var colibriGrabPath = userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";
    // var today = getDate();
    // Console.Printline(today.toString());

    Console.PrintLine("Starting dark frame collection...");
    Console.PrintLine("d:\\ColibriData\\" + today.toString() + "\\Dark");


    var wsh = new ActiveXObject("WScript.Shell");
    var command = "\"" + colibriGrabPath + "\" -n 10 -p Dark_25ms -e 0 -t 0 -f dark -w D:\\ColibriData\\" + today.toString() + "\\Dark";

    wsh.Run(command, 1, true); // 1: normal window, true: wait for completion


    Util.WaitForMilliseconds(100)
    Console.PrintLine("Finished collecting dark frames...");
    // Append and delete ColibriGrab log to ACP log after collecting bias frames
    appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);
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
        trkOn()
    }
        
    else
    {
        Console.PrintLine("Telescope is not connected. Attempting to connect...")
        Telescope.Connected = true;
        trkOn()
        
        if (Telescope.Connected)
        {
            Console.PrintLine("Telescope is now connected!")
            trkOn()
        } 

        else
        {
            Console.PrintLine("Telescope is still not connected. There must be a problem. :-(")
            abort()
        }
    }
        
    Console.PrintLine(" ")
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
    ////////////////////////////////////////////////////
    // Check to see if the dome is closed or in error //
    ////////////////////////////////////////////////////
    if (Dome.Status != 1)
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
// Function to open dome.
// MJM
///////////////////////////
function domeOpen()
{
    switch (Dome.ShutterStatus)
    {   //////////////////
        // Dome is open //
        //////////////////
        case 0:
        Console.PrintLine("--> Dome shutter is already open :-P");
        break;

        ////////////////////
        // Dome is closed //
        ////////////////////
        case 1:
        Console.PrintLine("--> Dome shutter is closed.");
        Dome.OpenShutter();
        Util.WaitForMilliseconds(500);

        while (Dome.ShutterStatus == 2)
        {
            Console.PrintLine("*** Dome shutter is opening...");
            Util.WaitForMilliseconds(2000);
        }

        if (Dome.ShutterStatus == 0)
        {
            Console.PrintLine("--> Dome shutter is open...");
        }
        else
            Console.PrintLine("--> Dome is NOT open.");
        break;

        ////////////////////////
        // Shutter is opening //
        ////////////////////////
        case 2:
        while (Dome.ShutterStatus == 2)
        {
            Console.PrintLine("*** Dome shutter is open...");
            Util.WaitForMilliseconds(2000);
        }
        Console.PrintLine("--> Dome shutter is opened...");
        break;

        /////////////////////////////////////////////////////
        // Dome is closing. Let it close and then open it. //
        /////////////////////////////////////////////////////
        case 3:
        while (Dome.ShutterStatus ==3)
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

        /////////////////////////////////
        // Houston, we have a problem. //
        /////////////////////////////////
        case 4:
        Console.PrintLine("There was a problem with the shutter control...")
        break;
    }
    ////////////////////////////////////////
    // Home the dome if not already done. //
    ////////////////////////////////////////
    if (!Dome.AtHome)
    {
        Dome.FindHome();
        while (!Dome.AtHome)
        {
            Console.PrintLine("*** Homing dome...");
            Util.WaitForMilliseconds(2000);
        }
        Console.PrintLine("--> Dome is homed... Bigly.");
    }
    
}

/////////////////////////////////////////////////////
// Returns available disk space
// freespace.bat must exist in the same directory
// as RunColibri.js as well as in the same directory
// as ACP.exe (c:\ProgramFiles(x86)\ACP) Obs Control
// MJM - Oct. 2022
/////////////////////////////////////////////////////
function freeDiskSpace()
{
    var AX = new ActiveXObject("WScript.Shell");
    var SE = AX.Exec(ACPApp.Path + "\\freespace.bat");

    var size = "";

    size = SE.StdOut.Read(25);   // size in bytes
    size = size / 1000000000000; // size in TB

    return(size)
}

//////////////////////////////
// Returns date as yyyymmdd
// MJM - June 2021
//////////////////////////////
function getDate()
{
    
    var d = new Date();
    var s = d.getUTCFullYear();
    var month = (d.getUTCMonth() + 1).toString();
    var day   = (d.getUTCDate()).toString();

    if (month.length == 1)
    {
        s += "0" + month;
    }
    else
    {
        s += month;
    }

    if (day.toString().length == 1)
    {
        s += "0" + day;
    }
    else
    {
        s += day;
    }
    return s;
}

function JDtoUTC(JulianDate)
{

    var millis = (JulianDate - 2440587.5) * 86400000
    var toUTC = new Date(millis)
    
    var s = toUTC.getUTCFullYear();
    var month = (toUTC.getUTCMonth() + 1).toString()
    var day   = (toUTC.getUTCDate()).toString()

    if (month.length == 1)
    {
        s += "0" + month;
    }
    else
    {
        s += month;
    }

    if (day.toString().length == 1)
    {
        s += "0" + day;
    }
    else
    {
        s += day;
    }
    return s;
}


/////////////////////////////////////////////////////
// Return the coordinates of the moon in RA and Dec
// MJM - 2021/06/24
/////////////////////////////////////////////////////
function getMoon()
{
    // finding moon elevation and azimuth
    Util.Console.PrintLine("== Moon Coordinates ==");
    ts.WriteLine(Util.SysUTCDate + " INFO: == Moon Coordinates ==");
    var SH = new ActiveXObject("WScript.Shell");
    var BS = SH.Exec(ACPApp.Path + "\\aa.exe -moon");
    var coords = "";

    while(BS.Status != 1)
    {
        while(!BS.StdOut.AtEndOfStream)
        {
            coords += BS.StdOut.Read(1);
        }
        Util.WaitForMilliseconds(100);
    }
    coords = coords.trim();
    Util.Console.PrintLine("== " + coords + " ==");
    ts.WriteLine(Util.SysUTCDate + " INFO: " + coords);

    var bits = coords.split(" ");

    ct = Util.NewCThereAndNow();
    ct.RightAscension = bits[0];
    ct.Declination = bits[1];

    return ct;
}

function getRADEC()
{
    var ras, des;
    if(Prefs.DoLocalTopo)                               // Get scope J2000 RA/Dec
    {
        SUP.LocalTopocentricToJ2000(Telescope.RightAscension, Telescope.Declnation);
        ras = SUP.J2000RA;
        des = SUP.J2000Dec;
    }

    else
    {
        ras = Telescope.RightAscension;
        des = Telescope.Declination;
    }

    return { ra: ras, dec: des };
}

///////////////////////////////////////////
// Sends scope to a particular Alt and Az
// MJM
///////////////////////////////////////////
function gotoAltAz(alt, az)
{

    breakme: if (ct.Elevation < elevationLimit)
    {
        Console.PrintLine("Tried to move to an unsave elevation of " + ct.Elevation.toFixed(4));
        ts.WriteLine(Util.SysUTCDate + " WARNING: Tried to move to an unsave elevation of " + ct.Elevation.toFixed(4));
        ts.WriteLine(Util.SysUTCDate + " WARNING: Closing up shop!");
        shutDown();
        Console.PrintLine("Finished closing up shop.");
        ts.WriteLine(Util.SysUTCDate + " INFO: Finished closing up shop!");
        break breakme;
    }

    if (Telescope.tracking)
    {
        Telescope.SlewToAltAz(alt, az);
        Util.WaitForMilliseconds(100);

        while (Telescope.Slewing)
        {
            Console.PrintLine("Going to...");
            Util.WaitForMilliseconds(2000);
        }
        Console.PrintLine("Done.");
    }
}

///////////////////////////////////////////
// Sends scope to a particular RA and DEC
// MJM
///////////////////////////////////////////
function gotoRADec(ra, dec)
{
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
        Console.PrintLine("Slewing to declination " + dec + " and right ascension " + ra.toFixed(4));
        ts.WriteLine(Util.SysUTCDate + " INFO: Slewing to declination " + dec + " and right ascension " + ra.toFixed(4));

        // Need to put a check in for 'incomplete' coordinates. Not sure what this means as it doesn't
        // seem to be a problem with ACP, but a problem with the AP driver. Let's try either restarting
        // script after error or just repeating this function on error return, if possible. Try/catch/finally
        // statement.

        try
        {
            Telescope.SlewToCoordinates(ra.toFixed(4), dec.toFixed(4));
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
    }
}

//////////////////////////////////////////////////////////////
// Function to adjust telescope pointing. Calls astrometry_correction.py
// subprocess to get new pointing.
//////////////////////////////////////////////////////////////

function adjustPointing(ra, dec)
{
    // Convert RA to decimal degrees
    ra = ra * 15;

    // Call astrometry_correction.py to get pointing offset
    Console.PrintLine("== Pointing Correction ==");
    ts.WriteLine(Util.SysUTCDate + " INFO: == Pointing Correction ==");
    var SH = new ActiveXObject("WScript.Shell");
    var BS = SH.Exec("python ExtraScripts\\astrometry_correction.py " + ra + " " + dec);
    var python_output = "";

    var start = new Date().getTime();
    var timeout = 300000; // Timeout in milliseconds (5 minutes)

    // Added an escape here in case the Python script hangs.
    while (BS.Status != 1) { 
        while (!BS.StdOut.AtEndOfStream) {
            python_output += BS.StdOut.Read(1);
        }
        Util.WaitForMilliseconds(100);

        if (new Date().getTime() - start > timeout) {
            Console.PrintLine("Python script timed out.");
            ts.WriteLine(Util.SysUTCDate + " ERROR: Python script timed out.");
            return;
        }
    }
    // Parse output from astrometry_correction.py
    var py_lines = python_output.split("\n");
    var radec_offset = py_lines[py_lines.length - 2].split(" ");

    // Calculate new RA and Dec pointing
    var new_ra = (ra + parseFloat(radec_offset[0])) / 15;
    var new_dec = dec + parseFloat(radec_offset[1]);
    
    // Print new pointing
    Console.PrintLine("New RA: " + new_ra.toString() + " New Dec: " + new_dec.toString());
    ts.WriteLine(Util.SysUTCDate + " INFO: New RA: " + new_ra.toString());
    ts.WriteLine(Util.SysUTCDate + " INFO: New Dec: " + new_dec.toString());

    // Check that new pointing is reasonable
    if (isNaN(new_ra) || isNaN(new_dec))
    {
        Console.PrintLine("New pointing is not a number. Ignoring new pointing and continuing with current pointing.");
        ts.WriteLine(Util.SysUTCDate + " WARNING: New pointing is not a number. Ignoring new pointing and continuing with current pointing.");
        return;
    }

    else if ((new_ra > 24 || new_ra < 0) || (new_dec > 90 || new_dec < -90))
    {
        Console.PrintLine("New pointing is not reasonable. Ignoring new pointing and continuing with current pointing.");
        ts.WriteLine(Util.SysUTCDate + " WARNING: New pointing is not reasonable. Ignoring new pointing and continuing with current pointing.");
        return;
    }

    // Check that new pointing is safe
    targetCt = Util.NewCThereAndNow();
    targetCt.RightAscension = new_ra;
    targetCt.Declination = new_dec;
    if (targetCt.Elevation < elevationLimit)
    {
        Console.PrintLine("Tried to move to an unsafe elevation of " + targetCt.Elevation.toFixed(4));
        Console.PrintLine("Ignoring new pointing and continuing with current pointing.");
        ts.WriteLine(Util.SysUTCDate + " WARNING: Ignoring new pointing and continuing with current pointing.");
    }

    // Call gotoRADec() to slew to new pointing
    else
    {
        gotoRADec(new_ra, new_dec);
    }
}



///////////////////////////////////////////////////////////////
// Function to shut down telescope at end of the night
// MJM - June 23, 2022
///////////////////////////////////////////////////////////////
function shutDown()
{
    trkOff()
    Console.PrintLine("Tracking turned off. Parking telescope now...")
    ts.WriteLine(Util.SysUTCDate + " INFO: Tracking turned off. Parking telescope now.")
    Telescope.Park()
    trkOff();
    Console.PrintLine("Telescope parked. Closing dome now...")
    ts.WriteLine(Util.SysUTCDate + " INFO: Telescope parked. Closing dome now.")
    domeClose()
    Console.PrintLine("Dome closed. Good night/morning.")
    ts.WriteLine(Util.SysUTCDate + " INFO: Dome closed. Good night/morning.")
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

/////////////////////////////////////////////////////
// Returns JD of sunrise and sunset for current day
// See: https://en.wikipedia.org/wiki/Sunrise_equation
// MJM - 2021/06
/////////////////////////////////////////////////////
function twilightTimes(jDate) // Returns astronomical twilight end (sunrise) and start (sunset) times as JD
{
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

////////////////////////////////////////
// Causes program to wait until sunset
// MJM - 2021/06/24
////////////////////////////////////////
function waitUntilSunset(updatetime)
{
    var currentJD = Util.SysJulianDate
    while (currentJD < sunset)
    {
        Console.Clear()
        if (currentJD > sunrise && currentJD < sunset)
        {
            Console.PrintLine("Sun is up");
            Console.PrintLine("It has been up for " + Util.Hours_HMS((currentJD - sunrise)*24,"h ","m ","s"));
            Console.PrintLine("It will set in " + Util.Hours_HMS(-1*(currentJD - sunset)*24,"h ","m ","s"));
            Console.PrintLine("Waiting " + -1*(currentJD - sunset)*24 + " hours to start operations.");
            Util.WaitForMilliseconds(updatetime);
            currentJD = Util.SysJulianDate;
        }
    }
}

function sortFields(fieldtosort)
{
    // Sort available fields based on # of stars fieldInfo[i][10] 
    sortedFields = fieldtosort.sort(function(a,b) {return b[10] - a[10]});

    // Console.PrintLine(" ")
    // Console.PrintLine("=== Sorted Fields ===")
    // for (i=0; i< sortedFields.length; i++)
    // {
    //     Console.PrintLine(sortedFields[i][3] + "  Az: " + sortedFields[i][1].toFixed(2)
    //         + "  Alt: " + sortedFields[i][0].toFixed(2) + "  HA: " + sortedFields[i][5].toFixed(3)
    //         + "  Airmass: " + sortedFields[i][6].toFixed(3) + "  # stars: " + sortedFields[i][10])
    // }
    // Console.PrintLine(" ")

    return sortedFields;
}

function whichField(timeJD)
{
    nextField = 0;
    // Console.PrintLine(finalFields)
    // currField = 0
    // targetDur = finalFields[0][12]-time
    Console.PrintLine("Called whichField function...");
    Console.PrintLine("Number of fields in finalFields: " + finalFields.length);
    
    // Ensure observations take place during the dark
    if (timeJD < sunset)
    {
        Console.PrintLine("\r\n  Earlier than first observation time.");
        Console.PrintLine("************************************");
        targetJD = finalFields[0][12];
        // In this case, targetDur is the time to wait as a negative number
        targetDur = timeJD - finalFields[0][12];
        targetLoops = Math.ceil(targetDur*86400 / 0.025 / numExposures);
        targetRA  = finalFields[0][2][0];
        targetDec = finalFields[0][2][1];

        Console.PrintLine("\r\nThe JD start time is " + targetJD.toFixed(4));
        Console.PrintLine("We'll run for " + targetLoops + " loops of " + numExposures + " exposures.");
        Console.PrintLine("Which means that we're on target for " + targetDur.toFixed(3) + " hours.");

        // Console.PrintLine(time)
        // Console.PrintLine(finalFields[finalFields.length-2][12])
        // Console.PrintLine(finalFields[finalFields.length-1][12])

        currField = -1;
        nextField = 0;
        fieldName = "TooEarly";
        
        return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD];
    }
    else if (timeJD > sunrise)
    {
        // Console.PrintLine(time)
        // Console.PrintLine(finalFields[finalFields.length-1][12])
        Console.PrintLine("After last time.");
        targetJD  = 999; //TODO: This is a hack. Need to fix this to work with JD.
        targetDur = 999;
        targetLoops = 0;
        currField = 999;
        nextField = 999;
        // Given Polaris to target by default to be safe
        targetRA  = 37.75;
        targetDec = 89.15;
        fieldName = "TooLate";

        ts.WriteLine(Util.SysUTCDate + " WARNING: After last time. Closing up shop.");
        Telescope.Park();
        trkOff();
        domeClose();
        return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD];
    }


    if (finalFields.length == 1)
    {
        Console.PrintLine("Only one field to observe!");
        ts.WriteLine(Util.SysUTCDate + " INFO: (whichField) Only one field to observe!");
        
        targetJD  = sunrise;
        targetDur = sunrise - timeJD;
        targetLoops = Math.ceil(targetDur*86400 / 0.025 / numExposures);
        currField = 0;
        nextField = -999;

        targetRA = finalFields[0][2][0];
        targetDec = finalFields[0][2][1];
        fieldName = finalFields[0][3].toString();

        Console.PrintLine("target JD: " + targetJD);
        Console.PrintLine("Number of loops: " + targetLoops);
        Console.PrintLine("Target duration: " + targetDur);
        Console.PrintLine("finalFields: " + finalFields[0][12]);
        ts.WriteLine(Util.SysUTCDate + " INFO: Target JD = " + targetJD + " Target Dur. = " + targetDur + " Target Loops: " + targetLoops + " Field Name: " + fieldName);



        return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD];
    }


    // Scan the finalFields list to identify the current field
    for (i = 0; i < finalFields.length - 1; i++)
    {
        if ((timeJD > finalFields[i][12]) && (timeJD < finalFields[i+1][12]))
        {
            targetJD  = finalFields[i + 1][12];
            targetDur = finalFields[i + 1][12] - timeJD;
            targetLoops = Math.ceil(targetDur*86400 / 0.025 / numExposures);
            currField = i;
            nextField = i + 1;
            targetRA = finalFields[i][2][0];
            targetDec =finalFields[i][2][1];
            fieldName = finalFields[i][3].toString();

            return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD];
        }
    }
    // Check final entry in finalFields list
    if ((timeJD > finalFields[finalFields.length-1][12]) && (timeJD < sunrise))
    {
        Console.PrintLine("At last field");
        ts.WriteLine(Util.SysUTCDate + " INFO: At last field");

        targetJD  = sunrise;
        targetDur = sunrise - timeJD;
        targetLoops = Math.ceil(targetDur*86400 / 0.025 / numExposures);
        currField = finalFields.length - 1;
        nextField = 999;
        targetRA = finalFields[finalFields.length - 1][2][0];
        targetDec = finalFields[finalFields.length - 1][2][1];
        fieldName = finalFields[finalFields.length - 1][3].toString();


        //ts.WriteLine(Util.SysUTCDate + " INFO: Target JD = " + targetJD + " Target Dur. = " + targetDur + " Target Loops: " + targetLoops + " Field Name: " + fieldName)
        //Console.PrintLine(fieldName + " Target JD = " + targetJD + " w/ a duration = " + targetDur + " for " + targetLoops + " loops ")

        return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD];
    }


    // Default if no valid fields are found (for any reason)
    // Given Polaris to target by default to be safe
    Console.PrintLine("No valid fields");
    ts.WriteLine(Util.SysUTCDate + " INFO: No valid fields");
    targetJD  = 999; //TODO: This is a hack. Need to fix this to work with JD.
    targetDur = 999;
    targetLoops = 0;
    currField = 999;
    nextField = 999;
    targetRA  = 37.75;
    targetDec = 89.15;
    fieldName = "NoFields";

    ts.WriteLine(Util.SysUTCDate + " WARNING: After last time. Closing up shop.");
    Telescope.Park();
    trkOff();
    domeClose();
    return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD];
    
}




///////////////////////////////////////////////////////////////////////////////////
//
// EEEE N   N DDD      OO  FFFF   FFFF U   U N   N  CC  TTTTT I  OO  N   N  SSS
// E    NN  N D  D    O  O F      F    U   U NN  N C  C   T   I O  O NN  N S
// EEE  N N N D   D   O  O FFF    FFF  U   U N N N C      T   I O  O N N N  SS
// E    N  NN D  D    O  O F      F    U   U N  NN C  C   T   I O  O N  NN    S
// EEEE N   N DDD      OO  F      F     UUU  N   N  CC    T   I  OO  N   N SSS 
//
///////////////////////////////////////////////////////////////////////////////////


/* --------------------------- Setup ----------------------------------------*/

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



if (logconsole == true)
{
    Console.LogFile = "d:\\Logs\\ACP\\" + Util.FormatVar(Util.SysUTCDate, "yyyymmdd_HhNnSs") + "-ACPconsole.log";
    Console.Logging = true;
}

sunset  = twilightTimes(Util.SysJulianDate)[1];
LogFile = "d:\\Logs\\ACP\\" + JDtoUTC(sunset) + "-ACP.log";
fso = new ActiveXObject("Scripting.FileSystemObject");

if (fso.FileExists(LogFile))
{
    Console.PrintLine("Log file exists. Appending to existing log file.");
}
else
{
    fso.CreateTextFile(LogFile);
}

f1 = fso.GetFile(LogFile);
// Check to see if f1 open. If not, do the following...
ts = f1.OpenAsTextStream(Mode, true);
Console.PrintLine("Log file ready.")


/*---------------------------------------------------------------------------*/
/*-----------------------------------Main------------------------------------*/
/*---------------------------------------------------------------------------*/

function main()
{

    // Get times of sunrise and sunset
    // twilightTimes: [0] - JD of sunrise, [1] - JD of sunset
    // Note! The calculation for sunsetLST only works if you are west of Greenwich
    sunset  = twilightTimes(Util.SysJulianDate)[1];
    sunrise = twilightTimes(Util.SysJulianDate + 1)[0];
    sunsetLST  = (Util.Julian_GMST(sunset)  + Telescope.SiteLongitude / 15).toFixed(1);
    sunriseLST = (Util.Julian_GMST(sunrise) + Telescope.SiteLongitude / 15).toFixed(1);

    // Length of night
    var darkHours = (sunrise - sunset) * 24;
    var timeUntilSunset = (sunset - Util.SysJulianDate) * 24; // hours
    var timeUntilSunrise = (sunrise - Util.SysJulianDate) * 24; // hours

    // Dark hours left
    var darkHoursLeft = Math.min(darkHours, timeUntilSunrise);

    // Print today's time of nautical sunrise and sunset.
    Console.PrintLine("Sunrise GMST: " + Util.Julian_GMST(sunrise));
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunrise GMST: " + Util.Julian_GMST(sunrise));
    Console.PrintLine("Sunset GMST: " + Util.Julian_GMST(sunset));
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunset GMST: " + Util.Julian_GMST(sunset));
    Console.PrintLine("Current GMST: " + Util.Julian_GMST(Util.SysJulianDate));
    ts.WriteLine(Util.SysUTCDate + " INFO: Current GMST: " + Util.Julian_GMST(Util.SysJulianDate));
    Console.PrintLine("Sunrise UTC: " + Util.Julian_Date(sunrise));
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunrise UTC: " + Util.Julian_Date(sunrise));
    Console.PrintLine("Sunset UTC: " + Util.Julian_Date(sunset));
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunset UTC: " + Util.Julian_Date(sunset));
    Console.PrintLine("Sunset JD: " + sunset);
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunset JD: " + sunset);
    Console.PrintLine("Sunrise JD: " + sunrise);
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunrise JD: " + sunrise);
    Console.PrintLine("Current JD: " + Util.SysJulianDate);
    ts.WriteLine(Util.SysUTCDate + " INFO: Current JD: " + Util.SysJulianDate);

    /* LST transformations
    Console.PrintLine("Sunset LST: " + sunsetLST)
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunset LST: " + sunsetLST)
    Console.PrintLine("Sunrise LST: " + sunriseLST)
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunrise LST: " + sunriseLST)
    Console.PrintLine("Current LST: " + Util.NowLST())
    ts.WriteLine(Util.SysUTCDate + " INFO: Current LST: " + Util.NowLST())
    */
    
    Console.PrintLine("Length of the Night: " + darkHours + "hours");
    ts.WriteLine(Util.SysUTCDate + " INFO: Length of the Night: " + darkHours + " hours");
    Console.PrintLine("Time until sunset: " + timeUntilSunset + " hours");
    Console.PrintLine("Time until sunrise: " + timeUntilSunrise + " hours");
    ts.WriteLine(Util.SysUTCDate + " INFO: Dark hours left: " + darkHoursLeft + " hours");


/*-----------------------------Prestart Checks-------------------------------*/

    // Check if there is enough space for this to run
    var spaceneeded = darkHoursLeft * 3600 * 40 * 12600000 / 1000000000000;
    var freespace = freeDiskSpace();
    if (freespace > spaceneeded)
    {
        Console.PrintLine("We need " + spaceneeded + " TB of space to run tonight.");
        Console.PrintLine("And we have " + freespace + " TB of free space available.");
        Console.PrintLine("So, we're good to go!");
    }
    else
    {
        if (Util.Confirm("You need to free up " + (spaceneeded - freespace) + " TB of space. If you run out of space while this script is running, RunColibri will crash when d: is full. This will potentially damage the telescope! Do you want to continue anyway?"))
        {
            ts.WriteLine(Util.SysUTCDate + " WARNING: You chose to continue operations without enough disk space. RunColibri will likely crash when you run out of space on d:.");
        }
        else
        {
            abort();
        }

    }

    // Check to see if the weather server is connected. If it isn't ask for
    // permission to continue.
    if (Weather.Available)
    {
        Console.PrintLine("Weather server is connected. Continuing with operations.");
        ts.WriteLine(Util.SysUTCDate + " INFO: Weather server is connected. Continuing with operations.");
        Util.WaitForMilliseconds(3000);
    }
    else
    {
        if (Util.Confirm("No weather server! Do you want to continue? Choose wisely..."))
        {
            Console.PrintLine("Ok, you've chosen to proceed with no weather server. 8-O");
            ts.WriteLine(Util.SysUTCDate + " WARNING: No weather server. You've chosen to proceed without. 8-O");
            ignoreWeather = true;
            Util.WaitForMilliseconds(3000);
        }
        else
            abort();
    }

    // If the weather server is connected and the weather is not safe, wait
    // until it becomes safe.
    if (Weather.Available && !Weather.safe)
    {
        ts.WriteLine(Util.SysUTCDate + " INFO: Weather unsafe! Waiting until it's looking a bit better out.");
    }

    while (Weather.Available && !Weather.safe)
    {
        if (getDate() != currentDate)
        {
            currentDate = getDate();
            LogFile = "d:\\Logs\\ACP\\" + JDtoUTC(sunset) + "-ACP.log";

            if (fso.FileExists(LogFile))
            {
                Console.PrintLine(Util.SysUTCDate + " INFO: Log file exists. Appending to existing log file.");;
            }
            else
            {
                fso.CreateTextFile(LogFile);
            }

            f1 = fso.GetFile(LogFile);
            try {
                ts = f1.OpenAsTextStream(Mode, true);
            }
            catch(err) {
                ts.WriteLine(Util.SysUTCDate + " WARNING: Log file is already open.");
            }
            // Console.Logging = false
            // Console.Logfile = "d:\\Logs\\ACP\\" + getDate() + "-ACP.log"
            // Console.Logging = true
        }
        Console.PrintLine("Unsafe weather conditions. Waiting for 5 minutes.");
        // abort()
        Util.WaitForMilliseconds(300000);
    }

    // Update currentDate variable to be correct
    if (getDate() != currentDate)
    {
        currentDate = getDate();
        LogFile = "d:\\Logs\\ACP\\" + JDtoUTC(sunset) + "-ACP.log";

        if (fso.FileExists(LogFile))
        {
            Console.PrintLine("Log file exists. Appending to existing log file.");
        }
        else
        {
            fso.CreateTextFile(LogFile);
        }

        f1 = fso.GetFile(LogFile);
        if (fso.FileExists(LogFile))
        {
            Console.PrintLine("Log file exists. Appending to existing log file.");

        }
        else
        {
            ts = f1.OpenAsTextStream(Mode, true);
        }
    }


    // Wait until sunset to begin operation
    while (timeUntilSunset > 0)
    {
        Console.PrintLine("");
        Console.PrintLine("It's still too early to begin... Waiting for " + ((sunset - Util.SysJulianDate)*24*3600).toFixed(0) + " seconds.");
        
        Util.WaitForMilliseconds(5000);
        timeUntilSunset = (sunset - Util.SysJulianDate) * 24; // hours
    }
    
    // Ready to go. Print alert that we will start observations now.
    Console.PrintLine("");
    Console.PrintLine("It is after sunset... Creating observation plan now.");


/*-----------------------------Observing Plan--------------------------------*/


    // Create directory for tonight's data and collect dark frames
    if (firstRun == true)
    {
        var today = JDtoUTC(sunset); // Today's UTC date to be used to define data directory

        Util.ShellExec("cmd.exe", "/c mkdir -p d:\\ColibriData\\" + today.toString() + "\\Dark");

        Console.PrintLine("Created today's data directory at d:\\ColibriData\\" + today.toString());
        ts.WriteLine(Util.SysUTCDate + " INFO: Created today's data directory at d:\\ColibriData\\" + today.toString());
        

        firstRun = false;
    }

    // Calculate field-moon angle for each field.
    var moonAngles = [];
    var moonct = getMoon();
    for (i = 0; i < fieldInfo.length; i++)
    {
        var b = (90 - fieldInfo[i][2][1]) * Math.PI / 180;
        var c = (90 - moonct.Declination) * Math.PI / 180;

        var aa = Math.abs(fieldInfo[i][2][0] - moonct.RightAscension) * Math.PI / 180;

        var moonAngle = Math.acos((Math.cos(b) * Math.cos(c)) + (Math.sin(b) * Math.sin(c) * Math.cos(aa))) * 180 / Math.PI;
        moonAngles.push(moonAngle);
        fieldInfo[i][4] = moonAngle;
    }

    var fieldsToObserve = []; // Array containing best field info in 6 minute increments

    // Elevation [0], Azimuth [1], field [2], field name [3], moon angle [4], HA [5], airmass [6],
    // # of M13 stars [7], a [8], b [9], # of stars visible [10], rank [11], start JD [12]
    
    // n is the number of samples in one observing block (length = timestep)
    // that will be computed.
    var n = Math.round(darkHours.toFixed(2) / timestep);
    Console.PrintLine("# of samples tonight: " + n);


    // Calcuate the local coordinates of each field at each timestep and the
    // number of visible stars in each field when accounting for extinction
    var prevField = "";
    for (k = 0; k < n; k++)
    {
        // Assume that the moon angle is constant throughout the night
        // In reality, it will move about 0.5 deg per hour
        // aa.exe doesn't allow time input from command line, so we'll
        // fix this later

        // Create a new coordinate transform at intervals of timestep
        var newLST = parseFloat(sunsetLST) + k * timestep;
        var newJD  = sunset + k * timestep / 24;
        var ct = Util.NewCT(Telescope.SiteLatitude, newLST);

        // Start a loop to calculate approximate number of stars in fields
        for (j = 0; j < fieldInfo.length; j++)
        {
            // Set RA and DEC to field 'j' coordinates  
            ct.RightAscension = fieldInfo[j][2][0] / 15; // in hours
            ct.Declination = parseFloat(fieldInfo[j][2][1]); // in degrees

            // Field coordinate definitions
            var lat = ct.Latitude;
            var alt = ct.Elevation;
            var LST = ct.SiderealTime;
            var HA = LST - ct.RightAscension;
            

            // Set fieldInfo fields for spatial/temporal fields
            fieldInfo[j][0] = ct.Elevation;
            fieldInfo[j][1] = ct.Azimuth;
            fieldInfo[j][5] = HA;
            fieldInfo[j][12] = newJD;

            // Calculate approx. # of stars in field using airmass/extinction
            // Know limiting magnitude at zenith (say 12 in 25 ms)
            // Know # of stars at M12 in each field
            // Calculate extinction at current airmass
            // With this new magnitude calculate approx. # of stars

            // Calculate airmass and extinction
            var airmass = 1 / Math.cos((90 - alt) * Math.PI / 180);
            fieldInfo[j][6] = airmass;
            var extinction = (airmass - 1) * extScale;

            // Calculate the true number of visible stars, accounting for extinction
            var numVisibleStars = parseInt(fieldInfo[j][8] * Math.exp(fieldInfo[j][9] * (magnitudeLimit - extinction)));
            fieldInfo[j][10] = numVisibleStars;
            // Console.PrintLine("Airmass: " + airmass)
            // Console.PrintLine("Number of visible M" + (magnitudeLimit-extinction).toPrecision(3) + " stars: " + numVisibleStars)

        }

        // Create goodFields array to hold fields that are above the horizon
        // and far enough from the moon
        var goodFields = [];

        for (j = 0; j < fieldInfo.length; j++)
        {
            if (fieldInfo[j][0] > elevationLimit && moonAngles[j] > minMoonOffset)
            {
                goodFields.push([fieldInfo[j][0],fieldInfo[j][1],fieldInfo[j][2],fieldInfo[j][3],fieldInfo[j][4],fieldInfo[j][5],fieldInfo[j][6],fieldInfo[j][7],fieldInfo[j][8],fieldInfo[j][9],fieldInfo[j][10],fieldInfo[j][11],fieldInfo[j][12]]);
            }
        }




        // Require that any new field be better than the old field by at least
        // minDiff. Otherwise, continue observing the old field.
        // TODO: make this if/else more clever
        sortFields(goodFields);
        if (sortedFields.length == 1)
        {
            fieldsToObserve.push([sortedFields[0][0],sortedFields[0][1],sortedFields[0][2],sortedFields[0][3],sortedFields[0][4],sortedFields[0][5],sortedFields[0][6],sortedFields[0][7],sortedFields[0][8],sortedFields[0][9],sortedFields[0][10],sortedFields[0][11],sortedFields[0][12]]);
            prevField = sortedFields[0][3];
        }
        else if ((sortedFields[0][3] != prevField) && (sortedFields[1][3] == prevField) && (sortedFields[0][10] - sortedFields[1][10] < minDiff))
        {
            fieldsToObserve.push([sortedFields[1][0],sortedFields[1][1],sortedFields[1][2],sortedFields[1][3],sortedFields[1][4],sortedFields[1][5],sortedFields[1][6],sortedFields[1][7],sortedFields[1][8],sortedFields[1][9],sortedFields[1][10],sortedFields[1][11],sortedFields[1][12]]);

            prevField = sortedFields[1][3];
        }
        else
        {
            fieldsToObserve.push([sortedFields[0][0],sortedFields[0][1],sortedFields[0][2],sortedFields[0][3],sortedFields[0][4],sortedFields[0][5],sortedFields[0][6],sortedFields[0][7],sortedFields[0][8],sortedFields[0][9],sortedFields[0][10],sortedFields[0][11],sortedFields[0][12]]);
            prevField = sortedFields[0][3];
        }
        

        // Print statements for testing
        //Console.PrintLine(prevField)
        //Console.PrintLine(sortedFields[0][3] + " " + sortedFields[0][10] + " / " + sortedFields[1][3] + " " + sortedFields[1][10])
        //Console.PrintLine("10: " + fieldInfo[9][10] + " 7: " + fieldInfo[6][10])
        //Console.PrintLine(sortedFields[0])
        //Console.PrintLine(fieldsToObserve);

        // Default option
        //fieldsToObserve.push([sortedFields[0][0],sortedFields[0][1],sortedFields[0][2],sortedFields[0][3],sortedFields[0][4],sortedFields[0][5],sortedFields[0][6],sortedFields[0][7],sortedFields[0][8],sortedFields[0][9],sortedFields[0][10],sortedFields[0][11],sortedFields[0][12]]);

    }


/*---------------------------Order & Print Plan------------------------------*/

    // Check length of fields to observe
    Console.PrintLine("# of selected time blocks: " + fieldsToObserve.length)
    Console.PrintLine("")


    // Push first field, then check if the following field is the same. If it
    // is, move onto the next field. Repeat until the end of the list and
    // then push the final field
    
    finalFields.push(fieldsToObserve[0]);
    for (i = 0; i<fieldsToObserve.length - 1; i++)
    {
        if (fieldsToObserve[i][3] != fieldsToObserve[i + 1][3])
        {
            //finalFields.push([fieldsToObserve[i][0],fieldsToObserve[i][1],fieldsToObserve[i][2],fieldsToObserve[i][3],fieldsToObserve[i][4],fieldsToObserve[i][5],fieldsToObserve[i][6],fieldsToObserve[i][7],fieldsToObserve[i][8],fieldsToObserve[i][9],fieldsToObserve[i][10],fieldsToObserve[i][11],fieldsToObserve[i][12]])
            finalFields.push(fieldsToObserve[i+1]);
            // Console.PrintLine(i.toString())
        }
    }


    // Calculate the duration of each field and append it onto the end of its
    // finalFields object. The last element goes to sunrise
    for (i = 0; i < finalFields.length - 1; i++)
    {
        finalFields[i].push(finalFields[i + 1][12] - finalFields[i][12]);
        //finalFields[i+1].push(finalFields[i*2+1][12]-finalFields[i*2][12])
    }
    finalFields[finalFields.length-1].push(sunrise - finalFields[finalFields.length - 1][12]);


    // Print table of raw finalFields array
    Console.PrintLine("");
    Console.PrintLine("=== finalFields ===");
    ts.WriteLine(Util.SysUTCDate + " === finalFields ===");
    for (k = 0; k < finalFields.length; k++)
    {
        ts.WriteLine(Util.SysUTCDate +  " " + finalFields[k]);
        Console.PrintLine(finalFields[k]);
    }

    // Print table of formatted finalFields array
    Console.PrintLine("");
    Console.PrintLine("=== Final Field Short List ===");
    ts.WriteLine(Util.SysUTCDate + "=== Final Field Short List ===");

    for (i = 0; i < finalFields.length - 1; i++)
    {
        Console.PrintLine(finalFields[i][3] + " starts " + finalFields[i][12].toFixed(3) + " ends " + finalFields[i + 1][12].toFixed(3) + " for " + (finalFields[i][13] * 24).toFixed(2) + " hours");
        Console.PrintLine(" with " + finalFields[i][10].toString() + " visible stars");
        ts.WriteLine(Util.SysUTCDate + " INFO: " + finalFields[i][3] + " starts " + finalFields[i][12].toFixed(3) + " ends " + finalFields[i + 1][12].toFixed(3) + " for " + (finalFields[i][13] * 24).toFixed(2) + " hours with " + finalFields[i][10].toString() + " visible stars");
    }
    Console.PrintLine(finalFields[finalFields.length - 1][3] + " starts " + finalFields[finalFields.length - 1][12].toFixed(3) + " ends " + sunrise + " for " + (finalFields[finalFields.length - 1][13] * 24).toFixed(2) + " hours");
    Console.PrintLine(" with " + finalFields[finalFields.length-1][10].toString() + " visible stars");
    ts.WriteLine(Util.SysUTCDate + " INFO: " + finalFields[finalFields.length - 1][3] + " starts " + finalFields[finalFields.length - 1][12].toFixed(3) + " ends " + sunrise.toFixed(3) + " for " + (finalFields[finalFields.length - 1][13] * 24).toFixed(2) + " hours with " + finalFields[finalFields.length - 1][10].toString() + " visible stars");    
    ts.WriteLine(Util.SysUTCDate + " INFO: === Final Field Coordinates ===");
    for (i = 0; i < finalFields.length; i++)
    {
        ts.WriteLine(Util.SysUTCDate + "Field: " + finalFields[i][3] + "  Elev: " + finalFields[i][0] + "  Az: " + finalFields[i][1]);
    }



/*-----------------------------Begin Operations------------------------------*/
    //abort() // used for testing

    // Loop through final field list to find first target
    // Calculate time to run as target end time minus current JD
    // Number of loops = Math.ceil(targetDur*3600 / 0.025 / 2400)
    
    // currentField [0] = field index for finalFields, 
    // [1] = time until end of field, [2] = number of loops, [3] = field RA, 
    // [4] = field DEC, [5] = field name, [6] = end JD
    runNum = 0;
    currentField = [0, 0, 0, 0, 0, "None", 0];

    while (currentField[0] > -1 && currentField[0] < 999)
    {
        // Identify the current field in the finalFields list based on the time
        currentJD = Util.SysJulianDate;
        currentField = whichField(Util.SysJulianDate);
        endJD = currentField[6];

        // Log outputs of whichField
        // whichField returns [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD]
        Console.PrintLine("");
        ts.WriteLine(Util.SysUTCDate + " INFO: Field Info");
        Console.PrintLine("Field index: " + currentField[0]);
        ts.WriteLine(Util.SysUTCDate + " INFO: Field index: " + currentField[0]);
        Console.PrintLine("Time until end of field: " + currentField[1]);
        ts.WriteLine(Util.SysUTCDate + " INFO: Time until end of field: " + currentField[1]);
        Console.PrintLine("Number of loops: " + currentField[2]);
        ts.WriteLine(Util.SysUTCDate + " INFO: Number of loops: " + currentField[2]);
        Console.PrintLine("Field RA: " + currentField[3]);
        ts.WriteLine(Util.SysUTCDate + " INFO: Field RA: " + currentField[3]);
        Console.PrintLine("Field Dec: " + currentField[4]);
        ts.WriteLine(Util.SysUTCDate + " INFO: Field Dec: " + currentField[4]);
        Console.PrintLine("Field Name: " + currentField[5]);
        ts.WriteLine(Util.SysUTCDate + " INFO: Field Name: " + currentField[5]);

        // Safeguard against opening before the start of the observing plan
        while (Util.SysJulianDate < sunset)
        {
            Console.PrintLine("");
            Console.PrintLine("It's still too early to begin... Waiting for " + ((sunset - Util.SysJulianDate) * 86400).toFixed(0) + " seconds.");
            Util.WaitForMilliseconds(5000);
        }
        
        // Safeguard against opening after the end of the observing plan/sunrise
        if (Util.SysJulianDate > sunrise)
        {
            Console.PrintLine("");
            Console.PrintLine("Too late. Nothing left to observe.");
            ts.WriteLine(Util.SysUTCDate + " INFO: Too late... Nothing left to observe.");
            // if (Util.IsTaskActive(tid))
                //Util.ShellExec("taskkill.exe", "/im ColibriGrab.exe /t /f")
            // abortAndRestart()
            andRestart();
        }
        else if (currentField[2] < 0 && currField[0] != -1)
        {
            Console.PrintLine("Negative loops remaining. Past last field. Closing up.");
            ts.WriteLine(Util.SysUTCDate + " INFO: Negative loops. Aborting script.");
            // abortAndRestart()
            andRestart();
        }

        // Monitor the weather status, if the weather script is active
        // TODO: Add Goto and all that stuff.
        if ((Weather.Available && Weather.safe) || (ignoreWeather == true))
        {
            Console.PrintLine("Checking Weather");
            connectScope();
            domeOpen();
            trkOn();
        }

        // Create coordinate transform for the current field
        currentFieldCt = Util.NewCThereAndNow();
        currentFieldCt.RightAscension = currentField[3] / 15;
        currentFieldCt.Declination = currentField[4];

        // Monitor and log the coordinates which the telescope slews to
        Console.PrintLine("");
        Console.PrintLine("Slewing to...");
        Console.PrintLine("RA: " + currentFieldCt.RightAscension);
        Console.PrintLine("Dec: " + currentFieldCt.Declination);
        ts.WriteLine(Util.SysUTCDate + " INFO: Slewing to...");
        ts.WriteLine(Util.SysUTCDate + " INFO: RA: " + currentFieldCt.RightAscension);
        ts.WriteLine(Util.SysUTCDate + " INFO: Dec: " + currentFieldCt.Declination);
        ts.WriteLine(Util.SysUTCDate + " INFO: Alt: " + currentFieldCt.Elevation);
        ts.WriteLine(Util.SysUTCDate + " INFO: Az: " + currentFieldCt.Azimuth);

        // Slew to the current field
        gotoRADec(currentFieldCt.RightAscension, currentFieldCt.Declination);

        // Slave the dome to the telescope and wait until they are both in
        // the correct position to begin observing
        while (Telescope.Slewing == true)
        {
            Console.PrintLine("Huh. Still Slewing...");
            Util.WaitForMilliseconds(500);
        }

        Dome.UnparkHome();
        if (Dome.slave == false)
        {
            Dome.slave = true;
        }

        while (Dome.Slewing == true)
        {
            Console.PrintLine("Dome is still slewing. Give me a minute...");
            Util.WaitForMilliseconds(500);
        }

        Console.PrintLine("At target.");
        Console.PrintLine("Target Alt/Az is: Alt. =" + currentFieldCt.Elevation.toFixed(2) + "   Az.= " + currentFieldCt.Azimuth.toFixed(2));
        ts.WriteLine(Util.SysUTCDate + " INFO: At target.");
        ts.WriteLine(Util.SysUTCDate + " INFO: Target Alt/Az is: Alt. =" + currentFieldCt.Elevation.toFixed(2) + "   Az.= " + currentFieldCt.Azimuth.toFixed(2));

        // Readjust the telescope pointing using child script
        adjustPointing(currentFieldCt.RightAscension, currentFieldCt.Declination);

        while (Telescope.Slewing == true)
        {
            Console.PrintLine("Huh. Still Slewing...");
            Util.WaitForMilliseconds(500);
        }

        Dome.UnparkHome()
        if (Dome.slave == false)
        {
            Dome.slave = true;
        }

        while (Dome.Slewing == true)
        {
            Console.PrintLine("Dome is still slewing. Give me a minute...");
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
            pierside = "W"
            Console.PrintLine("Pier side: " + pierside);
        }

        // if (Telescope.SideOfPier != Telescope.DestinationSideOfPier(currentFieldCt.RightAscension, currentFieldCt.Declination)) {
        //     Console.PrintLine("Flipping sides of pier...")
        //     gotoRADec(currentFieldCt.RightAscension, currentFieldCt.Declination);
        // }
        // else { Console.PrintLine("Already on the right side of the pier"); }

        // if (Telescope.SideOfPier == 0)
        // {
        //     pierside = "E"
        // }
        // else
        // {
        //     pierside = "W"
        // }

/*-----------------------------Data Collection-------------------------------*/

        Console.PrintLine("");
        Console.PrintLine("Starting data collection...");
        Console.PrintLine("Running from " + Util.SysJulianDate + " until " + endJD);
        ts.WriteLine(Util.SysUTCDate + " INFO: Starting data collection.");

        // Iterables
        var darkCounter = darkInterval; // Set equal to interval so that dark set is collected on first run
        var runCounter = 1;

        while (Util.SysJulianDate < endJD)
        {

            // Check pier side
            if (Telescope.SideOfPier != Telescope.DestinationSideOfPier(currentFieldCt.RightAscension, currentFieldCt.Declination))
            {
                Console.PrintLine("Flipping sides of pier...");
                ts.WriteLine(Util.SysUTCDate + " INFO: Flipping sides of the pier.");
                gotoRADec(currentFieldCt.RightAscension, currentFieldCt.Declination);

                // Readjust the telescope pointing using child script
                adjustPointing(currentFieldCt.RightAscension, currentFieldCt.Declination);

                while (Telescope.Slewing == true)
                {
                    Console.PrintLine("Huh. Still Slewing...");
                    Util.WaitForMilliseconds(500);
                }

                Dome.UnparkHome()
                if (Dome.slave == false)
                {
                    Dome.slave == true;
                }

                while (Dome.Slewing == true)
                {
                    Console.PrintLine("Dome is still slewing. Give me a minute...");
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
            }
            else 
            { 
                Console.PrintLine("Already on the right side of the pier"); 
            }

            // Collect darkes when darkInterval is reached
            if (darkCounter == darkInterval)
            {
               darkCollection(today, LogFile);
               darkCounter = 0;
            }
            darkCounter++;
            Console.PrintLine("Dark counter = " + darkCounter.toString());

            // Dynamically fetches the correct path to ColibriGrab.exe
            var wshShell = new ActiveXObject("WScript.Shell");
            var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");
            var colibriGrabPath = userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";


            // var today = getDate();
            // Console.Printline(today.toString());

            // Commands to run ColibriGrab.exe from the GitHub
            var wsh = new ActiveXObject("WScript.Shell");
            var command = "\"" + colibriGrabPath + "\" -n " + numExposures.toString() + " -p " + currentField[5].toString() + "_25ms-" + pierside + " -e 25 -t 0 -f normal -w D:\\ColibriData\\" + today.toString()
            
            Console.PrintLine('Executing command: ' + command);
            ts.WriteLine(Util.SysUTCDate + " INFO: Executing command: " + command); // Write the command to the log file
    
            // Run ColibriGrab.exe
            wsh.Run(command, 1, true); 

            Util.WaitForMilliseconds(1000);

            // Append and delete ColibriGrab log to ACP log after each run
            appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);
            Console.PrintLine("Done exposing run # " + runCounter.toString());
            ts.WriteLine(Util.SysUTCDate + " INFO: Done exposing run # " + runCounter.toString()); // Log completion of each run

            runCounter++;
        }
    }

    shutDown();       
}
            // Run ColibriGrab.exe
            //wsh.Run(command, 1, true); 


            // Start grabbing images
            //pid = Util.ShellExec("ColibriGrab.exe", "-n " + numExposures.toString() + " -p " + currentField[5].toString() + "_25ms-" + pierside + " -e 25 -t 0 -f normal -w D:\\ColibriData\\" + today.toString())
            
            //Console.PrintLine("Process ID = " + pid.toString())
            //Util.WaitForMilliseconds(1000)

            // Append and delete ColibriGrab log to ACP log after each run
            //appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);
            //Console.PrintLine("Done exposing run # " + runCounter.toString())
          
            //runCounter++
//        }

//    }

//    shutDown();

//}
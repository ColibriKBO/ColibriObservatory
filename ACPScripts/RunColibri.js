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

// ---------------------------------------------------------------------
// Function: setOutletState
// Arguments:
//   outletIndex (number) - 0-based outlet number (0 = Switch 1)
//   desiredState (bool)  - true for ON, false for OFF
// This function controls the DigitalLoggers Web Power Switch used by Colibri
// ---------------------------------------------------------------------
function setOutletState(outletNumber, switchValue) {
    var PWC  = new ActiveXObject("ASCOM.DigitalLoggers.Switch");

    try {
        if (!PWC.Connected) {
            PWC.Connected = true;
        }

        var outletCount = PWC.MaxSwitch;
        if (outletNumber < 0 || outletNumber >= outletCount) {
            Util.Console.PrintLine("ERROR: Outlet number " + outletNumber + " is out of range.");
            return;
        }

        var outletName = PWC.GetSwitchName(outletNumber);
        Util.Console.PrintLine("Setting outlet #" + outletNumber + " (" + outletName + ") to " + (switchValue ? "ON" : "OFF") + "...");
        PWC.SetSwitch(outletNumber, switchValue);

    } catch (e) {
        Util.Console.PrintLine("ERROR: " + e.message);
    } finally {
        if (PWC != null) {
            PWC.Connected = false;
        }
    }
}

/////////////////////////////////////////////////////////////
// Function to check if a process is running via it's name
/////////////////////////////////////////////////////////////
function isProcessRunningByName(exeName) {
    try {
        var svc = GetObject("winmgmts:{impersonationLevel=impersonate}!\\\\.\\root\\cimv2");
        var col = svc.ExecQuery("SELECT * FROM Win32_Process WHERE Name='" + exeName + "'");
        var e = new Enumerator(col);
        return !e.atEnd();
    } catch (e) {
        return false; // fail-safe: don't hang operations
    }
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
    var command = "\"" + colibriGrabPath + "\" -n 10 -p Dark_25ms -e 0 -t -10 -f dark -l 1 -w D:\\ColibriData\\" + today.toString() + "\\Dark";

    wsh.Run(command, 1, true); // 1: normal window, true: wait for completion

    Console.PrintLine("Finished collecting dark frames...");
    // Append and delete ColibriGrab log to ACP log after collecting bias frames
    appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);
}

//////////////////////////////////////////////////////////////////
// This function contains the automated version of the manual   //
// hack to transition the camera from MaxIM DL to FLI control   //
//////////////////////////////////////////////////////////////////
function resetFliPilot(ts) {
    ts.WriteLine(Util.SysUTCDate + " INFO: === FLIPilot reset ===");
    Console.PrintLine("=== FLIPilot reset ===");

    var WshShell = new ActiveXObject("WScript.Shell");
    var flipilotPath = "\"C:\\Program Files\\Finger Lakes Instrumentation\\FliPilot\\FLIPilot.exe\"";

    function killFliPilot() {
        try { WshShell.Run("taskkill /IM FLIPilot.exe /F /T", 0, true); } catch (e) {}
    }

    function launchFliPilot() {
        WshShell.Run(flipilotPath, 1, false); // non-blocking
    }

    try {
        // Make sure no old FLIPilot instance is hanging around
        killFliPilot();

        // Launch fresh FLIPilot
        launchFliPilot();
        ts.WriteLine(Util.SysUTCDate + " INFO: FLIPilot launched, waiting 8000 ms for settle.");
        Console.PrintLine("FLIPilot launched, waiting 8000 ms for settle.");

        // Give FLIPilot time to initialize and grab the camera
        Util.WaitForMilliseconds(10000);

        ts.WriteLine(Util.SysUTCDate + " INFO: FLIPilot reset complete.");
        Console.PrintLine("FLIPilot reset complete.");

    } catch (e) {
        ts.WriteLine(Util.SysUTCDate + " ERROR: resetFliPilot failed: " + (e.message || e.description || e));
        Console.PrintLine("ERROR: resetFliPilot failed: " + (e.message || e.description || e));
    }
}

function CameraStartup() {

    var WshShell = new ActiveXObject("WScript.Shell");

    var userProfile = WshShell.ExpandEnvironmentStrings("%USERPROFILE%");
    var colibriGrabPath = userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";

    // small startup run just to stabilize the camera
    var cmd = "\"" + colibriGrabPath + "\" -n 700 -p startup_test -e 25 -t 0 -f normal -l 0 -w D:\\Tests\\startup_test";

    Console.PrintLine(Util.SysUTCDate + " INFO: CameraStartup launching ColibriGrab");
    ts.WriteLine(Util.SysUTCDate + " INFO: CameraStartup launching ColibriGrab");

    // launch NON-blocking
    WshShell.Run(cmd, 1, false);

    // wait for exposure to start
    var delay = 15000;
    Util.WaitForMilliseconds(delay);

    // kill FLIPilot while CGrab is running
    try {
        WshShell.Run("taskkill /IM FLIPilot.exe /F /T", 0, true);
        Console.PrintLine(Util.SysUTCDate + " INFO: FLIPilot killed during CameraStartup");
        ts.WriteLine(Util.SysUTCDate + " INFO: FLIPilot during CameraStartup");
    } catch (e) {}


    // wait for ColibriGrab to finish before continuing
    while (isProcessRunningByName("ColibriGrab.exe")) {
        Util.WaitForMilliseconds(1000);
    }

    Console.PrintLine(Util.SysUTCDate + " INFO: CameraStartup complete");
    ts.WriteLine(Util.SysUTCDate + " INFO: CameraStartup complete");
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
        Util.WaitForMilliseconds(2000);

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

        case 2:
        while (Dome.ShutterStatus == 2)
        {
            Console.PrintLine("*** Dome shutter is open...");
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

///////////////////////////////////////////
// Sends scope to a particular Alt and Az
// MJM
///////////////////////////////////////////
function gotoAltAz(alt, az)
{
    if (!isFiniteNum(alt) || !isFiniteNum(az))
    {
        Console.PrintLine("WARNING: refusing AltAz slew to non-finite coordinates alt=" + alt + " az=" + az);
        ts.WriteLine(Util.SysUTCDate + " WARNING: refusing AltAz slew to non-finite coordinates alt=" + alt + " az=" + az);
        return false;
    }

    breakme: if (ct.Elevation < elevationLimit)
    {
        Console.PrintLine("Tried to move to an unsafe elevation of " + ct.Elevation.toFixed(4));
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
    // Find the last line that contains at least two floats
    var lines = text.replace(/\r/g, "").split("\n");
    for (var i = lines.length - 1; i >= 0; i--) {
        var nums = lines[i].match(/-?\d+(?:\.\d+)?/g);
        if (nums && nums.length >= 2) {
            var raOff = parseFloat(nums[0]);
            var decOff = parseFloat(nums[1]);
            if (!isNaN(raOff) && !isNaN(decOff)) return { ra: raOff, dec: decOff };
        }
    }
    return null;
}

//////////////////////////////////////////////////////////////
// Run the Python scheduler (scheduler/run_scheduler.py) once at
// startup and return its raw stdout. Modeled on execAstrometry:
// shell out via WScript.Shell.Exec, poll p.Status, accumulate
// stdout, and enforce a timeout.
//
// Path assumption: RunColibri.js runs from ACPScripts/ but the
// scheduler repo lives under the user's GitHub checkout. We build
// an absolute path the same way colibriGrabPath is built at the
// top of this file (line ~218): %USERPROFILE%\Documents\GitHub\
// ColibriObservatory\scheduler\run_scheduler.py. If the repo is
// laid out differently on a given telescope, adjust this path.
//////////////////////////////////////////////////////////////

function getScheduleFromPython(sunsetJD, sunriseJD) {
    var sh = new ActiveXObject("WScript.Shell");
    var userProfile = sh.ExpandEnvironmentStrings("%USERPROFILE%");
    var scriptPath = userProfile +
        "\\Documents\\GitHub\\ColibriObservatory\\scheduler\\run_scheduler.py";

    var timeoutMs = 120000; // 2 minutes

    var cmd = 'cmd /c python -u "' + scriptPath + '"' +
              ' --sunset-jd ' + sunsetJD +
              ' --sunrise-jd ' + sunriseJD +
              ' --framerate 40 2>&1';

    var p = sh.Exec(cmd);
    var start = new Date().getTime();
    var out = "";

    while (p.Status === 0) {
        while (!p.StdOut.AtEndOfStream) out += p.StdOut.Read(1024);
        Util.WaitForMilliseconds(100);

        var elapsed = new Date().getTime() - start;
        if (elapsed > timeoutMs) {
            try { sh.Run("taskkill /PID " + p.ProcessID + " /T /F", 0, true); } catch (e) {}
            throw new Error("run_scheduler timed out after " + Math.floor(timeoutMs/1000) + "s");
        }
    }

    while (!p.StdOut.AtEndOfStream) out += p.StdOut.Read(1024);

    return out;
}

//////////////////////////////////////////////////////////////
// Parse the schedule block emitted by run_scheduler.py. The
// Python prints a delimited block:
//   === SCHEDULE BEGIN ===
//   name,ra_deg,dec_deg,start_jd,alt,az,ha,airmass,score,nstars
//   field5,254.789,-27.225,2460000.5,45.2,180.3,0.5,1.2,1234.5,800
//   ... one row per segment, time-ordered ...
//   === SCHEDULE END ===
// Returns an array of segment objects with named numeric fields.
//////////////////////////////////////////////////////////////

function parseSchedule(text) {
    var segs = [];
    var lines = text.replace(/\r/g, "").split("\n");

    var inBlock = false;
    var seenHeader = false;

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();

        if (line === "=== SCHEDULE BEGIN ===") {
            inBlock = true;
            seenHeader = false;
            continue;
        }
        if (line === "=== SCHEDULE END ===") {
            inBlock = false;
            continue;
        }
        if (!inBlock) continue;
        if (line === "") continue;

        // Skip the header row (first non-empty line inside the block)
        if (!seenHeader) {
            seenHeader = true;
            continue;
        }

        var cols = line.split(",");
        if (cols.length < 10) continue;

        if (!isValidRaDecDeg(parseFloat(cols[1]), parseFloat(cols[2]))) {
            Console.PrintLine("WARNING: dropping scheduler field '" + cols[0].trim() +
                "' with invalid coords RA=" + cols[1] + " Dec=" + cols[2]);
            continue;
        }

        segs.push({
            name:    cols[0].trim(),
            ra_deg:  parseFloat(cols[1]),
            dec_deg: parseFloat(cols[2]),
            start_jd: parseFloat(cols[3]),
            alt:     parseFloat(cols[4]),
            az:      parseFloat(cols[5]),
            ha:      parseFloat(cols[6]),
            airmass: parseFloat(cols[7]),
            score:   parseFloat(cols[8]),
            nstars:  parseInt(cols[9], 10)
        });
    }

    return segs;
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
        var cmd_ra_deg = cmd_ra_deg + LAMBDA * ra_offset;
        var cmd_dec    = cmd_dec    + LAMBDA * dec_offset;

        // RA wrap-around (modulo-safe)
        cmd_ra_deg = ((cmd_ra_deg % 360) + 360) % 360;

        // Update closest-position tracker
        if (current_sep < min_sep_deg) {
            min_sep_deg    = current_sep;
            closest_ra_deg = cmd_ra_deg;
            closest_dec    = cmd_dec;
        }

        // ---- Slew to corrected position ------------------------------------
        var cmd_ra_hours = cmd_ra_deg / 15;
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
    } else {
        // Max iterations reached or astrometry failed — slew to closest measured position
        var fallback_ra_hours = closest_ra_deg / 15;
        Console.PrintLine("Pointing did not converge. Best achieved: "
            + (min_sep_deg === Infinity ? "N/A" : (min_sep_deg * 3600).toFixed(1) + " arcsec")
            + ". Slewing to best position.");
        ts.WriteLine(Util.SysUTCDate + " WARNING: Pointing not converged. Slewing to best: "
            + (min_sep_deg === Infinity ? "N/A" : (min_sep_deg * 3600).toFixed(1) + " arcsec"));
        gotoRADec(fallback_ra_hours, closest_dec);
        while (Telescope.Slewing) {
            Util.WaitForMilliseconds(500);
        }
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
        if ((timeJD > finalFields[i][12]) && (timeJD < finalFields[i + 1][12]))
        {
            targetJD  = finalFields[i + 1][12];
            targetDur = finalFields[i + 1][12] - timeJD;
            targetLoops = Math.ceil(targetDur * 86400 / 0.025 / numExposures);
            currField = i;
            nextField = i + 1;
            targetRA = finalFields[i][2][0];
            targetDec =finalFields[i][2][1];
            fieldName = finalFields[i][3].toString();

            return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD];
        }
    }
    // Check final entry in finalFields list
    if ((timeJD > finalFields[finalFields.length - 1][12]) && (timeJD < sunrise))
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


// Field coordinates and the hardcoded fieldInfo star-count table have been
// removed: the observing plan now comes from the Python scheduler
// (scheduler/run_scheduler.py) via getScheduleFromPython(), which supplies
// Gaia-backed field centroids, scores, and star counts directly.


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

    finalFields = [];

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

        Console.PrintLine("========== All Skies Mode Enabled ===========");
        ts.WriteLine("========== All Skies Mode Enabled ===========");
        Util.WaitForMilliseconds(3000);
    }
    else
    {
        if (Util.Confirm("No weather server! Do you want to continue? "))
        {
            Console.PrintLine("You've chosen to proceed with no weather server.");
            ts.WriteLine(Util.SysUTCDate + " You've chosen to proceed with no weather server.");

            ignoreWeather = true;
            if (Util.Confirm("Please Confirm: Are you running the dome in simulation mode?"))
            {
                Console.PrintLine("========== Dome Simulator Mode Enabled ===========");
                ts.WriteLine("========== Dome Simulator Mode Enabled ===========");
            }
            else
            {
                if (Util.Confirm("Final Confirm: Are you really sure you want to proceed without weather or dome simulation mode? WARNING: Not recommended unless on-site."))
                {
                    Console.PrintLine("WARNING: You've chosen to proceed with no weather server or simulation mode activated.");
                    ts.WriteLine(Util.SysUTCDate + " WARNING: You've chosen to proceed with no weather server or simulation mode activated.");

                    Console.PrintLine("========== Testing Mode Enabled ===========");
                    ts.WriteLine("========== Testing Mode Enabled ===========");
                }
                else
                {
                    abort();
                }
            }
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

    // Build the observing plan by calling the Python scheduler once at
    // startup. It returns the full-night plan (already Moon-cut, altitude-
    // cut, and contiguous-field-collapsed); JS just maps each segment into
    // the existing finalFields row format consumed by whichField() and the
    // observing loop.
    Console.PrintLine("Requesting observation plan from Python scheduler...");
    ts.WriteLine(Util.SysUTCDate + " INFO: Requesting observation plan from Python scheduler...");

    var sched = "";
    try {
        sched = getScheduleFromPython(sunset, sunrise);
    } catch (e) {
        Console.PrintLine("ERROR: Python scheduler failed: " + e.message);
        ts.WriteLine(Util.SysUTCDate + " ERROR: Python scheduler failed: " + e.message);
        abort();
    }

    var segs = parseSchedule(sched);

    // Guard: do not proceed with an empty plan.
    if (segs.length === 0)
    {
        Console.PrintLine("ERROR: Python scheduler returned no segments. Raw output follows:");
        Console.PrintLine(sched);
        ts.WriteLine(Util.SysUTCDate + " ERROR: Python scheduler returned no segments.");
        ts.WriteLine(Util.SysUTCDate + " ERROR: Scheduler raw output: " + sched);
        abort();
    }

    Console.PrintLine("# of scheduled segments: " + segs.length);
    ts.WriteLine(Util.SysUTCDate + " INFO: # of scheduled segments: " + segs.length);

    // Build finalFields from the scheduler segments.
    // Row index map (matches the legacy fieldInfo / whichField contract):
    //   [0] alt, [1] az, [2] [ra_deg, dec_deg], [3] name, [4] moon angle (0;
    //   Moon cut already enforced in Python), [5] HA, [6] airmass, [7] 0,
    //   [8] 0, [9] 0, [10] nstars, [11] score, [12] start JD.
    // [13] (duration) is appended by the existing loop below.
    for (i = 0; i < segs.length; i++)
    {
        var seg = segs[i];
        finalFields.push([seg.alt, seg.az, [seg.ra_deg, seg.dec_deg], seg.name,
                          0, seg.ha, seg.airmass, 0, 0, 0,
                          seg.nstars, seg.score, seg.start_jd]);
    }


/*---------------------------Order & Print Plan------------------------------*/


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
            shutDown();
        }
        else if (currentField[2] < 0 && currentField[0] != -1)
        {
            Console.PrintLine("Negative loops remaining. Past last field. Closing up.");
            ts.WriteLine(Util.SysUTCDate + " INFO: Negative loops. Aborting script.");
            // abortAndRestart()
            shutDown();
        }

        // Monitor the weather status, if the weather script is active
        // TODO: Add Goto and all that stuff.
        if ((Weather.Available && Weather.safe) || (ignoreWeather == true))
        {   
            Console.PrintLine("Checking Weather");
            Console.PrintLine("Powering on the telescope...");
            setOutletState(0,true); //Power on the telescope
            Console.PrintLine("Telescope Powered on...");
            Util.WaitForMilliseconds(5000); //Wait 5 seconds for the mount to power on
            Console.PrintLine("Connecting Scope...");
            connectScope();
            Console.PrintLine("Scope connected.");
            Console.PrintLine("Opening Dome.");
            domeOpen();

            Console.PrintLine("Telescope Unparking.");
            Telescope.Unpark()
            Console.PrintLine("Telescope Unparked.");

            // Camera reset and start-up before imaging at start-up may ultimately unnecessary commenting this out to test.
            //setOutletState(1,false); // Turn off the camera
            //Util.WaitForMilliseconds(5000); // wait for 5 seconds
            //setOutletState(1,true); // Turn the camera on
            //Util.WaitForMilliseconds(5000); // wait for 5 seconds

            //resetFliPilot(ts); // This opens fli pilot, wait for 8 s and close it again
            //Util.WaitForMilliseconds(2000);
            //CameraStartup(); // This runs a camera test script that properly starts the frame acqusition process

            // Append the camera start up log file.
            //appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);
        }

        // Turn on sidereal telescope tracking
        trkOn();

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
        if (!gotoRADec(currentFieldCt.RightAscension, currentFieldCt.Declination))
        {
            Console.PrintLine("Skipping field '" + currentField[5] + "': slew refused (invalid coords or unsafe elevation). Waiting out this field's window.");
            ts.WriteLine(Util.SysUTCDate + " WARNING: Skipping field '" + currentField[5] + "': slew refused. Waiting until end of its window.");
            while (Util.SysJulianDate < endJD)
            {
                Util.WaitForMilliseconds(5000);
            }
            continue;
        }

        // Slave the dome to the telescope and wait until they are both in
        // the correct position to begin observing
        while (Telescope.Slewing == true)
        {
            Console.PrintLine("Huh. Dome still Slewing...");
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

        // Sanity check to see if the dome is still opening before proceeding---we don't want to image the inside of the dome.
        while (Dome.ShutterStatus == 2 || Dome.ShutterStatus != 0)
        {
            Console.PrintLine("*** Dome shutter is still opening...");
            Util.WaitForMilliseconds(2000);
        }

        Console.PrintLine("At target.");
        Console.PrintLine("Target Alt/Az is: Alt. =" + currentFieldCt.Elevation.toFixed(2) + "   Az.= " + currentFieldCt.Azimuth.toFixed(2));
        ts.WriteLine(Util.SysUTCDate + " INFO: At target.");
        ts.WriteLine(Util.SysUTCDate + " INFO: Target Alt/Az is: Alt. =" + currentFieldCt.Elevation.toFixed(2) + "   Az.= " + currentFieldCt.Azimuth.toFixed(2));

        // Readjust the telescope pointing using the external python script that calls local astrometry.net
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

                // Readjust the telescope pointing using child script
                adjustPointing(currentFieldCt.RightAscension, currentFieldCt.Declination);

                while (Telescope.Slewing == true)
                {
                    Console.PrintLine("Huh. Still Slewing...");
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
            var command = "\"" + colibriGrabPath + "\" -n " + numExposures.toString() + " -p " + currentField[5].toString() + "_25ms-" + pierside + " -e 25 -t -10 -f normal -l 0 -w D:\\ColibriData\\" + today.toString()
            
            Console.PrintLine(Util.SysUTCDate + 'Executing command: ' + command);
            ts.WriteLine(Util.SysUTCDate + " INFO: Executing command: " + command); // Write the command to the log file
    
            // Run ColibriGrab.exe
            wsh.Run(command, 1, true);

            Util.WaitForMilliseconds(50);

            // Append and delete ColibriGrab log to ACP log after each run
            appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);
            Console.PrintLine("Done exposing run # " + runCounter.toString());
            ts.WriteLine(Util.SysUTCDate + " INFO: Done exposing run # " + runCounter.toString()); // Log completion of each run

            runCounter++;
        }
    }
    Console.PrintLine("Finished all observations for the night. Turning off equipment.");
    ts.WriteLine("Finished all observations for the night. Turning off equipment.");
    shutDown();       
}

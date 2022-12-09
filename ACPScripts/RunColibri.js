//tabs=4
//------------------------------------------------------------------------------
//
// Script:      GrabStream.js
// Authors:     Ridhee Gupta, Mike Mazur <mjmazur@gmail.com>
// Version:     0.1.0
// Requires:    ACP 7.1 or later (PinPoint 6 or later)
//              Windows Script 5.6 or later
//
// Environment: This script is written to run under the ACP scripting
//              console. 
//
// Description: Grabs a stream of images from Kepler 4040 camera running over
//              fibre. Uses external program called ColibriGrab.
//
// Revision History:
//
// Date      Who    Description
// --------- ---    --------------------------------------------------
// 15/04/20  mjm    Creation of script. Basic functions (trkOff, trkOn, domeOpen,
//					domeClose, domeHome, getRADEC)
// ???-???   rg 	Nautical twilight, field determination, moon offset
//					Functions: gotoRADec, gotoAltAz, biasCollection
// ??/??/??  mjm 	Running aa.exe and extracting output, add String.prototype.trim
// 02/04/21  mjm    Auto directory creation and file naming
// 24/06/21  mjm 	Added abort() function
// 14/07/21  mjm    Added new moon check
// 09/11/21  mjm    Added code to grab biases every n minutes
// 11/11/21  mjm    Cleaned up print statements and checked for proper field selection
// 03/03/22  mjm    So much... Added dome/telescope slave/slewing checks, added catch
//                  for only one 'finalField', added delays to try to prevent camera from
//                  being killed early
//                  Created connectScope() function
// 31/10/22 mjm     Added free space check

var SUP;

String.prototype.trim = function()
{
    return this.replace(/(^\s*)|(\s*$)/g, "");
}

/////////////////////
// Aborts script
// MJM - 2021-06-24
/////////////////////
function abort(){
    Console.PrintLine("Aborting script!");
    shutDown();
    while (Dome.ShutterStatus != 1 || Telescope.AtPark != True)
    {
        Util.WaitForMilliseconds(5000)
        Console.PrintLine("Waiting 5 seconds for shutter to close and telescope to park...")
    }
    Util.AbortScript();
    // WScript.Quit
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

////////////////////////////////////////////////////
// Does the dirty work of collecting bias data.
// RG
// MJM - Added naming of directory to today's date
////////////////////////////////////////////////////
function biasCollection(today) {
    var tid;
    // var today = getDate();
    // Console.Printline(today.toString());

    Console.PrintLine("Starting bias frame collection...");
    Console.Printline("d:\\ColibriData\\" + today.toString() + "\\Bias");

    tid = Util.ShellExec("ColibriGrab.exe", "-n 50 -p Bias_25ms -e 0 -t 0 -f bias -w D:\\ColibriData\\" + today.toString() + "\\Bias");
    while (Util.IsTaskActive(tid))
    {
        Util.WaitForMilliseconds(500)
        // Console.PrintLine("Collecting bias frames...")
    }

    // Util.ShellExec("taskkill.exe", "/im ColibriGrab.exe /t /f");
    Util.WaitForMilliseconds(100)
    Console.PrintLine("Finished collecting bias frames...");
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
        Telescope.Connected = "True"
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
            Console.PrintLine("--> Dome is NOT open.");
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

        /////////////////////////////////////////////////////
        // Dome is closing. Let it close and then open it. //
        /////////////////////////////////////////////////////
        case 3:
        while (Dome.ShutterStatus ==3)
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
        break;
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

        // Houston, we have a problem.
        case 4:
        Console.PrintLine("There was a problem with the shutter control...")
        break;
    }

    // Home the dome if not already done.
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
	var d, s, month, day;
	
	d = new Date();
	s = d.getUTCFullYear();
	
	month = (d.getUTCMonth()+1).toString()
	day   = (d.getUTCDate()).toString()

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
	return(s)
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

    return ct
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

    return {ra: ras, dec: des};
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
    Console.Printline("RA in gotoRADec function " + ra.toFixed(4));
    Console.Printline("Dec in gotoRADec function " + dec);
    Console.Printline("Elevation of field " + ct.Elevation.toFixed(4));

    targetCt = Util.NewCThereAndNow()
    targetCt.RightAscension = ra
    targetCt.Declination = dec

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
        Console.Printline("Slewing to declination " + dec + " and right ascension " + ra.toFixed(4));
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
}

/////////////////////////////////////////////////////
// Returns JD of sunrise and sunset for current day
// See: https://en.wikipedia.org/wiki/Sunrise_equation
// MJM - 2021/06
/////////////////////////////////////////////////////
function twilightTimes(jDate) // Returns astronomical twilight end (sunrise) and start (sunset) times as JD
{
	lat = Telescope.SiteLatitude
	lon = Telescope.SiteLongitude
	n = Math.floor(jDate - 2451545.0 + 0.0008)
	Jstar = n - (lon/360.0)
	M = (357.5291 + 0.98560028 * Jstar) % 360
	C = 1.9148*Math.sin(Util.Degrees_Radians(M)) + 0.02*Math.sin(2*Util.Degrees_Radians(M)) + 0.0003*Math.sin(3*Util.Degrees_Radians(M))
	lam = (M + C + 180 + 102.9372) % 360
	Jtransit = 2451545.0 + Jstar + 0.0053*Math.sin(Util.Degrees_Radians(M)) - 0.0069*Math.sin(2*Util.Degrees_Radians(lam))
	sindec = Math.sin(Util.Degrees_Radians(lam)) * Math.sin(Util.Degrees_Radians(23.44))
	cosHA = (Math.sin(Util.Degrees_Radians(-12)) - (Math.sin(Util.Degrees_Radians(lat))*sindec)) / (Math.cos(Util.Degrees_Radians(lat))*Math.cos(Math.asin(sindec)))
	Jrise = Jtransit - (Util.Radians_Degrees(Math.acos(cosHA)))/360
	Jset = Jtransit + (Util.Radians_Degrees(Math.acos(cosHA)))/360

	return [Jrise, Jset]
}

////////////////////////////////////////
// Causes program to wait until sunset
// MJM - 2021/06/24
////////////////////////////////////////
function waitUntilSunset(updatetime)
{
	var currentJD = Util.SysJulianDate
	while (currentJD - times[1] < 0)
	{
		Console.Clear()
		if (currentJD > times[0] && currentJD < times[1])
		{
			Console.PrintLine("Sun is up")
			Console.PrintLine("It has been up for " + Util.Hours_HMS((currentJD - times[0])*24,"h ","m ","s"))
			Console.PrintLine("It will set in " + Util.Hours_HMS(-1*(currentJD - times[1])*24,"h ","m ","s"))
			Console.PrintLine("Waiting " + -1*(currentJD - times[1])*24 + " hours to start operations.")
			Util.WaitForMilliseconds(updatetime)
			currentJD = Util.SysJulianDate
		}
	}
}

function sortFields(fieldtosort)
{
    // Sort available fields based on # of stars fieldInfo[i][10] 
    sortedFields = []
    sortedFields = fieldtosort.sort(function(a,b) {return b[10] - a[10]})

    // Console.PrintLine(" ")
    // Console.PrintLine("=== Sorted Fields ===")
    // for (i=0; i< sortedFields.length; i++)
    // {
    //     Console.PrintLine(sortedFields[i][3] + "  Az: " + sortedFields[i][1].toFixed(2)
    //         + "  Alt: " + sortedFields[i][0].toFixed(2) + "  HA: " + sortedFields[i][5].toFixed(3)
    //         + "  Airmass: " + sortedFields[i][6].toFixed(3) + "  # stars: " + sortedFields[i][10])
    // }
    // Console.PrintLine(" ")

    return sortedFields
}

function whichField(time)
{
    // ts.WriteLine(Util.SysUTCDate + " Time:" + Util.NowLST() + " " + time)
    nextField = 0
    // Console.PrintLine(finalFields)
    // currField = 0
    // targetDur = finalFields[0][12]-time
    Console.PrintLine(finalFields.length)
    if (finalFields.length == 2)
    {
        Console.PrintLine("Only one field to observe!")
        ts.WriteLine(Util.SysUTCDate + " INFO: (whichField) Only one field to observe!")
        
        targetLST = finalFields[1][12]
        targetDur = finalFields[1][12] - time
        targetLoops = Math.ceil(targetDur*3600 / 0.025 / numExposures)
        currField = 1
        nextField = -999

        targetRA = finalFields[0][2][0]
        targetDec = finalFields[0][2][1]
        fieldName = finalFields[0][3].toString()

        Console.PrintLine(targetLST)
        Console.PrintLine("Number of loops: " + targetLoops)
        Console.PrintLine("Target duration: " + targetDur)

        Console.PrintLine("finalFields: " + finalFields[0][12])
        Console.PrintLine("finalFields: " + finalFields[1][12])

        Console.PrintLine("LST: " + currentLST)
        Console.PrintLine("target LST: " + targetLST)

        // if (currentLST < finalFields[0][12])
        // {
        //     Console.PrintLine("\r\n  Earlier than first observation time.")
        //     Console.PrintLine("************************************")
        //     targetLST = finalFields[0][12]
        //     // In this case, targetDur is the time to wait as a negative number
        //     targetDur = time - finalFields[0][12]
        //     // targetDur = finalFields[1][12] - finalFields[0][12]
        //     targetLoops = Math.ceil(targetDur*3600 / 0.025 / numExposures)
        //     targetRA = finalFields[0][2][0]
        //     targetDec =finalFields[0][2][1]

        //     Console.PrintLine("\r\nThe LST start time is " + targetLST.toFixed(4))
        //     Console.PrintLine("We'll run for " + targetLoops + " loops of " + numExposures + " exposures.")
        //     Console.PrintLine("Which means that we're on target for " + targetDur.toFixed(3) + " hours.")

        //     // Console.PrintLine(time)
        //     // Console.PrintLine(finalFields[finalFields.length-2][12])
        //     // Console.PrintLine(finalFields[finalFields.length-1][12])

        //     currField = -1
        //     nextField = 0
        //     fieldName = "TooEarly"
        // }
    }

    for (i=0; i<finalFields.length/2-1; i++)
    {
        if (time > finalFields[i*2][12] & time < finalFields[i*2+2][12])
        {
            targetLST = finalFields[i+2][12]
            targetDur = finalFields[i+2][12] - time
            targetLoops = Math.ceil(targetDur*3600 / 0.025 / numExposures)
            currField = i*2
            nextField = i*2+2
            targetRA = finalFields[i*2][2][0]
            targetDec =finalFields[i*2][2][1]
            fieldName = finalFields[i*2][3].toString()

            ts.WriteLine(Util.SysUTCDate + " INFO: Target LST = " + targetLST + " Target Dur. = " + targetDur + " Target Loops: " + targetLoops + " Field Name: " + fieldName)

            // Console.PrintLine(targetLST)
            // Console.PrintLine(targetLoops)
            // Console.PrintLine(targetDur)

            break
        }
        else if (currentLST < finalFields[0][12])
        {
            Console.PrintLine("\r\n  Earlier than first observation time.")
            Console.PrintLine("************************************")
            targetLST = finalFields[0][12]
            // In this case, targetDur is the time to wait as a negative number
            targetDur = time - finalFields[0][12]
            // targetDur = finalFields[1][12] - finalFields[0][12]
            targetLoops = Math.ceil(targetDur*3600 / 0.025 / numExposures)
            targetRA = finalFields[0][2][0]
            targetDec =finalFields[0][2][1]

            Console.PrintLine("\r\nThe LST start time is " + targetLST.toFixed(4))
            Console.PrintLine("We'll run for " + targetLoops + " loops of " + numExposures + " exposures.")
            Console.PrintLine("Which means that we're on target for " + targetDur.toFixed(3) + " hours.")

            // Console.PrintLine(time)
            // Console.PrintLine(finalFields[finalFields.length-2][12])
            // Console.PrintLine(finalFields[finalFields.length-1][12])

            currField = -1
            nextField = 0
            fieldName = "TooEarly"
            break
        }
        else if (time > finalFields[finalFields.length-2][12] & time < finalFields[finalFields.length-1][12])
        {
            Console.PrintLine("Between last two times")
            targetLST = finalFields[finalFields.length-1][12]
            targetDur = finalFields[finalFields.length-1][12] - time
            targetLoops = Math.ceil(targetDur*3600 / 0.025 / numExposures)
            currField = finalFields.length-2
            nextField = finalFields.length-1
            targetRA = finalFields[finalFields.length-2][2][0]
            targetDec = finalFields[finalFields.length-2][2][1]
            fieldName = finalFields[finalFields.length-2][3].toString()
            ts.WriteLine(Util.SysUTCDate + " INFO: Between last two times")

            // Console.PrintLine(time)
            // Console.PrintLine(finalFields[finalFields.length-2][12])
            // Console.PrintLine(finalFields[finalFields.length-1][12])
            // Console.PrintLine(targetLST)
            // Console.PrintLine(targetLoops)
            // Console.PrintLine(targetDur)

            
            break
        }
        else if (time > finalFields[finalFields.length-1][12])
        {
            // Console.PrintLine(time)
            // Console.PrintLine(finalFields[finalFields.length-1][12])
            Console.PrintLine("After last time.")
            targetLST = 999
            targetDur = 999
            targetLoops = 0
            currField = 999
            nextField = 999
            targetRA = 0
            targetDec = 0
            fieldName = "TooLate"

            ts.WriteLine(Util.SysUTCDate + " WARNING: After last time. Closing up shop.")
            Telescope.Park()
            trkOff()
            domeClose()
            return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetLST]
        }
    }

    return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetLST]
}

///////////////////////////////////////////////////////////////////////////////////
//
// EEEE N   N DDD	   OO  FFFF   FFFF U   U N   N  CC  TTTTT I  OO  N   N  SSS
// E    NN  N D  D    O  O F      F    U   U NN  N C  C   T   I O  O NN  N S
// EEE  N N N D   D   O  O FFF    FFF  U   U N N N C      T   I O  O N N N  SS
// E    N  NN D  D    O  O F      F    U   U N  NN C  C   T   I O  O N  NN    S
// EEEE N   N DDD      OO  F      F     UUU  N   N  CC    T   I  OO  N   N SSS 
//
///////////////////////////////////////////////////////////////////////////////////

var fso, f1, ts;
var Mode = 8;

var curTarget = null;
var elevationLimit = 10;
var minMoonOffset = 15;

var numExposures = 2400;

var slewAttempt = 0;

var field1 = [273.735, -18.638]; // June/July
var field2 = [288.355, -7.992];
var field3 = [87.510, 20.819];
var field4 = [103.263, 24.329]; // January
var field5 = [129.869, 19.474]; // February
var field6 = [254.846, -27.353];
var field7 = [56.684, 24.313]; // August
var field12 = [318.657, -13.830]; // December
var field13 = [222.785, -11.810]; // May
var field14 = [334.741, -12.383]; // September
var field15 = [39.791, 16.953]; // November
var field16 = [8.974, 1.834]; // October
var field18 = [142.138, 12.533]; // March
var field19 = [206.512, -10.259]; // April
var field24 = [167.269, 2.203];

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
fieldInfo = [
    [0, 0, field1, "field1", 0, 0, 1.0, 3900, 0.0009, 1.176, 3900, 0, 0],
    [0, 0, field2, "field2", 0, 0, 1.0, 1268, 0.0005, 1.0, 1268, 0, 0],
    [0, 0, field3, "field3", 0, 0, 1.0, 918, 0.0005, 1.0, 918, 0, 0],
    [0, 0, field4, "field4", 0, 0, 1.0, 560, 0.0005, 1.0951, 560, 0, 0],
    [0, 0, field5, "field5", 0, 0, 1.0, 321, 0.2717, 0.5509, 321, 0, 0],
    [0, 0, field6, "field6", 0, 0, 1.0, 1455, 0.0005, 1.0, 1455, 0, 0],
    [0, 0, field7, "field7", 0, 0, 1.0, 304, 0.3736, 0.533, 304, 0, 0],
    [0, 0, field12, "field12", 0, 0, 1.0, 119, 0.001, 0.9228, 119, 0, 0],
    [0, 0, field13, "field13", 0, 0, 1.0, 113, 0.0036, 0.8133, 113, 0, 0],
    [0, 0, field14, "field14", 0, 0, 1.0, 179, 0.0003, 1.0127, 179, 0, 0],
    [0, 0, field15, "field15", 0, 0, 1.0, 167, 0.0002, 1.0816, 167, 0, 0],
    [0, 0, field16, "field16", 0, 0, 1.0, 113, 0.00008, 1.1247, 113, 0, 0],
    [0, 0, field18, "field18", 0, 0, 1.0, 232, 0.0009, 0.966, 232, 0, 0],
    [0, 0, field19, "field19", 0, 0, 1.0, 131, 0.0014, 0.909, 131, 0, 0],
    [0, 0, field24, "field24", 0, 0, 1.0, 158, 0.0005, 1.0, 158, 0, 0]
];

currentDate = getDate()

LogFile = "d:\\Logs\\ACP\\" + getDate() + "-ACP.log";
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

// visibleFields =[]
// for (i=0; i<fieldInfo.length; i++)
// {
//     if (fieldInfo)
// }

var pierside = "E"

function main()
{

    times = twilightTimes(Util.SysJulianDate)
    darkhours = (times[1]-times[0])*24
    spaceneeded = darkhours*3600*40*12600000/1000000000000
    freespace = freeDiskSpace()

    if (freespace > spaceneeded)
    {
        Console.PrintLine("We need " + spaceneeded + " TB of space to run tonight.")
        Console.PrintLine("And we have " + freespace + " TB of free space available.")
        Console.PrintLine("So, we're good to go!")
    }
    else
    {
        if (Util.Confirm("You need to free up " + (spaceneeded - freespace) +" TB of space. If you run out of space while this script is running, RunColibri will crash when d: is full. This will potentially damage the telescope! Do you want to continue anyway?"))
        {
            ts.WriteLine(Util.SysUTCDate + " WARNING: You chose to continue operations without enough disk space. RunColibri will likely crash when you run out of space on d:.")

        }
        else
            abort()
    }

	// Check to see if the weather server is connected. If it isn't ask for permission to continue.
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
			Console.PrintLine("Ok, you've chosen to proceed with no weather server. 8-O")
            ts.WriteLine(Util.SysUTCDate + " WARNING: No weather server. You've chosen to proceed without. 8-O")
            ignoreWeather = true
			Util.WaitForMilliseconds(3000)
		}
		else
			abort()
	}

	// Run function to wait until sunset before starting operations
	// waitUntilSunset(2000); // Variable is time (in ms) between updates

    if (Weather.Available && !Weather.safe)
    {
        ts.WriteLine(Util.SysUTCDate + " INFO: Weather unsafe! Waiting until it's looking a bit better out.")
    }

	while (Weather.Available && !Weather.safe)
	{
        if (getDate() != currentDate)
        {
            currentDate = getDate()
            LogFile = "d:\\Logs\\ACP\\" + getDate() + "-ACP.log"

            if (fso.FileExists(LogFile))
            {
                Console.PrintLine(Util.SysUTCDate + " INFO: Log file exists. Appending to existing log file.");
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
		Console.PrintLine("Unsafe weather conditions. Waiting for 5 minutes.")
		// abort()
        Util.WaitForMilliseconds(300000)
	}

    if (getDate() != currentDate)
    {
        currentDate = getDate()
        LogFile = "d:\\Logs\\ACP\\" + getDate() + "-ACP.log"

        if (fso.FileExists(LogFile))
        {
            Console.PrintLine("Log file exists. Appending to existing log file.");
        }
        else
        {
            fso.CreateTextFile(LogFile);
        }

        f1 = fso.GetFile(LogFile);
        if (fso.FileExists(LogFile)){
            Console.PrintLine("Log file exists. Appending to existing log file.");

        }
        else
        {
            ts = f1.OpenAsTextStream(Mode, true);
        }
        

        // Console.Logging = false
        // Console.Logfile = "d:\\Logs\\ACP\\" + getDate() + "-ACP.log"
        // Console.Logging = true
    }

	// Create directory for tonight's data and collect bias frames
	if (firstRun = 1)
    {
        var today = getDate(); // Today's UTC date to be used to define data directory
        // Console.Logging = false
        // Console.Logfile = "d:\\Logs\\ACP\\" + getDate() + "-ACP.log"
        // Console.Logging = true
        Util.ShellExec("cmd.exe", "/c mkdir -p d:\\ColibriData\\" + today.toString() + "\\Bias")
        Console.PrintLine("Created today's data directory at d:\\ColibriData\\" + today.toString())
        ts.WriteLine(Util.SysUTCDate + " INFO: Created today's data directory at d:\\ColibriData\\" + today.toString())
        //Console.PrintLine("Collecting bias frames...")
        biasCollection(today)
        firstRun = 0
    }

    // Get today's time of nautical sunrise and sunset.
    times = twilightTimes(Util.SysJulianDate); // [0] - JD of sunrise, [1] - JD of sunset
    Console.PrintLine("Sunrise GMST: " + Util.Julian_GMST(times[0]))
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunrise GMST: " + Util.Julian_GMST(times[0]))
    Console.PrintLine("Sunset GMST: " + Util.Julian_GMST(times[1]))
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunset GMST: " + Util.Julian_GMST(times[1]))
    Console.PrintLine("Sunrise UTC: " + Util.Julian_Date(times[0]))
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunrise UTC: " + Util.Julian_Date(times[0]))
    Console.PrintLine("Sunset UTC: " + Util.Julian_Date(times[1]))
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunset UTC: " + Util.Julian_Date(times[1]))
    Console.PrintLine("Current LST: " + Util.NowLST())
    ts.WriteLine(Util.SysUTCDate + " INFO: Current LST: " + Util.NowLST())
    Console.PrintLine("Current GMST: " + Util.Julian_GMST(Util.SysJulianDate))
    ts.WriteLine(Util.SysUTCDate + " INFO: Current GMST: " + Util.Julian_GMST(Util.SysJulianDate))

    // Length of night
    timesTomorrow = twilightTimes(Util.SysJulianDate+1)
    Console.PrintLine("Length of night: " + (timesTomorrow[0]-times[1]).toFixed(4)*24 + " hours")
    ts.WriteLine(Util.SysUTCDate + " INFO: Length of night: " + (timesTomorrow[0]-times[1]).toFixed(4)*24 + " hours")
    Console.PrintLine(" ")

    // Where is the moon? Calculate field-moon angle for each field.
    moonAngles = []
    

    moonct = getMoon()

    for (i=0; i<fieldInfo.length; i++)
    {
        b = (90-fieldInfo[i][2][1])*Math.PI/180
        c = (90-moonct.Declination)*Math.PI/180
        aa = Math.abs(fieldInfo[i][2][0]-moonct.RightAscension)*Math.PI/180
        moonAngle = [Math.acos((Math.cos(b)*Math.cos(c)) + (Math.sin(b)*Math.sin(c)*Math.cos(aa)))*180/Math.PI]
        moonAngles.push(moonAngle)
        fieldInfo[i][4] = moonAngle
    }

    // Ideally we would run the following code many times to create a 
    // table of best fields in 10 minute intervals.
    
    // Console.PrintLine("Sunrise GMST: " + Util.Julian_GMST(times[0]))
    // Console.PrintLine("Sunset GMST: " + Util.Julian_GMST(times[1]))
    // Console.PrintLine("Sunrise UTC: " + Util.Julian_Date(times[0]))
    // Console.PrintLine("Sunset UTC: " + Util.Julian_Date(times[1]))
    // Console.PrintLine("Current LST: " + Util.NowLST())
    // Console.PrintLine("Current GMST: " + Util.Julian_GMST(Util.SysJulianDate))
    // Console.PrintLine(" ")

    fieldsToObserve = [] // Array containing best field info in 6 minute increments


    // Elevation [0], Azimuth [1], field [2], field name [3], moon angle [4], HA [5], airmass [6],
    // # of M13 stars [7], a [8], b [9], # of stars visible [10], rank [11], LST [12]
    
    // timesTomorrow contains tomorrow's sunrise (timesTomorrow[0]) and sunset (timesTomorrow[1])
    // times. n is the number of samples in 6 minute intervals that will be computed.
    n = Math.round((timesTomorrow[0]-Util.SysJulianDate).toFixed(2)*24*10)
    Console.PrintLine("# of samples: " + n)

    // startLST = Util.NowLST()
    // times[1] is today's sunset time
    startLST = Util.NowLST() + (times[1]-Util.SysJulianDate)*24

    for (k=0; k<n; k++)
    {
        // Assume that the moon angle is constant throughout the night
        // In reality, it will move about 0.5 deg per hour
        // aa.exe doesn't allow time input from command line, so we'll
        // fix this later

        // Create a new coordinate transform
        ct = Util.NewCT(Telescope.SiteLatitude, startLST+k*0.1)

        // Start a loop to calculate approximate number of stars in fields
        for (j=0; j < fieldInfo.length; j++)
        {
            // Set RA and DEC to field 'j' coordinates   
            ct.RightAscension = fieldInfo[j][2][0] / 15;
            ct.Declination = parseFloat(fieldInfo[j][2][1]);

            lat = ct.Latitude
            alt = ct.Elevation
            LST = ct.SiderealTime

            // Set fieldInfo fields for elevation and azimuth
            fieldInfo[j][0] = ct.Elevation
            fieldInfo[j][1] = ct.Azimuth
            fieldInfo[j][12] = LST

            // Calculate approx. # of stars in field using airmass/extinction
            // Know limiting magnitude at zenith (say 12 in 25 ms)
            // Know # of stars at M12 in each field
            // Calculate extinction at current airmass
            // With this new magnitude calculate approx. # of stars

            airmass = 1 / Math.cos((90-alt)*Math.PI/180)
            fieldInfo[j][6] = airmass
            extinction = (airmass-1) * 0.4
            magnitudeLimit = 12

            if (airmass > 0)
            {
                numVisibleStars = parseInt(fieldInfo[j][8] * Math.exp(fieldInfo[j][9]*(magnitudeLimit-extinction)))
                // Console.PrintLine("Airmass: " + airmass)
                // Console.PrintLine("Number of visible M" + (magnitudeLimit-extinction).toPrecision(3) + " stars: " + numVisibleStars)
                fieldInfo[j][10] = numVisibleStars
            }

            RA = ct.RightAscension
            HA = LST - RA
            fieldInfo[j][5] = HA
        }

        // Create goodFields array to hold fields that are above the horizon
        // and far enough from the moon
        goodFields = []

        for (j=0; j < fieldInfo.length; j++)
        {
            if (fieldInfo[j][0] > elevationLimit && moonAngles[j] > minMoonOffset)
            {
                goodFields.push([fieldInfo[j][0],fieldInfo[j][1],fieldInfo[j][2],fieldInfo[j][3],fieldInfo[j][4],fieldInfo[j][5],fieldInfo[j][6],fieldInfo[j][7],fieldInfo[j][8],fieldInfo[j][9],fieldInfo[j][10],fieldInfo[j][11],fieldInfo[j][12]])
            }
        }

        sortFields(goodFields)

        fieldsToObserve.push([sortedFields[0][0],sortedFields[0][1],sortedFields[0][2],sortedFields[0][3],sortedFields[0][4],sortedFields[0][5],sortedFields[0][6],sortedFields[0][7],sortedFields[0][8],sortedFields[0][9],sortedFields[0][10],sortedFields[0][11],sortedFields[0][12]])
    }

    // for (k=0; k < fieldsToObserve.length; k++)
    // {
    //     ts.WriteLine(fieldsToObserve[k])
    // }

    m = fieldsToObserve.length
    
    finalFields = []
    
    finalFields.push([fieldsToObserve[0][0],fieldsToObserve[0][1],fieldsToObserve[0][2],fieldsToObserve[0][3],fieldsToObserve[0][4],fieldsToObserve[0][5],fieldsToObserve[0][6],fieldsToObserve[0][7],fieldsToObserve[0][8],fieldsToObserve[0][9],fieldsToObserve[0][10],fieldsToObserve[0][11],fieldsToObserve[0][12]])
    for (i=0; i<fieldsToObserve.length-1; i++)
    {
        if (fieldsToObserve[i][3] != fieldsToObserve[i+1][3])
        {
            finalFields.push([fieldsToObserve[i][0],fieldsToObserve[i][1],fieldsToObserve[i][2],fieldsToObserve[i][3],fieldsToObserve[i][4],fieldsToObserve[i][5],fieldsToObserve[i][6],fieldsToObserve[i][7],fieldsToObserve[i][8],fieldsToObserve[i][9],fieldsToObserve[i][10],fieldsToObserve[i][11],fieldsToObserve[i][12]])
            finalFields.push([fieldsToObserve[i+1][0],fieldsToObserve[i+1][1],fieldsToObserve[i+1][2],fieldsToObserve[i+1][3],fieldsToObserve[i+1][4],fieldsToObserve[i+1][5],fieldsToObserve[i+1][6],fieldsToObserve[i+1][7],fieldsToObserve[i+1][8],fieldsToObserve[i+1][9],fieldsToObserve[i+1][10],fieldsToObserve[i+1][11],fieldsToObserve[i+1][12]])
            // Console.PrintLine(i.toString())
        }
    }
    
    finalFields.push([fieldsToObserve[fieldsToObserve.length-1][0],fieldsToObserve[fieldsToObserve.length-1][1],fieldsToObserve[fieldsToObserve.length-1][2],fieldsToObserve[fieldsToObserve.length-1][3],fieldsToObserve[fieldsToObserve.length-1][4],fieldsToObserve[fieldsToObserve.length-1][5],fieldsToObserve[fieldsToObserve.length-1][6],fieldsToObserve[fieldsToObserve.length-1][7],fieldsToObserve[fieldsToObserve.length-1][8],fieldsToObserve[fieldsToObserve.length-1][9],fieldsToObserve[fieldsToObserve.length-1][10],fieldsToObserve[fieldsToObserve.length-1][11],fieldsToObserve[fieldsToObserve.length-1][12]])

    for (i=0; i<finalFields.length/2; i++)
    {
        finalFields[i*2].push(finalFields[i*2+1][12]-finalFields[i*2][12])
        finalFields[i*2+1].push(finalFields[i*2+1][12]-finalFields[i*2][12])
    }

    for (i=0; i<finalFields.length; i++)
    {
     if (finalFields[i][12] >= 24.0)
     {
        finalFields[i].push(finalFields[i][12]-24.0,1)
     }
     else
     {
        finalFields[i].push(finalFields[i][12],0)
     }
     Console.PrintLine("Yay " + finalFields[i])
    }

    // for (i=0; i<finalFields.length; i++)
    // {
    //     Console.PrintLine(finalFields[i])
    // }

    // ts.WriteLine(Util.SysUTCDate + " === finalFields ===")

    // for (k=0; k < finalFields.length; k++)
    // {
    //     ts.WriteLine(Util.SysUTCDate +  " " + finalFields[k])
    // }

    Console.PrintLine("")
    // ts.WriteBlankLines(1)
    Console.PrintLine("=== Final Field Short List ===")
    ts.WriteLine(Util.SysUTCDate + " INFO: === Final Field Short List ===")

    for (i=0; i<finalFields.length-1; i++)
    {
        Console.PrintLine(finalFields[i][3] + " starts " + finalFields[i][12].toFixed(3) + " ends " + finalFields[i+1][12].toFixed(3) + " for " + finalFields[i][13].toFixed(3) + " hours")
        Console.PrintLine("     with " + finalFields[i][10].toString() + " visible stars")
        ts.WriteLine(Util.SysUTCDate + " INFO: " + finalFields[i][3] + " starts " + finalFields[i][12].toFixed(3) + " ends " + finalFields[i+1][12].toFixed(3) + " for " + finalFields[i][13].toFixed(3) + " hours with " + finalFields[i][10].toString() + " visible stars")
    }
        // Console.PrintLine(finalFields[i][3] + " Alt:" + finalFields[i][0].toFixed(2) + " Az:" + finalFields[i][1].toFixed(2) + " Num *:" + finalFields[i][10] + " starting at " + finalFields[i][12].toFixed(3) + " for " + finalFields[i][13].toFixed(3) + " hours")
    
    ts.WriteLine(Util.SysUTCDate + " INFO: === Final Field Coordinates ===")
    for (i=0; i<finalFields.length-1; i++)
    {
        ts.WriteLine(Util.SysUTCDate + "Field: " + finalFields[i][3] + "  Elev: " + finalFields[i][0] + "  Az: " + finalFields[i][1])
    }

    // Loop through final field list to find first target
    // Calculate time to run as target end time minus current LST
    // Number of loops = Math.ceil(targetDur*3600 / 0.025 / 2400)
    
    // Elevation [0], Azimuth [1], field [2], field name [3], moon angle [4], HA [5], airmass [6],
    // # of M13 stars [7], a [8], b [9], # of stars visible [10], rank [11], LST [12]
    
    // currentField [0] = field index for finalFields, [1] = time until end of field, [2] = number of loops
    runNum = 0
    currentField = [0,0,0,0,0,"None"]

    while (currentField[0] > -1 & currentField[0] < 999)
    {    //
        currentLST = Util.NowLST()
        currentField = whichField(currentLST)
        Console.PrintLine("Current field: " + currentField)
        // endLST = currentLST + currentField[1]
        endLST = currentField[6]

        // whichField returns [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetLST]
        Console.PrintLine("")
        ts.WriteLine(Util.SysUTCDate + " INFO: Field Info")
        Console.PrintLine("Field index: " + currentField[0])
        ts.WriteLine(Util.SysUTCDate + " INFO: Field index: " + currentField[0])
        Console.PrintLine("Time until end of field: " + currentField[1])
        ts.WriteLine(Util.SysUTCDate + " INFO: Time until end of field: " + currentField[1])
        Console.PrintLine("Number of loops: " + currentField[2])
        ts.WriteLine(Util.SysUTCDate + " INFO: Number of loops: " + currentField[2])
        Console.PrintLine("Field RA: " + currentField[3])
        ts.WriteLine(Util.SysUTCDate + " INFO: Field RA: " + currentField[3])
        Console.PrintLine("Field Dec: " + currentField[4])
        ts.WriteLine(Util.SysUTCDate + " INFO: Field Dec: " + currentField[4])
        Console.PrintLine("Field Name: " + currentField[5])
        ts.WriteLine(Util.SysUTCDate + " INFO: Field Name: " + currentField[5])

        if (currentField[0] == -1)
        {
            Console.PrintLine("")
            Console.PrintLine("Yup, it's too early. Waiting for " + (-1*currentField[1]*3600).toFixed(0) + " seconds.")
            ts.WriteLine(Util.SysUTCDate + " INFO: It's too early. Waiting for " + (-1*currentField[1]*3600).toFixed(0) + " seconds.")
            while (currentField[0] == -1)
            {
                Util.WaitForMilliseconds(5000)
                currentLST = Util.NowLST()
                currentField = whichField(currentLST)
                if (currentField[0] == -1)
                {
                    Console.PrintLine("")
                    Console.PrintLine("It's still too early to begin... Waiting for " + (-1*currentField[1]*3600).toFixed(0) + " seconds.")
                }
            }
        }
        else if (currentField[0] == 999)
        {
            Console.PrintLine("")
            Console.PrintLine("Too late. Nothing left to observe.")
            ts.WriteLine(Util.SysUTCDate + " INFO: Too late... We should never have gotten here.")
            // if (Util.IsTaskActive(tid))
                //Util.ShellExec("taskkill.exe", "/im ColibriGrab.exe /t /f")
            abort()
        }
        else if (currentField[2] < 0 && currField[0] != -1)
        {
            Console.PrintLine("Negative loops remaining. Past last field. Closing up.")
            ts.WriteLine(Util.SysUTCDate + " INFO: Negative loops. Aborting script.")
            abort()

        }

        // Add Goto and all that stuff.
        if (Weather.Available && Weather.safe)
        {
            connectScope()
            domeOpen()
            trkOn()
        }
        else if (ignoreWeather == true)
        {
            connectScope()
            domeOpen()
            trkOn()
        }
        // else if ()
        //     Console.PrintLine("Weather unavailable or unsafe!")
        //     Console.PrintLine("This")
        //     abort()

        currentFieldCt = Util.NewCThereAndNow()
        currentFieldCt.RightAscension = currentField[3]/15
        currentFieldCt.Declination = currentField[4]

        Console.PrintLine("")
        Console.PrintLine("Slewing to...")
        ts.WriteLine(Util.SysUTCDate + " INFO: Slewing to...")
        Console.PrintLine("RA: " + currentFieldCt.RightAscension)
        ts.WriteLine(Util.SysUTCDate + " INFO: RA: " + currentFieldCt.RightAscension)
        Console.PrintLine("Dec: " + currentFieldCt.Declination)
        ts.WriteLine(Util.SysUTCDate + " INFO: Dec: " + currentFieldCt.Declination)

        ts.WriteLine(Util.SysUTCDate + " INFO: Alt: " + currentFieldCt.Elevation)
        ts.WriteLine(Util.SysUTCDate + " INFO: Az: " + currentFieldCt.Azimuth)

        gotoRADec(currentFieldCt.RightAscension, currentFieldCt.Declination)

        while (Telescope.Slewing == true)
        {
            Console.PrintLine("Huh. Still Slewing...")
            Util.WaitForMilliseconds(500)
        }

        Dome.UnparkHome()

        if (Dome.slave == false)
        {
            Dome.slave == true
        }

        while (Dome.Slewing == true)
        {
            Console.PrintLine("Dome is still slewing. Give me a minute...")
            Util.WaitForMilliseconds(500)
        }

        Console.PrintLine("At target.");
        ts.WriteLine(Util.SysUTCDate + " INFO: At target.")
            
        Console.PrintLine("Target Alt/Az is: Alt. =" + currentFieldCt.Elevation.toFixed(2) + "   Az.= " + currentFieldCt.Azimuth.toFixed(2));
        ts.WriteLine(Util.SysUTCDate + " INFO: Target Alt/Az is: Alt. =" + currentFieldCt.Elevation.toFixed(2) + "   Az.= " + currentFieldCt.Azimuth.toFixed(2))

        if (Telescope.SideOfPier == 0)
        {
            pierside = "E"
            Console.PrintLine("Pier side: " + pierside)
        }
        else
        {
            pierside = "W"
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

        Console.PrintLine("")
        Console.Printline("Starting data collection...")
        ts.WriteLine(Util.SysUTCDate + " INFO: Starting data collection.")

        biasCounter = 15 // Set equal to interval so that bias set is collected on first run
        biasInterval = 15 // Number of minutes between bias series collection
        numExps = 2400
        runCounter = 1

        Console.PrintLine(Util.nowLST())
        Console.PrintLine(endLST)
        while (Util.nowLST() < endLST)
        {

            // Check pier side
            if (Telescope.SideOfPier != Telescope.DestinationSideOfPier(currentFieldCt.RightAscension, currentFieldCt.Declination))
            {
                Console.PrintLine("Flipping sides of pier...")
                ts.WriteLine(Util.SysUTCDate + " INFO: Flipping sides of the pier.")
                gotoRADec(currentFieldCt.RightAscension, currentFieldCt.Declination);

                if (Telescope.SideOfPier == 0)
                {
                    pierside = "E"
                }
                else
                {
                    pierside = "W"
                }
            }
            else { Console.PrintLine("Already on the right side of the pier"); }

            // Collect biases when biasInterval is reached
            if (biasCounter == biasInterval)
            {
               biasCollection(today) 
               biasCounter = 0
            }
            biasCounter++
            Console.PrintLine("Bias counter = " + biasCounter.toString())

            // Start grabbing images
            pid = Util.ShellExec("ColibriGrab.exe", "-n " + numExps.toString() + " -p " + currentField[5].toString() + "_25ms-" + pierside + " -e 25 -t 0 -f normal -w D:\\ColibriData\\" + today.toString())
            
            Console.PrintLine("Process ID = " + pid.toString())
            Util.WaitForMilliseconds(1000)

            try
            {
                while (Util.IsTaskActive(pid)){
                    Util.WaitForMilliseconds(500)
                }
                Console.PrintLine("Done exposing run # " + runCounter.toString())
            }
            catch(err)
            {
                ts.WriteLine("ERROR: Process ID does not exist. ColibriGrab.exe is not running!")
                Console.PrintLine("Didn't expose properly on run # " + runCounter.toString())
            }
          
            runCounter++
        }

    }

    shutDown();

}
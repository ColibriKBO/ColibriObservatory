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
    ts.WriteLine(Util.SysUTCDate + "ERROR: Aborting script! Restarting script!")
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

////////////////////////////////////////////////////
// Does the dirty work of collecting dark data.
// RG
// MJM - Added naming of directory to today's date
////////////////////////////////////////////////////
function darkCollection(today) {
    var tid;
    // var today = getDate();
    // Console.Printline(today.toString());

    Console.PrintLine("Starting dark frame collection...");
    Console.Printline("d:\\ColibriData\\" + today.toString() + "\\Dark");

    tid = Util.ShellExec("ColibriGrab.exe", "-n 10 -p Dark_25ms -e 25 -t 0 -f dark -w D:\\ColibriData\\" + today.toString() + "\\Dark");
    while (Util.IsTaskActive(tid))
    {
        Util.WaitForMilliseconds(500)
        // Console.PrintLine("Collecting dark frames...")
    }

    // Util.ShellExec("taskkill.exe", "/im ColibriGrab.exe /t /f");
    Util.WaitForMilliseconds(100)
    Console.PrintLine("Finished collecting dark frames...");
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

function JDtoUTC(JulianDate)
{
	var s, month, day;

	var millis = (JulianDate - 2440587.5) * 86400000
	var toUTC = new Date(millis)
	
	s = toUTC.getUTCFullYear();
	
	month = (toUTC.getUTCMonth()+1).toString()
	day   = (toUTC.getUTCDate()).toString()

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

    targetCt = Util.NewCThereAndNow()
    targetCt.RightAscension = ra
    targetCt.Declination = dec

    // Print target elevation to screen
    Console.Printline("Elevation of field " + targetCt.Elevation.toFixed(4));

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

//////////////////////////////////////////////////////////////
// Function to adjust telescope pointing. Calls astrometry_correction.py
// subprocess to get new pointing.
//////////////////////////////////////////////////////////////

function adjustPointing(ra, dec)
{
    // Convert RA to decimal degrees
    ra = ra*15;

    // Call astrometry_correction.py to get pointing offset
    Console.PrintLine("== Pointing Correction ==");
    ts.WriteLine(Util.SysUTCDate + " INFO: == Pointing Correction ==");
    var SH = new ActiveXObject("WScript.Shell");
    var BS = SH.Exec("python ExtraScripts\\astrometry_correction.py " + ra + " " + dec);
    var python_output = "";

    while(BS.Status != 1)
    {
        while(!BS.StdOut.AtEndOfStream)
        {
            python_output += BS.StdOut.Read(1);
        }
        Util.WaitForMilliseconds(100);
    };

    // Parse output from astrometry_correction.py
    var py_lines = python_output.split("\n");
    var radec_offset = py_lines[py_lines.length-2].split(" ");

    // Calculate new RA and Dec pointing
    // Convert RA to hms
    new_ra = (ra + parseFloat(radec_offset[0]))/15;
    new_dec = dec + parseFloat(radec_offset[1]);
    
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
    targetCt = Util.NewCThereAndNow()
    targetCt.RightAscension = new_ra
    targetCt.Declination = new_dec
    if (targetCt.Elevation < elevationLimit)
    {
        Console.PrintLine("Tried to move to an unsave elevation of " + targetCt.Elevation.toFixed(4));
        Console.PrintLine("Ignoring new pointing and continuing with current pointing.");
        ts.WriteLine(Util.SysUTCDate + " WARNING: Ignoring new pointing and continuing with current pointing.");
    }

    // Call gotoRADec() to slew to new pointing
    else
    {gotoRADec(new_ra, new_dec)};

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
	while (currentJD < sunset)
	{
		Console.Clear()
		if (currentJD > sunrise && currentJD < sunset)
		{
			Console.PrintLine("Sun is up")
			Console.PrintLine("It has been up for " + Util.Hours_HMS((currentJD - sunrise)*24,"h ","m ","s"))
			Console.PrintLine("It will set in " + Util.Hours_HMS(-1*(currentJD - sunset)*24,"h ","m ","s"))
			Console.PrintLine("Waiting " + -1*(currentJD - sunset)*24 + " hours to start operations.")
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

function whichField(timeJD)
{
    nextField = 0
    // Console.PrintLine(finalFields)
    // currField = 0
    // targetDur = finalFields[0][12]-time
    Console.PrintLine("Called whichField function...")
    Console.PrintLine("Number of fields in finalFields: " + finalFields.length)
    
    // Ensure observations take place during the dark
    if (timeJD < sunset)
    {
        Console.PrintLine("\r\n  Earlier than first observation time.")
        Console.PrintLine("************************************")
        targetJD = finalFields[0][12]
        // In this case, targetDur is the time to wait as a negative number
        targetDur = timeJD - finalFields[0][12]
        targetLoops = Math.ceil(targetDur*86400 / 0.025 / numExposures)
        targetRA  = finalFields[0][2][0]
        targetDec = finalFields[0][2][1]

        Console.PrintLine("\r\nThe JD start time is " + targetJD.toFixed(4))
        Console.PrintLine("We'll run for " + targetLoops + " loops of " + numExposures + " exposures.")
        Console.PrintLine("Which means that we're on target for " + targetDur.toFixed(3) + " hours.")

        // Console.PrintLine(time)
        // Console.PrintLine(finalFields[finalFields.length-2][12])
        // Console.PrintLine(finalFields[finalFields.length-1][12])

        currField = -1
        nextField = 0
        fieldName = "TooEarly"
        
        return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD]
    }
    else if (timeJD > sunrise)
    {
        // Console.PrintLine(time)
        // Console.PrintLine(finalFields[finalFields.length-1][12])
        Console.PrintLine("After last time.")
        targetJD  = 999 //TODO: This is a hack. Need to fix this to work with JD.
        targetDur = 999
        targetLoops = 0
        currField = 999
        nextField = 999
        // Given Polaris to target by default to be safe
        targetRA  = 37.75
        targetDec = 89.15
        fieldName = "TooLate"

        ts.WriteLine(Util.SysUTCDate + " WARNING: After last time. Closing up shop.")
        Telescope.Park()
        trkOff()
        domeClose()
        return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD]
    }


    if (finalFields.length == 1)
    {
        Console.PrintLine("Only one field to observe!")
        ts.WriteLine(Util.SysUTCDate + " INFO: (whichField) Only one field to observe!")
        
        targetJD  = sunrise
        targetDur = sunrise - timeJD
        targetLoops = Math.ceil(targetDur*86400 / 0.025 / numExposures)
        currField = 0
        nextField = -999

        targetRA = finalFields[0][2][0]
        targetDec = finalFields[0][2][1]
        fieldName = finalFields[0][3].toString()

        Console.PrintLine("target JD: " + targetJD)
        Console.PrintLine("Number of loops: " + targetLoops)
        Console.PrintLine("Target duration: " + targetDur)
        Console.PrintLine("finalFields: " + finalFields[0][12])


        return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD]
    }


    // Scan the finalFields list to identify the current field
    for (i=0; i<finalFields.length-1; i++)
    {
        if ((timeJD > finalFields[i][12]) && (timeJD < finalFields[i+1][12]))
        {
            targetJD  = finalFields[i+1][12]
            targetDur = finalFields[i+1][12] - timeJD
            targetLoops = Math.ceil(targetDur*86400 / 0.025 / numExposures)
            currField = i
            nextField = i + 1
            targetRA = finalFields[i][2][0]
            targetDec =finalFields[i][2][1]
            fieldName = finalFields[i][3].toString()

            //ts.WriteLine(Util.SysUTCDate + " INFO: Target JD = " + targetJD + " Target Dur. = " + targetDur + " Target Loops: " + targetLoops + " Field Name: " + fieldName)
            //Console.PrintLine(fieldName + " Target JD = " + targetJD + " w/ a duration = " + targetDur + " for " + targetLoops + " loops ")

            return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD]
        }
    }
    // Check final entry in finalFields list
    if ((timeJD > finalFields[finalFields.length-1][12]) && (timeJD < sunrise))
    {
        Console.PrintLine("At last field")
        ts.WriteLine(Util.SysUTCDate + " INFO: At last field")

        targetJD  = sunrise
        targetDur = sunrise - timeJD
        targetLoops = Math.ceil(targetDur*86400 / 0.025 / numExposures)
        currField = finalFields.length-1
        nextField = 999
        targetRA = finalFields[finalFields.length-1][2][0]
        targetDec = finalFields[finalFields.length-1][2][1]
        fieldName = finalFields[finalFields.length-1][3].toString()


        //ts.WriteLine(Util.SysUTCDate + " INFO: Target JD = " + targetJD + " Target Dur. = " + targetDur + " Target Loops: " + targetLoops + " Field Name: " + fieldName)
        //Console.PrintLine(fieldName + " Target JD = " + targetJD + " w/ a duration = " + targetDur + " for " + targetLoops + " loops ")

        return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD]
    }


    // Default if no valid fields are found (for any reason)
    // Given Polaris to target by default to be safe
    Console.PrintLine("No valid fields")
    ts.WriteLine(Util.SysUTCDate + " INFO: No valid fields")
    targetJD  = 999 //TODO: This is a hack. Need to fix this to work with JD.
    targetDur = 999
    targetLoops = 0
    currField = 999
    nextField = 999
    targetRA  = 37.75
    targetDec = 89.15
    fieldName = "NoFields"

    ts.WriteLine(Util.SysUTCDate + " WARNING: After last time. Closing up shop.")
    Telescope.Park()
    trkOff()
    domeClose()
    return [currField, targetDur, targetLoops, targetRA, targetDec, fieldName, targetJD]
    
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
var darkInterval = 15 // Number of minutes between dark series collection


// Iterables
var slewAttempt = 0;

if (logconsole == true)
    {
        Console.LogFile = "d:\\Logs\\ACP\\scheduling_development-" + Util.FormatVar(Util.SysUTCDate, "yyyymmdd_HhNnSs") + "-ACPconsole.log";
        Console.Logging = true;
    }
    
    sunset  = twilightTimes(Util.SysJulianDate)[1]
    LogFile = "d:\\Logs\\ACP\\scheduling_development-" + JDtoUTC(sunset) + "-ACP.log";
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
    sunset  = twilightTimes(Util.SysJulianDate)[1]
    sunrise = twilightTimes(Util.SysJulianDate + 1)[0]
    sunsetLST  = (Util.Julian_GMST(sunset)  + Telescope.SiteLongitude/15).toFixed(1)
    sunriseLST = (Util.Julian_GMST(sunrise) + Telescope.SiteLongitude/15).toFixed(1)

    // Length of night
    darkHours = (sunrise - sunset)*24
    timeUntilSunset = (sunset - Util.SysJulianDate)*24 // hours
    timeUntilSunrise = (sunrise - Util.SysJulianDate)*24 // hours

    // Dark hours left
    if (darkHours > timeUntilSunrise)
        {darkHoursLeft = timeUntilSunrise}
    else
        {darkHoursLeft = darkHours}

    // Print today's time of nautical sunrise and sunset.
    Console.PrintLine("Sunrise GMST: " + Util.Julian_GMST(sunrise))
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunrise GMST: " + Util.Julian_GMST(sunrise))
    Console.PrintLine("Sunset GMST: " + Util.Julian_GMST(sunset))
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunset GMST: " + Util.Julian_GMST(sunset))
    Console.PrintLine("Current GMST: " + Util.Julian_GMST(Util.SysJulianDate))
    ts.WriteLine(Util.SysUTCDate + " INFO: Current GMST: " + Util.Julian_GMST(Util.SysJulianDate))
    Console.PrintLine("Sunrise UTC: " + Util.Julian_Date(sunrise))
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunrise UTC: " + Util.Julian_Date(sunrise))
    Console.PrintLine("Sunset UTC: " + Util.Julian_Date(sunset))
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunset UTC: " + Util.Julian_Date(sunset))
    Console.PrintLine("Sunset JD: " + sunset)
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunset JD: " + sunset)
    Console.PrintLine("Sunrise JD: " + sunrise)
    ts.WriteLine(Util.SysUTCDate + " INFO: Sunrise JD: " + sunrise)
    Console.PrintLine("Current JD: " + Util.SysJulianDate)
    ts.WriteLine(Util.SysUTCDate + " INFO: Current JD: " + Util.SysJulianDate)

    Console.PrintLine("Length of the Night: " + darkHours + "hours")
    ts.WriteLine(Util.SysUTCDate + " INFO: Length of the Night: " + darkHours + " hours")
    Console.PrintLine("Time until sunset: " + timeUntilSunset + " hours")
    Console.PrintLine("Time until sunrise: " + timeUntilSunrise + " hours")
    ts.WriteLine(Util.SysUTCDate + " INFO: Dark hours left: " + darkHoursLeft + " hours")

/*-----------------------------Prestart Checks-------------------------------*/

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
                Console.PrintLine("Ok, you've chosen to proceed with no weather server. 8-O")
                ts.WriteLine(Util.SysUTCDate + " WARNING: No weather server. You've chosen to proceed without. 8-O")
                ignoreWeather = true
                Util.WaitForMilliseconds(3000)
            }
            else
                abort()
        }

    // If the weather server is connected and the weather is not safe, wait
	// until it becomes safe.
    if (Weather.Available && !Weather.safe)
        {
            ts.WriteLine(Util.SysUTCDate + " INFO: Weather unsafe! Waiting until it's looking a bit better out.")
        }
    
        while (Weather.Available && !Weather.safe)
        {
            if (getDate() != currentDate)
            {
                currentDate = getDate()
                LogFile = "d:\\Logs\\ACP\\scheduling_development-" + JDtoUTC(sunset) + "-ACP.log"
    
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
    
        // Update currentDate variable to be correct
        if (getDate() != currentDate)
        {
            currentDate = getDate()
            LogFile = "d:\\Logs\\ACP\\scheduling_development-" + JDtoUTC(sunset) + "-ACP.log"
    
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
        }

/*-----------------------------Begin Operations------------------------------*/
        // Check if the ACP Scheduler dispatcher is scheduling or observing
        while (Scheduler.DispatcherStatus == 1 || Scheduler.DispatcherStatus == 2) {
            Console.PrintLine("ACP Scheduler is busy. Waiting for 5 minutes.");
            Util.WaitForMilliseconds(300000);
        }

        // Monitor the weather status, if the weather script is active
        // TODO: Add Goto and all that stuff.
        if ((Weather.Available && Weather.safe) || (ignoreWeather == true))
            {
                Console.PrintLine("Checking Weather")
                connectScope()
                domeOpen()
                trkOn()
            }

        // Create coordinate transform for the current field
        currentFieldCt = Util.NewCThereAndNow()
        currentFieldCt.RightAscension = currentField[3]/15
        currentFieldCt.Declination = currentField[4]
}
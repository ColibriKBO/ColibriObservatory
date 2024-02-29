/////////////////////////////
// Filename:   GotoWithAstrometry.js
// Author(s):  Peter Quigley
// Contact:    pquigle@uwo.ca
// Created:    Oct 11, 2023
// Updated:    Oct 11, 2023
//    
// Description:
//     Take user input from the ACP terminal (in decimal degrees) and slews to
//     that target. On initial slew, assesses the astrometry through the
//     external astrometry_correction.py script, and make a simple linear
//     correction to the pointing. Assumes at least a 'close' initial guess.
//
// Usage:
//     Run this script via ACP with the telescope connected. Weather module
//     connection is optional.
//
/////////////////////////////


/*------------------------------global vars----------------------------------*/

var elevationLimit = 10; // minimum elevation of field in degrees
var runUnsafe = false; // if true, will disable weather checks
var numCorrections = 1;
var tolerance = 0.005; // required accuracy in degrees
var tolsqr = Math.pow(tolerance, 2); // tolerance squared; don't change this

/*-------------------------------functions-----------------------------------*/

/////////////////////////////
// Mazur Instrument Functions
/////////////////////////////

// Turn on tracking
function trkOn()
{
    if (Telescope.CanSetTracking)
    {
        Telescope.Unpark();
        Telescope.Tracking = true;
        Console.PrintLine("--> Tracking is turned on :-)");
    }
    else if (Telescope.Tracking && !Telescope.CanSetTracking)
    {
        Console.PrintLine("Failed to enable tracking")
    }
}

// Turn off tracking
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
    }
}


// Close the dome
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

        //////////////////////
        // Dome is closing. //
        //////////////////////
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
        break;
    }
}


// Open the dome
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


// Move dome to the home position
function domeHome()
{
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


// Connect to the telescope and turn on tracking
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
            Util.AbortScript()
        }
    }
        
    Console.PrintLine(" ")
}


// Send telescope to specific RA and Dec
function gotoRADec(ra, dec)
{
    // Print input coordinates to screen
    Console.Printline("RA in gotoRADec function " + ra.toFixed(4));
    Console.Printline("Dec in gotoRADec function " + dec);

    // Create a new coordinate object with the input coordinates
    targetCt = Util.NewCThereAndNow()
    targetCt.RightAscension = ra
    targetCt.Declination = dec

    // Print target elevation to screen
    Console.Printline("Elevation of field " + targetCt.Elevation.toFixed(4));

    // Check that the elevation of the field is above the elevation limit
    breakme: if (targetCt.Elevation < elevationLimit)
    {
        Console.PrintLine("Tried to move to an unsave elevation of " + targetCt.Elevation.toFixed(4));
        Util.AbortScript();
        break breakme;
    }

    // Check that the telescope is tracking
    trkOnAttempt = 0;
    while (!Telescope.Tracking)
    {
        // If the telescope is not tracking, try to turn it on
        trkOn();
        trkOnAttempt += 1;

        // If the telescope is still not tracking after 5 attempts, abort the script
        if (trkOnAttempt > 5)
        {
            Console.PrintLine("Failed to turn on tracking after 5 attempts. Aborting script.");
            Util.AbortScript();
        }
    }

    // Check that the dome is tracking
    Dome.UnparkHome()
    if (Dome.slave == false)
    {
        Dome.slave == true
    }

    // Try to slew to the target coordinates
    slewToStatus = false;
    slewToAttempt = 0;
    while (!slewToStatus)
    {
        try
        {
            Telescope.SlewToCoordinates(ra.toFixed(4), dec.toFixed(4));
            Console.PrintLine("Done slewing.");
            slewToStatus = true;
        }
        catch(e)
        {
            if (slewToAttempt < 10)
            {
                Console.PrintLine("Error on attempt" + slewToAttempt + "to slew. Waiting 2 seconds and trying again.");
                Util.WaitForMilliseconds(2000);
                slewToAttempt += 1;
            }
            else
            {
                Console.PrintLine("Reached maximum number of tries to slew");
                Util.AbortScript();
            }
        }
    }

    // Wait for the dome to finish slewing
    while (Dome.Slewing == true)
    {
        Console.PrintLine("Dome is still slewing. Give me a minute...")
        Util.WaitForMilliseconds(500)
    }
}


function adjustPointing(ra, dec)
{
    // Convert RA to decimal degrees
    ra = ra*15;

    // Call astrometry_correction.py to get pointing offset
    Console.PrintLine("== Pointing Correction ==");
    var SH = new ActiveXObject("WScript.Shell");
    var BS = SH.Exec("python astrometry_correction.py " + ra + " " + dec);
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
    new_ra = (ra + Math.cos(dec)*parseFloat(radec_offset[0]))/15;
    new_dec = dec + parseFloat(radec_offset[1]);
    Console.PrintLine("New RA: " + new_ra.toString() + " New Dec: " + new_dec.toString());

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

    // Check that new pointing is safely above the elevation limit
    // Currently disabled, but can be enabled if you want to continue to point at target even if there is a problem
    /*
    targetCt = Util.NewCThereAndNow()
    targetCt.RightAscension = ra
    targetCt.Declination = dec
    if (targetCt.Elevation < elevationLimit)
    {
        Console.PrintLine("Tried to move to an unsave elevation of " + targetCt.Elevation.toFixed(4));
        Console.PrintLine("Ignoring new pointing and continuing with current pointing.");
        ts.WriteLine(Util.SysUTCDate + " WARNING: Ignoring new pointing and continuing with current pointing.");
    }

    // Call gotoRADec() to slew to new pointing
    else
    {gotoRADec(new_ra, new_dec)};
    */

    // Check that new pointing is within tolerance
    var pointingError = Math.pow(Math.cos(dec)*radec_offset[0], 2) + Math.pow(radec_offset[1], 2);

    if (pointingError > tolsqr)
    {
        Console.PrintLine("New pointing is not within tolerance. Iterating again.");

        // Call gotoRADec() to slew to new pointing
        gotoRADec(new_ra, new_dec);
        adjustPointing(ra, dec)
    }

}



/////////////////////////////
// Script Functions
/////////////////////////////

// Ask user for RA and Dec in the terminal 
function userInputRADEC()
{
    // Take user input for coordinates
    var RA  = parseFloat(Util.Prompt("RA coordinate (in decimal hours):  ", "NaN"));
    var DEC = parseFloat(Util.Prompt("Dec coordinate (in decimal degrees): ", "NaN"));
    Console.PrintLine("RA: " + RA + " DEC: " + DEC);

    // Check that these coordinates are valid
    if (isNaN(RA) || isNaN(DEC))
    {
        throw new Error("Coordinates could not be parsed. Exiting.");
        Util.AbortScript();
    }
    else if (RA < 0 || RA > 24 || DEC < -90 || DEC > 90)
    {
        throw new Error("Coordinates exceed expected bounds. Exiting.");
        Util.AbortScript();
    }
    else
    {
        return [RA, DEC]
    }
}

/*---------------------------------main--------------------------------------*/

// Main function
function main()
{
    /*--------------------------Safety Checks--------------------------------*/

    // Check to see if the weather server is connected. If it isn't ask for
	// permission to continue.
	if (Weather.Available)
	{
		Console.PrintLine("Weather server is connected.");
        Console.PrintLine("Continuing with operations.");
		Util.WaitForMilliseconds(1000);
	}
    else if (runUnsafe)
    {
        Console.PrintLine("Weather server is not connected, but unsafe mode is enabled.");
        Console.PrintLine("Continuing with operations.");
        ignoreWeather = true;
        Util.WaitForMilliseconds(1000);
    }
	else
	{
		if (Util.Confirm("No weather server! Do you want to continue? Choose wisely..."))
		{
			Console.PrintLine("Ok, you've chosen to proceed with no weather server. 8-O");
            ignoreWeather = true;
			Util.WaitForMilliseconds(1000)
		}
		else
			Util.AbortScript()
	}

	// If the weather server is connected and the weather is not safe, wait
	// until it becomes safe.
	while (Weather.Available && !Weather.safe)
	{
        // If the weather is unsafe, close the dome and wait a minute
        if (Dome.ShutterStatus != 1)
        {
            Console.PrintLine("Unsafe weather conditions. Closing the dome...")
            domeClose();
        }
        else
        {
		    Console.PrintLine("Unsafe weather conditions. Waiting a minute...")
            Util.WaitForMilliseconds(60000)
        }
	}


    /*------------------------Begin Script Operations------------------------*/

    // Connect to telescope and open the dome
    connectScope();
    domeOpen();
    trkOff()

    // Ask user for coordinates
    var coordinates = userInputRADEC();
    var RA = coordinates[0];
    var DEC = coordinates[1];

    // Slew to coordinates
    gotoRADec(RA, DEC);

    // Adjust pointing iteratively until within tolerance
    adjustPointing(RA, DEC);

    // End of script
    Console.PrintLine("Dome is done slewing and telescope is at target. End of script.")

}
// Scheduling observation request objects
function Request(directoryName, priority, ra, dec, startUTC, startJD, endUTC, endJD, numExposures, exposureTime, filter, binning, csvIndex) {
    this.directoryName = directoryName;
    this.priority = priority;

    this.ra = ra;
    this.dec = dec;

    this.startUTC = startUTC;
    this.startJD = startJD;
    this.endUTC = endUTC;
    this.endJD = endJD;

    this.numExposures = numExposures;
    this.exposureTime = exposureTime;
    this.filter = filter;
    this.binning = binning;

    this.altitude = 0;
    this.moonAngle = 0;

    this.score = 0;
    this.csvIndex = csvIndex;

    this.compareScore = function(otherRequest) { return this.score > otherRequest.score; };
}

function RequestIndices() {
    this.directoryName = 0;
    this.priority = 1;

    this.ra = 2;
    this.dec = 3;

    this.startTime = 4;
    this.endTime = 5;

    this.numExposures = 6;
    this.exposureTime = 7;
    this.filter = 8;
    this.binning = 9;

    this.completion = 10;
}

// Scheduling-related functions
// Equation from https://aa.usno.navy.mil/faq/JD_formula
function UTCtoJD(UTC) {
    var dividedUTC = UTC.split(":");
    var K = parseInt(dividedUTC[0]);
    var M = parseInt(dividedUTC[1]);
    var I = parseInt(dividedUTC[2]);
    var H = parseInt(dividedUTC[3]);
    var m = parseInt(dividedUTC[4]);

    var ut = H + (m / 60);
    var JD = (367 * K) - trunc((7 * (K + trunc((M + 9) / 12))) / 4) + trunc((275 * M) / 9) + I + 1721013.5 + (ut / 24) - (0.5 * sign(100 * K + M - 190002.5)) + 0.5;

    return JD;
}

function trunc(number) {
    return parseInt(number);
}

function sign(number) {
    if (number > 0) { return 1; }
    else if (number < 0) { return -1; }
    return 0;
}

function getRequests() {
    var requests = [];
    var lines = [];
    var indices = new RequestIndices();

    try {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var file = fso.OpenTextFile("./colibri_user_observations.csv", 1); // 1 = For Reading

        var rowCounter = 0;
        // var lines = [];
        var rowData = [];

        while(!file.AtEndOfStream) {
            //if (rowCounter != 0) {
            var line = file.ReadLine();
            lines.push(line);
            rowData = line.split(",");
            Console.PrintLine(rowData);
            
            if (rowData[parseInt(indices.completion)] == 0) {

                var request = new Request(
                    rowData[(indices.directoryName)],
                    parseInt(rowData[(indices.priority)]),
                    parseFloat(rowData[(indices.ra)]),
                    parseFloat(rowData[(indices.dec)]),
                    rowData[(indices.startTime)],
                    UTCtoJD(rowData[(indices.startTime)]),
                    rowData[(indices.endTime)],
                    UTCtoJD(rowData[(indices.endTime)]),
                    rowData[(indices.numExposures)],
                    rowData[(indices.exposureTime)],
                    rowData[(indices.filter)],
                    rowData[(indices.binning)],
                    rowCounter
                );

                // var request = new Request;
                
                // request.directoryName = rowData[parseInt(indices.directoryName)];
                // request.priority = parseInt(rowData[parseInt(indices.priority)]);

                // request.ra = parseFloat(rowData[parseInt(indices.ra)]);
                // request.dec = parseFloat(rowData[parseInt(indices.dec)]);

                // request.startUTC = rowData[parseInt(indices.startTime)];
                // request.endUTC = rowData[parseInt(indices.endTime)];
                // request.startJD = UTCtoJD(request.startUTC);
                // request.endJD = UTCtoJD(request.endUTC);

                // request.numExposures = parseInt(rowData[parseInt(indices.numExposures)]);
                // request.exposureTime = parseFloat(rowData[parseInt(indices.exposureTime)]);
                // request.filter = rowData[parseInt(indices.filter)];
                // request.binning = rowData[parseInt(indices.binning)];

                // request.csvIndex = rowCounter;

                requests.push(request);
            }
            //}
            rowCounter++;
        }
        file.Close();
        fso = null;
    } catch (e) {
        Console.PrintLine("An error occurred: " + e.message);
    }

    return [requests, lines];
}

function selectBestObservation(requests, sunset, sunrise, moonCT) {
    var suitableObs = filterByTime(requests, sunset, sunrise);
    suitableObs = filterByAstronomy(suitableObs, moonCT);
    var rankedObs = rankObservations(suitableObs);
    var bestObs = selectTopObservation(rankedObs);

    return bestObs;
}

function filterByTime(requests, sunset, sunrise) {
    var filteredObs = [];
    var currJD = Util.SysJulianDate;

    for (var i = 0; i < requests.length; i++) {
        var request = requests[i];
        if (withinTimeWindow(request, currJD, sunset, sunrise)) {
            filteredObs.push(request);
        }
    }

    return filteredObs;
}

function withinTimeWindow(request, currJD, sunset, sunrise) {
    var start = request.startJD;
    var end = request.endJD;

    return start <= currJD && currJD <= end && withinNightTime(request, sunset, sunrise);
}

function withinNightTime(request, sunset, sunrise) {
    var start = request.startJD;
    var end = request.endJD;

    return sunset <= start && start <= sunrise && sunset <= end && end <= sunrise;
}

function filterByAstronomy(requests, moonCT) {
    var filteredObs = [];
    var currLST = Util.NowLST;

    for (var i = 0; i < requests.length; i++) {
        var request = requests[i];
        if (meetsAstronomyConditions(request, moonCT, currLST)) { filteredObs.push(request); }
    }

    return filteredObs;
}

function meetsAstronomyConditions(request, moonCT, newLST) {
    var ra = request.ra;
    var dec = request.dec;
    
    var targetAltitude = calculateAltitude(ra, dec, newLST);
    var moonAngle = calculateMoonAngle(ra, dec, moonCT);

    request.altitude = altitude;
    request.moonAngle = moonAngle;

    return targetAltitude > elevationLimit && moonAngle > minMoonOffset;
}

function calculateAltitude(ra, dec, newLST) {
    var ct = Util.NewCT(Telescope.SiteLatitude, newLST);

    ct.RightAscension = ra/15;
    ct.Declination = dec;

    return ct.Elevation;
}

function calculateMoonAngle(ra, dec, moonCT) {
    var b = (90 - dec) * Math.PI / 180;
    var c = (90 - moonCT.Declination) * Math.PI / 180;
    var aa = Math.abs(ra - moonCT.RightAscension) * Math.PI / 180;

    var moonAngle = Math.acos((Math.cos(b) * Math.cos(c)) + (Math.sin(b) * Math.sin(c) * Math.cos(aa))) * 180 / Math.PI;
    return moonAngle;
}

function rankObservations(requests) {
    var rankedObs = [];

    for (var i = 0; i < requests.length; i++) {
        var request = requests[i];
        calculateScore(request);
    }

    rankedObs = requests.sort(function (request1, request2) { return request1.compareScore(request2); });
    return rankedObs;
}

function calculateScore(request) {
    var score = request.priority;

    score += evaluateTimeScore(reqeust);
    score += evaluateAstronomyScore(request);

    request.score = score;
}

function evaluateTimeScore(request) {
    var startSec = (request.startJD - 2440587.5) * 86400;
    var endSec = (request.endJD - 2440587.5) * 86400;

    return Math.max(0, (endSec - startSec) / 60); // Duration in minutes
}

function evaluateAstronomyScore(request) {
    var altitudeScore = Math.max(0, request.altitude - elevationLimit);
    var moonScore = Math.max(0, request.moonAngle - minMoonOffset);

    return altitudeScore + moonScore;
}

function selectTopObservation(requests) {
    if (requests.length == 0) {
        return null;
    }
    return requests[0];
}

// Auxiliary functions
function openLogFile(sunset) {
    var fso = newActiveXObject("Scripting.FileSystemObject");
    var LogFile = "d:\\Logs\\ACP\\" + JDtoUTC(sunset) + "-ACP.log";

    if (fso.FileExists(LogFile)) {
        Console.PrintLine("Log file exists. Appending to existing log file.");
    }
    else {
        fso.CreateTextFile(LogFile);
    }
    
    var f1 = fso.GetFile(LogFile);
    // Check to see if f1 is open. If not, do the following...
    var ts = f1.OpenAsTextStream(appendMode, true);
    Console.PrintLine("Log file ready.");

    return ts;
}

function updateDay(timeString) {
    var parts = timeString.split(":");
    var day = parseInt(parts[2]) + 1;
    parts[2] = (day < 10 ? "0" : "") + day;
    return parts.join(":");
}

function updateCSV(lines) {
    try{
        var writeFile = fso.OpenTextFile('./colibri_user_observations.csv', 2) // 2 = writing
        for (var i = 0; i < lines.length; i++) {
            writeFile.WriteLine(lines[i]);
        }
        writeFile.Close();
        Console.PrintLine("CSV File modified successfuly.");
        ts.WriteLine(Util.SysUTCDate + " INFO: CSV File modified successfuly.");
    } catch (e) {
        Console.PrintLine("ERROR: " + e.message);
        ts.WriteLine(Util.SysUTCDate + " ERROR: " + e.message);
    }
}

//RunColibri Functions
// Handles script --> Combines the functionality of abort, abortAndRestart, and andRestart scripts from RunColibri
// function handleScript(ts, action) {
//     if (action == "abort" || action == "abortAndRestart") {
//         Console.PrintLine("Aborting script!");
//         ts.WriteLine(Util.SysUTCDate + "ERROR: Aborting script!");
//         if (action == "abortAndRestart") {
//             ts.WriteLine("Restarting Script!" );
//         } 
//     } else if (action == "andRestart") {
//             Console.PrintLine("Shutting down and restarting!");
//     }

//     shutDown();
//     while(Dome.ShutterStatus != 1 || Telescope.AtPark != true) {
//         Util.WaitForMilliseconds(5000);
//         Console.PrintLine("Waiting 5 seconds for shutter to close and telescope to park...");
//     }

//     if (action == "abort" || action == "abortAndRestart") {
//         if (Util.ScriptActive) {
//             Console.PrintLine("Aborting...");
//             Util.AbortScript();
//         }

//         while (Util.ScriptActive) {
//             Console.PrintLine("Waiting for script to finish...");
//             Util.WaitForMilliseconds(1000);
//         }
//     }

//     if (action == "abortAndRestart" || action == "andRestart") {
//         main();
//     }
// }

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
    // Get the user's home directory and construct the path to ColibriGrab.exe in Github!
    var wshShell = new ActiveXObject("WScript.Shell");
    var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");
    var colibriGrabPath = userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";

    // var tid;
    // var today = getDate();
    // Console.Printline(today.toString());

    Console.PrintLine("Starting bias frame collection...");
    Console.Printline("d:\\ColibriData\\" + today.toString() + "\\Bias");

    var wsh = new ActiveXObject("WScript.Shell");
    var command = "\"" + colibriGrabPath + "\" + -n 50 -p Bias_25ms -e 0 -t 0 -f bias -w D:\\ColibriData\\" + today.toString() + "\\Bias";
    Console.PrintLine("Executing command: " + command);

    // Run ColibriGrab.exe
    wsh.Run(command, 1, true); // 1: normal window, true: wait for completion

    // tid = Util.ShellExec("ColibriGrab.exe", "-n 50 -p Bias_25ms -e 0 -t 0 -f bias -w D:\\ColibriData\\" + today.toString() + "\\Bias");
    // while (Util.IsTaskActive(tid))
    // {
    //     Util.WaitForMilliseconds(500)
    //     // Console.PrintLine("Collecting bias frames...")
    // }

    // Util.ShellExec("taskkill.exe", "/im ColibriGrab.exe /t /f");
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
function darkCollection(today) {
    var wshShell = new ActiveXObject("WScript.Shell");
    var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");
    var colibriGrabPath = userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";

    // var tid;
    // var today = getDate();
    // Console.Printline(today.toString());

    Console.PrintLine("Starting dark frame collection...");
    Console.Printline("d:\\ColibriData\\" + today.toString() + "\\Dark");

    var wsh = new ActiveXObject("WScript.Shell");
    var command = "\"" + colibriGrabPath + "\" -n 10 -p Dark_25ms -e 0 -t 0 -f dark -w D:\\ColibriData\\" + today.toString() + "\\Dark";

    // Run ColibriGrab.exe
    wsh.Run(command, 1, true); // 1: normal window, true: wait for completion

    // tid = Util.ShellExec("ColibriGrab.exe", "-n 10 -p Dark_25ms -e 25 -t 0 -f dark -w D:\\ColibriData\\" + today.toString() + "\\Dark");
    // while (Util.IsTaskActive(tid))
    // {
    //     Util.WaitForMilliseconds(500)
    //     // Console.PrintLine("Collecting dark frames...")
    // }

    // Util.ShellExec("taskkill.exe", "/im ColibriGrab.exe /t /f");
    Util.WaitForMilliseconds(100)
    Console.PrintLine("Finished collecting dark frames...");

    // Append and delete ColibriGrab log to ACP log after collectin dark frames
    appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);
}

/*
// Does the dirty work of collecting image data given a filter.
// Combines functionality of biasCollection and darkCollection functions.
function imgCollection(today, filter) {
    var wshShell = new ActiveXObject("WScript.Shell");
    var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");
    var colibriGrabPath = userProfiel + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";

    Console.PrintLine("Starting " + filter + " frame collection...");
    Console.PrintLine("d:\\ColibriData\\" + today.toString() + "\\" + filter);

    var command = "\"" + colibriGrabPath + "\" -n 10 -p " + filter + "_25ms -e 25 -t 0 -f " + filter + " -w D:\\ColibriData\\" + today.toString() + "\\" + filter;
    
    wshShell.Run(commdn, 1, true); // 1: normal window, true: wait for completion

    Util.WaitForMilliseconds(100);
    Console.PrintLine("Finished collecting " + filter + " frames...");

    // Append and delete ColibriGrab log to ACP log after collecting filter frames
    appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);
}

*/

///////////////////////////
// Function to connect the telescope
// MJM -
///////////////////////////

function connectScope()
{
    // Check to see if telescope is connected. If not, try to connect to it.
    if (Telescope.Connected) {
        Console.PrintLine("Telescope is connected!")
        trkOn()
    } else {
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
    Console.PrintLine(ACPApp.Path);
    var BS = SH.Exec(ACPApp.Path + "\\aa.exe -moon");
    // var BS = SH.Exec()
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
// function shutDown()
// {
//     trkOff()
//     Console.PrintLine("Tracking turned off. Parking telescope now...")
//     ts.WriteLine(Util.SysUTCDate + " INFO: Tracking turned off. Parking telescope now.")
//     Telescope.Park()
//     trkOff();
//     Console.PrintLine("Telescope parked. Closing dome now...")
//     ts.WriteLine(Util.SysUTCDate + " INFO: Telescope parked. Closing dome now.")
//     domeClose()
//     Console.PrintLine("Dome closed. Good night/morning.")
//     ts.WriteLine(Util.SysUTCDate + " INFO: Dome closed. Good night/morning.")
// }

function shutDown() {
    trkOff();
    Console.PrintLine("Tracking turned off. Parking telescope now...");
    ts.WriteLine(Util.SysUTCDate + " INFO: Tracking turned off. Parking telescope now.");
    Telescope.Park();
    trkOff();
    Console.PrintLine("Telescope parked. Closing dome now...");
    ts.WriteLine(Util.SysUTCDate + " INFO: Telescope parked. Closing dome now.");
    domeClose();
    Console.PrintLine("Dome closed. Good night/morning.");
    ts.WriteLine(Util.SysUTCDate + " INFO: Dome closed. Good night/morning.");

    // Handle the case when requested observations are not completed
    var lines = getRequests()[1];
    for (var i = 0; i < lines.length; i++) {
        var data = lines[i].split(",");
        if (data[10] == 0) {
            Console.PrintLine("Observation " + line[0] + " was not completed.");
            ts.WriteLine(Util.SysUTCDate + " Observation " + line[0] + " was not completed.");
            Console.PrintLine("Updating date and priority to be observed tomorrow.");
            ts.WriteLine(Util.SysUTCDate + " Updating date and priority to be observed tomorrow.");

            data[4] = updateDay(data[4]);
            data[5] = updateDay(data[5]);
            data[1] = parseInt(data[1]) + 1;
        }
    }
    
    updateCSV(lines);
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

// This function appends the ColibriGrab log file to the ACP log file and then deletes it afterwards.
// Function to append the ColibriGrab data each time it runs to the end of the log to allow better diagnostics where problems might be happening
function appendAndDeleteColibriGrabLog(colibriLogFile, LogFile) {
    try{
        if (fso.FileExists(colibriLogFile)) {
            var colibriLog = fso.OpenTextFile(colibriLogFile, ForReading, false);

            while (!colibriLog.AtEndOfStream) {
                var logLine = colibriLog.ReadLine();
                ts.WriteLine(Util.SysUTCDate + " " + logLine);
            }

            colibriLog.close();

            // Delete the ColibriGrab log file after appending its contents
            fso.DeleteFile(colibriLogFile);
            Console.PrintLine(Util.SysUTCDate + " INFO: Deleted ColibriGrab log file after appending.");
            ts.WriteLine(Util.SysUTCDate + " INFO: Deleted ColibriGrab log file after appending.");
        } else {
            Console.PrintLine(Util.SysUTCDate + " ERROR: ColibriGrab log file does not exist.");
            ts.WriteLine(Util.SysUTCDate + " ERROR: ColibriGrab log file does not exist.");
        }
    } catch (e) {
        Console.PrintLine("ERROR: " + e.message);
        ts.WriteLine(Util.SysUTCDate + " ERROR: " + e.message);
    }
}

// END OF FUNCTIONS

// Global variables:
// ACP Variables
var logconsole = true;
var firstRun = true;
var isAfterSunset = false;
var fso, f1, ts;
var Mode = 8;
var currentDate = getDate();
var pierside = "E";

var ForReading = 1;
var ForAppending = 8;

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

if (logconsole == true) {
    Console.LogFile = "d:\\Logs\\ACP\\" + Util.FormatVar(Util.SysUTCDate, "yyyymmdd_HhNnSs") + "-ACPconsole.log";
    Console.Logging = true;
}
    
sunset  = twilightTimes(Util.SysJulianDate)[1]
LogFile = "d:\\Logs\\ACP\\" + JDtoUTC(sunset) + "-ACP.log";
fso = new ActiveXObject("Scripting.FileSystemObject");
    
if (fso.FileExists(LogFile)) {
    Console.PrintLine("Log file exists. Appending to existing log file.");
} else {
    fso.CreateTextFile(LogFile);
}

f1 = fso.GetFile(LogFile);
// Check to see if f1 open. If not, do the following...
ts = f1.OpenAsTextStream(Mode, true);
Console.PrintLine("Log file ready.")

function main() {
    // Get times of sunrise and sunset
    // twilightTimes: [0] - JD of sunrise, [1] - JD of sunset
    // Note! The calculation for sunsetLST only works if you are west of Greenwich
    sunset  = twilightTimes(Util.SysJulianDate)[1]
    sunrise = twilightTimes(Util.SysJulianDate + 1)[0]
    sunsetLST  = (Util.Julian_GMST(sunset)  + Telescope.SiteLongitude/15).toFixed(1)
    sunriseLST = (Util.Julian_GMST(sunrise) + Telescope.SiteLongitude/15).toFixed(1)

    var moonCT = getMoon();

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

    // Prestart checks
    // Check to see if the weather server is connected. If it isn't ask for
	// permission to continue.
	if (Weather.Available) {
            Console.PrintLine("Weather server is connected. Continuing with operations.");
            ts.WriteLine(Util.SysUTCDate + " INFO: Weather server is connected. Continuing with operations.");
            Util.WaitForMilliseconds(3000);
    } else {
        if (Util.Confirm("No weather server! Do you want to continue? Choose wisely...")) {
            Console.PrintLine("Ok, you've chosen to proceed with no weather server. 8-O")
            ts.WriteLine(Util.SysUTCDate + " WARNING: No weather server. You've chosen to proceed without. 8-O")
            ignoreWeather = true
            Util.WaitForMilliseconds(3000)
        } else {
            abort();
        }
    }
    
    // If the weather server is connected and the weather is not safe, wait
    // until it becomes safe.
    if (Weather.Available && !Weather.safe) {
        ts.WriteLine(Util.SysUTCDate + " INFO: Weather unsafe! Waiting until it's looking a bit better out.")
    }

    while (Weather.Available && !Weather.safe) {
        if (getDate() != currentDate) {
            currentDate = getDate()
            LogFile = "d:\\Logs\\ACP\\" + JDtoUTC(sunset) + "-ACP.log"

            if (fso.FileExists(LogFile)) {
                Console.PrintLine(Util.SysUTCDate + " INFO: Log file exists. Appending to existing log file.");
            } else {
                fso.CreateTextFile(LogFile);
            }

            f1 = fso.GetFile(LogFile);
            try {
                ts = f1.OpenAsTextStream(Mode, true);
            } catch(err) {
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
    if (getDate() != currentDate) {
        currentDate = getDate()
        LogFile = "d:\\Logs\\ACP\\" + JDtoUTC(sunset) + "-ACP.log"

        if (fso.FileExists(LogFile)) {
            Console.PrintLine("Log file exists. Appending to existing log file.");
        } else {
            fso.CreateTextFile(LogFile);
        }

        f1 = fso.GetFile(LogFile);
        if (fso.FileExists(LogFile)){
            Console.PrintLine("Log file exists. Appending to existing log file.");

        } else {
            ts = f1.OpenAsTextStream(Mode, true);
        }
    }

    // Observing Plan
    // Create directory for tonight's data and collect dark frames
	if (firstRun = true) {
        var today = JDtoUTC(sunset); // Today's UTC date to be used to define data directory
        // Console.Logging = false
        // Console.Logfile = "d:\\Logs\\ACP\\" + getDate() + "-ACP.log"
        // Console.Logging = true
        Util.ShellExec("cmd.exe", "/c mkdir -p d:\\ColibriData\\" + today.toString() + "\\Dark\\")
        Console.PrintLine("Created today's data directory at d:\\ColibriData\\" + today.toString())
        ts.WriteLine(Util.SysUTCDate + " INFO: Created today's data directory at d:\\ColibriData\\" + today.toString())
        //Console.PrintLine("Collecting dark frames...")
        firstRun = false
    }

    var csvData = getRequests();
    Console.PrintLine(csvData);
    var requests = csvData[0];
    var lines = csvData[1];

    for (var i = 0; i < requests.length; i++) {
        var request = requests[i];
        Console.PrintLine(request.directoryName);
    }

    // Begin Operations
    do {
        var bestObs = selectBestObservation(requests, sunset, sunrise, moonCT);

        // Safeguard against opening before the start of the observing plan
        // COMMENT OUT FOR SIMULATED DOME TESTING DURING THE DAY
        // while (Util.SysJulianDate < sunset) {
        //     Console.PrintLine("")
        //     Console.PrintLine("It's still too early to begin... Waiting for " + ((sunset - Util.SysJulianDate)*86400).toFixed(0) + " seconds.")
        //     Util.WaitForMilliseconds(5000)
        // }

        // Safeguard against opening after the end of the observing plan/sunrise
        if (Util.SysJulianDate > sunrise) {
            Console.PrintLine("")
            Console.PrintLine("Too late. Nothing left to observe.")
            ts.WriteLine(Util.SysUTCDate + " INFO: Too late... Nothing left to observe.")
            // if (Util.IsTaskActive(tid))
                //Util.ShellExec("taskkill.exe", "/im ColibriGrab.exe /t /f")
            // abortAndRestart()
            andRestart()
        }

        // Monitor the weather status, if the weather script is active
        // TODO: Add Goto and all that stuff.
        if ((Weather.Available && Weather.safe) || (ignoreWeather == true)) {
            Console.PrintLine("Checking Weather")
            connectScope()
            domeOpen()
            trkOn()
        }

        if (bestObs == null) {
            // No suitable observation found in current conditions.
            // Wait for 5 minutes and try again.
            Util.WaitForMilliseconds(300000);
            continue;
        }

        // Log output of selectBestObservation
        // selectBestObservation returns a Request with properties: directoryName, priority, ra, dec, startUTC, startJD, endUTC, endJD, numExposures, exposureTime, filter, binning, altitude, moonAngle, score, and csvIndex
        Console.PrintLine("")
        ts.WriteLine(Util.SysUTCDate + " INFO: Requested observation Info")
        Console.PrintLine("Directory Name: " + bestObs.directoryName)
        ts.WriteLine(Util.SysUTCDate + " INFO: Directory Name: " + bestObs.directoryName)
        Console.PrintLine("Priority: " + bestObs.priority)
        ts.WriteLine(Util.SysUTCDate + " INFO: Priority: " + bestObs.priority)
        Console.PrintLine("RA: " + bestObs.ra)
        ts.WriteLine(Util.SysUTCDate + " INFO: RA: " + bestObs.ra)
        Console.PrintLine("Dec: " + bestObs.dec)
        ts.WriteLine(Util.SysUTCDate + " INFO: Dec: " + bestObs.dec)
        Console.PrintLine("Start UTC: " + bestObs.startUTC)
        ts.WriteLine(Util.SysUTCDate + " INFO: Start UTC: " + bestObs.startUTC)
        Console.PrintLine("Start JD: " + bestObs.startJD)
        ts.WriteLine(Util.SysUTCDate + " INFO: Start JD: " + bestObs.startJD)
        Console.PrintLine("End UTC: " + bestObs.endUTC)
        ts.WriteLine(Util.SysUTCDate + "INFO: End UTC: " + bestObs.endUTC)
        Console.PrintLine("End JD: " + bestObs.endJD)
        ts.WriteLine(Util.SysUTCDate + "INFO: End JD: " + bestObs.endJD)
        Console.WriteLine("Number of Exposure: " + bestObs.numExposures)
        ts.WriteLine(Util.SysUTCDate + "INFO: Number of Exposures: " + bestObs.numExposures)
        Console.PrintLine("Exposure Time: " + bestObs.exposureTime)
        ts.WriteLine(Util.SysUTCDate + "INFO: Exposure Time: " + bestObs.exposureTime)
        Console.PrintLine("Filter: " + bestObs.filter)
        ts.WriteLine(Util.SysUTCDate + "INFO: Filter: " + bestObs.filter)
        Console.PrintLine("Binning: " + bestObs.binning)
        ts.WriteLine(Util.SysUTCDate + "INFO: Binning: " + bestObs.binning)
        Console.PrintLine("Altitude: " + bestObs.altitude)
        ts.WriteLine(Util.SysUTCDate + "INFO: Altitude: " + bestObs.altitude)
        Console.PrintLine("Moon Angle: " + bestObs.moonAngle)
        ts.WriteLine(Util.SysUTCDate + "INFO: Moon Angle: " + bestObs.moonAngle)
        Console.PrintLine("Score: " + bestObs.score)
        ts.WriteLine(Util.SysUTCDate + "INFO: Score: " + bestObs.score)
        Console.PrintLine("CSV Index: " + bestObs.csvIndex)
        ts.WriteLine(Util.SysUTCDate + "INFO: CSV Index: " + bestObs.csvIndex)
        

        // Create coordinate transform for the current request
        currentFieldCt = Util.NewCThereAndNow()
        currentFieldCt.RightAscension = bestObs.ra / 15
        currentFieldCt.Declination = bestObs.dec

        // Monitor and log the coordinates which the telescope slews to
        Console.PrintLine("")
        Console.PrintLine("Slewing to...")
        Console.PrintLine("RA: " + currentFieldCt.RightAscension)
        Console.PrintLine("Dec: " + currentFieldCt.Declination)
        ts.WriteLine(Util.SysUTCDate + " INFO: Slewing to...")
        ts.WriteLine(Util.SysUTCDate + " INFO: RA: " + currentFieldCt.RightAscension)
        ts.WriteLine(Util.SysUTCDate + " INFO: Dec: " + currentFieldCt.Declination)
        ts.WriteLine(Util.SysUTCDate + " INFO: Alt: " + currentFieldCt.Elevation)
        ts.WriteLine(Util.SysUTCDate + " INFO: Az: " + currentFieldCt.Azimuth)

        // Slew to the current field
        gotoRADec(currentFieldCt.RightAscension, currentFieldCt.Declination)

        // Slave the dome to the telescope and wait until they are both in
        // the correct position to begin observing
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
        Console.PrintLine("Target Alt/Az is: Alt. =" + currentFieldCt.Elevation.toFixed(2) + "   Az.= " + currentFieldCt.Azimuth.toFixed(2));
        ts.WriteLine(Util.SysUTCDate + " INFO: At target.")
        ts.WriteLine(Util.SysUTCDate + " INFO: Target Alt/Az is: Alt. =" + currentFieldCt.Elevation.toFixed(2) + "   Az.= " + currentFieldCt.Azimuth.toFixed(2))

        // Readjust the telescope pointing using child script
        adjustPointing(currentFieldCt.RightAscension, currentFieldCt.Declination)
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

        // Check pier side
        if (Telescope.SideOfPier == 0)
        {
            pierside = "E"
            Console.PrintLine("Pier side: " + pierside)
        }
        else
        {
            pierside = "W"
            Console.PrintLine("Pier side: " + pierside)
        }

        // Data Collection
        Console.PrintLine("")
        Console.Printline("Starting data collection...")
        // Console.PrintLine("Running from " + Util.SysJulianDate + " until " + endJD)
        ts.WriteLine(Util.SysUTCDate + " INFO: Starting data collection.")

        // Create directory for requested observation images
        Util.ShellExec("cmd.exe", "/c mkdir -p d:\\ColibriData\\" + today.toString() + "\\" + bestObs.directoryName)

        // Iterables
        darkCounter = darkInterval // Set equal to interval so that dark set is collected on first run
        runCounter = 1

        // while (runCounter <= bestObs.numExposures) {
            // Check pier side
            if (Telescope.SideOfPier != Telescope.DestinationSideOfPier(currentFieldCt.RightAscension, currentFieldCt.Declination)) {
                Console.PrintLine("Flipping sides of pier...")
                ts.WriteLine(Util.SysUTCDate + " INFO: Flipping sides of the pier.")
                gotoRADec(currentFieldCt.RightAscension, currentFieldCt.Declination);

                // Readjust the telescope pointing using child script
                adjustPointing(currentFieldCt.RightAscension, currentFieldCt.Declination)
                while (Telescope.Slewing == true) {
                    Console.PrintLine("Huh. Still Slewing...")
                    Util.WaitForMilliseconds(500)
                }

                Dome.UnparkHome()
                if (Dome.slave == false) {
                    Dome.slave == true
                }

                while (Dome.Slewing == true) {
                    Console.PrintLine("Dome is still slewing. Give me a minute...")
                    Util.WaitForMilliseconds(500)
                }

                // Check pier side
                if (Telescope.SideOfPier == 0) {
                    pierside = "E"
                    Console.PrintLine("Pier side: " + pierside)
                } else {
                    pierside = "W"
                    Console.PrintLine("Pier side: " + pierside)
                }
            } else { Console.PrintLine("Already on the right side of the pier"); }

            // Collect darkes when darkInterval is reached
            if (darkCounter == darkInterval) {
                darkCollection(today) 
                darkCounter = 0
            }
            darkCounter++
            Console.PrintLine("Dark counter = " + darkCounter.toString())

            // Dynamicallly fetches the correct path to ColibriGrab.exe
            var wshShell = new ActiveXObject("WScript.Shell");
            var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");
            var colibriGrabPath = userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";

            // Commands to run ColibriGrabe.exe from the GitHub
            var wsh = new ActiveXObject("WScript.Shell");
            var command = "\"" + colibriGrabPath + "\" -n " + bestObs.numExposures.toString() + " -p " + bestObs.directoryName + "_" + bestObs.exposureTime + "ms-" + pierside + " -e " + bestObs.exposureTime + " -t 0 -f " + bestObs.filter + "-w D:\\ColibriData\\" + today.toString() + "\\" + bestObs.directoryName;

            Console.PrintLine("Executing command: " + command);
            ts.WriteLine(Util.SysUTCDate + " INFO: Executing command: " + command); // Write the command to the log file

            // Run ColibriGrab.exe
            wsh.Run(command, 1, true);

            Util.WaitForMilliseconds(50);

            // Append and delete ColibriGrab log fo ACP log after each run
            appendAndDeleteColibriGrabLog("D:\\colibrigrab_tests\\colibrigrab_output.log", LogFile);
            Console.PrintLine("Done exposing run # " + runCounter.toString());
            ts.WriteLine(Util.SysUTCDate + " INFO: Done exposing run # " + runCounter.toString()); // Log completion of each run

            runCounter++;

            // Mark requested observation as completed in CSV file
            try {
                // var readFile = fso.OpenTextFile('./colibri_user_observations.csv', 1);
                // var lines = [];
                // while (!readFile.AtEndOfStream) {
                //     lines.push(file.ReadLine());
                // }
                // readFile.Close();

                if (bestObs.csvIndex >= 0 && bestObs.csvIndex < lines.length) {
                    var rowData = lines[bestObs.csvIndex].split(",");

                    // Modify data in rowData as needed
                    // var requestIndices = new RequestIndices();
                    rowData[10] = 1;

                    // Join modified rowData back into a CSV line
                    lines[bestObs.csvIndex] = rowData.join(",");
                } else {
                    Console.PrintLine("Index out of range or file is empty.");
                }

                updateCSV(lines);
            //     // Write the modified data back to the file
            //     var writeFile = fso.OpenTextFile('./colibri_user_observations.csv', 2) // ForWriting (2)
            //     for (var i = 0; i < lines.length; i++) {
            //         writeFile.WriteLine(lines[i]);
            //     }
            //     writeFile.Close();

            // Console.PrintLine("CSV File modified successfully.");
            } catch (e) {
                Console.PrintLine("Error: " + e.message);
            }

            requests.shift();
        // }
    } while (requests.length > 0);

    shutDown();
}
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
    var JD = (367 * K) - Math.trunc((7 * (K + Math.trunc((M + 9) / 12))) / 4) + Math.trunc((275 * M) / 9) + I + 1721013.5 + (ut / 24) - (0.5 * Math.sign(100 * K + M - 190002.5)) + 0.5;

    return JD;
}

function getRequests() {
    var requests = [];
    var indices = new RequestIndices();

    try {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var file = fso.OpenTextFile("./colibri_user_observations.csv", readMode); // 1 = For Reading

        var rowCounter = 0;
        var line;

        while(!file.AtEndOfStream) {
            if (rowCounter != 0) {
                var rowData = line.split(",");

                if (rowData[parseInt(indices.completion)] == 0) {
                    var request = new Request;
                    line = file.ReadLine();

                    request.directoryName = rowData[parseInt(indices.directoryName)];
                    request.priority = parseInt(rowData[parseInt(indices.priority)]);

                    request.ra = parseFloat(rowData[parseInt(indices.ra)]);
                    request.dec = parseFloat(rowData[parseInt(indices.dec)]);

                    request.startUTC = rowData[parseInt(indices.startTime)];
                    request.endUTC = rowData[parseInt(indices.endTime)];
                    request.startJD = UTCtoJD(request.startUTC);
                    request.endJD = UTCtoJD(request.endUTC);

                    request.numExposures = parseInt(rowData[parseInt(indices.numExposures)]);
                    request.exposureTime = parseFloat(rowData[parseInt(indices.exposureTime)]);
                    request.filter = rowData[parseInt(indices.filter)];
                    request.binning = rowData[parseInt(indices.binning)];

                    request.csvIndex = rowCounter;

                    requests.push(request);
                }
            }
            rowCounter++;
        }
        file.Close();
        fso = null;
    } catch (e) {
        Console.PrintLine("An error occurred: " + e.message);
    }

    return requests;
}

function selectBestObservation(requests) {
    var suitableObs;
    var rankedObs;
    var bestObs;

    suitableObs = filterByTime(requests, sunset, sunrise);
    suitableObs = filterByAstronomy(suitableObs, moonCT);
    rankedObs = rankObservations(suitableObs);
    bestObs = selectTopObservation(rankedObs);

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
        if (meetsAstronomyConditions(request, moonCT, currLST)) {
            filteredObs.push(request);
        }
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

//RunColibri Functions
// Handles script --> Combines the functionality of abort, abortAndRestart, and andRestart scripts from RunColibri
function abort(ts, action) {
    if (action == "abort" || action == "abortAndRestart") {
        Console.PrintLine("Aborting script!");
        ts.WriteLine(Util.SysUTCDate + "ERROR: Aborting script!");
        if (action == "abortAndRestart") {
            ts.WriteLine("Restarting Script!" );
        } 
    } else if (action == "andRestart") {
            Console.PrintLine("Shutting down and restarting!");
    }

    shutDown();
    while(Dome.ShutterStatus != 1 || Telescope.AtPark != true) {
        Util.WaitForMilliseconds(5000);
        Console.PrintLine("Waiting 5 seconds for shutter to close and telescope to park...");
    }

    if (action == "abort" || action == "abortAndRestart") {
        if (Util.ScriptActive) {
            Console.PrintLine("Aborting...");
            Util.AbortScript();
        }

        while (Util.ScriptActive) {
            Console.PrintLine("Waiting for script to finish...");
            Util.WaitForMilliseconds(1000);
        }
    }

    if (action == "abortAndRestart" || action == "andRestart") {
        main();
    }
}


// END OF FUNCTIONS

// Global variables:
var elevationLimit = 10;
var minMoonOffset = 15;
var readMode = 1;
var writeMode = 2;
var appendMode = 8;


function main() {
    var sunset = twilightTimes(Util.SysJulianDate)[1];
    var sunrise = twilightTimes(Util.SysJulianDate + 1)[0];
    var moonCT = getMoon();

    var ts = openLogFile(sunset);
    
    var ignoreWeather = false;

    // Prestart checks
    // Check the weather server
    if (Weather.Available) {
        // Weather conneted. Continue with operations.
        Util.WaitForMilliseconds(3000);
    }
    else {
        if (Util.Confirm("No weather server! Continue?")) {
            // Chosen to proceed without weather server
            ignoreWeather = true;
            Util.WaitForMilliseconds(3000);
        }
        else {
            abort(ts);
        }
    }





    var requests = getRequests();
    // Begin Operations
    do {
        var bestObs = selectBestObservation(requests);

        while (Util.SysJulianDate < sunset) {
            // Too early. Wait for sunset
            Util.WaitForMilliseconds(5000);
        }

        if (Util.SysJulianDate > sunrise) {
            // Too late. Nothing left to observe
            andRestart(ts);
        }

        if ((Weather.Available && Weather.Safe) || ignoreWeather) {
            connectScope();
            domeOpen();
            trkOn();
        }

        if (bestObs == null) {
            // No suitable observation found in current conditions.
            // Wait for 5 minutes and try again.
            Util.WaitForMilliseconds(300000);
            continue;
        }

        // Create coordinate transform for current request
        var requestCT = Util.NewCThereAndNow();
    } while (requests.length > 0);
}
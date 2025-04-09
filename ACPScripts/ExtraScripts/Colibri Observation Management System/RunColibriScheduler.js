// Scheduling observation request objects
// Request Object is used to represent scheduling observation requests.

// Each request contains details such as target coordinates, timing, exposure settings, and observation metadata.
function Request(directoryName, priority, ra, dec, startUTC, startJD, endUTC, endJD, obsDuration, exposureTime, filter, binning, csvIndex) {

    // Directory name where the observation data will be saved.
    this.directoryName = directoryName;
    // Priority of the observation request (higher priority requests are scheduled first).
    this.priority = priority;

    // Right Ascension (RA) of the celestial target (in degrees).
    this.ra = ra;
    // Declination (DEC) of the celestial target (in degrees).
    this.dec = dec;

    // Start time of the observation in UTC format (human-readable).
    this.startUTC = startUTC;
    // Start time of the observation in Julian Date (JD) format (for astronomical calculations).
    this.startJD = startJD;
    // End time of the observation in UTC format.
    this.endUTC = endUTC;
    // End time of the observation in Julian Date format.
    this.endJD = endJD;

    // Total duration of the observation (in minutes).
    this.obsDuration = obsDuration;
    // Time for a single exposure (in seconds).
    this.exposureTime = exposureTime;

    // Filter applied during the observation (1 for normal, 2 for dark, or 3 for biased)
    this.filter = filter;
    // Binning setting for the camera (1 for 1x1 or 2 for 2x2)
    this.binning = binning;

    // Altitude of the target during observation, initialized to 0 (calculated later).
    this.altitude = 0;
    // Angular distance between the target and the moon, initialized to 0 (calculated later).
    this.moonAngle = 0;

    // Score assigned to the request, used for sorting and prioritization.
    this.score = 0;
    // Index of the request in the CSV file (used to track and manage CSV data).
    this.csvIndex = csvIndex;

    //DEBUG by Owen/Akshat
    this.astronomyScore = "";
    this.timeScore = "";
    this.totalScore = "";
    //DEBUG by Owen/Akshat

    // Method to compare the score of the current request with another request.
    // Returns true if the current request's score is higher, used for sorting requests.
    this.compareScore = function(otherRequest) { return otherRequest.score - this.score; };
}

// RequestIndices object maps the fields in a CSV file to corresponding observation request parameters.
// This class helps index fields when parsing observation requests from a CSV file.
function RequestIndices() {
   
    this.directoryName = 0;     // Index of the directory name in the CSV file.
    this.priority = 1;          // Index of the priority field.

    this.ra = 2;                // Index of the Right Ascension (RA) field.
    this.dec = 3;               // Index of the Declination (DEC) field.

    this.startTime = 4;         // Index of the observation start time field.
    this.endTime = 5;           // Index of the observation end time field.

    this.obsDuration = 6;       // Index of the observation duration field.
    this.exposureTime = 7;      // Index of the exposure time field.
    this.filter = 8;            // Index of the filter field.
    this.binning = 9;           // Index of the binning field.

    this.completion = 10;       // Index to track whether the observation request has been completed (1 for completed, 0 for uncompleted).
}

// Added by Akshat and Owen
function isoStringToUTC(timeString){
    
    timeString = timeString.replace('-', ':');
    timeString = timeString.replace('-', ':');
    timeString = timeString.replace('T', ':');
    timeString = timeString.replace(':00.000Z', '');

    return timeString;
}

// Added by Akshat and Owen
function formatISODate(date) {
    function pad(n) { return n < 10 ? '0' + n : n; }
    return date.getUTCFullYear() + '-' +
           pad(date.getUTCMonth() + 1) + '-' +
           pad(date.getUTCDate()) + 'T' +
           pad(date.getUTCHours()) + ':' +
           pad(date.getUTCMinutes()) + ':' +
           pad(date.getUTCSeconds()) + '.' +
           (date.getUTCMilliseconds() / 1000).toFixed(3).slice(2, 5) + 'Z';
}

// Added by Akshat and Owen
function JDtoUTCScheduler(JD, debug){
    var unixTimestamp = (JD - 2440587.5) * 86400000;
    var newDate;
    if(debug === undefined){
        newDate = isoStringToUTC(formatISODate(new Date(unixTimestamp)));
    }
    else{
        newDate = isoStringToUTC(new Date(unixTimestamp).toISOString());
    }
    newDate = newDate.split(":"); // Convert to JavaScript Date object

    var date = "";
    for (var i = 0; i < 5; i++) {
        if (i > 0) {
            date += ":";
        }
        date += newDate[i];
    }

    return date;
}


// Scheduling-related functions
// Converts a UTC time string to a Julian Date (JD) for astronomical calculations.
// JD is used for precision in tracking celestial events and scheduling observations.
function UTCtoJD(UTC, debug) {

    // Split the UTC string into its components: year, month, day, hour, and minutes.
    var dividedUTC = UTC.split(":");

    // Parse the components as integers for calculation.
    var year = parseInt(dividedUTC[0], 10);
    var month = parseInt(dividedUTC[1], 10);
    var day = parseInt(dividedUTC[2], 10);
    var hour = parseInt(dividedUTC[3], 10);
    var minute = parseInt(dividedUTC[4], 10);

    // Convert the time into fractional hours and then fractional days.
    var fracHour = hour + (minute / 60); // Convert minutes to hours.
    var fracDay = day + (fracHour / 24); // Convert hours to a fractional part of the day.

    if (debug === undefined) { // normal operation of code
        // Use the ACP Util Object to calculate the Julian Date from the year, month, and fractional day.
        return Util.Calendar_Julian(year, month, fracDay);
    }
    // debug mode which can be tested in say VS Code
        // If month is January or February, adjust year and month for the Julian calculation
        if (month <= 2) {
            year -= 1;
            month += 12;
        }
        // Calculate Julian Day Number using the standard formula
        var A = Math.floor(year / 100);
        var B = 2 - A + Math.floor(A / 4);
        var JD = Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;
        // Add the fractional day to the Julian Day
        return JD + fracDay;
}

// Reads and parses observation requests from a CSV file.
// The function returns an array of Request objects along with the raw CSV data.
function getRequests(debug) {
    
    var requests = [];  // Array to store the parsed Request objects.
    var lines = [];     // Array to store the raw lines from the CSV file.
    var indices = new RequestIndices(); // Object to map CSV fields to request parameters.

    if (debug === undefined) { // normal operation of code
        try {
            // Create an ActiveX object for file system operations.
            var fso = new ActiveXObject("Scripting.FileSystemObject");
            // Open the CSV file containing the observation request in read-only mode.
            var file = fso.OpenTextFile("./colibri_user_observations.csv", ForReading);

            var rowCounter = -1; // Counter to track the row index in the CSV file.
            var rowData = [];    // Array to hold the individual fields of a CSV row.

            // Loop through the CSV file line by line until reaching the end of the file.
            while(!file.AtEndOfStream) {
                if (rowCounter >= 0) { // Skip the header row (first row of the CSV).
                    var line = file.ReadLine(); // Read a line from the CSV file.
                    lines.push(line); // Add the raw line to the lines array.
                    rowData = line.split(","); // Split the line by commas to get individual fields.
                    
                    // Check if the observation request has not been completed (completion field is 0).
                    if (rowData[indices.completion] == 0) {
                        
                        // Create a new Request object using the parsed CSV fields.
                        var request = new Request(
                            rowData[indices.directoryName], // Directory name.
                            parseInt(rowData[indices.priority]), // Priority as an integer.
                            parseFloat(rowData[indices.ra]), // Right Ascension as a float.
                            parseFloat(rowData[indices.dec]), // Declination as a float.
                            rowData[indices.startTime], // Start time in UTC.
                            UTCtoJD(rowData[indices.startTime]), // Convert start time to Julian Date.
                            rowData[indices.endTime], // End time in UTC.
                            UTCtoJD(rowData[indices.endTime]), // Convert end time to Julian Date.
                            parseInt(rowData[indices.obsDuration]), // Observation duration as an integer.
                            parseFloat(rowData[indices.exposureTime]), // Exposure time as a float.
                            rowData[indices.filter], // Filter used for the observation.
                            rowData[indices.binning], // Binning setting.
                            rowCounter // Index of the request in the CSV file.
                        );

                        // Add the newly created Request to the array.
                        requests.push(request);
                    }
                }
                // Increment the row counter to move to the next line.
                rowCounter++;
            }
            file.Close(); // Close the CSV file after reading all lines.
            fso = null; // Release the FileSystemObject.
        } catch (e) {
            // Print an error message to the console if an exception occurs.
            Console.PrintLine("An error occurred: " + e.message);
        }
        // Return the array of Request objects and the raw CSV lines.
        return [requests, lines];
    }
    // debug mode which can be tested in say VS Code
    var fs = require('fs');
    var data;
    try {
        data = fs.readFileSync('./colibri_user_observations.csv', 'utf8');
      } catch (err) {
        console.error(err);
        }

    var rowCounter = -1; // Counter to track the row index in the CSV file.
    var rowData = [];    // Array to hold the individual fields of a CSV row.
    file = data.split("\n");

    // Loop through the CSV file line by line until reaching the end of the file.
    while(rowCounter < file.length){
        if (rowCounter > 0) { // Skip the header row (first row of the CSV).
            var line = file[rowCounter];
            line = line.replaceAll('\r', '');
            if(line == ''){
                rowCounter++;
                continue;
            }
            lines.push(line); // Add the raw line to the lines array.
            rowData = line.split(","); // Split the line by commas to get individual fields.
            
            // Check if the observation request has not been completed (completion field is 0).
            if (rowData[indices.completion] == 0) {
                
                // Create a new Request object using the parsed CSV fields.
                var request = new Request(
                    rowData[indices.directoryName], // Directory name.
                    parseInt(rowData[indices.priority]), // Priority as an integer.
                    parseFloat(rowData[indices.ra]), // Right Ascension as a float.
                    parseFloat(rowData[indices.dec]), // Declination as a float.
                    rowData[indices.startTime], // Start time in UTC.
                    UTCtoJD(rowData[indices.startTime], "debug"), // Convert start time to Julian Date.
                    rowData[indices.endTime], // End time in UTC.
                    UTCtoJD(rowData[indices.endTime], "debug"), // Convert end time to Julian Date.
                    parseInt(rowData[indices.obsDuration]) <= 0 ? 5 : parseInt(rowData[indices.obsDuration]), // Observation duration as an integer.
                    parseFloat(rowData[indices.exposureTime]), // Exposure time as a float.
                    rowData[indices.filter], // Filter used for the observation.
                    rowData[indices.binning], // Binning setting.
                    rowCounter // Index of the request in the CSV file.
                );
                requests.push(request);
            }
        }
        rowCounter++;
    }
    // Return the array of Request objects and the raw CSV lines.
    return [requests, lines];
}


// Added by Akshat and Owen to run LSTNow on local machine
function getLST(longitude, UTCstring, timeFastForward) {
    var now = UTCstring.split(":");
    
    // Get current UTC time components
    var year = parseInt(now[0], 10);
    var month = parseInt(now[1], 10) - 1; // Adjust for zero-based index
    var day = parseInt(now[2], 10);
    var hours = parseInt(now[3], 10);
    var minutes = parseInt(now[4], 10);
    
    var date = new Date(year, month, day, hours, minutes, 0); // No ISO string parsing

    date.setTime(date.getTime() + timeFastForward * 60000);

    year = date.getFullYear();
    month = date.getMonth() + 1; // Convert back to 1-based index
    day = date.getDate(); // Corrected from getDay()
    hours = date.getHours();
    minutes = date.getMinutes();

    // Convert to Julian Date
    if (month <= 2) {
        year -= 1;
        month += 12;
    }

    var A = Math.floor(year / 100);
    var B = 2 - A + Math.floor(A / 4);

    var JD = Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5 +
             (hours + minutes / 60) / 24; // No `seconds` variable used

    // Calculate Julian Century
    var T = (JD - 2451545.0) / 36525.0;

    // Calculate Greenwich Mean Sidereal Time (GMST) in degrees
    var GMST = 280.46061837 + 360.98564736629 * (JD - 2451545) +
               T * T * (0.000387933 - T / 38710000);

    // Normalize GMST to [0, 360] range
    GMST = ((GMST % 360) + 360) % 360;

    // Convert GMST to Local Sidereal Time (LST)
    var LST = GMST + longitude;
    LST = ((LST % 360) + 360) % 360;

    // Convert degrees to hours
    return LST / 15; // LST in hours
}


// Selects the best observation from a list of requests, based on various filtering and ranking criteria.
function selectBestObservations(requests, sunset, sunrise, moonCT, debug) {

    var suitableObs;
    var filteredObs;
    if(debug === undefined){
        // Filter out observations that don't fit within the time window or between sunset and sunrise.
        suitableObs = filterByTime(requests, sunset, sunrise);
        Console.PrintLine("length of suitableObs: " + suitableObs.length)
        // Filter out observations that don't meet the required astronomical conditions (e.g., moon proximity, altitude).
        filteredObs = filterByAstronomy(suitableObs, moonCT);
        Console.PrintLine("length of filteredObs: " + filteredObs.length)
    }                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               
    else{
        suitableObs = filterByTime(requests, sunset, sunrise, "debug");
        // Filter out observations that don't meet the required astronomical conditions (e.g., moon proximity, altitude).
        filteredObs = filterByAstronomy(suitableObs, moonCT, "debug");
        // Modified below
        //filteredObs = filterByAstronomy(requests, moonCT, "debug");
    }
    Console.PrintLine("NowLST: " + Util.NowLST())
    Console.PrintLine("length of filteredObs: " + filteredObs.length)
    // Rank the remaining suitable observations based on priority, time, and astronomy scores.
    var rankedObs = rankObservations(filteredObs, debug);
    
    // we need to calculate correct start and end times of the first and following observations
    // start and end times are arranged end to end. and are calculated based off of top observation.
    Console.PrintLine(rankedObs.length + " ranked observations before start/end window calculation.");
    calculateStartEndWindows(rankedObs, debug);
    Console.PrintLine(rankedObs.length + " ranked observations after start/end window calculation.");
    
    var rankedObsAstronomyCheck = [];
    var timeFastForward = 0;
    for (var i = 0; i < rankedObs.length; i++) {
        var lst = getLST(Telescope.Sitelongitude, rankedObs[i].startUTC, timeFastForward);
        var endlst = getLST(Telescope.Sitelongitude, rankedObs[i].endUTC, timeFastForward);
        //Console.PrintLine("lst: " + lst + " endlst: " + endlst);
        if (meetsAstronomyConditions(rankedObs[i], moonCT, lst, debug) && meetsAstronomyConditions(rankedObs[i], moonCT, endlst, debug)) {
            rankedObsAstronomyCheck.push(rankedObs[i]);
        }
        else
        {
            timeFastForward += rankedObs[i].obsDuration;
        }
        //Console.PrintLine("EndLST:" + endlst + ", LST:" + lst);
    }
    
    Console.PrintLine("At line 376:" + rankedObsAstronomyCheck.length + " ranked observations after astronomy check.");
    calculateStartEndWindows(rankedObsAstronomyCheck, debug);
    Console.PrintLine("At line 378" + rankedObsAstronomyCheck.length + " ranked observations after start/end window calculation.");
    
    if(debug === undefined){
        writeRequestsToCSV(rankedObsAstronomyCheck);
    }
    else{
        writeRequestsToCSV(rankedObsAstronomyCheck, "debug");
    }
    return rankedObsAstronomyCheck; // Return the best observation astronomy check array.
}

//Added by Akshat and Owen
function getSunsetSunrise(numDays, debug){
    
    // Moved section from main to this function so sunrise and sunset can be accessed
    var monthToNum = {
        'Jan': '01',
        'Feb': '02',
        'Mar': '03',
        'Apr': '04',
        'May': '05',
        'Jun': '06',
        'Jul': '07',
        'Aug': '08',
        'Sep': '09',
        'Oct': '10',
        'Nov': '11',
        'Dec': '12'
    };
    
    // DEBUG: need to set sunset and sunrise time
    var currentDay = new Date();
    currentDay.setDate(currentDay.getDate() + numDays);
    var parts = currentDay.toUTCString().split(' ');
    var hourMinSec = parts[4].split(':');
    var currentDateString = parts[3] + ':' + monthToNum[parts[2]] + ':' + parts[1] + ':' + hourMinSec[0] + ':' + hourMinSec[1];
    var cdJD = UTCtoJD(currentDateString, debug);

    sunset  = twilightTimes(cdJD, debug)[1];
    sunrise = twilightTimes(cdJD + 1, debug)[0];
    
    return [sunset, sunrise];
}

// Added by Akshat and Owen
function updateUTCDate(requests, index, updateStart, dateBase, minsToIncrement){
    var parts = dateBase.split(":"); // Split the time string into parts.
    var mins = parseInt(parts[parts.length - 1]) // Parse the minutes
    var hours = parseInt(parts[parts.length - 2]) // Parse the hours
    var days = parseInt(parts[parts.length - 3]) // Parse the days

    // update mins
    var calculatedMins = mins + minsToIncrement;
    var minsToIncrement = minsToIncrement % 60;

    // update hours
    var hoursToIncrement = Math.floor(calculatedMins / 60) % 24;
    var calculatedHours = hours +  hoursToIncrement;

    // increment hours and mins, rollover hours and mins if necessary
    parts[parts.length - 1] = (mins + minsToIncrement) % 60;
    parts[parts.length - 2] = (hours + hoursToIncrement) % 24;

    // format fields with leading zero if only one digit long
    parts[parts.length - 1] = (parts[parts.length - 1] < 10 ? "0" : "") + parts[parts.length - 1];
    parts[parts.length - 2] = (parts[parts.length - 2] < 10 ? "0" : "") + parts[parts.length - 2];

    //update days
    var daysToIncrement = Math.floor(calculatedHours / 24);
    if(daysToIncrement == 1){
        if(updateStart){
            requests[index].startUTC = updateDay(parts.join(":"));
        }
        else{
            requests[index].endUTC = updateDay(parts.join(":"));
        }
    }
    else{
        // Recombine the parts into a single time string
        if(updateStart){
            requests[index].startUTC = parts.join(":");
        }
        else{
            requests[index].endUTC = parts.join(":");
        }
    }   
}

// Added by Akshat and Owen
function calculateStartEndWindows(rankedObs, debug){
    var numDays = 0;
    var sunrise = getSunsetSunrise(numDays, debug)[1];
    var sunset = getSunsetSunrise(numDays, debug)[0];
    var sunriseSunsetReset = true;
    
    // first observation is top observations, we start window cascading calculation based off that
    for (var i = 0; i < rankedObs.length; i++) {
        if (sunriseSunsetReset) {
            // Start utc for current observation should be set to sunset if the flag is true
            rankedObs[i].startUTC = JDtoUTCScheduler(sunset);
            sunriseSunsetReset = false;
        }
        else if(i > 0){
            // need to increment endUTC of previous observation by 5 before assigning
            // as startUTC for next observation
            //rankedObs[i].startUTC = rankedObs[i - 1].endUTC;
            //updateUTCDate(rankedObs[i].startUTC, rankedObs[i - 1].endUTC, telescopeSchedulerSlewAllowance);
            updateUTCDate(rankedObs, i, true, rankedObs[i - 1].endUTC, telescopeSchedulerSlewAllowance);
        }
        // for first observation, only update endUTC
        updateUTCDate(rankedObs, i, false, rankedObs[i].startUTC, rankedObs[i].obsDuration);

        // For observations not included in the current night
        var obsStartJD = UTCtoJD(rankedObs[i].startUTC, debug)
        var obsEndJD = UTCtoJD(rankedObs[i].endUTC, debug)
        if (obsStartJD > sunrise || (obsStartJD < sunrise && obsEndJD > sunrise)) {
            i--;
            // Recalculate sunrise and sunset for next day
            numDays++;
            sunset = getSunsetSunrise(numDays, debug)[0];
            sunrise = getSunsetSunrise(numDays, debug)[1];
            sunriseSunsetReset = true;
        }
    }
}

// Filters the observation requests by checking if they fall within the allowed time window and between sunset and sunrise.
function filterByTime(requests, sunset, sunrise, debug) {
    
    var filteredObs = [];
    var currJD;
    if (debug === undefined) { // normal operation of code
        currJD = Util.SysJulianDate; // Get the current Julian Date.
    }
    else{
        // debug mode which can be tested in say VS Code
        var monthToNum = new Map();
        monthToNum.set('Jan', '01');
        monthToNum.set('Feb', '02');
        monthToNum.set('Mar', '03');
        monthToNum.set('Apr', '04');
        monthToNum.set('May', '05');
        monthToNum.set('Jun', '06');
        monthToNum.set('Jul', '07');
        monthToNum.set('Aug', '08');
        monthToNum.set('Sep', '09');
        monthToNum.set('Oct', '10');
        monthToNum.set('Nov', '11');
        monthToNum.set('Dec', '12');

        var currentDay = new Date();
        currentDay.setHours(21); // set hours to around midnight UTC so observations don't get filtered out
        var parts = currentDay.toUTCString().split(' ');
        var hourMinSec = parts[4].split(':');
        var currentDateString = parts[3] + ':' + monthToNum.get(parts[2]) + ':' + parts[1] + ':' + hourMinSec[0] + ':' + hourMinSec[1];
        currJD = UTCtoJD(currentDateString, "debug");
    }
    // Loop through each request and check if it fits within the time window and sunset/sunrise.
    // Console.PrintLine("currJD: " + currJD + " sunset: " + sunset + " sunrise: " + sunrise);
    for (var i = 0; i < requests.length; i++) {
        var request = requests[i];
        // Add to filteredObs if the request is within the time window.
        if (withinTimeWindow(request, currJD, sunset, sunrise)) { filteredObs.push(request); }
    }
    return filteredObs; // Return the filtered list of requests.
}

// Checks if an observation request fits within the allowed time window and between sunset and sunrise.
function withinTimeWindow(request, currJD, sunset, sunrise) {
    
    var startWindow = request.startJD;  // Start time of the observation request (in Julian Date).
    var endWindow = request.endJD;      // End time of the observation request (in Julian Date).
    
    // Calculate the end time of the observation in Julian Date.
    var endJD = currJD + (request.obsDuration / 1440); // obsDuration is in minutes, dividing by 1440 gives days.
    //Console.PrintLine("startWindow: " + startWindow + " endWindow: " + endWindow + " currJD: " + currJD + " sunrise: " + sunrise + " sunset: " + sunset);
    // Check if the observation fits within the time window and returns true if it does.
    return startWindow <= currJD && currJD <= endWindow && endJD <= sunrise && sunset <= startWindow && startWindow <= sunrise && sunset <= endWindow && endWindow <= sunrise;
}

// Filters the observation requests by checking if they meet certain astronomical conditions (e.g., target altitude and distance from the moon).
function filterByAstronomy(requests, moonCT, debug) {
    
    var filteredObs = [];
    var currLST;
    if (debug === undefined) { // normal operation of code
        currLST = Util.NowLST(); // Get the current Local Sidereal Time.
    }
    else{
        // debug mode which can be tested in say VS Code
        currLST = 10.5; // Replace with a varant LST value in hours (e.g., 10.5 = 10:30 hours).
    }

    // Loop through each request and check if it meets the astronomical conditions.
    for (var i = 0; i < requests.length; i++) {
        var request = requests[i];
        // Add to filteredObs if the request meets the astronomy conditions.
        if (meetsAstronomyConditions(request, moonCT, currLST, debug)) { filteredObs.push(request); }
    }
    return filteredObs; // Return the filtered list of requests.
}

// Checks if the observation request meets the required astronomical conditions (elevation above a limit and minimum moon angle).
function meetsAstronomyConditions(request, moonCT, newLST, debug) {
    
    var ra = request.ra;    // Right Ascension of the target.
    var dec = request.dec;  // Declination of the target.
    
    // Calculate the altitude of the target at the current Local Sidereal Time (LST).
    var targetAltitude = calculateAltitude(ra, dec, newLST, debug);
    // Calculate the angular distance between the target and the moon.
    var moonAngle = calculateMoonAngle(ra, dec, moonCT);
    
    // Store the calculated values in the request object.
    request.altitude = targetAltitude;
    request.moonAngle = moonAngle;

    if (debug !== undefined) {  // debug mode which can be tested in say VS Code
        Console.PrintLine("Target Altitude: " + targetAltitude + " Moon Angle: " + moonAngle);
    }

    // Return true if the target's ltitude is above the elevation limit and if the moon's angle is greater than the minimum offset.
    return targetAltitude > elevationLimit && moonAngle > minMoonOffset;
}

// Calculates the altitude of the target based on its RA, DEC, and the Local Sidereal Time (LST).
function calculateAltitude(ra, dec, newLST, debug) {

    if (debug === undefined) { // normal operation of code
        var ct = Util.NewCT(Telescope.SiteLatitude, newLST); // Create a new coordinate transform (CT) object with the telescope's latitude and current LST.
        //Console.PrintLine("ra: " + ra + " dec: " + dec + " newLST: " + newLST);
        ct.RightAscension = ra/15; // Convert Right Ascension from degrees to hours. Set the Right Ascension of the target.
        ct.Declination = dec; // Set the Declination of the target.
        return ct.Elevation; // Return the target's altitude (elevation) in degrees.
    }
    else{
        // debug mode which can be tested in say VS Code
        // varants
        var latitude = 34.0; // Replace with the telescope's fixed latitude in degrees (e.g., 34.0 for a location in the northern hemisphere).

        // Convert inputs to radians for calculations
        var raRad = (ra / 15) * (Math.PI / 180); // Convert RA from degrees to hours, then to radians
        var decRad = dec * (Math.PI / 180); // Convert Dec to radians
        var latRad = latitude * (Math.PI / 180); // Convert latitude to radians
        var lstRad = newLST * (Math.PI / 180); // Convert LST to radians

        // Calculate the Hour Angle (HA) in radians
        var haRad = lstRad - raRad;

        // Calculate altitude (elevation) using the formula:
        // sin(alt) = sin(dec) * sin(lat) + cos(dec) * cos(lat) * cos(HA)
        var sinAlt = Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);
        var altitude = Math.asin(sinAlt); // Resulting altitude in radians

        // Convert altitude back to degrees
        return altitude * (180 / Math.PI);
    }
}

// Calculates the angular distance bbetween the target and the moon in degrees.
function calculateMoonAngle(ra, dec, moonCT) {
    
    var b = (90 - dec) * Math.PI / 180; // Convert Declination to radians.
    var c = (90 - moonCT.Declination) * Math.PI / 180; // Convert Moon Declination to radians.
    var aa = Math.abs(ra - moonCT.RightAscension) * Math.PI / 180; // Convert RA difference to radians.

    // Use the spherical law of cosines to calculate the angular distance between the target and the moon.
    var moonAngle = Math.acos((Math.cos(b) * Math.cos(c)) + (Math.sin(b) * Math.sin(c) * Math.cos(aa))) * 180 / Math.PI;
    return moonAngle; // Return the moon angle in degrees.
}

// Ranks the observation requests by calculating a score for each one, and then sorts them in descending order based on that score.
function rankObservations(requests, debug) {
    
    var rankedObs = [];

    // Loop through each request and calculate its score.
    for (var i = 0; i < requests.length; i++) {
        var request = requests[i];
        calculateScore(request, debug); // Calculate and assign a score to each request.
    }

    // Sort the request in descending order based on their scores.
    rankedObs = requests.sort(function (request1, request2) { 
        return request1.compareScore(request2); // Use the compareScore method to determine the order.
    });

    return rankedObs; // Return the ranked list of observation requests.
}

// Calculates the overall score for an observation request based on its priority, timing, and astronomical conditions.
function calculateScore(request, debug) {

    // new score calculation: (requestedTime(hrs) * priority) / ( 1/cosine(90deg - elevation))
    var airmass = 1 / (Math.cos((90 - request.altitude) * (Math.PI / 180))); //Changed
    var score = ((request.obsDuration / 60) * request.priority) / airmass;
    
    if (debug !== undefined) {  // debug mode which can be tested in say VS Code
        request.totalScore = score.toFixed(2);  // totalScore for display only
    }
    request.score = score; // Assign the calcualted score to the request.
}

// Calculates score based on the observation's time window (how long the observation lasts).
function evaluateTimeScore(request) {
    
    // DEBUG Akshat/Owen: just return duration of observation in minutes
    return Math.max(0, request.obsDuration);
    // DEBUG Akshat/Owen: just return duration of observation in minutes

    // Convert the start and end times from Julian date to seconds since Unix Epoch.
    var startSec = (request.startJD - 2440587.5) * 86400;
    var endSec = (request.endJD - 2440587.5) * 86400;

    // Return the observation's duration in minutes (with a minimum score of 0).
    return Math.max(0, (endSec - startSec) / 60); // Duration in minutes
}

// Calculates the score based on the observation's astronomical conditions (e.g., altitude and distance from the moon).
function evaluateAstronomyScore(request) {
    
    // Calculate the score based on how much the altitude exceeds the elevation limit.
    var altitudeScore = Math.max(0, request.altitude - elevationLimit);

    // Return the sum of the altitude and moon angle scores.
    return altitudeScore;
}

// Select the top observation from the ranked list of requests.
// Returns the top request or "None" if the lsit is empty.
function selectTopObservation(requests) {
    if (requests.length == 0) {
        return "None"; // Return "None" if there are no valid observations.
    }
    return requests[0]; // Return the first (highest-ranked) request.
}

// Auxiliary functions
// Updates the day in a time string.
// Owen and Akshat fixed this function Nov 21, 2024
// timeString should be in this format: YYYY-MM-DDTHH:mm
function updateDay(timeString) {

    timeString = timeString.replace(':', '-');
    timeString = timeString.replace(':', '-');
    timeString = timeString.replace(':', 'T');

    // Parse the input time string into a Date object
    var date = new Date(timeString);
    if (isNaN(date)) {
        throw new Error("Invalid time string format.");
    }
    // Add one day
    date.setDate(date.getDate() + 1);
    // Convert back to ISO 8601 string and return
    var returnVal = date.toISOString();

    returnVal = returnVal.replace('-', ':');
    returnVal = returnVal.replace('-', ':');
    returnVal = returnVal.replace('T', ':');
    returnVal = returnVal.replace(':00.000Z', '');

    return returnVal;
}

function writeRequestsToCSV(requests, debug) {
    try {

        var writeFile;
        var data;
        var fs; 
        if (debug === undefined) { // normal operation of code
            // Open the CSV file for writing (overwriting the file)
            writeFile = fso.OpenTextFile("sorted_user_observations.csv", ForWriting, true);
            var header = "TESS_ID,Priority (1 - 5),RA (deg),Dec (deg),Start Time (Year:Mon:Day:Hour:Min)(UTC),End Time (Year:Mon:Day:Hour:Min)(UTC),Obs Duration (mins),Exposure Time (seconds),Filter (1,2,3),Binning (1,2),Total Score"
            writeFile.WriteLine(header); // Write header to the file
        }
        else{
            // debug mode which can be tested in say VS Code
            fs = require('fs');
            data = "TESS_ID,Priority (1 - 5),RA (deg),Dec (deg),Start Time (Year:Mon:Day:Hour:Min)(UTC),End Time (Year:Mon:Day:Hour:Min)(UTC),Obs Duration (mins),Exposure Time (seconds),Filter (1,2,3),Binning (1,2),Total Score\n";
        }
        
        // Write the new lines of data to the file
        for (var i = 0; i < requests.length; i++) {
            var obs = "";
            obs += requests[i].directoryName;
            obs += ",";
            obs += requests[i].priority;
            obs += ",";
            obs += Math.round(requests[i].ra * 100000) / 100000;
            obs += ",";
            obs += Math.round(requests[i].dec * 100000) / 100000;
            obs += ",";
            obs += requests[i].startUTC;
            obs += ",";
            obs += requests[i].endUTC;
            obs += ",";
            obs += requests[i].obsDuration;
            obs += ",";
            obs += requests[i].exposureTime;
            obs += ",";
            obs += requests[i].filter;
            obs += ",";
            obs += requests[i].binning; 

            if (debug === undefined) { // normal operation of code
                obs += ",";
                obs += Math.round(requests[i].score * 10) / 10;
                writeFile.WriteLine(obs); // Write each line to the file
            }
            else{
                obs += ",";
                obs += Math.round(requests[i].score * 10) / 10;
                obs += '\n';
                data += obs;
            }
        }
        if(debug !== undefined){
            fs.writeFileSync("sorted_user_observations.csv", data);
        }
        writeFile.Close(); // Close the file after writing
        if (debug !== undefined) {
            file1 = './colibri_user_observations.csv';
            file2 = 'sorted_user_observations.csv';
            
            // Read and normalize files, handling commas for CSVs
            var file1Lines = fs.readFileSync(file1, 'utf8').replace(/\r/g, '').split('\n').map(function (line) {return line.trim();}).filter(function (line) {return line;});
            var file2Lines = fs.readFileSync(file2, 'utf8').replace(/\r/g, '').split('\n').map(function (line) {return line.trim();}).filter(function (line) {return line;});
    
            // Extract the first word from each line by splitting by commas
            var file2FirstWords = new Set(file2Lines.map(function (line) {return line.split(',')[0].trim()}));
    
            console.log('First fields in file2:', Array.from(file2FirstWords));  // Debugging
    
            var header = file1Lines[0];
    
            var filteredLines = [];
            var slicedLines = file1Lines.slice(1); // slice() is ES3-compatible
            for (var i = 0; i < slicedLines.length; i++) {
                var line = slicedLines[i];
                var firstWord = line.split(',')[0].trim(); // Get the first field (before the comma)
                
                if (!file2FirstWords.has(firstWord)) {
                    filteredLines.push(line);
                }
            }
            // Use concat() instead of spread operator
            var uniqueLines = [header].concat(filteredLines);

    
            console.log('Unique lines from file1:', uniqueLines);  // Debugging
    
            // Write back the filtered lines to file1
            fs.writeFileSync(file1, uniqueLines.join('\n'), 'utf8');
    
            console.log("Updated " + file1 + ", removed " + (file1Lines.length - uniqueLines.length) + " lines with common first fields.");
        }
    } catch (e) {
        // In case of an error (e.g., file access issues), log the error message
        if (typeof updateLog === "function") {
            if(debug === undefined){
                updateLog(e.message, "ERROR");
            }
        } else {
            if(debug === undefined){
                console.error("Error: " + e.message);
            }
        }
    }
}

// Updates the CSV file with new lines while preserving the header row.
// 'lines' parameter is expected to be an array of strings representing the new date to be added.
function updateCSV(lines) {
    
    try {
        // Open the existing CSV file for reading.
        var readFile = fso.OpenTextFile('./colibri_user_observations.csv', ForReading);
        var header = readFile.ReadLine(); // Read and store the first line (header).
        readFile.Close(); // Close the file after reading the header.

        // Open the CSV file again, but this time for writing (overwriting the file).
        var writeFile = fso.OpenTextFile('./colibri_user_observations.csv', ForWriting);

        // Write the new lines of data to the file.
        for (var i = 0; i < lines.length; i++) {
            writeFile.WriteLine(lines[i]); // Write each line from the 'lines' array to the file.
        }
        writeFile.Close(); // Close the file after writing.

        // Log a success message indicating that the CSV file was modified.
        updateLog("CSV File modified successfully.", "INFO");
    } catch (e) {
        // In case of an error (e.g., file access issues), log the error message.
        updateLog(e.message, "ERROR");
    }
}

// Logs and prints the current observation plan.
// 'plan' is an array of observation requests, each containing details like start time, end time, RA, Dec, etc. 
function printPlan(plan) {
    updateLog("debug: in printPlan()");
    // Log a header indicating the start of the current plan display.
    updateLog("=== Current Plan ===", "INFO");
    
    // Loop through each observation request in the plan and log its details.
    for (var i = 0; i < plan.length; i++) {
        var request = plan[i]; // Get the current observation request.
        if(request.completion == 0){
            // Log the directory name, start and end times, (in both UTC and JD), and score the request.
            updateLog(request.directoryName + " starts " + request.startUTC + " (" + request.startJD + ") ends " + request.endUTC + " (" + request.endJD + ") with score " + request.score, "INFO");
            // Log additional details including RA, Dec, altitude, and moon angle of the request.
            updateLog("RA: " + request.ra + " Dec: " + request.dec + " Alt: " + request.alt + " Moon Angle: " + request.moonAngle, "INFO");
        }
    }
}

// Handles script actions such as aborting, restarting, and shutdown 
// 'action' parameter determines what action to take (abort, abortAndRestart, andRestart).
// TODO: Test this function by replacing existing calls to abort, abortAndRestart, and andRestart with this function.
function handleScript(action) {
    // Check if the action is to abort or abort and restart the script.
    if (action == "abort" || action == "abortAndRestart") {
        updateLog("Aborting script!", "ERROR"); // Log an error indicating that the script is being aborted.
        
        // If the action is to abort and restart, log that the script will be restarted.
        if (action == "abortAndRestart") {
            updateLog("Restarting script!", "INFO");
        } 
    }
    // If the action is "andRestart", log that the system will shut down and restart.
    else if (action == "andRestart") {
        updateLog("Shutting down and restarting!", "INFO");
    }

    // Call the shutdown function to stop the telescope and other equipment.
    shutDown();

    // Wait for the dome shutter to close and the telescope to park.
    while(Dome.ShutterStatus != 1 || Telescope.AtPark != true) {
        Util.WaitForMilliseconds(5000); // Wait 5 seconds before checking the shutter and telescope status again.
        Console.PrintLine("Waiting 5 seconds for shutter to close and telescope to park...");
    }

    // If the action is to abort the script or abort and restart:
    if (action == "abort" || action == "abortAndRestart") {
        // If a script is currently active, abort it.
        if (Util.ScriptActive) {
            Console.PrintLine("Aborting...");
            Util.AbortScript(); // Call the method to abort the script.
        }

        // Wait until the script is fully aborted.
        while (Util.ScriptActive) {
            Console.PrintLine("Waiting for script to finish...");
            Util.WaitForMilliseconds(5000); // Wait 5 seconds before checking again.
        }
    }

    // If the action is to abort and restart or just restart, call the main function to restart the process.
    if (action == "abortAndRestart" || action == "andRestart") {
        main(); // Call the main function to restart the script.
    }
}

// Collects reference image data (bias or dark frames) using the specified filters
// Does the dirty work of collecting reference image data given a filter.
// Combines functionality of biasCollection and darkCollection functions.
function refCollection(filter, exposure, filePath) {
    // Attempt to link the camera
    try {
        // Check if the camera is not linked
        if (!ccdCamera.LinkEnabled) {
            updateLog("Camera is not linked. Attempting to link...", "INFO");
            // Enable the camera link
            ccdCamera.LinkEnabled = true;

            // Check if the camera was successfully linked.
            if (ccdCamera.LinkEnabled) {
                updateLog("Camera linked successfully.", "INFO");
            } else {
                // Log an error if the camera failed to link.
                updateLog("Failed to link the camera." , "ERROR");
                return; // Exit the function if the camera could not be linked.
            }
        } else {
            // Log if the camera was already linked.
            updateLog("Camera already linked.", "INFO");
        }
    } catch (e) {
        // Log any errors that occurred during the linking process.
        updateLog("An error occurred: " + e.message, "ERROR");
    }

    // Loop to capture 10 images
    for (var i = 0; i < 10; i++) {
        // Try to start the exposure for each image
        try {
            updateLog("Starting exposure...", "INFO");
            
            // Set binning values for the camera to 2x2
            ccdCamera.BinX = 2;
            ccdCamera.BinY = 2;

            // Start the exposure with the specified filter and exposure time
            ccdCamera.Expose(exposure, filter); // Exposure time is given in seconds.
            
            // Log that the exposure started successfully.
            updateLog("Exposure started successfully");
        } catch (e) {
            // Log any errors encountered while starting the exposure.
            updateLog("Error starting exposure: " + e.message);
        }

        // Initialize variables for waiting for the image to be ready
        var maxWaitTime = exposure * 1000; // Maximum wait time (the exposure time), in milliseconds
        var waitInterval = 500; // Interval to check if the image is ready (500ms)
        var elapsedTime = 0; // Track the elapsed time.

        // Wait for the image to be ready or until the max wait time is reached.
        try {
            // Continuously check if the image is ready within the allotted wait time.
            while (!ccdCamera.ImageReady && elapsedTime < maxWaitTime) {
                Util.WaitForMilliseconds(waitInterval); // Pause for the specified interval.
                elapsedTime += waitInterval; // Increase the elapsed time.
            }

            // If the image is ready, save it to the specified file path.
            if (ccdCamera.ImageReady) {
                // Generate a unique file name for the image using the current timestamp and exposure time.
                var newFilePath = filePath + "\\image_" + new Date().getTime() + "_" + exposure + "s.fits";
                updateLog("Saving image to: " + newFilePath, "INFO");
                
                // Save the image to the generated file path.
                ccdCamera.SaveImage(newFilePath);
                
                // Log that the image was saved successfully.
                updateLog("Image saved successfully to: " + newFilePath);
            } else {
                // Log an error if the image was not ready within the max wait time.
                updateLog("Image not ready after waiting.", "ERROR");
            }
        } catch (e) {
            // Log any errors that occurred while saving the image
            updateLog("Error saving image: " + e.message);
        }
    }

    // After capturing all images, attempt to disconnect the camera.
    try {
        // Set LinkEnabled to false to disconnect the camera.
        ccdCameraCamera.LinkEnabled = false;

        // Log that the camera was disconnected suggessfully.
        updateLog("Camera disconnected.", "INFO");
    } catch (e) {
        // Log any errors encountered during the disconnection process.
        updateLog("An error occurred: " + e.message, "ERROR");
    }
}

// RunColibri Functions
var SUP;

String.prototype.trim = function() {
    return this.replace(/(^\s*)|(\s*$)/g, "");
}

/////////////////////
// Aborts script
// MJM - 2021-06-24
/////////////////////
function abort() {
    Console.PrintLine("Aborting script!");
    ts.WriteLine(Util.SysUTCDate + "ERROR: Aborting script!");
    shutDown();
    while (Dome.ShutterStatus !=1 || Telescope.AtPark != true) {
        Util.WaitForMilliseconds(5000);
        Console.PrintLine("Waiting 5 seconds for shutter to close and telescope to park...");
    }
    
    if (Util.ScriptActive) {
        Console.PrintLine("Aborting...");
        Util.AbortScript();
    }

    while (Util.ScriptActive) {
        Console.PrintLine("Waiting for script to finish...");
    }
}

function abortAndRestart() {
    Console.PrintLine("Aborting script!");
    ts.WriteLine(Util.SysUTCDate + "ERROR: Aborting script! Restarting script!");
    shutDown();
    while (Dome.ShutterStatus != 1 || Telescope.AtPark != true) {
        Util.WaitForMilliseconds(5000);
        Console.PrintLine("Waiting 5 seconds for shutter to close and telescope to park...");
    }

    if (Util.ScriptActive) {
        Console.PrintLine("Aborting...");
        Util.AbortScript();
    }

    while (Util.ScriptActive) {
        Console.PrintLine("Waiting for script to finish...");
    }

    main();
}

function andRestart(){
    Console.PrintLine("Shutting down and restarting!");
    shutDown();

    while (Dome.ShutterStatus != 1 || Telescope.AtPark != true) {
        Util.WaitForMilliseconds(5000);
        Console.PrintLine("Waiting 5 seconds for shutter to close and telescope to park...");
    }

    main();
}

//////////////////////////////////////////////////
// Function called when Alert button is pressed
//////////////////////////////////////////////////
function alert(){
    Console.alert(consIconWarning, "Quiting script!");
    shutDown();
    abort();
}

///////////////////////////
// Function to connect the telescope
// MJM -
///////////////////////////
function connectScope() {
    // Check to see if telescope is connected. If not, try to connect to it.
    if (Telescope.Connected) {
        Console.PrintLine("Telescope is connected!");
        trkOn();
    } else {
        Console.PrintLine("Telescope is not connected. Attempting to connect...");
        Telescope.Connected = "True";
        trkOn();
        
        if (Telescope.Connected) {
            Console.PrintLine("Telescope is now connected!");
            trkOn();
        } else {
            Console.PrintLine("Telescope is still not connected. There must be a problem. :-(");
            abort();
        }
    }
    Console.PrintLine(" ");
}

///////////////////////////
// Function to close dome
// MJM -
///////////////////////////
function domeClose() {
    switch (Dome.ShutterStatus) {
        //////////////////
        // Dome is open //
        //////////////////
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

        ////////////////////////////////////
        // Dome is closing. Let it close. //
        ////////////////////////////////////
        case 3:
            while (Dome.ShutterStatus == 3) {
                Console.PrintLine("*** Dome shutter is closing. Waiting for it close...");
                Util.WaitForMilliseconds(2000);
            }
            
            Console.PrintLine("--> Dome shutter is closed...");
            break;

        /////////////////////////////////
        // Houston, we have a problem. //
        /////////////////////////////////
        case 4:
            Console.PrintLine("There was a problem with the shutter control...");
            return;
    }

    // Check to see if the dome is closed or in error
    if (Dome.ShutterStatus != 1) {
        Console.PrintLine("Dome is not closed. Trying again...");
        Util.WaitForMilliseconds(1000);
        domeClose();
    }
}

///////////////////////////
// Function to home dome.
// MJM -
///////////////////////////
function domeHome(){
    ////////////////////////////////////////
    // Home the dome if not already done. //
    ////////////////////////////////////////
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

///////////////////////////
// Function to open dome.
// MJM
///////////////////////////
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
            } else { Console.PrintLine("--> Dome is NOT open."); }
                
            break;

        case 2:
            while (Dome.ShutterStatus == 2) {
                Console.PrintLine("*** Dome shutter is open...");
                Util.WaitForMilliseconds(2000);
            }
            Console.PrintLine("--> Dome shutter is opened...");
            break;

        // Dome is closing. Let it close and then open it.
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

        // Houston, we have a problem.
        case 4:
            Console.PrintLine("There was a problem with the shutter control...")
            break;
    }

    // Home the dome if not already done.
    if (!Dome.AtHome) {
        Dome.FindHome();
        while (!Dome.AtHome) {
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
function freeDiskSpace() {
    var AX = new ActiveXObject("WScript.Shell");
    var SE = AX.Exec(ACPApp.Path + "\\freespace.bat");

    var size = "";

    size = SE.StdOut.Read(25);   // size in bytes
    size = size / 1000000000000; // size in TB

    return(size);
}

//////////////////////////////
// Returns date as yyyymmdd
// MJM - June 2021
//////////////////////////////
function getDate() {
	var d = new Date();
	var s = d.getUTCFullYear();
	
	var month = (d.getUTCMonth()+1).toString();
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
	return(s);
}

function JDtoUTC(JulianDate) {
	var millis = (JulianDate - 2440587.5) * 86400000;
	var toUTC = new Date(millis);
	
	var s = toUTC.getUTCFullYear();
	
	var month = (toUTC.getUTCMonth()+1).toString();
	var day   = (toUTC.getUTCDate()).toString();

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
	return(s);
}

/////////////////////////////////////////////////////
// Return the coordinates of the moon in RA and Dec
// MJM - 2021/06/24
/////////////////////////////////////////////////////
function getMoon() {
	// finding moon elevation and azimuth
    Util.Console.PrintLine("== Moon Coordinates ==");
    ts.WriteLine(Util.SysUTCDate + " INFO: == Moon Coordinates ==");
    var SH = new ActiveXObject("WScript.Shell");
    Console.PrintLine(ACPApp.Path);
    var BS = SH.Exec(ACPApp.Path + "\\aa.exe -moon");
    var coords = "";

    while(BS.Status != 1) {
        while(!BS.StdOut.AtEndOfStream) {
            coords += BS.StdOut.Read(1);
        }
        Util.WaitForMilliseconds(100);
    }
    coords = coords.trim();
    Util.Console.PrintLine("== " + coords + " ==");
    ts.WriteLine(Util.SysUTCDate + " INFO: " + coords);

    var bits = coords.split(" ");

    var ct = Util.NewCThereAndNow();
    ct.RightAscension = bits[0];
    ct.Declination = bits[1];

    return ct;
}

function getRADEC() {
    var ras, des;
    
    // Get scope J2000 RA/Dec
    if(Prefs.DoLocalTopo) {
        SUP.LocalTopocentricToJ2000(Telescope.RightAscension, Telescope.Declnation);
        ras = SUP.J2000RA;
        des = SUP.J2000Dec;
    } else {
        ras = Telescope.RightAscension;
        des = Telescope.Declination;
    }

    return {ra: ras, dec: des};
}

///////////////////////////////////////////
// Sends scope to a particular Alt and Az
// MJM
///////////////////////////////////////////
function gotoAltAz(alt, az) {
    breakme: if (ct.Elevation < elevationLimit) {
        Console.PrintLine("Tried to move to an unsave elevation of " + ct.Elevation.toFixed(4));
        ts.WriteLine(Util.SysUTCDate + " WARNING: Tried to move to an unsave elevation of " + ct.Elevation.toFixed(4));
        ts.WriteLine(Util.SysUTCDate + " WARNING: Closing up shop!");
        shutDown();
        Console.PrintLine("Finished closing up shop.");
        ts.WriteLine(Util.SysUTCDate + " INFO: Finished closing up shop!");
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

///////////////////////////////////////////
// Sends scope to a particular RA and DEC
// MJM
///////////////////////////////////////////
function gotoRADec(ra, dec) {
    Console.Printline("RA in gotoRADec function " + ra.toFixed(4));
    Console.Printline("Dec in gotoRADec function " + dec);

    var targetCt = Util.NewCThereAndNow();
    targetCt.RightAscension = ra;
    targetCt.Declination = dec;

    // Print target elevation to screen
    Console.Printline("Elevation of field " + targetCt.Elevation.toFixed(4));

    breakme: if (targetCt.Elevation < elevationLimit) {
        Console.PrintLine("Tried to move to an unsave elevation of " + targetCt.Elevation.toFixed(4));
        ts.WriteLine(Util.SysUTCDate + " WARNING: Tried to move to an unsave elevation of " + targetCt.Elevation.toFixed(4));
        ts.WriteLine(Util.SysUTCDate + " INFO: Closing up shop!");
        shutDown();
        ts.WriteLine(Util.SysUTCDate + " INFO: Finished closing up shop!");
        break breakme;
    }

    if (Telescope.tracking) {   
        Console.Printline("Slewing to declination " + dec + " and right ascension " + ra.toFixed(4));
        ts.WriteLine(Util.SysUTCDate + " INFO: Slewing to declination " + dec + " and right ascension " + ra.toFixed(4));

        // Need to put a check in for 'incomplete' coordinates. Not sure what this means as it doesn't
        // seem to be a problem with ACP, but a problem with the AP driver. Let's try either restarting
        // script after error or just repeating this function on error return, if possible. Try/catch/finally
        // statement.

        try {
            Telescope.SlewToCoordinates(ra.toFixed(4), dec.toFixed(4));
        } catch(e) {
            if (slewAttempt < 10) {
                Console.PrintLine("Error on attempt" + slewAttempt + "to slew. Waiting 5 seconds and trying again.");
                ts.WriteLine("Error on attempt" + slewAttempt + "to slew. Waiting 5 seconds and trying again.");
                Util.WaitForMilliseconds(5000);
                gotoRADec(ra, dec);
                slewAttempt += 1;
            } else {
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

function adjustPointing(ra, dec) {
    // Convert RA to decimal degrees
    ra = ra * 15;

    // Call astrometry_correction.py to get pointing offset
    Console.PrintLine("== Pointing Correction ==");
    ts.WriteLine(Util.SysUTCDate + " INFO: == Pointing Correction ==");
    var SH = new ActiveXObject("WScript.Shell");
    // var BS = SH.Exec("python ExtraScripts\\astrometry_correction.py " + ra + " " + dec);
    var BS = SH.Exec("python ..\\astrometry_correction.py " + ra + " " + dec);
    var python_output = "";
    var python_error = "";

    var start = new Date().getTime();
    var timeout = 300000; // Timeout in milliseconds (5 minutes)
    
    Console.PrintLine("Script started at: " + start);
    ts.WriteLine(Util.SysUTCDate + " INFO: Script started at: " + start);

    // Added an escape here in case the Python script hangs.
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
        ts.WriteLine(Util.SysUTCDate + " INFO: Current Time: " + currentTime);

        if (currentTime - start > timeout) {
            Console.PrintLine("Python script timed out.");
            ts.WriteLine(Util.SysUTCDate + " ERROR: Python script timed out.");
            BS.Terminate();
            return;
        }
    }

    var end = new Date().getTime();
    Console.PrintLine("Script ended at: " + end);
    ts.WriteLine(Util.SysUTCDate + " INFO: Script ended at: " + end);
    Console.PrintLine("Script duration: " + (end - start) + " ms");
    ts.WriteLine(Util.SysUTCDate + " INFO: Script duration: " + (end - start) + " ms");

    if (python_error) {
        Console.PrintLine("Python script error output: " + python_error);
        ts.WriteLine(Util.SysUTCDate + " ERROR: Python script error output: " + python_error);
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
    if (isNaN(new_ra) || isNaN(new_dec)) {
        Console.PrintLine("New pointing is not a number. Ignoring new pointing and continuing with current pointing.");
        ts.WriteLine(Util.SysUTCDate + " WARNING: New pointing is not a number. Ignoring new pointing and continuing with current pointing.");
        return;
    } else if ((new_ra > 24 || new_ra < 0) || (new_dec > 90 || new_dec < -90)) {
        Console.PrintLine("New pointing is not reasonable. Ignoring new pointing and continuing with current pointing.");
        ts.WriteLine(Util.SysUTCDate + " WARNING: New pointing is not reasonable. Ignoring new pointing and continuing with current pointing.");
        return;
    }

    // Check that new pointing is safe
    var targetCt = Util.NewCThereAndNow();
    targetCt.RightAscension = new_ra;
    targetCt.Declination = new_dec;
    if (targetCt.Elevation < elevationLimit) {
        Console.PrintLine("Tried to move to an unsafe elevation of " + targetCt.Elevation.toFixed(4));
        Console.PrintLine("Ignoring new pointing and continuing with current pointing.");
        ts.WriteLine(Util.SysUTCDate + " WARNING: Ignoring new pointing and continuing with current pointing.");
    } else {
        // Call gotoRADec() to slew to new pointing
        gotoRADec(new_ra, new_dec);
    }
}

///////////////////////////////////////////////////////////////
// Shuts down the telescope and dome after boservations are complete.
// Turns off tracking, parks the telescope, and closes the dome.
// Also handles updating the schedule for incomplete observations (currently a placeholder)
// MJM - June 23, 2022
// Edited SMS - August 2024
///////////////////////////////////////////////////////////////
function shutDown() {
    // Turn off tracking of the telescope.
    trkOff();
    updateLog("Tracking turned off. Parking telescope now.", "INFO");

    // Park the telescope safely.
    Telescope.Park();

    // Ensure tracking is off again after parking.
    trkOff();
    updateLog("Telescope parked. Closing dome now.", "INFO");

    // Close the observatory dome.
    domeClose();
    updateLog("Dome closed. Good night/morning.", "INFO");

    // TODO: Handkle incomplete observations (functionality not working yet)
    // Retrieve the list of requested observations; index[1] assumes it returns the lines of CSV data.
    var lines = getRequests()[1];

    // Loop through each observation line in the request data.
    for (var i = 0; i < lines.length; i++) {
        // Split the line by commas to parse the observation data.
        var data = lines[i].split(",");

        // Check if the observation was not completed.
        if (data[10] == 0) {
            // Log that the observation was not completed.
            updateLog("Observation " + line[0] + " was not completed.", "INFO");
            // Update the log indicating the observation is rescheduled for tomorrow.
            updateLog("Updating date and priority to be observed tomorrow.", "INFO");

            // Update the observation's start and end times by moving them to the next day.
            data[4] = updateDay(data[4]); // Update start date.
            data[5] = updateDay(data[5]); // Update end date.

            // Increase the priority.
            data[1] = parseInt(data[1]) + 1;
        }
    }
    
    // Save the updated observation schedule back to the CSV file.
    updateCSV(lines);
}

///////////////////////////////////////////////////////////////
// Function to turn tracking off. Liberated from BJD scripts.
///////////////////////////////////////////////////////////////
function trkOff() {
    if (Telescope.CanSetTracking) {
        Telescope.Tracking = false;
        Console.PrintLine("--> Tracking is turned off.");
    } else if (Telescope.Tracking && !Telescope.CanSetTracking) {
        Console.PrintLine("Failed to disable tracking");
        ts.WriteLine(" WARNING: Failed to disable telescope tracking");
    }
}

//////////////////////////////////////////////////////////////
// Function to turn tracking on. Liberated from BJD scripts.
//////////////////////////////////////////////////////////////
function trkOn() {
    if (Telescope.CanSetTracking) {
        Telescope.Unpark();
        Telescope.Tracking = true;
        Console.PrintLine("--> Tracking is turned on :-)");
    } else if (Telescope.Tracking && !Telescope.CanSetTracking) {
        Console.PrintLine("Failed to enable tracking");
        ts.WriteLine(" WARNING: Failed to enable telescope tracking");
    }
}

/////////////////////////////////////////////////////
// Returns astronomical twilight end (sunrise) and start (sunset) times of the current day as JD
// See: https://en.wikipedia.org/wiki/Sunrise_equation
// MJM - 2021/06
/////////////////////////////////////////////////////
function twilightTimes(jDate, debug) {
    var lat = 43.1928;
	var lon = -81.3103;
    if (debug === undefined) {
        lat = Telescope.SiteLatitude;
	    lon = Telescope.SiteLongitude;
    }
	var n = Math.floor(jDate - 2451545.0 + 0.0008);
	var Jstar = n - (lon/360.0);
	var M = (357.5291 + 0.98560028 * Jstar) % 360;
	var C = 1.9148*Math.sin(Util.Degrees_Radians(M)) + 0.02*Math.sin(2*Util.Degrees_Radians(M)) + 0.0003*Math.sin(3*Util.Degrees_Radians(M));
	var lam = (M + C + 180 + 102.9372) % 360;
	var Jtransit = 2451545.0 + Jstar + 0.0053*Math.sin(Util.Degrees_Radians(M)) - 0.0069*Math.sin(2*Util.Degrees_Radians(lam));
	var sindec = Math.sin(Util.Degrees_Radians(lam)) * Math.sin(Util.Degrees_Radians(23.44));
	var cosHA = (Math.sin(Util.Degrees_Radians(-12)) - (Math.sin(Util.Degrees_Radians(lat))*sindec)) / (Math.cos(Util.Degrees_Radians(lat))*Math.cos(Math.asin(sindec)));
	var Jrise = Jtransit - (Util.Radians_Degrees(Math.acos(cosHA)))/360;
	var Jset = Jtransit + (Util.Radians_Degrees(Math.acos(cosHA)))/360;

	return [Jrise, Jset];
}

////////////////////////////////////////
// Causes program to wait until sunset
// MJM - 2021/06/24
////////////////////////////////////////
function waitUntilSunset(updatetime) {
	var currentJD = Util.SysJulianDate;
	while (currentJD < sunset) {
		Console.Clear();
		if (currentJD > sunrise && currentJD < sunset) {
			Console.PrintLine("Sun is up");
			Console.PrintLine("It has been up for " + Util.Hours_HMS((currentJD - sunrise)*24,"h ","m ","s"));
			Console.PrintLine("It will set in " + Util.Hours_HMS(-1*(currentJD - sunset)*24,"h ","m ","s"));
			Console.PrintLine("Waiting " + -1*(currentJD - sunset)*24 + " hours to start operations.");
			Util.WaitForMilliseconds(updatetime);
			currentJD = Util.SysJulianDate;
		}
	}
}
// END OF FUNCTIONS

// Global variables and configurations
var DEBUG = false;
// Variables used for logging and system state checks.
var logconsole = true; // Enable or disable logging the console output.
var firstRun = true; // Tracks whether the script is running for the first time.
var fso, f1, ts; // FileSystemObject and file variables for logging and file handling.
var currentDate = getDate(); // Store the current date.
var pierside = "E"; // Tracks which side the pier the telescope is on ("E" for East, "W" for West).
var maximDL; // Object for controlling MaxIM DL software.
var ccdCamera; // Object representing the CCD camera controlled by MaxIM DL.

// Magic numbers for astronomical limits
var elevationLimit = 10; // Minimum elevation angle for telescope pointing (degrees).
var minMoonOffset = 15; // Minimum allowed angular distance from the Moon (degrees).
var telescopeSchedulerSlewAllowance = 5; // allowance of 5 mins between observations in scheduler for slewing

// File handling varants for different file modes.
var ForReading = 1;
var ForAppending = 8;
var ForWriting = 2;

// A variable to track the number of telescope slew attempts.
var slewAttempt = 0;

if(DEBUG === false){ // normal operation of code
    // Log to console and file if logging is enabled.
    if (logconsole == true) {
        // Create a log file with a timestamped name and enable logging.
        Console.LogFile = "d:\\Logs\\ACP\\" + Util.FormatVar(Util.SysUTCDate, "yyyymmdd_HhNnSs") + "-ACPconsole.log";
        Console.Logging = true;
    }

    // Retrieve the sunset time from astronomical twilight data.
    sunset  = twilightTimes(Util.SysJulianDate)[1]; // Sunset in Julian Date (JD)
    LogFile = "d:\\Logs\\ACP\\" + JDtoUTC(sunset) + "-ACP.log"; // Log file path based on sunset time.

    // Create an ActiveX FileSystemObject for file handling
    fso = new ActiveXObject("Scripting.FileSystemObject");
        
    // Check if the log file already exists.
    if (fso.FileExists(LogFile)) {
        Console.PrintLine("Log file exists. Appending to existing log file.");
    } else {
        // If the log file does not exist, create it.
        fso.CreateTextFile(LogFile);
    }
    // Open the log file for appending
    f1 = fso.GetFile(LogFile);
    ts = f1.OpenAsTextStream(ForAppending, true);
    Console.PrintLine("Log file ready.")
}

// Updates the log with the given message and type (e.g., INFO or ERROR).
// 'contents' is the message to log, 'type' is the log type (INFO, ERROR, etc.).
function updateLog(contents, type) {
    // Print the log message to the console.
    Console.PrintLine(contents);
    // Write the log message to a file with a timestamp, type, and the log content.
    ts.writeLine(Util.SysUTCDate + " " + type + ": " + contents);
}

// main() function is utilized by ACP, while mainDEBUG() is utilized locally on say VSCode
// Main execution function.
function main() {
    
    // Define the log file path using the current sunset time in UTC format.
    LogFile = "d:\\Logs\\ACP\\" + JDtoUTC(sunset) + "-ACP.log";
    
    if (fso.FileExists(LogFile)) {
        Console.PrintLine(Util.SysUTCDate + " INFO: Log file exists. Appending to existing log file.");
    } else {
        fso.CreateTextFile(LogFile);
    }
    f1 = fso.GetFile(LogFile);
    try {
        ts = f1.OpenAsTextStream(ForAppending, true);
    } catch(err) {
        ts.WriteLine(Util.SysUTCDate + " WARNING: Log file is already open.");
    }
    try{
        updateLog("Attempting to create ActiveX object for MaxIM DL", "INFO");
        // Create ActiveX object for controlling MaxIM DL software
        maximDL = new ActiveXObject("MaxIm.Application");
        updateLog("MaxIM DL ActiveX object created successfully.", "INFO");
        // Access the CCD camera object from MaxIM DL.
        ccdCamera = maximDL.CCDCamera;
        updateLog("Accessing the CCD camera object", "INFO");
    } catch (e) {
        // Handle any errors during object creation or access.
        updateLog("An error occurred " + e.message, "ERROR");
    }
    
    // Calculate astronomical sunrise and sunset times (technically 12 degree twilight times) based on Julian Date.
    // twilightTimes: [0] - JD of sunrise, [1] - JD of sunset
    // Note! The calculation for sunsetLST only works if you are west of Greenwich
    sunset  = twilightTimes(Util.SysJulianDate)[1];
    sunrise = twilightTimes(Util.SysJulianDate + 1)[0];
    sunsetLST  = (Util.Julian_GMST(sunset)  + Telescope.SiteLongitude/15).toFixed(1);
    sunriseLST = (Util.Julian_GMST(sunrise) + Telescope.SiteLongitude/15).toFixed(1);

    // Get the current position of the Moon
    var moonCT = getMoon();

    // Calculate the total hours of darkness between sunset and sunrise.
    var darkHours = (sunrise - sunset)*24; // Length of night in hours.
    var timeUntilSunset = (sunset - Util.SysJulianDate)*24; // Hours until sunset.
    var timeUntilSunrise = (sunrise - Util.SysJulianDate)*24; // Hours until sunrise.

    // Calculate remaining dark hours.
    if (darkHours > timeUntilSunrise){
        darkHoursLeft = timeUntilSunrise;
    } else{
        darkHoursLeft = darkHours;
    }

    // Log astronomical times for today.
    updateLog("Sunrise GMST: " + Util.Julian_GMST(sunrise), "INFO");
    updateLog("Sunset GMST: " + Util.Julian_GMST(sunset), "INFO");
    updateLog("Current GMST: " + Util.Julian_GMST(Util.SysJulianDate), "INFO");
    updateLog("Sunrise UTC: " + Util.Julian_Date(sunrise), "INFO");
    updateLog("Sunset UTC: " + Util.Julian_Date(sunset), "INFO");
    updateLog("Sunset JD: " + sunset, "INFO");
    updateLog("Sunrise JD: " + sunrise, "INFO");
    updateLog("Current JD: " + Util.SysJulianDate, "INFO");
    updateLog("Length of the Night: " + darkHours + " hours", "INFO");
    updateLog("Time until sunset: " + timeUntilSunset + " hours", "INFO");
    updateLog("Time until sunrise: " + timeUntilSunrise + " hours");
    updateLog("Dark hours left: " + darkHoursLeft + " hours", "INFO");

    // Prestart checks for weather conditions
    // Check to see if the weather server is connected. If it isn't ask for permission to continue.
	if (Weather.Available) {
        // If weather server is connected, log success and wait for 3 seconds.
            updateLog("Weather server is connected. Contining with operations.", "INFO");
            Util.WaitForMilliseconds(3000);
    } else {
        // If no weather server, ask for user confirmation to proceed.
        if (Util.Confirm("No weather server! Do you want to continue? Choose wisely...")) {
            updateLog("No weather server. You've chosen to proceed without.", "WARNING");
            ignoreWeather = true;
            Util.WaitForMilliseconds(3000);
        } else {
            // Abort if the user chooses not to continue without weather data.
            abort();
        }
    }
    
    // Handle unsafe weather conditions by waiting until conditions improve.
    if (Weather.Available && !Weather.safe) {
        updateLog("Weather unsafe! Waiting until it's looking a bit better out.", "INFO");
    }

    while (Weather.Available && !Weather.safe) {
        // If a new day starts, update the log file.
        if (getDate() != currentDate) {
            currentDate = getDate();
        }

        // Log and wait for 5 minutes before checking weather conditions again.
        updateLog("Unsafe weather conditions. Waiting for 5 minutes.", "INFO");
        Util.WaitForMilliseconds(300000)
    }
    
    // Ensure the currentDate variable is up to date.
    if (getDate() != currentDate) {
        // Update currentDate to today's date.
        currentDate = getDate();

        // Define the log file path using the current sunset time in UTC format.
        LogFile = "d:\\Logs\\ACP\\" + JDtoUTC(sunset) + "-ACP.log"

        // Check if the log file already exists.
        if (fso.FileExists(LogFile)) {
            // Inform the user that the log file exists and will be appended.
            Console.PrintLine("Log file exists. Appending to existing log file.");
        } else {
            // Create a new log file if it doesn't exist.
            fso.CreateTextFile(LogFile);
        }

        // Get a reference to the log file.
        f1 = fso.GetFile(LogFile);

        // Confirm the file exists again (possibly redundant check)
        if (fso.FileExists(LogFile)){
            Console.PrintLine("Log file exists. Appending to existing log file.");

        } else {
            // Open the log file in append mode for further logging
            
            ts = f1.OpenAsTextStream(ForAppending, true);
        }
    }

    // Observing Plan - Prepare for the first run
    // Create directory for tonight's data and collect dark frames if this is the first run.
	if (firstRun = true) {
        // Convert sunset time to UTC to define the data directory.
        var today = JDtoUTC(sunset);

        // Create the data directory for today's observations, including a subdirectory for dark frames.
        //Util.ShellExec("cmd.exe", "/c mkdir -p d:\\ColibriData\\" + today.toString() + "\\Dark\\")
        Util.ShellExec("cmd.exe", "/c mkdir -p d:\\test_sophies_scheduler\\" + today.toString() + "\\Dark\\")
        
        // Log the creation of the directory.
        //updateLog("Created today's data directory at d:\\ColibriData\\" + today.toString(), "INFO");
        updateLog("Created today's data directory at d:\\test_sophies_scheduler\\" + today.toString(), "INFO");
        
        // Mark that the first run is completed.
        firstRun = false
    }

    // Retrieve observation requests and their corresponding CSV lines.
    var csvData = getRequests();
    var requests = csvData[0]; // Observation requests
    var lines = csvData[1]; // Lines from the CSV file
    Console.PrintLine("length of requests: " + requests.length)
    // Select the best observation based on the current conditions (sunset, sunrise, moon conditions, etc.)
    var listOfBestObs = selectBestObservations(requests, sunset, sunrise, moonCT);
    
    var obsIndex = 0;
    // Begin the main observation loop.
    do {
        Console.PrintLine("length of listOfBestObs: " + listOfBestObs.length)
        Console.PrintLine(listOfBestObs)
        var bestObs = obsIndex < listOfBestObs.length ? listOfBestObs[obsIndex] : null;
        Console.PrintLine("on line 1957")
        Console.PrintLine(bestObs[0]);
        Console.PrintLine("on line 1959")
        updateLog(bestObs);
        Console.PrintLine("on line 1958")
        obsIndex++;

        // Safeguard: Prevent observing before sunset
        // (This can be commented out for simulated testing during the day)
        //while (Util.SysJulianDate < sunset) {
        //    updateLog("It's still too early to begin... Waiting for " + ((sunset - Util.SysJulianDate)*86400).toFixed(0) + " seconds.", "INFO");
        //    Util.WaitForMilliseconds(5000); // Wait for 5 seconds before checking again.
        //}

        // Safeguard: Stop observing if it's past sunrise
        if (Util.SysJulianDate > sunrise) {
            updateLog("Too late. Nothing left to observe.", "INFO");
            andRestart(); // Restart the system
        }

        // Monitor the weather and check if it is safe to observe.
        if ((Weather.Available && Weather.safe) || (ignoreWeather == true)) {
            Console.PrintLine("Checking Weather");
            connectScope(); // Connect to the telescope.
            domeOpen(); // Open the dome.
            trkOn(); // Turn on telescope tracking.
        }

        // If no suitable observation is found, wait for 5 minutes and retry.
        // TODO: Instead of waiting idly for 5 minutes when no suitable observations are found, add RunColibri KBO observation functionality.
        if (bestObs == null || bestObs == "None") {
            Console.PrintLine("No suitable observation found in current conditions.")
            Console.PrintLine("Wait for 5 minutes and try again.")
            Util.WaitForMilliseconds(300000); // Wait for 5 minutes
            continue; // Continue to the next iteration of the loop.
        }

        // Log the selected observation details.
        // selectBestObservation returns a Request with properties: directoryName, priority, ra, dec, startUTC, startJD, endUTC, endJD, exposureTime, filter, binning, altitude, moonAngle, score, and csvIndex
        updateLog("Requested Observation Info", "INFO");
        updateLog("Directory Name: " + bestObs.directoryName, "INFO");
        updateLog("Priority: " + bestObs.priority, "INFO");
        updateLog("RA: " + bestObs.ra, "INFO");
        updateLog("Dec: " + bestObs.dec, "INFO");
        updateLog("Start UTC:" + bestObs.startUTC, "INFO");
        updateLog("Start JD: " + bestObs.startJD, "INFO");
        updateLog("End UTC: " + bestObs.endUTC, "INFO");
        updateLog("End JD: " + bestObs.endJD, "INFO");
        updateLog("Exposure Time: " + bestObs.exposureTime, "INFO");
        updateLog("Filter: " + bestObs.filter, "INFO");
        updateLog("Binning: " + bestObs.binning, "INFO");
        updateLog("Altitude: " + bestObs.altitude, "INFO");
        updateLog("Moon Angle: " + bestObs.moonAngle, "INFO");
        updateLog("Score: " + bestObs.score, "INFO");
        updateLog("CSV Index: " + bestObs.csvIndex, "INFO");

        // Create coordinate transform for the current request
        var currentFieldCt = Util.NewCThereAndNow();
        currentFieldCt.RightAscension = bestObs.ra / 15; // Convert RA from degrees to hours.
        currentFieldCt.Declination = bestObs.dec;

        // Log the coordinates to which the telescope will slew
        updateLog("Slewing to...", "INFO");
        updateLog("RA: " + currentFieldCt.RightAscension, "INFO");
        updateLog("Dec: " + currentFieldCt.Declination, "INFO");
        updateLog("Alt: " + currentFieldCt.Elevation, "INFO");
        updateLog("Az: " + currentFieldCt.Azimuth, "INFO");

        // Command the telescope to slew to the target field.
        gotoRADec(currentFieldCt.RightAscension, currentFieldCt.Declination);

        // Wait for the telescope and dome to finish slewing
        while (Telescope.Slewing == true) {
            Console.PrintLine("Huh. Still Slewing...");
            Util.WaitForMilliseconds(500); // Wait for 0.5 seconds between checks.
        }

        Dome.UnparkHome(); // Unpark the dome and move it to the home position.
        if (Dome.slave == false) { Dome.slave = true; } // Ensure the dome is slaved to the telescope.

        // Wait for the dome to finish slewing.
        while (Dome.Slewing == true) {
            Console.PrintLine("Dome is still slewing. Give me a minute...");
            Util.WaitForMilliseconds(500); // Wait for 0.5 seconds between checks
        }

        // Update the log when the telescope and dome have reached the target coordinates.
        updateLog("At target.", "INFO");
        updateLog("Target Alt/Az is: Alt. =" + currentFieldCt.Elevation.toFixed(2) + "   Az. = " + currentFieldCt.Azimuth.toFixed(2), "INFO");

        // Start collecting data for the observation
        updateLog("Starting data collection...", "INFO");

        // Attempt to link the camera for image capturing.
        try {
            if (!ccdCamera.LinkEnabled) {
                updateLog("Camera is not linked. Attempting to link...", "INFO");
                ccdCamera.LinkEnabled = true; // Enable the camera link.

                if (ccdCamera.LinkEnabled) {
                    updateLog("Camera linked successfully.", "INFO");
                } else {
                    updateLog("Failed to link the camera." , "ERROR");
                    return;
                }
            } else {
                updateLog("Camera already linked.", "INFO");
            }
        } catch (e) {
            updateLog("An error occurred: " + e.message, "ERROR");
        }

        // Create directories for storing the captured images.
        Util.ShellExec("cmd.exe", "/c mkdir -p d:\\ColibriData\\" + today.toString() + "\\" + bestObs.directoryName)
        Util.ShellExec("cmd.exe", "/c mkdir -p d:\\ColibriData\\" + today.toString() + "\\Dark\\" + bestObs.directoryName)

        // Iteration counters for exposures and dark frames.
        var darkInterval = 30 / (bestObs.exposureTime / 60); // Calculate how many exposures fit into 30 minutes.
        var darkCounter = darkInterval; // Initialize the dark frame counter. Set equal to interval so that dark set is collected on first run.
        var runCounter = 1;

        var endJD = Util.SysJulianDate + (bestObs.obsDuration / 1440); // Calculate when the observation should end (in Julian Date)

        // Start a loop that runs while the current Julian Date is less than or equal to the observation's end time.
        while (Util.SysJulianDate <= endJD) {
            // Check if it's time to adjust the telescope pointing and take dark frames.
            // This happens either every 30 minutes or if the remaining observation time is less than 30 minutes.
            if (darkCounter == darkInterval) {
                // Log the start of telescope pointing adjustment using a child script.
                updateLog("Readjust the telescope pointing using child script.", "INFO");
                
                // Adjust the telescope pointing to the current target (Right Ascension and Declination).
                adjustPointing(currentFieldCt.RightAscension, currentFieldCt.Declination)
                
                // Wait for the telescope to finish slewing (moving to the target coordinates)
                while (Telescope.Slewing == true) {
                    Console.PrintLine("Huh. Still Slewing..."); // Inform the user the telescope is still slewing.
                    Util.WaitForMilliseconds(500); // Wait for 0.5 seconds before checking again.
                }

                // Unpark the dome and move it to its home position
                Dome.UnparkHome();

                // If the dome is not already slaved (automatically follows the telescope), enable slaving
                if (Dome.slave == false) { Dome.slave = true; }

                // Wait for the dome to finish slewing (moving to align with the telescope)
                while (Dome.Slewing == true) {
                    Console.PrintLine("Dome is still slewing. Give me a minute..."); // Inform the user that the dome is still moving
                    Util.WaitForMilliseconds(500); // Wait for 0.5 seconds before checking again
                }

                // Check the current side of the pier the telescope is on (East or West) and log it
                if (Telescope.SideOfPier == 0) {
                    pierside = "E"; // Telescope is on the East side of the pier
                } else {
                    pierside = "W"; // Telescope is on the West side of the pier
                }
                updateLog("Pier side: " + pierside, "INFO");
                
                // Log that the telescope is about to take dark frames (calibration images with no light).
                updateLog("Taking Darks.", "INFO");

                // Capture dark frames using the specified exposure time and save them to the designated directory.
                refCollection(2, bestObs.exposureTime, "D:\\ColibriData\\" + today.toString() + "\\Dark\\" + bestObs.directoryName);

                // Reset the dark frame counter to start counting again for the next interval.
                darkCounter = 0;
            }

            // Increment the dark frame counter to track when the next dark frame should be taken.
            darkCounter++;
            updateLog("Dark counter = " + darkCounter.toString(), "INFO"); // Log the updated dark frame counter value.

            // Attempt to start a new exposure for the observation.
            try {
                updateLog("Starting exposure...", "INFO");

                // Set the binning (resolution) of the camera based on the observation parameters.
                ccdCamera.BinX = bestObs.binning;
                ccdCamera.BinY = bestObs.binning;

                // Begin the exposure with the specified exposure time and filter.
                // The exposure time is expected in seconds.
                ccdCamera.Expose(bestObs.exposureTime, bestObs.filter);

                // Log a successful start of the exposure.
                updateLog("Exposure started successfully", "INFO");
            } catch (e) {
                // Log an error if something goes wrong while starting the exposure.
                updateLog("Error starting exposure: " + e.message, "ERROR");
            }

            // Wait for the image to be ready after the exposure.
            var maxWaitTime = bestObs.exposureTime * 1000; // Maximum wait time (the exposure time), in milliseconds.
            var waitInterval = 1000; // Check every 1000ms (1 second).
            var elapsedTime = 0; // Initialize the elapsed time counter.

            try {
                // Wait for the camera to signal that the image is ready, or until the maximum wait time is reached.
                while (!ccdCamera.ImageReady && elapsedTime < maxWaitTime) {
                    Util.WaitForMilliseconds(waitInterval); // Wait for the defined interval (1 second).
                    elapsedTime += waitInterval; // Increment the elapsed time by the interval.
                }

                // If the image is ready, save it to the specified file path.
                if (ccdCamera.ImageReady) {
                    var filePath = "D:\\ColibriData\\" + today.toString() + "\\" + bestObs.directoryName + "\\image_" + new Date().getTime() + "_" + bestObs.exposureTime + "s.fits"; 
                    updateLog("Saving image to: " + filePath, "INFO");  // Log the file path where the image will be saved.
                    ccdCamera.SaveImage(filePath); // Save the image to the specified path.
                    updateLog("Image saved successfully to: " + filePath, "INFO");// Log the successful image save.
                } else {
                    // Log an error if the image is not ready after the maximum wait time.
                    updateLog("Image not ready after waiting.", "ERROR");
                }
            } catch (e) {
                // Log an error if something goes wrong during image saving.
                updateLog("Error saving image: " + e.message, "ERROR");
            }
            
            // Increment the run counter after each successful exposure.
            runCounter++;
        }

        // Attempt to safely disconnect from the camera after all exposures are complete.
        try {
            ccdCameraCamera.LinkEnabled = false; // Disable the camera link (disconnect).
            updateLog("Camera disconnected.", "INFO"); // Log the successful camera disconnection.
        } catch (e) {
            // Log an error if something goes wrong while disconnecting the camera.
            updateLog("An error occurred: " + e.message, "ERROR");
        }

        // Mark requested observation as completed in the CSV file.
        try {
            // Ensure the CSV index is valid and within the bounds of the observation requests array.
            if (bestObs.csvIndex >= 0 && bestObs.csvIndex < lines.length) {
                var rowData = lines[bestObs.csvIndex].split(","); // Split the CSV row into an array of data.

                // Modify the necessary column (e.g., column 10) to mark the observation as completed.
                rowData[10] = 1;

                // Join the array back into a CSV-formatted string
                lines[bestObs.csvIndex] = rowData.join(",");
            } else {
                // Log an error if the CSV index is out of range or if the file is empty.
                updateLog("Index out of range or file is empty.", "ERROR");
                updateLog("CSV Index: " + bestObs.csvIndex, "INFO");
            }

            // Update the CSV file with the modified data.
            updateCSV(lines);
        } catch (e) {
            // Log an error if something goes wrong while updating the CSV file.
            updateLog("Error: " + e.message, "ERROR");
        }

        // Fetch the next set of observation requests.
        requests = getRequests()[0];

        // Log the remaining observation requests and print the updated observation plan.
        updateLog("Remaining requests: " + requests.length, "INFO");
        updateLog("Updated Plan:", "INFO");
        printPlan(requests);

    // Continue the loop if there are still observation requests remaining.
    } while (obsIndex < listOfBestObs.length);

    // Safely shut down the system after all observation requests have been processed.
    shutDown();
}

// DEBUG - Akshat/Owen debug function
// Main execution function.
function mainDEBUG() {

    // Calculate astronomical sunrise and sunset times (technically 12 degree twilight times) based on Julian Date.
    // twilightTimes: [0] - JD of sunrise, [1] - JD of sunset
    // Note! The calculation for sunsetLST only works if you are west of Greenwich
    //sunset  = 2460699.4796364945;
    //sunrise = 2460699.987987991;

    var monthToNum = new Map();
    monthToNum.set('Jan', '01');
    monthToNum.set('Feb', '02');
    monthToNum.set('Mar', '03');
    monthToNum.set('Apr', '04');
    monthToNum.set('May', '05');
    monthToNum.set('Jun', '06');
    monthToNum.set('Jul', '07');
    monthToNum.set('Aug', '08');
    monthToNum.set('Sep', '09');
    monthToNum.set('Oct', '10');
    monthToNum.set('Nov', '11');
    monthToNum.set('Dec', '12');
    
    // DEBUG: need to set sunset and sunrise time
    var currentDay = new Date();
    //currentDay.setHours(12);
    //currentDay.setMinutes(30);
    var parts = currentDay.toUTCString().split(' ');
    var hourMinSec = parts[4].split(':');
    var currentDateString = parts[3] + ':' + monthToNum.get(parts[2]) + ':' + parts[1] + ':' + hourMinSec[0] + ':' + hourMinSec[1];
    var sunset = UTCtoJD(currentDateString, "debug");
    sunset  = twilightTimes(sunset, "debug")[1];
    

    var nextDay = new Date();
    //nextDay.setHours(2);
    //nextDay.setMinutes(30);
    var parts = nextDay.toUTCString().split(' ');
    var hourMinSec = parts[4].split(':');
    var nextDateString = parts[3] + ':' + monthToNum.get(parts[2]) + ':' + parts[1] + ':' + hourMinSec[0] + ':' + hourMinSec[1];
    var sunrise = UTCtoJD(nextDateString, "debug");
    sunrise = twilightTimes(sunrise + 1, "debug")[0];
    // DEBUG: need to set sunset and sunrise time
    
    // Get the current position of the Moon
    var moonCT = {
        RightAscension: 15.35477392,
        Declination: -23.61302659
    };

    // Retrieve observation requests and their corresponding CSV lines.
    var csvData = getRequests("debug");
    var requests = csvData[0]; // Observation requests

    var bestObs = selectBestObservations(requests, sunset, sunrise, moonCT, "debug");
}

// If you wish to run on ACP set to main(), if locally use mainDEBUG()
main();

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

    //DEBUG
    this.astronomyScore = 0;
    this.timeScore = 0;
    this.totalScore = 0;
    //DEBUG

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

// Scheduling-related functions
// Converts a UTC time string to a Julian Date (JD) for astronomical calculations.
// JD is used for precision in tracking celestial events and scheduling observations.
function UTCtoJD(UTC) {
    // Split the UTC string into its components: year, month, day, hour, and minutes.
    var dividedUTC = UTC.split(":");

    // Parse the components as integers for calculation.
    var year = parseInt(dividedUTC[0], 10);
    var month = parseInt(dividedUTC[1], 10);
    var day = parseInt(dividedUTC[2], 10);
    var hour = parseInt(dividedUTC[3], 10);
    var minute = parseInt(dividedUTC[4], 10);

    // If month is January or February, adjust year and month for the Julian calculation
    if (month <= 2) {
        year -= 1;
        month += 12;
    }

    // Calculate Julian Day Number using the standard formula
    var A = Math.floor(year / 100);
    var B = 2 - A + Math.floor(A / 4);
    var JD = Math.floor(365.25 * (year + 4716)) + Math.floor(30.6001 * (month + 1)) + day + B - 1524.5;

    // Convert the time into fractional hours and then fractional days.
    var fracHour = hour + (minute / 60); // Convert minutes to hours.
    var fracDay = fracHour / 24; // Convert hours to a fractional part of the day.

    // Add the fractional day to the Julian Day
    JD += fracDay;

    // Return the calculated Julian Date
    return JD;
}

// Reads and parses observation requests from a CSV file.
// The function returns an array of Request objects along with the raw CSV data.
function getRequests() {

    var requests = [];  // Array to store the parsed Request objects.
    var lines = [];     // Array to store the raw lines from the CSV file.
    var indices = new RequestIndices(); // Object to map CSV fields to request parameters.

    // Create an ActiveX object for file system operations.
    const fs = require('fs');

    // Read the CSV file
    var data;
    try {
        data = fs.readFileSync('./colibri_user_observations.csv', 'utf8');
      } catch (err) {
        console.error(err);
        }

    var rowCounter = -1; // Counter to track the row index in the CSV file.
    var rowData = [];    // Array to hold the individual fields of a CSV row.
    const file = data.split("\n");

    // Loop through the CSV file line by line until reaching the end of the file.
    while(rowCounter < file.length){
    // while(!file.AtEndOfStream) {
        if (rowCounter > 0) { // Skip the header row (first row of the CSV).
            //var line = file.ReadLine(); // Read a line from the CSV file.
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
    fso = null; // Release the FileSystemObject.
    
    //updateLog("debug: length of requests in getRequests() " + requests.length);
    // Return the array of Request objects and the raw CSV lines.
    return [requests, lines];
}

// Selects the best observation from a list of requests, based on various filtering and ranking criteria.
function selectBestObservation(requests, sunset, sunrise, moonCT) {

    // Filter out observations that don't fit within the time window or between sunset and sunrise.
    var suitableObs = filterByTime(requests, sunset, sunrise);

    // Filter out observations that don't meet the required astronomical conditions (e.g., moon proximity, altitude).
    var filteredObs = filterByAstronomy(suitableObs, moonCT);

    // Rank the remaining suitable observations based on priority, time, and astronomy scores.
    var rankedObs = rankObservations(filteredObs);
    
    // Select the highest-ranked observation.
    var bestObs = selectTopObservation(rankedObs);

    // we need to calculate correct start and end times of the first and following observations
    // start and end times are arranged end to end. and are calculated based off of top observation.
    calculateStartEndWindows(rankedObs);

    writeRequestsToCSV(rankedObs);
    return bestObs; // Return the best observation request.
}

function calculateStartEndWindows(rankedObs){
    // first observation is top observations, we start window cascading calculation based off that
    for (var i = 0; i < rankedObs.length; i++) {
        if(i > 0){
            rankedObs[i].startUTC = rankedObs[i - 1].endUTC;
        }
        // for first observation, only update endUTC
        var parts = rankedObs[i].startUTC.split(":"); // Split the time string into parts.
        var mins = parseInt(parts[parts.length - 1]) // Parse the minutes
        var hours = parseInt(parts[parts.length - 2]) // Parse the hours
        var days = parseInt(parts[parts.length - 3]) // Parse the days

        // update mins
        var calculatedMins = mins + rankedObs[i].obsDuration;
        var minsToIncrement = rankedObs[i].obsDuration % 60;

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
            rankedObs[i].endUTC = updateDay(parts.join(":"));
        }
        else{
            // Recombine the parts into a single time string
            rankedObs[i].endUTC = parts.join(":");
        }   
    }
}

// Filters the observation requests by checking if they fall within the allowed time window and between sunset and sunrise.
function filterByTime(requests, sunset, sunrise) {
    
    var filteredObs = [];
    // var currJD = Util.SysJulianDate;

    // DEBUG: calculate current julian date instead of using Utility call
    const currentDate = new Date();
    currentDate.setHours(19);
    var currJD = currentDate.getTime() / 86400000 + 2440587.5;
    // DEBUG: calculate current julian date instead of using Utility call

    // Loop through each request and check if it fits within the time window and sunset/sunrise.
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

    // Check if the observation fits within the time window and returns true if it does.
    return startWindow <= currJD && currJD <= endWindow && endJD <= sunrise && sunset <= startWindow && startWindow <= sunrise && sunset <= endWindow && endWindow <= sunrise;
}

// Filters the observation requests by checking if they meet certain astronomical conditions (e.g., target altitude and distance from the moon).
function filterByAstronomy(requests, moonCT) {
    
    var filteredObs = [];
    var currLST = 10.5; // Replace with a constant LST value in hours (e.g., 10.5 = 10:30 hours).

    // Loop through each request and check if it meets the astronomical conditions.
    for (var i = 0; i < requests.length; i++) {
        var request = requests[i];
        // Add to filteredObs if the request meets the astronomy conditions.
        if (meetsAstronomyConditions(request, moonCT, currLST)) { filteredObs.push(request); }
    }

    return filteredObs; // Return the filtered list of requests.
}

// Checks if the observation request meets the required astronomical conditions (elevation above a limit and minimum moon angle).
function meetsAstronomyConditions(request, moonCT, newLST) {
    
    var ra = request.ra;    // Right Ascension of the target.
    var dec = request.dec;  // Declination of the target.
    
    // Calculate the altitude of the target at the current Local Sidereal Time (LST).
    var targetAltitude = calculateAltitude(ra, dec, newLST);
    // Calculate the angular distance between the target and the moon.
    var moonAngle = calculateMoonAngle(ra, dec, moonCT);
    
    // Store the calculated values in the request object.
    request.altitude = targetAltitude;
    request.moonAngle = moonAngle;

    // Return true if the target's ltitude is above the elevation limit and if the moon's angle is greater than the minimum offset.
    return targetAltitude > elevationLimit && moonAngle > minMoonOffset;
}

// Calculates the altitude of the target based on its RA, DEC, and the Local Sidereal Time (LST).
function calculateAltitude(ra, dec, newLST) {
    // Constants
    const latitude = 34.0; // Replace with the telescope's fixed latitude in degrees (e.g., 34.0 for a location in the northern hemisphere).

    // Convert inputs to radians for calculations
    const raRad = (ra / 15) * (Math.PI / 180); // Convert RA from degrees to hours, then to radians
    const decRad = dec * (Math.PI / 180); // Convert Dec to radians
    const latRad = latitude * (Math.PI / 180); // Convert latitude to radians
    const lstRad = newLST * (Math.PI / 180); // Convert LST to radians

    // Calculate the Hour Angle (HA) in radians
    const haRad = lstRad - raRad;

    // Calculate altitude (elevation) using the formula:
    // sin(alt) = sin(dec) * sin(lat) + cos(dec) * cos(lat) * cos(HA)
    const sinAlt = Math.sin(decRad) * Math.sin(latRad) + Math.cos(decRad) * Math.cos(latRad) * Math.cos(haRad);
    const altitude = Math.asin(sinAlt); // Resulting altitude in radians

    // Convert altitude back to degrees
    return altitude * (180 / Math.PI);
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
function rankObservations(requests) {
    
    var rankedObs = [];

    // Loop through each request and calculate its score.
    for (var i = 0; i < requests.length; i++) {
        var request = requests[i];
        calculateScore(request); // Calculate and assign a score to each request.
    }

    // Sort the request in descending order based on their scores.
    rankedObs = requests.sort(function (request1, request2) { 
        return request1.compareScore(request2); // Use the compareScore method to determine the order.
    });

    return rankedObs; // Return the ranked list of observation requests.
}

// Calculates the overall score for an observation request based on its priority, timing, and astronomical conditions.
function calculateScore(request) {
    
    var score = request.priority * 50; // Give priority extra weight (multiplied by 50).

    if(request.directoryName == '6109949904687424640'){
        var pass = 1;
    }
    // Add the scores from time and astronomy conditions to the total score.
    score += evaluateTimeScore(request);
    score += evaluateAstronomyScore(request);

    request.timeScore = evaluateTimeScore(request);
    request.astronomyScore = evaluateAstronomyScore(request);
    request.totalScore = score;

    request.score = score; // Assign the calcualted score to the request.
}

// Calculates score based on the observation's time window (how long the observation lasts).
function evaluateTimeScore(request) {
    
    // DEBUG: just return duration of observation in minutes
    return Math.max(0, request.obsDuration);
    // DEBUG: just return duration of observation in minutes

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
    date.setHours(date.getHours() - 5);
    // Convert back to ISO 8601 string and return
    var returnVal = date.toISOString();

    returnVal = returnVal.replace('-', ':');
    returnVal = returnVal.replace('-', ':');
    returnVal = returnVal.replace('T', ':');
    returnVal = returnVal.replace(':00.000Z', '');

    return returnVal;
}

function twilightTimes(jDate) {
	var lat = Telescope.SiteLatitude;
	var lon = Telescope.SiteLongitude;
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

function writeRequestsToCSV(requests, sunrise, sunset) {

    // Moved section from main to this function so sunrise and sunset can be accessed
    const monthToNum = new Map();
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
    currentDay.setHours(12);
    currentDay.setMinutes(30);
    var parts = currentDay.toUTCString().split(' ');
    var hourMinSec = parts[4].split(':');
    var currentDateString = parts[3] + ':' + monthToNum.get(parts[2]) + ':' + parts[1] + ':' + hourMinSec[0] + ':' + hourMinSec[1];
    var sunset = UTCtoJD(currentDateString);
    // console.log(sunset); 2025-02-19 17:30:00

    var nextDay = new Date();
    nextDay.setDate(currentDay.getDate() + 1);
    nextDay.setHours(2);
    nextDay.setMinutes(30);
    var parts = nextDay.toUTCString().split(' ');
    var hourMinSec = parts[4].split(':');
    var nextDateString = parts[3] + ':' + monthToNum.get(parts[2]) + ':' + parts[1] + ':' + hourMinSec[0] + ':' + hourMinSec[1];
    var sunrise = UTCtoJD(nextDateString);
    // console.log(sunrise); 2025-02-20 07:30:00
    // DEBUG: need to set sunset and sunrise time
    
    try {

        // Import the filesystem module 
        const fs = require('fs');
        
        fs.readFileSync('./colibri_user_observations.csv', 'utf8');

        var data = "Directory Name,Priority,RA,Dec,Start Time,End Time,Obs Duration,Exposure Time,Filter,Binning,Total Score,Astronomy Score, Time Score\n"
        data += "Sunrise: "
        data += sunrise;
        data += "\n";
        data += "Sunset: "
        data += sunset;
        data += "\n";

        // Write the new lines of data to the file
        for (var i = 0; i < requests.length; i++) {
            startObsWindowJD = UTCtoJD(requests[i].startUTC);
            endObsWindowJD = UTCtoJD(requests[i].endUTC);
            if (startObsWindowJD >= sunset && endObsWindowJD <= sunrise) {
            var obs = "";
            obs += requests[i].directoryName;
            obs += ",";
            obs += requests[i].priority;
            obs += ",";
            obs += requests[i].ra;
            obs += ",";
            obs += requests[i].dec;
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
            obs += ",";
            obs += requests[i].totalScore; 
            obs += ",";
            obs += requests[i].astronomyScore; 
            obs += ",";
            obs += requests[i].timeScore; 
            obs += '\n';
            data += obs;
            }

        }
        fs.writeFileSync("sorted_user_observations.csv", data);

        file1 = './colibri_user_observations.csv';
        file2 = 'sorted_user_observations.csv';

        // Read and normalize files, handling commas for CSVs
        const file1Lines = fs.readFileSync(file1, 'utf8').replace(/\r/g, '').split('\n').map(line => line.trim()).filter(line => line);
        const file2Lines = fs.readFileSync(file2, 'utf8').replace(/\r/g, '').split('\n').map(line => line.trim()).filter(line => line);

        // Extract the first word from each line by splitting by commas
        const file2FirstWords = new Set(file2Lines.map(line => line.split(',')[0].trim()));

        console.log('First fields in file2:', Array.from(file2FirstWords));  // Debugging

        // Filter file1 lines where the first field (before comma) is not in file2
        const uniqueLines = file1Lines.filter(line => {
            const firstWord = line.split(',')[0].trim(); // Get the first field (before the comma)
            return !file2FirstWords.has(firstWord);
        });

        console.log('Unique lines from file1:', uniqueLines);  // Debugging

        // Write back the filtered lines to file1
        fs.writeFileSync(file1, uniqueLines.join('\n'), 'utf8');

        console.log(`Updated ${file1}, removed ${file1Lines.length - uniqueLines.length} lines with common first fields.`);
    } catch (e) {
        // In case of an error (e.g., file access issues), log the error message
        console.error("Error: " + e.message);
    }
}


//New function to delete observations that have already been scheduled


// END OF FUNCTIONS

// Global variables and configurations
// Variables used for logging and system state checks.
var logconsole = true; // Enable or disable logging the console output.
var fso, f1, ts; // FileSystemObject and file variables for logging and file handling.
// var currentDate = "20250101"; // Store the current date.

// Magic numbers for astronomical limits
var elevationLimit = 10; // Minimum elevation angle for telescope pointing (degrees).
var minMoonOffset = 15; // Minimum allowed angular distance from the Moon (degrees).

// Main execution function.
function main() {

    // Calculate astronomical sunrise and sunset times (technically 12 degree twilight times) based on Julian Date.
    // twilightTimes: [0] - JD of sunrise, [1] - JD of sunset
    // Note! The calculation for sunsetLST only works if you are west of Greenwich
    //sunset  = 2460699.4796364945;
    //sunrise = 2460699.987987991;

    const monthToNum = new Map();
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
    currentDay.setHours(12);
    currentDay.setMinutes(30);
    var parts = currentDay.toUTCString().split(' ');
    var hourMinSec = parts[4].split(':');
    var currentDateString = parts[3] + ':' + monthToNum.get(parts[2]) + ':' + parts[1] + ':' + hourMinSec[0] + ':' + hourMinSec[1];
    var sunset = UTCtoJD(currentDateString);
    console.log("Sunset JD:")
    console.log(sunset);

    var nextDay = new Date();
    nextDay.setDate(currentDay.getDate() + 1);
    nextDay.setHours(2);
    nextDay.setMinutes(30);
    var parts = nextDay.toUTCString().split(' ');
    var hourMinSec = parts[4].split(':');
    var nextDateString = parts[3] + ':' + monthToNum.get(parts[2]) + ':' + parts[1] + ':' + hourMinSec[0] + ':' + hourMinSec[1];
    var sunrise = UTCtoJD(nextDateString);
    console.log("Sunrise JD:")
    console.log(sunrise);
    // DEBUG: need to set sunset and sunrise time
    
    // Get the current position of the Moon
    var moonCT = {
        RightAscension: 15.35477392,
        Declination: -23.61302659,
    };

    // Retrieve observation requests and their corresponding CSV lines.
    var csvData = getRequests();
    var requests = csvData[0]; // Observation requests

    var bestObs = selectBestObservation(requests, sunset, sunrise, moonCT);
}

main();
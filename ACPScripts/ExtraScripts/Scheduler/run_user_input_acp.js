// import { Request, RequestIndices } from "./RunColibriRequests.js";

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

    this.csvIndex = csvIndex;

    this.compareScore = function(otherRequest) {return this.score > otherRequest.score; };
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

function UTCtoJD(UTC) {
    var dividedUTC = UTC.split(":");
    // var K = parseInt(dividedUTC[0]);
    // var M = parseInt(dividedUTC[1]);
    // var I = parseInt(dividedUTC[2]);
    // var H = parseInt(dividedUTC[3]);
    // var m = parseInt(dividedUTC[4]);

    var year = parseInt(dividedUTC[0], 10);
    // var year = dividedUTC[0];
    Console.PrintLine(typeof(year));
    Console.PrintLine("Year: " + year);
    var month = parseInt(dividedUTC[1], 10);
    Console.PrintLine("Month: " + month);
    var day = parseInt(dividedUTC[2], 10);
    Console.PrintLine("Day: " + day);
    var hour = parseInt(dividedUTC[3], 10);
    Console.PrintLine("Hour: " + hour);
    var minute = parseInt(dividedUTC[4], 10);
    Console.PrintLine("Minute: " + minute);

    var fracHour = hour + (minute / 60);
    Console.PrintLine("fracHour: " + fracHour);

    var fracDay = day + (fracHour / 24);
    Console.PrintLine("fracDay: " + fracDay);

    var JD = Util.Calendar_Julian(year, month, fracDay);
    Console.PrintLine(JD)

    // var JD = (367 * K) - trunc((7 * (K + trunc((M + 9) / 12))) / 4) + trunc((275 * M) / 9) + I + 1721013.5 + (ut / 24) - (0.5 * sign(100 * K + M - 190002.5)) + 0.5;

    return JD;
}

function getRequests() {
    var requests = [];
    var lines = [];
    var indices = new RequestIndices();

    try {
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var file = fso.OpenTextFile("./colibri_user_observations.csv", 1); // 1 = For Reading

        var rowCounter = 0;

        while(!file.AtEndOfStream) {
                var line = file.ReadLine();
                lines.push(line);
                var rowData = line.split(",");
                
                if (parseInt(rowData[indices.completion]) == 0) {
                    var request = new Request(
                        rowData[indices.directoryName],
                        parseInt(rowData[indices.priority]),
                        parseFloat(rowData[indices.ra]),
                        parseFloat(rowData[indices.dec]),
                        rowData[indices.startTime],
                        UTCtoJD(rowData[indices.startTime]),
                        rowData[indices.endTime],
                        UTCtoJD(rowData[indices.endTime]),
                        rowData[indices.numExposures],
                        rowData[indices.exposureTime],
                        rowData[indices.filter],
                        rowData[indices.binning],
                        rowCounter
                    );

                    Console.PrintLine(request);

                    requests.push(request);
                }
            rowCounter++;
        }
        file.Close();
        // fso = null;
    } catch (e) {
        Console.PrintLine("An error occurred: " + e.message);
    }

    return [requests, lines];
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

function main() {
    // var requests = [];
    // var indices = new RequestIndices();

    // try{
    //     // Create an instance of the FileSystemObject
    //     var fso = new ActiveXObject("Scripting.FileSystemObject");
    //     var file = fso.OpenTextFile("./colibri_user_observations.csv", 1); // 1 = For Reading

    //     rowCounter = 0;

    //     // Read and process each line of the CSV file.
    //     var line;
    //     while (!file.AtEndOfStream) {
    //         line = file.ReadLine();
    //         if (rowCounter != 0) {
    //             var rowData = line.split(",");
    //             var request = new Request;

    //             request.name = rowData[parseInt(indices.directory_name)];
    //             request.ra = rowData[parseInt(indices.ra)];
    //             request.dec = rowData[parseInt(indices.dec)];
    //             request.num_exposures = rowData[parseInt(indices.num_exposures)];
    //             request.exposure_time = rowData[parseInt(indices.exposure_time)];
    //             request.filter = rowData[indices.filter];
    //             request.binning = rowData[parseInt(indices.binning)];

    //             requests.push(request);
    //         }
    //         rowCounter++;
    //     }

    //     // Close the file
    //     file.Close();
    //     fso = null;
    // } catch (e) {
    //     // Console.PrintLine("An error occurred: " + e.message);
    //     console.log("An error occurred: " + e.message);
    // }

    // var requests = getRequests()[0];
    // print(requests);

    // for (var i = 0; i < requests.length; i++) {
    //     var request = requests[i];

    //     Console.PrintLine("Directory name: " + request.diretoryName);
    //     Console.PrintLine("Priority: " + request.priority);
    //     Console.PrintLine("RA: " + request.ra);
    //     Console.PrintLine("Dec: " + request.dec);
    //     Console.PrintLine("Number of Exposures: " + request.numExposures);
    //     Console.PrintLine("Exposure Time: " + request.exposureTime);
    //     Console.PrintLine("Filter:" + request.filter);
    //     Console.PrintLine("Binning: " + request.binning);

    //     Console.PrintLine("------------------");
    // }
    

    try {
        var sunset = twilightTimes(Util.SysJulianDate)[1];
        var today = JDtoUTC(sunset);
        
        Console.PrintLine("Test Path");
    
        var bestObs = new Request("orion",8,83.3975,5.7561,"2024:08:16:16:00",UTCtoJD("2024:08:16:16:00"),"2024:08:16:18:00", UTCtoJD("2024:08:16:18:00"),30,60000,"dark",2,0);

        var wshShell = new ActiveXObject("WScript.Shell");
        var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");

        var colibriGrabPath = userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";
        Console.PrintLine(colibriGrabPath);

        var test_path = "\"" + colibriGrabPath + "\" -n " + bestObs.numExposures.toString() + " -p " + bestObs.directoryName + "_" + bestObs.exposureTime + "ms-" + pierside + " -e " + bestObs.exposureTime + " -t 0 -f " + bestObs.filter + "-w D:\\ColibriData\\" + today.toString() + "\\" + bestObs.directoryName;
        Console.PrintLine(test_path);
    } catch (e) {
        Console.PrintLine("Error: " + e.message);
    }

    
}
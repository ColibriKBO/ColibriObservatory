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
        var file = fso.OpenTextFile("./colibri_user_observations.csv", 1); // 1 = For Reading

        var rowCounter = 0;
        var line;

        while(!file.AtEndOfStream) {
            if (rowCounter != 0) {
                if (rowData[parseInt(indices.completion)] == 0) {
                    var request = new Request;
                    line = file.ReadLine();
                    var rowData = line.split(",");

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

    for (var i = 0; i < requests.length; i++) {
        var request = requests[i];

        Console.PrintLine("Directory name: " + request.name);
        Console.PrintLine("RA: " + request.ra);
        Console.PrintLine("Dec: " + request.dec);
        Console.PrintLine("Number of Exposures: " + request.num_exposures);
        Console.PrintLine("Exposure Time: " + request.exposure_time);
        Console.PrintLine("Filter:" + request.filter);
        Console.PrintLine("Binning: " + request.binning);

        Console.PrintLine("------------------");
    }
}
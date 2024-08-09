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

    Console.PrintLine(JD);
    Console.PrintLine(typeof(JD));

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

    var requests = getRequests()[0];
    print(requests);

    for (var i = 0; i < requests.length; i++) {
        var request = requests[i];

        Console.PrintLine("Directory name: " + request.diretoryName);
        Console.PrintLine("Priority: " + request.priority);
        Console.PrintLine("RA: " + request.ra);
        Console.PrintLine("Dec: " + request.dec);
        Console.PrintLine("Number of Exposures: " + request.numExposures);
        Console.PrintLine("Exposure Time: " + request.exposureTime);
        Console.PrintLine("Filter:" + request.filter);
        Console.PrintLine("Binning: " + request.binning);

        Console.PrintLine("------------------");
    }
}
// import { Request, RequestIndices } from "./RunColibriRequests.js";

function Request(directory_name, ra, dec, num_exposures, exposure_time, filter, binning) {
    this.directory_name = directory_name;
    this.ra = ra;
    this.dec = dec;
    this.num_exposures = num_exposures;
    this.exposure_time = exposure_time;
    this.filter = filter;
    this.binning = binning;
}

function RequestIndices() {
    this.directory_name = 0;
    this.ra = 1;
    this.dec = 2;
    this.num_exposures = 3;
    this.exposure_time = 4;
    this.filter = 5;
    this.binning = 6;
}

function main() {
    var requests = [];
    var indices = new RequestIndices();

    try{
        // Create an instance of the FileSystemObject
        var fso = new ActiveXObject("Scripting.FileSystemObject");
        var file = fso.OpenTextFile("./colibri_user_observations.csv", 1); // 1 = For Reading

        rowCounter = 0;

        // Read and process each line of the CSV file.
        var line;
        while (!file.AtEndOfStream) {
            line = file.ReadLine();
            if (rowCounter != 0) {
                var rowData = line.split(",");
                var request = new Request;

                request.name = rowData[parseInt(indices.directory_name)];
                request.ra = rowData[parseInt(indices.ra)];
                request.dec = rowData[parseInt(indices.dec)];
                request.num_exposures = rowData[parseInt(indices.num_exposures)];
                request.exposure_time = rowData[parseInt(indices.exposure_time)];
                request.filter = rowData[indices.filter];
                request.binning = rowData[parseInt(indices.binning)];

                requests.push(request);
            }
            rowCounter++;
        }

        // Close the file
        file.Close();
        fso = null;
    } catch (e) {
        // Console.PrintLine("An error occurred: " + e.message);
        console.log("An error occurred: " + e.message);
    }

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
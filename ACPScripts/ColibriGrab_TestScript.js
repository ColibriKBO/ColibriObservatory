function freeDiskSpace(driveLetter) {
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    var drive = fso.GetDrive(driveLetter);
    var freeSpace = drive.FreeSpace;

    // Convert free space from bytes to TB
    var freeSpaceTB = freeSpace / 1000000000000;

    return freeSpaceTB;
}

function padZero(num) {
    return num < 10 ? '0' + num : num;
}


function main() {

    // Number of iterations to simulate Colibri observations
    var iterations = 25;
    var framesPerIteration = 2400;
    var frameType = "dark";
    var filterWheelPosition = 1;

    // Acquisition settings
    var exposureMs = 25;
    var temperature = 0;

    // Buffered acquisition settings
    var ramSlots = 245;
    var writerThreads = 3;

    // Current date
    var date = new Date();
    var dateString = date.getFullYear() + "-"
        + (date.getMonth() + 1) + "-"
        + date.getDate();

    // New ColibriGrab executable
    var wshShell = new ActiveXObject("WScript.Shell");
    var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");

    var colibriGrabPath = userProfile
        + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab"
        + "\\.local-build\\BufferedUTC_v02\\ColibriGrab_BufferedUTC_v02.exe";

    var fso = new ActiveXObject("Scripting.FileSystemObject");

    var totalStart = new Date().getTime();
    var successfulRuns = 0;

    Console.PrintLine("============================================");
    Console.PrintLine("COLIBRIGRAB BUFFERED UTC ACQUISITION TEST");
    Console.PrintLine("============================================");
    Console.PrintLine("Executable: " + colibriGrabPath);
    Console.PrintLine("Frame type: " + frameType);
    Console.PrintLine("Exposure: " + exposureMs + " ms");
    Console.PrintLine("Frames per iteration: " + framesPerIteration);
    Console.PrintLine("Total iterations: " + iterations);
    Console.PrintLine("Expected total frames: " + (iterations * framesPerIteration));
    Console.PrintLine("Temperature: " + temperature + " C");
    Console.PrintLine("Filter position: " + filterWheelPosition);
    Console.PrintLine("RAM buffer slots: " + ramSlots);
    Console.PrintLine("Writer threads: " + writerThreads);
    Console.PrintLine("Free disk space: " + freeDiskSpace("D:").toFixed(3) + " TB");
    Console.PrintLine("============================================");

    if (!fso.FileExists(colibriGrabPath)) {
        Console.PrintLine("ERROR: ColibriGrab executable not found!");
        return;
    }

    for (var i = 0; i < iterations; i++) {

        var runNumber = i + 1;

        var iterationDir = "D:\\colibrigrab_tests\\"
            + dateString + "_" + runNumber + "_" + frameType;

        if (!fso.FolderExists(iterationDir)) {
            fso.CreateFolder(iterationDir);
        }

        var exeCommand = "\"" + colibriGrabPath + "\""
            + " -n " + framesPerIteration
            + " -p colibrigrab_test_" + runNumber
            + " -e " + exposureMs
            + " -t " + temperature
            + " -f " + frameType
            + " -l " + filterWheelPosition
            + " -w \"" + iterationDir + "\""
            + " --ram-slots " + ramSlots
            + " --writer-threads " + writerThreads
            + " --verify-files 1";

        Console.PrintLine("");
        Console.PrintLine("--------------------------------------------");
        Console.PrintLine("Starting iteration " + runNumber + " / " + iterations);
        Console.PrintLine("Output: " + iterationDir);
        Console.PrintLine("Start time: " + new Date().toUTCString());
        Console.PrintLine("--------------------------------------------");

        var runStart = new Date().getTime();

        // Run ColibriGrab and wait for it to finish.
        // Its live output appears in its own console window.
        var exitCode = wshShell.Run(exeCommand, 1, true);

        var elapsedSeconds =
            (new Date().getTime() - runStart) / 1000.0;

        if (exitCode !== 0) {
            Console.PrintLine("");
            Console.PrintLine("ERROR: COLIBRIGRAB ACQUISITION FAILED");
            Console.PrintLine("Iteration: " + runNumber);
            Console.PrintLine("Exit code: " + exitCode);
            Console.PrintLine("Elapsed time: " + elapsedSeconds.toFixed(2) + " s");
            Console.PrintLine("Successful iterations: " + successfulRuns);
            Console.PrintLine("Stopping acquisition test.");
            return;
        }

        successfulRuns++;

        Console.PrintLine("Iteration " + runNumber + " completed successfully.");
        Console.PrintLine("Acquisition time: " + elapsedSeconds.toFixed(2) + " s");
        Console.PrintLine("Completed: " + successfulRuns + " / " + iterations);
        Console.PrintLine("Expected frames from completed runs: "
            + (successfulRuns * framesPerIteration));
        Console.PrintLine("Free disk space: "
            + freeDiskSpace("D:").toFixed(3) + " TB");

        Util.WaitForMilliseconds(50);
    }

    var totalElapsed =
        (new Date().getTime() - totalStart) / 1000.0;

    Console.PrintLine("");
    Console.PrintLine("============================================");
    Console.PrintLine("ALL COLIBRIGRAB TESTS COMPLETED");
    Console.PrintLine("============================================");
    Console.PrintLine("Successful iterations: " + successfulRuns + " / " + iterations);
    Console.PrintLine("Expected total frames: "
        + (successfulRuns * framesPerIteration));
    Console.PrintLine("Total elapsed time: "
        + (totalElapsed / 60.0).toFixed(2) + " minutes");
    Console.PrintLine("Remaining disk space: "
        + freeDiskSpace("D:").toFixed(3) + " TB");
    Console.PrintLine("============================================");
}

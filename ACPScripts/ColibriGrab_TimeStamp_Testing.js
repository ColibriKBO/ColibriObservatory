// ACP / JScript: investigate RCD filesystem timestamp gaps.
// No changes to ColibriGrab.exe or libflipro.dll.
// All timestamp analysis is performed AFTER acquisition, using a separate PowerShell script.

function pad2(n) {
    return (n < 10 ? "0" : "") + n;
}

function utcSessionStamp() {
    var d = new Date();
    return d.getUTCFullYear() + pad2(d.getUTCMonth() + 1) + pad2(d.getUTCDate()) +
           "T" + pad2(d.getUTCHours()) + pad2(d.getUTCMinutes()) +
           pad2(d.getUTCSeconds()) + "Z";
}

function countRcdFiles(fso, folderPath) {
    var count = 0;
    var files = new Enumerator(fso.GetFolder(folderPath).Files);
    for (; !files.atEnd(); files.moveNext()) {
        var file = files.item();
        if (fso.GetExtensionName(file.Name).toLowerCase() == "rcd") {
            count++;
        }
    }
    return count;
}

function main() {
    // Safe first pass: 3 x 2400 frames is approximately 90.6 GB of raw RCD data.
    var iterations = 1;
    var framesPerIteration = 2400;
    var exposureMs = 25; // IMPORTANT: original test script passed 125 ms.
    var frameType = "dark";
    var filterWheelPosition = 1;
    var cameraTemperatureC = -10;
    var binning = 2;
    var delayMs = 0;

    var testRoot = "D:\\colibrigrab_tests";
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    var shell = new ActiveXObject("WScript.Shell");
    var profile = shell.ExpandEnvironmentStrings("%USERPROFILE%");
    var exe = profile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";

    if (!fso.FileExists(exe)) {
        Console.PrintLine("ERROR: Cannot find ColibriGrab.exe at " + exe);
        return;
    }
    if (!fso.FolderExists(testRoot)) {
        fso.CreateFolder(testRoot);
    }

    // RCDs contain approximately 12,583,296 image bytes plus a 384-byte header.
    // Preserve at least another 20 GB after the estimated test data.
    var estimatedBytes = iterations * framesPerIteration * (12582912 + 384);
    var reserveBytes = 20000000000;
    if (fso.GetDrive("D:").FreeSpace < estimatedBytes + reserveBytes) {
        Console.PrintLine("ERROR: Not enough free D: space for this test + 20 GB reserve.");
        Console.PrintLine("Estimated test data: " + (estimatedBytes / 1000000000).toFixed(1) + " GB.");
        return;
    }

    var sessionDir = testRoot + "\\timing_" + utcSessionStamp();
    if (fso.FolderExists(sessionDir)) {
        Console.PrintLine("ERROR: Test session already exists; refusing to reuse: " + sessionDir);
        return;
    }
    fso.CreateFolder(sessionDir);

    Console.PrintLine("=== ColibriGrab RCD timestamp diagnostic ===");
    Console.PrintLine("Session: " + sessionDir);
    Console.PrintLine("Settings: " + iterations + " runs x " + framesPerIteration +
                      " frames, " + exposureMs + " ms, " + frameType);
    Console.PrintLine("ColibriGrab executable is unchanged; no live file-metadata scanning.");

    for (var i = 1; i <= iterations; i++) {
        var runName = "run_" + pad2(i);
        var runDir = sessionDir + "\\" + runName;
        fso.CreateFolder(runDir);

        var cmd = '"' + exe + '"' +
                  ' -n ' + framesPerIteration +
                  ' -p timing_' + pad2(i) + '_' +
                  ' -e ' + exposureMs +
                  ' -d ' + delayMs +
                  ' -b ' + binning +
                  ' -t ' + cameraTemperatureC +
                  ' -f ' + frameType +
                  ' -l ' + filterWheelPosition +
                  ' -w "' + runDir + '"';

        Console.PrintLine("Starting " + runName + "...");
        // Wait for the external ColibriGrab process to finish.
        // Do not redirect output: ColibriGrab already appends its own .log file.
        var exitCode = shell.Run(cmd, 1, true);
        var actual = countRcdFiles(fso, runDir);
        Console.PrintLine(runName + ": exit code " + exitCode +
                          ", " + actual + "/" + framesPerIteration + " RCD files.");

        if (exitCode != 0 || actual != framesPerIteration) {
            Console.PrintLine("WARNING: Unexpected run result; stopping to preserve evidence.");
            break;
        }
        Util.WaitForMilliseconds(1000);
    }

    Console.PrintLine("Test finished. Preserve the RCD files until the timestamp report is reviewed.");
    Console.PrintLine("Run ColibriGrab_Analyze_Timestamps.ps1 afterward (outside acquisition).");
    Console.PrintLine("Session: " + sessionDir);
}


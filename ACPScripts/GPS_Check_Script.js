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

function executePythonScript(scriptPath) 
{
        try {
            var exec = wsh.Exec(scriptPath);
            while (!exec.StdOut.AtEndOfStream) {
                WScript.Echo(exec.StdOut.ReadLine());
            }
            while (!exec.StdErr.AtEndOfStream) {
                WScript.Echo(exec.StdErr.ReadLine());
            }
            exec.WaitForExit();
            WScript.Echo("Script executed with exit code: " + exec.ExitCode);
        } catch (e) {
            WScript.Echo("Error: " + e.message);
        }
}

function main() {
    //var initialExposure = 25; // Initial exposure time in ms
    //var exposureIncrement = 1; // Exposure increment in ms
    //var totalExposures = 1; // Total number of different exposures to test
    var exposures = [1, 10, 25, 33, 50];
    var totalExposures = exposures.length;
    var totalCaptureTime = (60000 * 60); // Total capture time in milliseconds (60 minutes)
    var frameType = "dark"; // Frame type to test
    
    Console.PrintLine('ColibriGrab testing with various exposure settings');

    // Get the current date and time
    var date = new Date();
    var dateString = date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();

    for (var exposureIndex = 0; exposureIndex < totalExposures; exposureIndex++) {
        //var exposure = initialExposure + (exposureIndex * exposureIncrement);
        var exposure = exposures[exposureIndex];

        if (exposure == 1)
        {
            framesPerIteration  = 200000;
        }
        else
        {
            framesPerIteration = Math.floor(totalCaptureTime / exposure);
        }
       

        for (var i = 0; i < 1; i++) {
            var iterationDir = "D:\\colibrigrab_test_new\\" + dateString + "_" + exposure + "ms_" + (i + 1);
            
            var fso = new ActiveXObject("Scripting.FileSystemObject");
            if (!fso.FolderExists(iterationDir)) {
                fso.CreateFolder(iterationDir);
            }

            // Define the path for ColibriGrab log file
            var colibriGrabLogPath = "D:\\colibrigrab_tests\\colibrigrab_output.txt";

            // Get the user's home directory and construct the path to ColibriGrab.exe in Github
            var wshShell = new ActiveXObject("WScript.Shell");
            var userProfile = wshShell.ExpandEnvironmentStrings("%USERPROFILE%");
            var colibriGrabPath = userProfile + "\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";
            
            // Dynamically start ColibriGrab
            var command = "\"" + colibriGrabPath + "\" -n " + framesPerIteration + " -p colibrigrab_test_" + (i + 1) + " -e " + exposure + " -t 0 -f " + frameType + " -w " + iterationDir + "\\ > " + colibriGrabLogPath + " 2>&1";
            var wsh = new ActiveXObject("WScript.Shell");
            wsh.Run(command, 1, true); // 1: normal window, true: wait for completion

            Util.WaitForMilliseconds(50); // Wait for .050 seconds before next iteration
        }
    }
    Console.PrintLine("Organizing directories...");
    var wsh = new ActiveXObject("WScript.Shell");

    // Organize directories by exposure setting
    var CutandPaste = "python " + userProfile + "\\Documents\\GitHub\\ColibriObservatory\\ACPScripts\\GPS_Check\\CutandPaste.py";
    wsh.Run(CutandPaste, 1, true);

    var OrganizeByExposure = "python" + userProfile + "\\Documents\\GitHub\\ColibriObservatory\\ACPScripts\\GPS_Check\\OrganizeByExposure.py";
    var wsh = new ActiveXObject("WScript.Shell");
    wsh.Run(OrganizeByExposure, 1, true);

    var CutandPaste2 = "python" + userProfile + "\\Documents\\GitHub\\ColibriObservatory\\ACPScripts\\GPS_Check\\CutandPaste2.py";
    var wsh = new ActiveXObject("WScript.Shell");
    wsh.Run(CutandPaste2, 1, true);
    Console.PrintLine("Start GPS Checks...");
    // Run the GPS check script after organizing directories
    var gpsCheckScript = "python " + userProfile + "\\Documents\\GitHub\\ColibriObservatory\\ACPScripts\\GPS_Check\\check_gps.py";
    executePythonScript(gpsCheckScript);

    Console.PrintLine('All testing done');
}

main();
WScript.Quit();
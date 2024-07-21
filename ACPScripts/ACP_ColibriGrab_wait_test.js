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
    

    // Number of iterations to simulate Colibri simulations
    var iterations = 250;
    var framesPerIteration = 2400;
    var frameType = "dark"; // Frame type to test
    
    Console.PrintLine('ColibriGrab testing with ' + framesPerIteration + ' frames of 25ms exposure');

    // Get the current date and time
    var date = new Date();
    var dateString = date.getFullYear() + "-" + (date.getMonth() + 1) + "-" + date.getDate();

    for (var i = 0; i < iterations; i++) {
        var iterationDir = "D:\\colibrigrab_test_new\\" + dateString + "_" + (i + 1) + "_" + frameType;
        
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
        var command = "\"" + colibriGrabPath + "\" -n " + framesPerIteration + " -p colibrigrab_test_" + (i + 1) + " -e 25 -t 0 -f " + frameType + " -w " + iterationDir + "\\ > " + colibriGrabLogPath + " 2>&1";
        var wsh = new ActiveXObject("WScript.Shell");
        wsh.Run(command, 1, true); // 1: normal window, true: wait for completion

        Util.WaitForMilliseconds(2000); // Wait for 2 seconds before next iteration
    }

    Console.PrintLine('All testing done');
}

main();

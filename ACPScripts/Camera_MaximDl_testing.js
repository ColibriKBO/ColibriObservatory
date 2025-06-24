// === MaxIm DL High-Speed Buffered Acquisition Script ===

var fso = new ActiveXObject("Scripting.FileSystemObject");
var Console = Util.Console;
var logFile;

function log(msg) {
    Console.PrintLine(msg);
    logFile.WriteLine(Util.SysUTCDate + " " + msg);
}

function pad(n) {
    return (n < 10 ? "0" + n : n);
}

function getDate() {
    var d = new Date();
    return d.getUTCFullYear().toString() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate());
}

function getDateTime() {
    var d = new Date();
    return getDate() + "_" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds());
}

function abort(msg) {
    if (msg) log("ABORT: " + msg);
    log("Aborting script.");
    logFile.Close();
    throw new Error("Script aborted.");
}

function ensureDirExists(path) {
    if (!fso.FolderExists(path)) {
        fso.CreateFolder(path);
        log("Created directory: " + path);
    }
}

function main() {
    var baseDir = "D:\\TestImages";
    ensureDirExists(baseDir);
    var logPath = baseDir + "\\CameraTest_" + getDate() + ".log";
    logFile = fso.CreateTextFile(logPath, true);
    log("=== Starting Buffered High-Speed Acquisition ===");

    var maximDL, cam;
    try {
        log("Connecting to MaxIm DL...");
        maximDL = new ActiveXObject("MaxIm.Application");
        cam = maximDL.CCDCamera;
    } catch (e) {
        abort("Failed to create MaxIm DL object: " + e.message);
    }

    try {
        if (!cam.LinkEnabled) {
            cam.LinkEnabled = true;
            Util.WaitForMilliseconds(1000);
        }
        log("Camera linked.");
    } catch (e) {
        abort("Error linking camera: " + e.message);
    }

    cam.BinX = 2;
    cam.BinY = 2;
    cam.FastReadout = true;
    cam.AutoDownload = true;

    var exposureTime = 0.025; // 25 ms
    var totalFrames = 2400;
    var frameBuffers = [];
    var minuteIndex = 0;

    while (true) {
        var minuteFolder = baseDir + "\\" + getDateTime();
        ensureDirExists(minuteFolder);

        var modes = cam.ReadoutModes;

        for (var i = 0; i < modes.length; i++) {
            Util.Console.PrintLine("Readout Mode " + i + ": " + modes[i]);
        }

        log("Acquiring minute bin #" + minuteIndex);

        var currentBuffer = [];
        var t0 = new Date();

        for (var i = 0; i < totalFrames; i++) {
            try {
                cam.Expose(exposureTime, 1); // Light frame
                while (!cam.ImageReady) {
                    Util.WaitForMilliseconds(1);
                }

                // Store copy of image in memory
                currentBuffer.push(cam.ImageArray);

            } catch (e) {
                log("ERROR during exposure " + i + ": " + e.message);
            }
        }

        var elapsed = (new Date() - t0) / 1000;
        log("Acquisition done in " + elapsed.toFixed(2) + " seconds.");

        // === Save previous buffer if available
        if (frameBuffers.length > 0) {
            var bufferToSave = frameBuffers.shift(); // remove first
            var folderToSave = baseDir + "\\Minute_" + pad(minuteIndex - 1);
            ensureDirExists(folderToSave);

            for (var j = 0; j < bufferToSave.length; j++) {
                try {
                    cam.ImageArray = bufferToSave[j];
                    var fname = folderToSave + "\\IMG_" + pad(j) + ".fit";
                    cam.SaveImage(fname);
                } catch (e) {
                    log("ERROR saving image " + j + ": " + e.message);
                }
            }

            log("Finished saving minute " + (minuteIndex - 1));
        }

        // Store current buffer for saving next loop
        frameBuffers.push(currentBuffer);
        minuteIndex++;
    }
}

main();

// === MaxIm DL Continuous Acquisition Script with Binning and Directory Creation ===

var fso = new ActiveXObject("Scripting.FileSystemObject");
var Console = Util.Console;
var logFile;

// === Utility Functions ===

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

// === Main Function ===

function main() {
    var baseDir = "D:\\TestImages";
    ensureDirExists(baseDir);
    var logPath = baseDir + "\\CameraTest_" + getDate() + ".log";
    logFile = fso.CreateTextFile(logPath, true);

    log("=== Starting Continuous Camera Acquisition ===");

    var maximDL, ccdCamera;

    // Connect to MaxIm DL
    try {
        log("Creating MaxIm DL ActiveX object...");
        maximDL = new ActiveXObject("MaxIm.Application");
        ccdCamera = maximDL.CCDCamera;
        log("Camera object accessed.");
    } catch (e) {
        abort("Could not create or access MaxIm DL object: " + e.message);
    }

    // Link the camera
    try {
        if (!ccdCamera.LinkEnabled) {
            log("Linking camera...");
            ccdCamera.LinkEnabled = true;
            Util.WaitForMilliseconds(1000);
        }
        if (ccdCamera.LinkEnabled) {
            log("Camera successfully linked.");
        } else {
            abort("Failed to link camera.");
        }
    } catch (e) {
        abort("Error while linking camera: " + e.message);
    }

    // === Image Acquisition Loop ===
    var exposureTime = 0.025; // seconds
    var binX = 2, binY = 2;
    var saveSubfolder;
    var imageCounter = 0;

    while (true) {
        var minuteStart = new Date();
        saveSubfolder = baseDir + "\\" + getDateTime();
        ensureDirExists(saveSubfolder);
        log("Starting 1-minute acquisition in folder: " + saveSubfolder);

        while ((new Date() - minuteStart) < 60000) { // 1 minute loop
            try {
                ccdCamera.BinX = binX;
                ccdCamera.BinY = binY;

                ccdCamera.Expose(exposureTime, 1); // 1 = light frame
                Util.WaitForMilliseconds(100); // wait briefly

                var waitTime = 0;
                var waitLimit = 5000; // 5 seconds max wait
                while (!ccdCamera.ImageReady && waitTime < waitLimit) {
                    Util.WaitForMilliseconds(100);
                    waitTime += 100;
                }

                if (ccdCamera.ImageReady) {
                    var filename = saveSubfolder + "\\IMG_" + getDateTime() + "_" + exposureTime + "s.fits";
                    ccdCamera.SaveImage(filename);
                    log("Saved: " + filename);
                    imageCounter++;
                } else {
                    log("WARNING: Image not ready after wait.");
                }

            } catch (e) {
                log("ERROR: Failed during exposure: " + e.message);
                Util.WaitForMilliseconds(1000); // wait a bit before retrying
            }
        }

        log("Completed 1-minute bin with " + imageCounter + " images.");
    }
}

// === Start Script ===
main();

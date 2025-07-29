var Console = Util.Console;

function log(msg) {
    Console.PrintLine(msg);
}

function abort(msg) {
    log("ABORT: " + msg);
    throw new Error("Script aborted.");
}

function main() {
    var desiredSlot = 2;

    // Create ASCOM FilterWheel driver instance
    var chooser = new ActiveXObject("ASCOM.Utilities.Chooser");
    chooser.DeviceType = "FilterWheel";

    var progId = "ASCOM.EFW2.FilterWheel"; // Or whatever your working ProgID is
    log("Connecting to filter wheel via ASCOM: " + progId);
    var fw = new ActiveXObject(progId);

    fw.Connected = true;

    var currentPos = fw.Position;
    log("Current filter wheel position: " + currentPos);

    if (currentPos != desiredSlot) {
        log("Setting filter wheel to slot: " + desiredSlot);
        fw.Position = desiredSlot;

        // Poll until physical wheel reaches desired slot
        var waitedMs = 0;
        var maxWaitMs = 25000;
        var waitStep = 250;
        while (waitedMs < maxWaitMs) {
            Util.WaitForMilliseconds(waitStep);
            waitedMs += waitStep;

            var pollPos = fw.Position;
            //log("Polling: current filter = " + pollPos);
            if (pollPos == desiredSlot) {
                log("Filter wheel reached desired slot.");
                break;
            }
        }

        if (waitedMs >= maxWaitMs) {
            fw.Connected = false;
            abort("Timeout: filter wheel did not reach desired slot before timing out.");
        }
    } else {
        log("Filter wheel already at desired slot.");
    }

    fw.Connected = false;
    log("Filter wheel disconnected.");

    // Optionally continue with MaxIm logic here
    var maximDL = new ActiveXObject("MaxIm.Application");
    var cam = maximDL.CCDCamera;
    if (!cam.LinkEnabled) cam.LinkEnabled = true;
    log("Camera linked via MaxIm DL.");

    // ... capture logic etc ...

    cam.LinkEnabled = false;
    maximDL.Quit();
    log("MaxIm DL closed.");
}
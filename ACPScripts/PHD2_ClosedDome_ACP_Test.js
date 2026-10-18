
// PHD2_ClosedDome_ACP_Test.js
// ACP classic JScript; run from the ACP console, not by double-clicking.
// This test NEVER calls PHD2's 'guide' method or requests mount motion.
// It connects the equipment, verifies calibration, captures 5 dark frames,
// stops looping and disconnects only equipment owned by PhD2Tools.

// Locate the reusable ACP/Python project in the current user's Documents.
var phd2ToolsDir = new ActiveXObject("WScript.Shell")
    .ExpandEnvironmentStrings("%USERPROFILE%") + "\\Documents\\GitHub\\PhD2Tools";
var phd2FSO = new ActiveXObject("Scripting.FileSystemObject");
var phd2SharedJS = phd2ToolsDir + "\\PHD2_ACP.js";

if (!phd2FSO.FileExists(phd2SharedJS))
    throw new Error("Missing shared ACP module: " + phd2SharedJS);

var phd2Input = phd2FSO.OpenTextFile(phd2SharedJS, 1, false);
var phd2Source = phd2Input.ReadAll();
phd2Input.Close();

// Load the shared PHD2 functions without eval().
if (phd2Source.indexOf("function phd2RunAction(") < 0)
{
    throw new Error(
        "PHD2_ACP.js does not contain phd2RunAction()."
    );
}

var phd2Loader = new Function(
    "Console",
    "Util",
    phd2Source + "\r\nreturn phd2RunAction;"
);

var phd2RunAction = phd2Loader(Console, Util);

if (typeof phd2RunAction != "function")
{
    throw new Error(
        "Failed to load the shared PHD2 controller."
    );
}

Console.PrintLine(
    "PHD2 shared controller loaded: " +
    typeof phd2RunAction
);

function main()
{
    var initialized = false;
    var passed = false;
    var cleanupOK = true;

    Console.PrintLine("========================================================");
    Console.PrintLine("PHD2 CLOSED-DOME PYTHON CONTROLLER TEST");
    Console.PrintLine("========================================================");
    Console.PrintLine("Project: " + phd2ToolsDir);
    Console.PrintLine("Operations: probe, initialize, camera-test, stop, shutdown");
    Console.PrintLine("NO guiding, calibration, mount slew or guide pulses requested.");

    try
    {
        var info = phd2RunAction("probe", false);
        Console.PrintLine("PHD2 version: " + (info.version || "not reported"));
        Console.PrintLine("Initial state: " + info.state);
        Console.PrintLine("Current profile: " + info.profile.name);

        if (info.state != "Stopped" && info.state != "Selected")
            throw new Error("PHD2 is not idle; refusing closed-dome test.");

        var setup = phd2RunAction("initialize", false);
        initialized = true;
        Console.PrintLine("Verified profile: " + setup.profile);
        Console.PrintLine("Guide camera: " + setup.equipment.camera.name);
        Console.PrintLine("ASCOM mount: " + setup.equipment.mount.name);
        Console.PrintLine("Restored calibration: " + setup.calibration.calibrated);

        if (setup.calibration.calibrated !== true)
            throw new Error("Saved mount calibration was not restored.");

        // Defaults in PHD2Control.py: five frames at 1000 ms each.
        // These are dark/closed-dome frames; only camera LOOP is requested.
        var camera = phd2RunAction("camera-test", false);
        Console.PrintLine("Guide-camera frames: " + camera.frames +
                          " / " + camera.requested);

        if (camera.frames != 5 || camera.requested != 5)
            throw new Error("Unexpected frame count from camera test.");

        // camera-test already stops its own loop; also test idempotent stop.
        phd2RunAction("stop", false);
        passed = true;
    }
    catch (err)
    {
        Console.PrintLine("TEST ERROR: " +
            (err.message || String(err)));

        Console.PrintLine("Error number: " + err.number);
        Console.PrintLine("Error description: " + err.description);
        Console.PrintLine("Error line: " + err.lineNumber);
    }
    finally
    {
        // Only request shutdown after successful initialize.
        // A failed initialize handles its own connection cleanup in Python.
        if (initialized)
        {
            try
            {
                phd2RunAction("shutdown", false);
                Console.PrintLine("Cleanup: shutdown completed.");
            }
            catch (err2)
            {
                cleanupOK = false;
                Console.PrintLine("CLEANUP ERROR: " +
                                  (err2.message || String(err2)));
                Console.PrintLine("Inspect PHD2 manually before moving the mount.");
            }
        }
    }

    Console.PrintLine("========================================================");
    Console.PrintLine(passed && cleanupOK ?
        "ACP CLOSED-DOME TEST PASSED" :
        "ACP CLOSED-DOME TEST FAILED");
    Console.PrintLine("========================================================");
}

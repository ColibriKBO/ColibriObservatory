// PHD2_Guiding_ACP_Test.js
// SUPERVISED OPEN-DOME TEST for PHD2 + AP1600 from ACP classic JScript.
// Uses the existing shared Python controller. NO slews or pier flips.
// This test DOES start guiding: PHD2 will send real guide pulses to the mount.
// Save in: %USERPROFILE%\Documents\GitHub\PhD2Tools\

// Set true ONLY when observing conditions, cable clearance, and the
// current guiding calibration have been verified at the telescope.
var ENABLE_REAL_GUIDING_TEST = true;

// First guiding session: 2 minutes. Second session: 1 minute.
var FIRST_MONITOR_SECONDS = 120;
var SECOND_MONITOR_SECONDS = 60;
var TEST_RESTART_GUIDING = true;

// Shared module used successfully by the closed-dome test.
var phd2ToolsDir = new ActiveXObject("WScript.Shell")
    .ExpandEnvironmentStrings("%USERPROFILE%") + "\\Documents\\GitHub\\PhD2Tools";
var phd2FSO = new ActiveXObject("Scripting.FileSystemObject");
var phd2SharedJS = phd2ToolsDir + "\\PHD2_ACP.js";

if (!phd2FSO.FileExists(phd2SharedJS))
    throw new Error("Missing shared ACP file: " + phd2SharedJS);

var phd2Input = phd2FSO.OpenTextFile(phd2SharedJS, 1, false);
var phd2Source = phd2Input.ReadAll();
phd2Input.Close();

if (phd2Source.indexOf("function phd2RunAction(") < 0 ||
    phd2Source.indexOf("monitorSeconds") < 0)
    throw new Error("PHD2_ACP.js does not include the new monitor action. Update it first.");

// The new Function() loader has already passed our BLUEBIRD ACP test.
var phd2Loader = new Function(
    "Console", "Util", phd2Source + "\r\nreturn phd2RunAction;"
);
var phd2RunAction = phd2Loader(Console, Util);
if (typeof phd2RunAction != "function")
    throw new Error("Could not export phd2RunAction() from PHD2_ACP.js");

function phd2Preflight()
{
    // These are ASCOM/ACP read-only status checks, not commands to the mount.
    if (!Telescope.Connected)
        throw new Error("ACP telescope connection is not active.");
    if (Telescope.AtPark)
        throw new Error("Mount is parked. Unpark and track a suitable field manually first.");
    if (Telescope.Slewing)
        throw new Error("Mount is still slewing.");
    if (!Telescope.Tracking)
        throw new Error("Mount is not tracking.");
    // Check whether ACP exposes the dome connection property.
    var domeConnected;

    try
    {
        domeConnected = Dome.Connected;
        Console.PrintLine(
            "ACP Dome.Connected: " + String(domeConnected)
        );
    }
    catch (e)
    {
        domeConnected = undefined;
        Console.PrintLine(
            "ACP Dome.Connected could not be read: " +
            (e.message || String(e))
        );
    }

    // Require a valid, confirmed OPEN shutter reading.
    var shutterStatus;

    try
    {
        shutterStatus = Dome.ShutterStatus;
        Console.PrintLine(
            "ACP Dome.ShutterStatus: " + String(shutterStatus)
        );
    }
    catch (e)
    {
        throw new Error(
            "Unable to read dome shutter status: " +
            (e.message || String(e))
        );
    }

    if (domeConnected === false)
        throw new Error(
            "ACP reports the dome disconnected. Reconnect the dome in ACP."
        );

    if (shutterStatus === null ||
        typeof shutterStatus == "undefined" ||
        isNaN(Number(shutterStatus)) ||
        Number(shutterStatus) != 0)
    {
        throw new Error(
            "Dome shutter is not confirmed OPEN. Status: " +
            String(shutterStatus)
        );
    }

    Console.PrintLine("Dome safety check PASSED: shutter OPEN.");
}

function phd2PrintMonitor(label, data)
{
    Console.PrintLine("--- " + label + " ---");
    Console.PrintLine("Guide frames: " + data.frames +
                      " over " + data.duration_seconds + " seconds");
    Console.PrintLine("RA RMS : " + data.ra_rms_pixels + " guide pixels");
    Console.PrintLine("Dec RMS: " + data.dec_rms_pixels + " guide pixels");
    Console.PrintLine("Total RMS: " + data.total_rms_pixels + " guide pixels");
    if (typeof data.total_rms_arcsec == "number")
        Console.PrintLine("Total RMS: " + data.total_rms_arcsec + " arcseconds");
    Console.PrintLine("Mean RA/Dec: " + data.ra_mean_pixels + " / " +
                      data.dec_mean_pixels + " guide pixels");
    Console.PrintLine("Max radial error: " + data.max_radial_error_pixels + " px");
    Console.PrintLine("Lost star frames: " + data.star_lost_frames);
    if (data.recent_frames && data.recent_frames.length > 0)
    {
        Console.PrintLine("Recent RA/Dec guide errors (px):");
        for (var i = 0; i < data.recent_frames.length; i++)
        {
            var f = data.recent_frames[i];
            Console.PrintLine("  frame " + f.frame + ": RA=" + f.ra_px +
                              "  Dec=" + f.dec_px + "  SNR=" + f.snr);
        }
    }
}

function main()
{
    var initialized = false;
    var passed = false;
    var cleanupOK = true;
    var startAttempted = false;

    Console.PrintLine("========================================================");
    Console.PrintLine("PHD2 SUPERVISED OPEN-DOME GUIDING TEST");
    Console.PrintLine("========================================================");
    Console.PrintLine("Project: " + phd2ToolsDir);
    Console.PrintLine("PHD2 will issue REAL guide corrections to the AP1600.");
    Console.PrintLine("No telescope slews, pier flips or manual calibrations requested.");

    try
    {
        if (!ENABLE_REAL_GUIDING_TEST)
            throw new Error("Safety lock: change ENABLE_REAL_GUIDING_TEST to true " +
                            "only after completing the open-dome checklist.");

        phd2Preflight();
        Console.PrintLine("ACP preflight passed: shutter OPEN, unparked, tracking.");

        var info = phd2RunAction("probe", false);
        Console.PrintLine("PHD2 version: " + info.version);
        Console.PrintLine("Initial PHD2 state: " + info.state);
        if (info.state != "Stopped" && info.state != "Selected")
            throw new Error("PHD2 must be idle before testing (not already guiding).");

        var setup = phd2RunAction("initialize", false);
        initialized = true;
        Console.PrintLine("Profile: " + setup.profile);
        Console.PrintLine("Camera: " + setup.equipment.camera.name);
        Console.PrintLine("Mount: " + setup.equipment.mount.name);
        Console.PrintLine("Saved calibration: " + setup.calibration.calibrated);
        if (setup.calibration.calibrated !== true)
            throw new Error("Calibration missing; test cannot proceed.");

        phd2Preflight();
        Console.PrintLine("Starting guiding session 1...");
        startAttempted = true;
        var start1 = phd2RunAction("start", true);
        Console.PrintLine("Guiding settled: " + start1.settled);
        Console.PrintLine("Startup RMS: " + start1.rms_pixels + " pixels");
        Console.PrintLine("Calibration flip event: " + start1.calibration_flipped_event);

        var monitor1 = phd2RunAction("monitor", false, FIRST_MONITOR_SECONDS);
        phd2PrintMonitor("SESSION 1", monitor1);
        var status1 = phd2RunAction("status", false);
        Console.PrintLine("PHD2 state: " + status1.app_state);
        phd2RunAction("stop", false);
        Console.PrintLine("Guiding session 1 stopped; telescope has not been moved.");

        if (TEST_RESTART_GUIDING)
        {
            phd2Preflight();
            Console.PrintLine("Restarting guiding with saved calibration...");
            startAttempted = true;
            var start2 = phd2RunAction("start", true);
            Console.PrintLine("Guiding restarted and settled: " + start2.settled);
            Console.PrintLine("Startup RMS: " + start2.rms_pixels + " pixels");
            Console.PrintLine("Calibration flip event: " + start2.calibration_flipped_event);

            var monitor2 = phd2RunAction("monitor", false, SECOND_MONITOR_SECONDS);
            phd2PrintMonitor("SESSION 2 AFTER RESTART", monitor2);
            var status2 = phd2RunAction("status", false);
            Console.PrintLine("PHD2 state after restart: " + status2.app_state);
            phd2RunAction("stop", false);
        }
        passed = true;
    }
    catch (err)
    {
        Console.PrintLine("TEST ERROR: " + (err.message || String(err)));
        Console.PrintLine("NO MOUNT MOVEMENT WILL BE REQUESTED BY THIS TEST.");
    }
    finally
    {
        // Regardless of where failure occurred, attempt to stop all guiding
        // started by the controller. A failed stop must be inspected manually.
        if (initialized || startAttempted)
        {
            try
            {
                phd2RunAction("stop", false);
                Console.PrintLine("Cleanup: PHD2 capture confirmed stopped.");
            }
            catch (stopErr)
            {
                cleanupOK = false;
                Console.PrintLine("CRITICAL: Could not confirm guiding stopped: " +
                                  (stopErr.message || String(stopErr)));
                Console.PrintLine("STOP PHD2 MANUALLY BEFORE ANY TELESCOPE MOVEMENT.");
            }
        }
        if (initialized)
        {
            try
            {
                phd2RunAction("shutdown", false);
                Console.PrintLine("Cleanup: PHD2 equipment shutdown complete.");
            }
            catch (shutdownErr)
            {
                cleanupOK = false;
                Console.PrintLine("Cleanup failed: " +
                                  (shutdownErr.message || String(shutdownErr)));
                Console.PrintLine("Inspect PHD2 and ASCOM connections manually.");
            }
        }
    }
    Console.PrintLine("========================================================");
    Console.PrintLine(passed && cleanupOK ?
        "ACP OPEN-DOME GUIDING TEST PASSED" :
        "ACP OPEN-DOME GUIDING TEST FAILED");
    Console.PrintLine("========================================================");
}

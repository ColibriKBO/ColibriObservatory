// ACP_Autofocus_Test.js - supervised standalone ASTAP autofocus test.
// Does not slew, open/close the dome, park, or change telescope tracking.
// IMPORTANT: Execute only with the dome safely open, telescope tracking,
// a suitable star field, and no other camera/focuser software taking exposures.
// Uses PyFocus's EXISTING --autofocus headless entry point.

// ---------------- EDIT THESE FOR BLUEBIRD ----------------
var PROJECT_DIR = "C:\\Users\\BlueBird\\Documents\\GitHub\\ColibriObservatory\\PyFocus\\ColibriGrab_Method";
var PYTHON_EXE = "C:\\Users\\BlueBird\\AppData\\Local\\Programs\\Python\\Python311\\python.exe"; // CHANGE to `where python` result for the working (base) environment
var PYFOCUS_FILE = "ColibriFocus.py";
var COLIBRIGRAB_EXE = "C:\\Users\\BlueBird\\Documents\\GitHub\\ColibriGrab\\ColibriGrab\\ColibriGrab.exe";
var OUTPUT_ROOT = "D:\\ColibriData\\PyFocus";
var LOG_ROOT = "D:\\ColibriData\\PyFocus\\ACP_Test_Logs";
var FOCUSER_DRIVER = "SeletekFocuser.Focuser";

// Match the last successful GUI settings, rather than CLI defaults.
var EXPOSURE = 0.250;
var STEP_SIZE = 150;
var STEPS_EACH_SIDE = 4;
var FRAMES_PER_POSITION = 8;
var COARSE_MULTIPLIER = 3;
var MAX_EXCURSION = 3000;
var SETTLE_TIME = 2.0;
var GRAB_TIMEOUT_SECONDS = 120;

var POLL_SECONDS = 2;
var HEARTBEAT_SECONDS = 30;
var TIMEOUT_MINUTES = 60; // whole-run watchdog; adjust after measuring real runtime
var CANCEL_GRACE_MINUTES = 5; // allow PyFocus to restore focus after stop flag
// --------------------------------------------------------

var fso = new ActiveXObject("Scripting.FileSystemObject");
var shell = new ActiveXObject("WScript.Shell");
var startedAt = new Date();
var runName = "AF_ACP_" + timestamp(startedAt);
var commandFile = LOG_ROOT + "\\" + runName + ".cmd";
var consoleLog = LOG_ROOT + "\\" + runName + ".log";
var resultJson = LOG_ROOT + "\\" + runName + "_result.json";
var stopFile = LOG_ROOT + "\\" + runName + ".stop";
var lastLogSize = 0;

function timestamp(d) {
    function two(n) { return (n < 10 ? "0" : "") + n; }
    return d.getFullYear() + two(d.getMonth()+1) + two(d.getDate()) + "_" +
           two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds());
}
function iso(d) { return d.toUTCString(); }
function secsSince(d) { return (new Date().getTime() - d.getTime()) / 1000.0; }
function say(s) { Console.PrintLine("[ACP AF " + timestamp(new Date()) + "] " + s); }
function quote(s) { return '"' + s + '"'; }
function ensureFolder(path) {
    if (fso.FolderExists(path)) return;
    var parent = fso.GetParentFolderName(path);
    if (parent && !fso.FolderExists(parent)) ensureFolder(parent);
    fso.CreateFolder(path);
}
function readText(path) {
    var stream = fso.OpenTextFile(path, 1, false);
    try { return stream.ReadAll(); } finally { stream.Close(); }
}
function readLogDelta() {
    if (!fso.FileExists(consoleLog)) return;

    var content;
    try {
        content = readText(consoleLog);
    } catch (e) {
        // Python may be writing to the log while ACP reads it.
        // Skip this poll and try again.
        return;
    }
    if (content.length < lastLogSize) lastLogSize = 0;
    var delta = content.substring(lastLogSize);
    var lastNewline = delta.lastIndexOf("\n");
    if (lastNewline < 0) return; // wait for complete line
    var complete = delta.substring(0, lastNewline+1);
    lastLogSize += complete.length;
    var lines = complete.replace(/\r/g, "").split("\n");
    for (var i=0; i<lines.length; i++) if (lines[i].length) say("PYTHON | " + lines[i]);
}
function assertFile(path, description) {
    if (!fso.FileExists(path)) throw new Error(description + " not found: " + path);
}
function writeStop(reason) {
    if (!fso.FileExists(stopFile)) {
        var out = fso.CreateTextFile(stopFile, false);
        out.WriteLine("ACP cancellation: " + reason + " at " + iso(new Date()));
        out.Close();
    }
    say("Cancellation requested: " + reason + "; allowing PyFocus to stop safely.");
}

function main() {
    say("===========================================================");
    say("ACP SUPERVISED COLIBRI AUTOFOCUS TEST");
    say("Started UTC: " + iso(startedAt));
    say("Project: " + PROJECT_DIR);
    say("Focuser: " + FOCUSER_DRIVER);
    say("Exposure=" + EXPOSURE + " s; frames/position=" + FRAMES_PER_POSITION);
    say("Fine step=" + STEP_SIZE + "; coarse step=" + (STEP_SIZE*COARSE_MULTIPLIER) +
        "; +/-" + STEPS_EACH_SIDE + " positions; excursion=" + MAX_EXCURSION);
    var expectedPositions = 2 * (2 * STEPS_EACH_SIDE + 1) + 3;

    say("Expected positions=" + expectedPositions +
    "; expected frames=" + (FRAMES_PER_POSITION * expectedPositions));
    say("No dome, mount, or slew commands are issued by this test script.");
    ensureFolder(LOG_ROOT);
    assertFile(PYTHON_EXE, "Python interpreter");
    assertFile(PROJECT_DIR + "\\" + PYFOCUS_FILE, "PyFocus script");
    assertFile(COLIBRIGRAB_EXE, "ColibriGrab executable");
    if (fso.FileExists(stopFile)) throw new Error("Stop flag already exists: " + stopFile);
    if (fso.FileExists(resultJson)) throw new Error("Stale result exists: " + resultJson);

    var args = [
        quote(PYTHON_EXE), "-u", quote(PROJECT_DIR + "\\" + PYFOCUS_FILE),
        "--autofocus", "--exposure", EXPOSURE, "--binning", "2",
        "--colibrigrab-exe", quote(COLIBRIGRAB_EXE),
        "--grab-output-root", quote(OUTPUT_ROOT),
        "--focuser-driver", quote(FOCUSER_DRIVER),
        "--step-size", STEP_SIZE, "--steps-each-side", STEPS_EACH_SIDE,
        "--frames-per-position", FRAMES_PER_POSITION,
        "--coarse-multiplier", COARSE_MULTIPLIER,
        "--max-excursion", MAX_EXCURSION, "--settle-time", SETTLE_TIME,
        "--grab-timeout", GRAB_TIMEOUT_SECONDS,
        "--stop-file", quote(stopFile), "--output-json", quote(resultJson)
    ];
    // Use a short-lived .cmd so cmd.exe quoting and stdout/stderr redirection
    // remain predictable. Full Python tracebacks are retained in the .log.
    var cmd = fso.CreateTextFile(commandFile, false);
    cmd.WriteLine("@echo off");
    cmd.WriteLine("cd /d " + quote(PROJECT_DIR));
    cmd.WriteLine(args.join(" ") + " > " + quote(consoleLog) + " 2>&1");
    cmd.WriteLine("exit /b %ERRORLEVEL%");
    cmd.Close();
    say("Command file: " + commandFile);
    say("Python log: " + consoleLog);
    say("Result JSON: " + resultJson);
    say("Stop flag: " + stopFile);
    say("Starting Python subprocess via cmd.exe...");

    var proc = shell.Exec("cmd.exe /D /C " + quote(commandFile));
    var processStart = new Date();
    var lastHeartbeat = processStart;
    var cancellationTime = null;
    while (proc.Status === 0) {
        Util.WaitForMilliseconds(POLL_SECONDS * 1000);
        readLogDelta();
        var elapsed = secsSince(processStart);
        if (secsSince(lastHeartbeat) >= HEARTBEAT_SECONDS) {
            say("HEARTBEAT: Python running; elapsed=" + elapsed.toFixed(1) + " s");
            lastHeartbeat = new Date();
        }
        if (elapsed > TIMEOUT_MINUTES*60 && cancellationTime === null) {
            writeStop("whole-run timeout after " + TIMEOUT_MINUTES + " min");
            cancellationTime = new Date();
        }
        if (cancellationTime !== null && secsSince(cancellationTime) > CANCEL_GRACE_MINUTES*60) {
            say("CRITICAL: Python did not exit after cancellation grace period.");
            say("Do NOT start another autofocus. Inspect Python/ColibriGrab and focuser state manually.");
            throw new Error("Autofocus process still active after cancellation grace period");
        }
    }
    readLogDelta();
    var code = proc.ExitCode;
    say("Python process exited; code=" + code + "; duration=" + secsSince(processStart).toFixed(1) + " s");
    if (!fso.FileExists(resultJson)) throw new Error("No result JSON written; inspect " + consoleLog);
    var data = readText(resultJson);
    var success = /"success"\s*:\s*true\b/i.test(data);
    var pos = /"best_position"\s*:\s*(\d+)/i.exec(data);
    var hfd = /"best_hfd_px"\s*:\s*([0-9.]+)/i.exec(data);
    var err = /"error"\s*:\s*"([^"]*)"/i.exec(data);
    say("RESULT: success=" + success + "; focus=" + (pos ? pos[1] : "N/A") +
        "; HFD=" + (hfd ? hfd[1] : "N/A") + "; error=" + (err ? err[1] : "none"));
    if (code !== 0 || !success || !pos || !hfd) {
        throw new Error("Autofocus FAILED or unverified. Do not proceed to observations. Check " + resultJson);
    }
    say("VERIFIED FOCUS: " + pos[1] + " steps; HFD=" + hfd[1] + " px");
    say("TOTAL ACP TEST TIME: " + secsSince(startedAt).toFixed(1) + " s");
    say("===========================================================");
}

try { main(); }
catch (e) { say("FAILED: " + e.message); throw e; }

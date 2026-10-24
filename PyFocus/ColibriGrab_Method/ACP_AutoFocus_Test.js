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
var OUTPUT_ROOT = "D:\\PyFocus";
var LOG_ROOT = "D:\\PyFocus\\ACP_Test_Logs";
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

// ============================================================
// AUTOFOCUS MODE SELECTION (ALL SETTABLE VARIABLES)
// ============================================================

// NORMAL AUTOFOCUS:
//   "coarse" = Local coarse scan around current focus position.
//              Recommended for routine nightly focusing.
//
//   "fine"   = Local coarse scan followed by fine refinement.
//              Recommended for more precise focusing.
// BLIND FOCUS RECOVERY:
//   "recovery" = Search across the safe focuser range
//                (20,000–100,000 steps), then refine and verify.
//                Recommended when severely out of focus.
var AUTOFOCUS_MODE = "recovery";

// QUADRATIC INTERPOLATION:
//   true  = Enable quadratic interpolation during normal
//           fine autofocus to estimate the HFD minimum.
//   false = Disable quadratic interpolation.
//
// Only applies when AUTOFOCUS_MODE = "fine".
// Ignored during "coarse" and "recovery" modes.
var USE_QUADRATIC = false;

// MANDATORY SAFETY FOCUS LIMITS:
// No focuser position outside this range is permitted.
// These must match the hard-coded Python movement limits.
// ACP checks the configuration; Python enforces each move.
var FOCUSER_SAFE_MIN = 20000;
var FOCUSER_SAFE_MAX = 100000;


// RECOVERY REFINEMENT:
//   "automatic" = Coarse + fine refinement, then verification.
//   "coarse"    = Coarse refinement only, then verification.
var RECOVERY_REFINEMENT = "automatic";


// RECOVERY DIRECTION (order of wide-search focuser positions):
//   "low-high" = Start at the minimum safe position (20,000)
//                and search toward the maximum (100,000).
//   "high-low" = Start at the maximum safe position (100,000)
//                and search toward the minimum (20,000).
//   "nearest"  = Start near the current focuser position and
//                search outward in both directions.
var RECOVERY_DIRECTION = "low-high";

// RECOVERY SPACING (steps between wide-search measurements):
//   3000 = Fast: fewer measurements, quicker search, but greater risk
//          of missing if only a narrow region where stars become detectable.
//   2000 = Balanced: recommended default for blind recovery.
//   1000 = Thorough: more measurements, slower, but better coverage.
// If too few valid measurements are found, Python attempts a
// denser fallback search using 500-step spacing.
var RECOVERY_SPACING = 2000;



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

function say(message, level) {
    level = level || "INFO";

    Console.PrintLine(
        Util.SysUTCDate + " " + level + ": [AUTOFOCUS] " + message
    );
}

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
    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        if (!line.length) continue;

        // Avoid printing the enormous result JSON.
        if (line.indexOf("AUTOFOCUS_RESULT") >= 0) continue;

        // Completed focus-position measurements.
        if (/^ASTAP (coarse|fine|verification|recovery|recovery-refine) \d+: HFD=/i.test(line)) {
            say(line, "INFO");
            continue;
        }

        // Important autofocus milestones.
        // Show final focus decisions, verification results, recovery progress,
        // and the mandatory focuser safety range.
        // All other detailed Python output remains available in the .log file.
        if (/^ASTAP (final comparison candidates|selected from fresh comparisons|autofocus verified|recovery:|safe focuser range:)/i.test(line)) {
            say(line, "INFO");
            continue;
        }

        // Errors and warnings.
        if (/\b(ERROR|FAILED|Traceback|Exception)\b/i.test(line)) {
            say("Python: " + line, "ERROR");
            continue;
        }

        if (/\bWARNING\b/i.test(line)) {
            say("Python: " + line, "WARNING");
        }
    }
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
    // Validate autofocus configuration before starting.
    if (AUTOFOCUS_MODE !== "coarse" &&
        AUTOFOCUS_MODE !== "fine" &&
        AUTOFOCUS_MODE !== "recovery") {
        throw new Error("Invalid AUTOFOCUS_MODE: " + AUTOFOCUS_MODE);
    }

    // Ensure mandatory safety limits have not been altered.
    if (FOCUSER_SAFE_MIN !== 20000 || FOCUSER_SAFE_MAX !== 100000) {
        throw new Error("Mandatory focuser safety limits have been changed.");
    }

    // Validate blind-recovery search direction.
    // Only these three search orders are supported.
    if (RECOVERY_DIRECTION !== "low-high" &&
        RECOVERY_DIRECTION !== "high-low" &&
        RECOVERY_DIRECTION !== "nearest") {
        throw new Error("Invalid RECOVERY_DIRECTION: " + RECOVERY_DIRECTION);
    }

    // Validate blind-recovery search spacing.
    // Only 1000, 2000, or 3000 steps are permitted.
    if (RECOVERY_SPACING !== 1000 &&
        RECOVERY_SPACING !== 2000 &&
        RECOVERY_SPACING !== 3000) {
        throw new Error("Invalid recovery spacing: " + RECOVERY_SPACING);
    }

    if (RECOVERY_REFINEMENT !== "automatic" &&
        RECOVERY_REFINEMENT !== "coarse") {
        throw new Error("Invalid recovery refinement: " + RECOVERY_REFINEMENT);
    }

    say("===========================================================");
    say("ACP SUPERVISED COLIBRI AUTOFOCUS TEST");
    say("Started UTC: " + iso(startedAt));
    say("Project: " + PROJECT_DIR);
    say("Focuser: " + FOCUSER_DRIVER);
    say("Mandatory focuser range: " +
        FOCUSER_SAFE_MIN + ".." + FOCUSER_SAFE_MAX);

    say("Autofocus mode: " +
        (AUTOFOCUS_MODE === "recovery" ? "Blind Recovery + Coarse" :
        (AUTOFOCUS_MODE === "fine" ? "Coarse + Fine" : "Coarse Only")));

    if (AUTOFOCUS_MODE === "recovery") {
        say("Recovery direction: " + RECOVERY_DIRECTION);
        say("Wide-search spacing: " + RECOVERY_SPACING + " steps");
        say("Final refinement: " + RECOVERY_REFINEMENT);
        say("Safe focuser range: " +
            FOCUSER_SAFE_MIN + ".." + FOCUSER_SAFE_MAX);
    }
    say("Quadratic interpolation: " + (AUTOFOCUS_MODE === "fine" && USE_QUADRATIC ? "ENABLED" : "DISABLED"));
    say("Exposure=" + EXPOSURE + " s; frames/position=" + FRAMES_PER_POSITION);
    say("Fine step=" + STEP_SIZE + "; coarse step=" + (STEP_SIZE*COARSE_MULTIPLIER) +
        "; +/-" + STEPS_EACH_SIDE + " positions; excursion=" + MAX_EXCURSION);
    var coarsePositions = 2 * STEPS_EACH_SIDE + 1;
    var finePositions = AUTOFOCUS_MODE === "fine" ? coarsePositions : 0;
    var verificationPositions = 3;

    var expectedPositions =
        coarsePositions + finePositions + verificationPositions;

    if (AUTOFOCUS_MODE === "recovery") {
        say("Recovery search: up to 30 wide positions plus refinement, coarse and verification");
    } else {
        say("Expected positions=" + expectedPositions +
            "; expected frames=" + (FRAMES_PER_POSITION * expectedPositions));
    }
    say("No dome, mount, or slew commands are issued by this test script.");
    ensureFolder(LOG_ROOT);
    assertFile(PYTHON_EXE, "Python interpreter");
    assertFile(PROJECT_DIR + "\\" + PYFOCUS_FILE, "PyFocus script");
    assertFile(COLIBRIGRAB_EXE, "ColibriGrab executable");
    if (fso.FileExists(stopFile)) throw new Error("Stop flag already exists: " + stopFile);
    if (fso.FileExists(resultJson)) throw new Error("Stale result exists: " + resultJson);

    var args = [
        quote(PYTHON_EXE), "-u", quote(PROJECT_DIR + "\\" + PYFOCUS_FILE),
        "--autofocus",
        "--autofocus-mode", AUTOFOCUS_MODE,
        "--exposure", EXPOSURE,
        "--binning", "2",
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

    if (AUTOFOCUS_MODE === "recovery") {
        args.push(
            "--recovery-direction", RECOVERY_DIRECTION,
            "--recovery-spacing", RECOVERY_SPACING,
            "--recovery-refinement", RECOVERY_REFINEMENT
        );
    }

    if (AUTOFOCUS_MODE === "fine" && USE_QUADRATIC) {
        args.push("--quadratic");
    }
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

    // New focus-assessment fields.
    var initialPos = /"initial_position"\s*:\s*(\d+)/i.exec(data);
    var initialHfd = /"initial_hfd_px"\s*:\s*([0-9.]+)/i.exec(data);
    var focusDelta = /"focus_delta_steps"\s*:\s*(-?\d+)/i.exec(data);
    var hfdImprovement = /"hfd_improvement_px"\s*:\s*(-?[0-9.]+)/i.exec(data);
    var hfdThreshold = /"hfd_improvement_threshold_px"\s*:\s*([0-9.]+)/i.exec(data);
    var assessment = /"focus_assessment"\s*:\s*"([^"]+)"/i.exec(data);

    // First, ensure autofocus actually succeeded.
    if (code !== 0 || !success || !pos || !hfd) {
        say("Autofocus failed or verification unsuccessful.", "ERROR");
        if (err) say("Python error: " + err[1], "ERROR");
        throw new Error(
            "Autofocus FAILED. Do not proceed to observations. Check " + resultJson
        );
    }

    say("Autofocus completed successfully.");
    say("Best focus position: " + pos[1] + " steps");
    say("Verified HFD: " + Number(hfd[1]).toFixed(3) + " px");

    // Starting focus measurements.
    if (initialPos) {
        say("Starting focus: " + initialPos[1] + " steps" +
            (initialHfd
                ? " | Initial HFD: " + Number(initialHfd[1]).toFixed(3) + " px"
                : " | Initial HFD unavailable"));
    } else {
        say("Starting focus position unavailable.", "WARNING");
    }

    // Movement relative to starting focus.
    if (focusDelta) {
        var delta = Number(focusDelta[1]);
        say("Focus change: " + (delta >= 0 ? "+" : "") + delta + " steps");
    }

    // Compare measured HFD.
    if (hfdImprovement && hfdThreshold) {
        say("Measured HFD improvement: " +
            Number(hfdImprovement[1]).toFixed(3) +
            " px | Significance threshold: " +
            Number(hfdThreshold[1]).toFixed(3) + " px");
    }

    // Interpret the Python autofocus assessment.
    if (assessment) {
        switch (assessment[1]) {
            case "START_POSITION_RETAINED":
                say("Assessment: Starting focus retained; no position correction required.");
                break;

            case "MEASURED_IMPROVEMENT":
                say("Assessment: Measurable improvement in focus quality.");
                break;

            case "NO_CLEAR_HFD_IMPROVEMENT":
                say("Assessment: No clear HFD improvement over starting focus.", "WARNING");
                break;

            case "MEASURED_WORSENING":
                say("Assessment: Final HFD worse than initial measurement.", "WARNING");
                break;

            case "BASELINE_UNAVAILABLE":
                say("Assessment: Initial HFD measurement unavailable.", "WARNING");
                break;

            default:
                say("Assessment: " + assessment[1], "WARNING");
        }
    } else {
        say("Focus assessment unavailable. Verify ColibriFocus.py version.", "WARNING");
    }

    say("TOTAL ACP TEST TIME: " + secsSince(startedAt).toFixed(1) + " s");
    say("===========================================================");
}

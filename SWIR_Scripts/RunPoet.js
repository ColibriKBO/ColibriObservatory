// RunPOET.js
//
// SUPERVISED END-TO-END POET AUTOMATION TEST
//
// Author: Connor Martz
//
// Date: October 2026
//
// Workflow:
//   1) Human edits target/settings below and runs this script in ACP.
//   2) ACP slews to the nominal J2000 target using gotoRADec().
//   3) ACP requests a SWIR pointing exposure through the existing
//      REDBIRD <-> POET file-based camera/solver workflow.
//   4) REDBIRD plate-solves the SWIR image and returns the pointing error.
//   5) If outside tolerance but within the correction safety limit, ACP applies
//      the proven correction from the LAST COMMANDED coordinates.
//   6) Steps 3-5 repeat until tolerance is reached or the bounded correction
//      limit is exhausted.
//   7) Once centered, ACP writes a frame-limited continuous-capture request.
//   8) The POET watcher launches command_line_camera_control.exe in
//      --continuous_capture mode with --max_frames.
//   9) ACP waits for POET to acknowledge start, then waits until the
//      frame-limited science block finishes.
//
// PHD2 is intentionally NOT controlled by this script.
// Pier flips ARE handled explicitly by RunPOET using SideOfPier /
// DestinationSideOfPier checks at science/background transitions.
//
// Safety behavior:
//   - At most MAX_CORRECTIVE_SLEWS corrective slews are allowed.
//   - Every solve must match the requested target.
//   - Any requested correction above MAX_CORRECTION_ARCSEC is rejected.
//   - A strongly worsening solution is treated as divergence and aborts.
//   - Camera/solver failures and timeouts abort with no further SWIR slew.
//   - Continuous science capture has a bounded frame count and timeout.
//
// IMPORTANT:
//   Continuous-capture support requires the POET watcher to understand
//   *.continuous_start request files and to write the corresponding
//   *.continuous_started / *.continuous_complete / *.continuous_failed
//   status files described below.
//

// =====================================================================
// HUMAN-EDITABLE SETTINGS
// =====================================================================

var TARGET_NAME = "NGC2158";

// J2000 / ICRS target coordinates
var TARGET_RA_HMS  = "06:07:26.9";
var TARGET_DEC_DMS = "+24:05:56";

var POINTING_EXPOSURE_MS = 15000;
var POINTING_GAIN = 1.5;
var POINTING_TEC_C = -15.0;

// Frame-limited continuous science acquisition.
// Start small for the first end-to-end test; increase after validation.
var SCIENCE_EXPOSURE_MS = 10000;
var SCIENCE_GAIN = 1.5;
var SCIENCE_TEC_C = -15.0;

// Total amount of actual on-target science integration desired.
var TOTAL_SCIENCE_MINUTES = 60.0;

// Take a background set after approximately this much
// ON-TARGET science integration.
var BACKGROUND_INTERVAL_MINUTES = 10.0;

// POET should acknowledge that continuous capture actually launched.
var SCIENCE_START_TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

// Runtime fail-safe for the whole frame-limited science block.
// The actual timeout is calculated as:
//   max(10 min, 2 x pure exposure time + this margin)
var SCIENCE_TIMEOUT_MARGIN_MS = 10 * 60 * 1000; // 10 minutes

// Shared folder as seen locally on REDBIRD.
var SHARED_ROOT = "D:\\SWIR_Pointing";
var REQUEST_DIR = SHARED_ROOT + "\\requests";
var RESULT_DIR  = SHARED_ROOT + "\\results";
var POET_SCIENCE_ROOT = "C:\\Users\\User\\Documents\\Elginfield_SWIR_Automation\\captures";

// End-of-run background sequence.
var TAKE_BACKGROUND_FRAMES = true;

// Up to 9 background frames.
var BACKGROUND_FRAME_COUNT = 9;

// Each position is another 30 arcsec from the science position:
// 30", 60", 90", ... 270".
var BACKGROUND_DITHER_ARCSEC = 30.0;

// N, S, E, or W.
var BACKGROUND_DITHER_DIRECTION = "E";

// By default use the same camera settings as science.
var BACKGROUND_EXPOSURE_MS = SCIENCE_EXPOSURE_MS;
var BACKGROUND_GAIN = SCIENCE_GAIN;
var BACKGROUND_TEC_C = SCIENCE_TEC_C;

var BACKGROUND_SETTLE_AFTER_SLEW_MS = 2000;
var BACKGROUND_CAPTURE_TIMEOUT_MS = 3 * 60 * 1000;

// Pointing/safety settings
var SUCCESS_TOLERANCE_ARCSEC = 15.0;
var MAX_CORRECTION_ARCSEC = 3600.0;       // 1 degree
var MAX_CORRECTIVE_SLEWS = 3;             // at most 4 solves total
var DIVERGENCE_FACTOR = 1.5;              // abort if error grows dramatically
var DIVERGENCE_MIN_INCREASE_ARCSEC = 10.0;
var TARGET_MATCH_TOLERANCE_ARCSEC = 1.0;  // result must match requested target
var RESULT_TIMEOUT_MS = 10 * 60 * 1000;   // 10 minutes
var POLL_MS = 500;
var SETTLE_AFTER_SLEW_MS = 5000;

// Same coordinate behavior as current RunColibri.
var USE_TOPOCENTRIC_SLEWS = true;
var ELEVATION_LIMIT_DEG = 10.0;
var MAX_SLEW_ATTEMPTS = 10;

// Explicit pier-flip handling. RunPOET checks the AP driver before any
// science/background transition that could otherwise cause a surprise flip.
var HANDLE_PIER_FLIPS = true;


// =====================================================================
// LOGGING / BASIC HELPERS
// =====================================================================

function log(msg)
{
    Console.PrintLine(msg);
}

function errText(e)
{
    if (e == null) return "Unknown error";
    return e.message || e.description || String(e);
}

function isFiniteNum(x)
{
    return (typeof x == "number" && isFinite(x));
}

function pad2(n)
{
    return (n < 10 ? "0" : "") + n;
}

function pad3(n)
{
    if (n < 10) return "00" + n;
    if (n < 100) return "0" + n;
    return String(n);
}

function sanitizeName(s)
{
    return String(s).replace(/[^A-Za-z0-9_-]/g, "_");
}

function makeRunId()
{
    var d = new Date();

    return sanitizeName(TARGET_NAME) + "_" +
        d.getUTCFullYear() +
        pad2(d.getUTCMonth() + 1) +
        pad2(d.getUTCDate()) + "_" +
        pad2(d.getUTCHours()) +
        pad2(d.getUTCMinutes()) +
        pad2(d.getUTCSeconds()) +
        pad3(d.getUTCMilliseconds());
}

function wrapRaHours(hours)
{
    while (hours < 0.0) hours += 24.0;
    while (hours >= 24.0) hours -= 24.0;
    return hours;
}

function wrapRaDeg(deg)
{
    while (deg < 0.0) deg += 360.0;
    while (deg >= 360.0) deg -= 360.0;
    return deg;
}

function wrappedRaDeltaDeg(aMinusB)
{
    var x = aMinusB;
    while (x < -180.0) x += 360.0;
    while (x >= 180.0) x -= 360.0;
    return x;
}

function isValidRaHoursDecDeg(raHours, decDeg)
{
    if (!isFiniteNum(raHours) || !isFiniteNum(decDeg)) return false;
    if (raHours < 0.0 || raHours >= 24.0) return false;
    if (decDeg < -90.0 || decDeg > 90.0) return false;
    return true;
}

function getTotalScienceFrames()
{
    var totalMs =
        Number(TOTAL_SCIENCE_MINUTES) *
        60.0 *
        1000.0;

    return Math.ceil(
        totalMs /
        Number(SCIENCE_EXPOSURE_MS)
    );
}


function getScienceFramesPerBlock()
{
    var intervalMs =
        Number(BACKGROUND_INTERVAL_MINUTES) *
        60.0 *
        1000.0;

    var frames =
        Math.floor(
            intervalMs /
            Number(SCIENCE_EXPOSURE_MS)
        );

    if (frames < 1)
        frames = 1;

    return frames;
}

// =====================================================================
// COORDINATE PARSING / FORMATTING
// =====================================================================

function parseRAHMS(text)
{
    var p = String(text).replace(/\s/g, "").split(":");

    if (p.length != 3)
        throw new Error("Invalid RA. Expected HH:MM:SS.s, got: " + text);

    var h = Number(p[0]);
    var m = Number(p[1]);
    var s = Number(p[2]);

    if (!isFinite(h) || !isFinite(m) || !isFinite(s) ||
        h < 0 || h >= 24 || m < 0 || m >= 60 || s < 0 || s >= 60)
    {
        throw new Error("Invalid RA: " + text);
    }

    return h + m / 60.0 + s / 3600.0;
}

function parseDecDMS(text)
{
    var raw = String(text).replace(/\s/g, "");
    var sign = 1.0;

    if (raw.charAt(0) == "-")
    {
        sign = -1.0;
        raw = raw.substring(1);
    }
    else if (raw.charAt(0) == "+")
    {
        raw = raw.substring(1);
    }

    var p = raw.split(":");

    if (p.length != 3)
        throw new Error("Invalid Dec. Expected +/-DD:MM:SS.s, got: " + text);

    var d = Number(p[0]);
    var m = Number(p[1]);
    var s = Number(p[2]);

    if (!isFinite(d) || !isFinite(m) || !isFinite(s) ||
        d < 0 || d > 90 || m < 0 || m >= 60 || s < 0 || s >= 60)
    {
        throw new Error("Invalid Dec: " + text);
    }

    var value = sign * (d + m / 60.0 + s / 3600.0);

    if (value < -90.0 || value > 90.0)
        throw new Error("Invalid Dec: " + text);

    return value;
}

function formatRA(hours)
{
    hours = wrapRaHours(hours);

    var totalMs = Math.round(hours * 3600.0 * 1000.0);
    var h = Math.floor(totalMs / 3600000);
    totalMs -= h * 3600000;

    var m = Math.floor(totalMs / 60000);
    totalMs -= m * 60000;

    var s = totalMs / 1000.0;

    var ss = s.toFixed(3);
    if (s < 10.0) ss = "0" + ss;

    return pad2(h) + ":" + pad2(m) + ":" + ss;
}

function formatDec(deg)
{
    var sign = deg < 0.0 ? "-" : "+";
    var x = Math.abs(deg);

    var totalMs = Math.round(x * 3600.0 * 1000.0);
    var d = Math.floor(totalMs / 3600000);
    totalMs -= d * 3600000;

    var m = Math.floor(totalMs / 60000);
    totalMs -= m * 60000;

    var s = totalMs / 1000.0;

    var ss = s.toFixed(3);
    if (s < 10.0) ss = "0" + ss;

    return sign + pad2(d) + ":" + pad2(m) + ":" + ss;
}


// =====================================================================
// FILE / JSON HELPERS
// =====================================================================

function ensureFolder(path)
{
    var fso = new ActiveXObject("Scripting.FileSystemObject");

    if (!fso.FolderExists(path))
    {
        fso.CreateFolder(path);
    }
}

function jsonEscape(s)
{
    return String(s)
        .replace(/\\/g, "\\\\")
        .replace(/"/g, '\\"')
        .replace(/\r/g, "\\r")
        .replace(/\n/g, "\\n");
}

function readTextFile(path)
{
    var fso = new ActiveXObject("Scripting.FileSystemObject");

    if (!fso.FileExists(path))
        throw new Error("File does not exist: " + path);

    var f = fso.OpenTextFile(path, 1, false);
    var text = f.ReadAll();
    f.Close();

    return text;
}

function parseJson(text)
{
    // ACP's older JScript environment may not provide JSON.parse().
    return eval("(" + text + ")");
}

function writeRequestAtomic(
    requestId,
    sequenceNumber,
    runId,
    targetRaHours,
    targetDecDeg,
    commandRaHours,
    commandDecDeg)
{
    var fso = new ActiveXObject("Scripting.FileSystemObject");

    var finalPath = REQUEST_DIR + "\\" + requestId + ".json";
    var tempPath  = REQUEST_DIR + "\\" + requestId + ".json.part";

    if (fso.FileExists(finalPath) || fso.FileExists(tempPath))
        throw new Error("Request already exists: " + requestId);

    var targetRaDeg = targetRaHours * 15.0;

    var json =
        "{\r\n" +
        '  "id": "' + jsonEscape(requestId) + '",\r\n' +
        '  "run_id": "' + jsonEscape(runId) + '",\r\n' +
        '  "sequence": ' + sequenceNumber + ',\r\n' +
        '  "target_name": "' + jsonEscape(TARGET_NAME) + '",\r\n' +
        '  "target_ra": "' + jsonEscape(TARGET_RA_HMS) + '",\r\n' +
        '  "target_dec": "' + jsonEscape(TARGET_DEC_DMS) + '",\r\n' +
        '  "target_ra_deg": ' + targetRaDeg.toFixed(12) + ',\r\n' +
        '  "target_dec_deg": ' + targetDecDeg.toFixed(12) + ',\r\n' +
        '  "command_ra_hours": ' + commandRaHours.toFixed(12) + ',\r\n' +
        '  "command_dec_deg": ' + commandDecDeg.toFixed(12) + ',\r\n' +
        '  "exposure_ms": ' + Number(POINTING_EXPOSURE_MS).toFixed(3) + ',\r\n' +
        '  "gain": ' + Number(POINTING_GAIN).toFixed(3) + ',\r\n' +
        '  "tec_c": ' + Number(POINTING_TEC_C).toFixed(3) + ',\r\n' +
        '  "created_utc": "' + jsonEscape(new Date().toUTCString()) + '"\r\n' +
        "}\r\n";

    var f = fso.CreateTextFile(tempPath, true);
    f.Write(json);
    f.Close();

    // Unique request IDs mean the destination should never exist.
    fso.MoveFile(tempPath, finalPath);

    log("Capture request written:");
    log("  " + finalPath);

    return finalPath;
}

function waitForResult(requestId)
{
    var fso = new ActiveXObject("Scripting.FileSystemObject");

    var resultPath = RESULT_DIR + "\\" + requestId + ".json";
    var cameraFailPath = REQUEST_DIR + "\\" + requestId + ".camera_failed";

    var start = new Date().getTime();
    var lastStatus = start;

    log("Waiting for automated SWIR capture + plate solve...");
    log("Expected result:");
    log("  " + resultPath);

    while (true)
    {
        if (fso.FileExists(resultPath))
        {
            return resultPath;
        }

        if (fso.FileExists(cameraFailPath))
        {
            var reason = readTextFile(cameraFailPath);
            throw new Error(
                "POET camera acquisition failed for " +
                requestId + ":\r\n" + reason
            );
        }

        var now = new Date().getTime();

        if ((now - start) > RESULT_TIMEOUT_MS)
        {
            throw new Error(
                "Timed out waiting for result after " +
                Math.round(RESULT_TIMEOUT_MS / 1000.0) +
                " seconds: " + requestId
            );
        }

        if ((now - lastStatus) >= 10000)
        {
            log(
                "  Still waiting... " +
                Math.round((now - start) / 1000.0) +
                " s"
            );
            lastStatus = now;
        }

        Util.WaitForMilliseconds(POLL_MS);
    }
}

function loadAndValidateResult(
    resultPath,
    expectedId,
    targetRaDeg,
    targetDecDeg)
{
    var result = parseJson(readTextFile(resultPath));

    if (String(result.id) != String(expectedId))
    {
        throw new Error(
            "Result ID mismatch. Expected " +
            expectedId + ", got " + result.id
        );
    }

    if (result.solved !== true)
    {
        throw new Error(
            "Plate solve failed for " + expectedId +
            ". Telescope will not be corrected."
        );
    }

    var returnedTargetRaDeg  = Number(result.target_ra_deg);
    var returnedTargetDecDeg = Number(result.target_dec_deg);

    if (!isFinite(returnedTargetRaDeg) ||
        !isFinite(returnedTargetDecDeg))
    {
        throw new Error("Result has invalid target coordinates.");
    }

    var draTargetDeg =
        wrappedRaDeltaDeg(returnedTargetRaDeg - targetRaDeg);

    var draTargetSkyArcsec =
        draTargetDeg *
        Math.cos(targetDecDeg * Math.PI / 180.0) *
        3600.0;

    var ddecTargetArcsec =
        (returnedTargetDecDeg - targetDecDeg) * 3600.0;

    var targetMismatchArcsec =
        Math.sqrt(
            draTargetSkyArcsec * draTargetSkyArcsec +
            ddecTargetArcsec * ddecTargetArcsec
        );

    if (targetMismatchArcsec > TARGET_MATCH_TOLERANCE_ARCSEC)
    {
        throw new Error(
            "Result target does not match ACP target. " +
            "Mismatch=" + targetMismatchArcsec.toFixed(3) +
            " arcsec."
        );
    }

    var values = [
        Number(result.center_ra_deg),
        Number(result.center_dec_deg),
        Number(result.dra_coord_deg),
        Number(result.ddec_deg),
        Number(result.dra_sky_arcsec),
        Number(result.ddec_arcsec),
        Number(result.total_error_arcsec)
    ];

    for (var i = 0; i < values.length; i++)
    {
        if (!isFinite(values[i]))
            throw new Error("Result contains invalid numeric values.");
    }

    return result;
}


// =====================================================================
// FRAME-LIMITED CONTINUOUS SCIENCE CAPTURE CONTROL
// =====================================================================

function writeContinuousStartAtomic(sessionId, runId, maxFrames)
{
    var fso = new ActiveXObject("Scripting.FileSystemObject");

    // Deliberately NOT a .json extension so the existing single-capture
    // watcher cannot accidentally treat this as a pointing request.
    var finalPath =
        REQUEST_DIR + "\\" + sessionId + ".continuous_start";

    var tempPath =
        REQUEST_DIR + "\\" + sessionId + ".continuous_start.part";

    if (fso.FileExists(finalPath) || fso.FileExists(tempPath))
        throw new Error(
            "Continuous-capture request already exists: " + sessionId
        );

    var json =
        "{\r\n" +
        '  "type": "continuous_start",\r\n' +
        '  "id": "' + jsonEscape(sessionId) + '",\r\n' +
        '  "run_id": "' + jsonEscape(runId) + '",\r\n' +
        '  "target_name": "' + jsonEscape(TARGET_NAME) + '",\r\n' +
        '  "name": "' + jsonEscape(sessionId) + '",\r\n' +
        '  "science_directory": "' +
            jsonEscape(POET_SCIENCE_ROOT + "\\" + sessionId) + '",\r\n' +
        '  "exposure_ms": ' + Number(SCIENCE_EXPOSURE_MS).toFixed(3) + ',\r\n' +
        '  "gain": ' + Number(SCIENCE_GAIN).toFixed(3) + ',\r\n' +
        '  "tec_c": ' + Number(SCIENCE_TEC_C).toFixed(3) + ',\r\n' +
        '  "max_frames": ' + Math.floor(Number(maxFrames)) + ',\r\n' +
        '  "created_utc": "' + jsonEscape(new Date().toUTCString()) + '"\r\n' +
        "}\r\n";

    var f = fso.CreateTextFile(tempPath, true);
    f.Write(json);
    f.Close();

    fso.MoveFile(tempPath, finalPath);

    log("Continuous-capture request written:");
    log("  " + finalPath);

    return finalPath;
}

function waitForContinuousStarted(sessionId)
{
    var fso = new ActiveXObject("Scripting.FileSystemObject");

    var startedPath =
        RESULT_DIR + "\\" + sessionId + ".continuous_started";

    var failedPath =
        RESULT_DIR + "\\" + sessionId + ".continuous_failed";

    var start = new Date().getTime();
    var lastStatus = start;

    log("Waiting for POET to confirm continuous capture started...");
    log("Expected status:");
    log("  " + startedPath);

    while (true)
    {
        if (fso.FileExists(startedPath))
            return;

        if (fso.FileExists(failedPath))
        {
            throw new Error(
                "POET continuous capture failed to start:\r\n" +
                readTextFile(failedPath)
            );
        }

        var now = new Date().getTime();

        if ((now - start) > SCIENCE_START_TIMEOUT_MS)
        {
            throw new Error(
                "Timed out waiting for POET continuous capture to start after " +
                Math.round(SCIENCE_START_TIMEOUT_MS / 1000.0) +
                " seconds."
            );
        }

        if ((now - lastStatus) >= 10000)
        {
            log(
                "  Still waiting for continuous start... " +
                Math.round((now - start) / 1000.0) +
                " s"
            );
            lastStatus = now;
        }

        Util.WaitForMilliseconds(POLL_MS);
    }
}

    function getScienceTimeoutMs(maxFrames)
    {
        var pureExposureMs =
            Number(maxFrames) *
            Number(SCIENCE_EXPOSURE_MS);

        var calculated =
            pureExposureMs * 2.0 +
            Number(SCIENCE_TIMEOUT_MARGIN_MS);

        var minimum = 10 * 60 * 1000;

        return calculated > minimum ? calculated : minimum;
    }

function waitForContinuousComplete(sessionId, maxFrames)
{
    var fso = new ActiveXObject("Scripting.FileSystemObject");

    var completePath =
        RESULT_DIR + "\\" + sessionId + ".continuous_complete";

    var failedPath =
        RESULT_DIR + "\\" + sessionId + ".continuous_failed";

    var stoppedPath =
        RESULT_DIR + "\\" + sessionId + ".continuous_stopped";

    var timeoutMs = getScienceTimeoutMs(maxFrames);
    var start = new Date().getTime();
    var lastStatus = start;

    log("Waiting for frame-limited continuous SWIR capture to finish...");
    log("Expected completion status:");
    log("  " + completePath);
    log(
        "Science timeout = " +
        Math.round(timeoutMs / 60000.0) +
        " minutes."
    );

    while (true)
    {
        if (fso.FileExists(completePath))
        {
            return "complete";
        }

        // Optional status for a future manual/external graceful stop.
        if (fso.FileExists(stoppedPath))
        {
            return "stopped";
        }

        if (fso.FileExists(failedPath))
        {
            throw new Error(
                "POET continuous capture failed:\r\n" +
                readTextFile(failedPath)
            );
        }

        var now = new Date().getTime();

        if ((now - start) > timeoutMs)
        {
            throw new Error(
                "Timed out waiting for frame-limited continuous capture " +
                "to finish after " +
                Math.round(timeoutMs / 60000.0) +
                " minutes."
            );
        }

        if ((now - lastStatus) >= 30000)
        {
            log(
                "  Continuous capture still running... " +
                Math.round((now - start) / 60000.0) +
                " min elapsed"
            );
            lastStatus = now;
        }

        Util.WaitForMilliseconds(1000);
    }
}

function runScienceBlock(runId, blockNumber, maxFrames)
{
    var sessionId =
        runId +
        "_science_block_" +
        pad2(blockNumber);

    log("");
    log("============================================================");
    log("STARTING FRAME-LIMITED CONTINUOUS SWIR CAPTURE");
    log("============================================================");
    log("Science block : " + blockNumber);
    log("Session ID    : " + sessionId);
    log("Exposure      : " + SCIENCE_EXPOSURE_MS + " ms");
    log("Gain          : " + SCIENCE_GAIN);
    log("TEC           : " + SCIENCE_TEC_C + " C");
    log("Max frames    : " + maxFrames);
    log(
        "Science dir   : " +
        POET_SCIENCE_ROOT +
        "\\" +
        sessionId
    );

    writeContinuousStartAtomic(
        sessionId,
        runId,
        maxFrames
    );

    waitForContinuousStarted(sessionId);

    log("");
    log("POET reports continuous capture is running.");

    var finishState =
        waitForContinuousComplete(
            sessionId,
            maxFrames
        );

    log("");
    log("============================================================");

    if (finishState == "complete")
    {
        log(
            "CONTINUOUS CAPTURE COMPLETE: " +
            maxFrames +
            " requested science frames completed."
        );
    }
    else
    {
        throw new Error(
            "Continuous capture stopped before " +
            "the requested frame limit."
        );
    }

    log("Science session: " + sessionId);
    log("============================================================");
}

// =====================================================================
// END-OF-RUN BACKGROUND DITHER SEQUENCE
// =====================================================================

function getBackgroundDitherCoordinates(
    baseRaHours,
    baseDecDeg,
    direction,
    offsetArcsec)
{
    var dir = String(direction).toUpperCase();

    var raDeg = baseRaHours * 15.0;
    var decDeg = baseDecDeg;

    if (dir == "N" || dir == "S")
    {
        var signedNorth =
            (dir == "N" ? 1.0 : -1.0) * offsetArcsec;

        decDeg += signedNorth / 3600.0;
    }
    else if (dir == "E" || dir == "W")
    {
        var cosDec =
            Math.cos(baseDecDeg * Math.PI / 180.0);

        if (Math.abs(cosDec) < 0.01)
        {
            throw new Error(
                "East/west background dither is unsafe " +
                "this close to the celestial pole."
            );
        }

        var signedEast =
            (dir == "E" ? 1.0 : -1.0) * offsetArcsec;

        // Convert requested sky offset to RA coordinate offset.
        raDeg +=
            signedEast /
            (3600.0 * cosDec);

        raDeg = wrapRaDeg(raDeg);
    }
    else
    {
        throw new Error(
            "BACKGROUND_DITHER_DIRECTION must be N, S, E, or W."
        );
    }

    var raHours =
        wrapRaDeg(raDeg) / 15.0;

    if (!isValidRaHoursDecDeg(raHours, decDeg))
    {
        throw new Error(
            "Background dither produced invalid coordinates."
        );
    }

    return {
        ra: raHours,
        dec: decDeg
    };
}


function writeBackgroundCaptureAtomic(
    frameId,
    runId,
    index,
    offsetArcsec,
    backgroundDirectory)
{
    var fso =
        new ActiveXObject(
            "Scripting.FileSystemObject"
        );

    var finalPath =
        REQUEST_DIR +
        "\\" +
        frameId +
        ".background_capture";

    var tempPath =
        REQUEST_DIR +
        "\\" +
        frameId +
        ".background_capture.part";

    if (
        fso.FileExists(finalPath) ||
        fso.FileExists(tempPath)
    )
    {
        throw new Error(
            "Background request already exists: " +
            frameId
        );
    }

    var json =
        "{\r\n" +

        '  "type": "background_capture",\r\n' +

        '  "id": "' +
        jsonEscape(frameId) +
        '",\r\n' +

        '  "run_id": "' +
        jsonEscape(runId) +
        '",\r\n' +

        '  "target_name": "' +
        jsonEscape(TARGET_NAME) +
        '",\r\n' +

        '  "name": "' +
        jsonEscape(frameId) +
        '",\r\n' +

        '  "background_directory": "' +
        jsonEscape(backgroundDirectory) +
        '",\r\n' +

        '  "exposure_ms": ' +
        Number(BACKGROUND_EXPOSURE_MS).toFixed(3) +
        ',\r\n' +

        '  "gain": ' +
        Number(BACKGROUND_GAIN).toFixed(3) +
        ',\r\n' +

        '  "tec_c": ' +
        Number(BACKGROUND_TEC_C).toFixed(3) +
        ',\r\n' +

        '  "dither_index": ' +
        index +
        ',\r\n' +

        '  "dither_count": ' +
        Math.floor(Number(BACKGROUND_FRAME_COUNT)) +
        ',\r\n' +

        '  "dither_direction": "' +
        jsonEscape(BACKGROUND_DITHER_DIRECTION) +
        '",\r\n' +

        '  "dither_offset_arcsec": ' +
        Number(offsetArcsec).toFixed(3) +
        ',\r\n' +

        '  "created_utc": "' +
        jsonEscape(new Date().toUTCString()) +
        '"\r\n' +

        "}\r\n";

    var f =
        fso.CreateTextFile(
            tempPath,
            true
        );

    f.Write(json);
    f.Close();

    fso.MoveFile(
        tempPath,
        finalPath
    );

    log("Background capture request written:");
    log("  " + finalPath);
}


function waitForBackgroundComplete(frameId)
{
    var fso =
        new ActiveXObject(
            "Scripting.FileSystemObject"
        );

    var completePath =
        RESULT_DIR +
        "\\" +
        frameId +
        ".background_complete";

    var failedPath =
        RESULT_DIR +
        "\\" +
        frameId +
        ".background_failed";

    var start =
        new Date().getTime();

    var lastStatus = start;

    while (true)
    {
        if (fso.FileExists(completePath))
        {
            return;
        }

        if (fso.FileExists(failedPath))
        {
            throw new Error(
                "POET background capture failed:\r\n" +
                readTextFile(failedPath)
            );
        }

        var now =
            new Date().getTime();

        if (
            (now - start) >
            BACKGROUND_CAPTURE_TIMEOUT_MS
        )
        {
            throw new Error(
                "Timed out waiting for background frame " +
                frameId +
                "."
            );
        }

        if (
            (now - lastStatus) >= 10000
        )
        {
            log(
                "  Still waiting for " +
                frameId +
                "..."
            );

            lastStatus = now;
        }

        Util.WaitForMilliseconds(POLL_MS);
    }
}


function runBackgroundSequence(
    runId,
    visitNumber,
    baseRaHours,
    baseDecDeg)
{
    if (!TAKE_BACKGROUND_FRAMES)
    {
        log("Background sequence disabled.");
        return false;
    }

    // Remember if ANY background dither caused a pier flip.
    var backgroundPierFlipOccurred = false;

    var count =
        Number(BACKGROUND_FRAME_COUNT);

    if (
        !isFinite(count) ||
        count < 1 ||
        count > 9 ||
        Math.floor(count) != count
    )
    {
        throw new Error(
            "BACKGROUND_FRAME_COUNT must be an integer from 1 to 9."
        );
    }

    var stepArcsec =
        Number(BACKGROUND_DITHER_ARCSEC);

    if (
        !isFinite(stepArcsec) ||
        stepArcsec <= 0
    )
    {
        throw new Error(
            "BACKGROUND_DITHER_ARCSEC must be positive."
        );
    }

    var backgroundDirectory =
        POET_SCIENCE_ROOT +
        "\\" +
        runId +
        "_background" +
        "\\visit_" +
        pad2(visitNumber);

    log("");
    log(
        "============================================================"
    );
    log(
        "STARTING BACKGROUND DITHER SEQUENCE"
    );
    log(
        "============================================================"
    );

    log("Background visit: " + visitNumber);

    log("Frames       : " + count);
    log(
        "Dither step  : " +
        stepArcsec +
        " arcsec"
    );
    log(
        "Direction    : " +
        BACKGROUND_DITHER_DIRECTION
    );
    log(
        "Exposure     : " +
        BACKGROUND_EXPOSURE_MS +
        " ms"
    );
    log(
        "Gain         : " +
        BACKGROUND_GAIN
    );
    log(
        "TEC          : " +
        BACKGROUND_TEC_C +
        " C"
    );
    log(
        "POET folder  : " +
        backgroundDirectory
    );

    log(
        "Base command : RA " +
        formatRA(baseRaHours) +
        "  Dec " +
        formatDec(baseDecDeg)
    );

    

    log("");

    for (
        var i = 1;
        i <= count;
        i++
    )
    {
        // Positions are cumulative from the final centered
        // science position:
        // 30", 60", 90", ... etc.
        var cumulativeOffset =
            stepArcsec * i;

        var coords =
            getBackgroundDitherCoordinates(
                baseRaHours,
                baseDecDeg,
                BACKGROUND_DITHER_DIRECTION,
                cumulativeOffset
            );

        var frameId =
            runId +
            "_background_v" +
            pad2(visitNumber) +
            "_" +
            pad2(i);

        log(
            "------------------------------------------------------------"
        );

        log(
            "BACKGROUND " +
            i +
            "/" +
            count +
            "  cumulative offset=" +
            cumulativeOffset.toFixed(1) +
            " arcsec " +
            String(
                BACKGROUND_DITHER_DIRECTION
            ).toUpperCase()
        );

        log(
            "  Slew to RA " +
            formatRA(coords.ra) +
            "  Dec " +
            formatDec(coords.dec)
        );

        // Check whether this particular background dither
        // requires a pier flip.
        var pierSideBeforeDither = null;

        if (HANDLE_PIER_FLIPS)
            pierSideBeforeDither = getCurrentPierSide();

        var ditherFlipped = performPierFlipIfRequired(
            coords.ra,
            coords.dec,
            "background visit " + visitNumber +
            ", dither " + i + "/" + count
        );

        if (ditherFlipped)
        {
            backgroundPierFlipOccurred = true;

            log("Background dither " + i +
                " deliberately flipped the telescope.");

            // The flip routine already slewed to this position
            // and verified the new pier side.
        }
        else
        {
            // No flip required. Perform the ordinary dither slew.
            if (!gotoRADec(coords.ra, coords.dec))
            {
                throw new Error(
                    "Background dither gotoRADec() failed for frame " +
                    i + "."
                );
            }

            // Check for an unexpected pier-side change.
            if (HANDLE_PIER_FLIPS &&
                getCurrentPierSide() != pierSideBeforeDither)
            {
                throw new Error(
                    "Unexpected pier flip during background visit " +
                    visitNumber + ", dither " + i + "."
                );
            }
        }

        Util.WaitForMilliseconds(
            BACKGROUND_SETTLE_AFTER_SLEW_MS
        );

        writeBackgroundCaptureAtomic(
            frameId,
            runId,
            i,
            cumulativeOffset,
            backgroundDirectory
        );

        waitForBackgroundComplete(
            frameId
        );

        log(
            "  Background frame complete: " +
            frameId +
            ".fits"
        );
    }

    log("");
    log(
        "============================================================"
    );
    log(
        "BACKGROUND SEQUENCE COMPLETE"
    );
    log(
        "Saved " +
        count +
        " local-only background FITS on POET."
    );
    log(
        "Folder: " +
        backgroundDirectory
    );
    log(
    "============================================================"
    );

    log("Pier flip(s) during this background visit: " +
        (backgroundPierFlipOccurred ? "YES" : "NO"));

    return backgroundPierFlipOccurred;
}


// =====================================================================
// J2000 -> TOPOCENTRIC, SAME APPROACH AS CURRENT RunColibri
// =====================================================================

function convertJ2000ToTopocentric(raJ2000, decJ2000)
{
    var transform = null;

    try
    {
        transform = new ActiveXObject(
            "ASCOM.Astrometry.Transform.Transform"
        );

        transform.SiteLatitude = Telescope.SiteLatitude;
        transform.SiteLongitude = Telescope.SiteLongitude;

        try
        {
            transform.SiteElevation = Telescope.SiteElevation;
        }
        catch (e)
        {
            transform.SiteElevation = 0;
        }

        transform.JulianDateUTC = Util.SysJulianDate;
        transform.Refraction = false;
        transform.SetJ2000(raJ2000, decJ2000);

        var result = {
            ra: Number(transform.RATopocentric),
            dec: Number(transform.DECTopocentric)
        };

        if (!isValidRaHoursDecDeg(result.ra, result.dec))
        {
            throw new Error(
                "Invalid transformed coordinates: RA=" +
                result.ra + " Dec=" + result.dec
            );
        }

        return result;
    }
    finally
    {
        if (transform != null)
        {
            try { transform.Dispose(); }
            catch (e) {}
        }
    }
}

function getMountCoordinates(raJ2000, decJ2000)
{
    if (!USE_TOPOCENTRIC_SLEWS)
    {
        return {
            ra: raJ2000,
            dec: decJ2000,
            mode: "DIRECT J2000"
        };
    }

    if (Number(Telescope.EquatorialSystem) != 1)
    {
        throw new Error(
            "Topocentric slew requested, but EquatorialSystem=" +
            Telescope.EquatorialSystem
        );
    }

    var topo = convertJ2000ToTopocentric(raJ2000, decJ2000);

    return {
        ra: topo.ra,
        dec: topo.dec,
        mode: "TOPOCENTRIC"
    };
}

// =====================================================================
// PARK TELESCOPE AT END OF RUN
// =====================================================================

function parkTelescope()
{
    log("");
    log("============================================================");
    log("PARKING TELESCOPE");
    log("============================================================");

    // Same tracking-off behaviour used by RunColibri.
    if (Telescope.CanSetTracking)
    {
        Telescope.Tracking = false;
        log("--> Tracking is turned off.");
    }
    else if (Telescope.Tracking && !Telescope.CanSetTracking)
    {
        log("WARNING: Failed to disable telescope tracking.");
    }

    log("Tracking turned off. Parking telescope now...");

    try
    {
        // Same park command used by RunColibri.
        Telescope.Park();

        while (!Telescope.AtPark)
        {
            log("Waiting for telescope to park...");
            Util.WaitForMilliseconds(2000);
        }
    }
    catch (e)
    {
        throw new Error(
            "Telescope park failed: " + errText(e)
        );
    }

    // RunColibri calls trkOff() again after parking.
    if (Telescope.CanSetTracking)
    {
        Telescope.Tracking = false;
    }

    log("Telescope parked.");
}

// =====================================================================
// gotoRADec - SAFE STANDALONE VERSION
// =====================================================================

function gotoRADec(ra, dec)
{
    if (!isValidRaHoursDecDeg(ra, dec))
    {
        log(
            "ERROR: refusing invalid coordinates RA(h)=" +
            ra + " Dec=" + dec
        );
        return false;
    }

    var targetCt = Util.NewCThereAndNow();
    targetCt.RightAscension = ra;
    targetCt.Declination = dec;

    var elevation = Number(targetCt.Elevation);

    log("");
    log("gotoRADec()");
    log("  J2000 RA  = " + formatRA(ra));
    log("  J2000 Dec = " + formatDec(dec));
    log("  Elevation = " + elevation.toFixed(2) + " deg");

    if (elevation < ELEVATION_LIMIT_DEG)
    {
        log(
            "ERROR: slew refused. Elevation " +
            elevation.toFixed(2) +
            " deg is below " +
            ELEVATION_LIMIT_DEG.toFixed(2) +
            " deg."
        );
        return false;
    }

    if (!Telescope.Connected)
    {
        log("ERROR: Telescope is not connected.");
        return false;
    }

    if (!Telescope.Tracking)
    {
        log("ERROR: Telescope tracking is OFF.");
        return false;
    }

    var mountCoords;

    try
    {
        mountCoords = getMountCoordinates(ra, dec);
    }
    catch (e)
    {
        log("ERROR: coordinate conversion failed: " + errText(e));
        return false;
    }

    log("  Coordinate mode = " + mountCoords.mode);
    log(
        "  Mount command   = RA " +
        mountCoords.ra.toFixed(8) +
        " h  Dec " +
        mountCoords.dec.toFixed(8) +
        " deg"
    );

    for (var attempt = 1; attempt <= MAX_SLEW_ATTEMPTS; attempt++)
    {
        try
        {
            log(
                "  Slew attempt " +
                attempt + "/" + MAX_SLEW_ATTEMPTS
            );

            Telescope.SlewToCoordinates(
                mountCoords.ra,
                mountCoords.dec
            );

            log("  Slew completed.");
            return true;
        }
        catch (e)
        {
            log("  Slew failed: " + errText(e));

            if (attempt < MAX_SLEW_ATTEMPTS)
            {
                log("  Waiting 5 seconds before retry...");
                Util.WaitForMilliseconds(5000);
            }
        }
    }

    log("ERROR: maximum slew attempts reached.");
    return false;
}


// =====================================================================
// REQUEST + SOLVE ONE POINTING FRAME
// =====================================================================

function acquireAndSolve(
    requestId,
    sequenceNumber,
    runId,
    targetRaHours,
    targetDecDeg,
    commandRaHours,
    commandDecDeg)
{
    writeRequestAtomic(
        requestId,
        sequenceNumber,
        runId,
        targetRaHours,
        targetDecDeg,
        commandRaHours,
        commandDecDeg
    );

    var resultPath = waitForResult(requestId);

    return loadAndValidateResult(
        resultPath,
        requestId,
        targetRaHours * 15.0,
        targetDecDeg
    );
}

function printResult(label, result)
{
    log("");
    log(label);
    log(
        "  Solved center: RA=" +
        Number(result.center_ra_deg).toFixed(8) +
        " deg  Dec=" +
        Number(result.center_dec_deg).toFixed(8) +
        " deg"
    );
    log(
        "  RA sky error = " +
        Number(result.dra_sky_arcsec).toFixed(2) +
        " arcsec"
    );
    log(
        "  Dec error    = " +
        Number(result.ddec_arcsec).toFixed(2) +
        " arcsec"
    );
    log(
        "  Total error  = " +
        Number(result.total_error_arcsec).toFixed(2) +
        " arcsec"
    );
}


// =====================================================================
// REUSABLE SWIR CENTERING SEQUENCE
// =====================================================================

function centerSWIRTarget(
    runId,
    requestTag,
    targetRaHours,
    targetDecDeg,
    startingCommandRaHours,
    startingCommandDecDeg)
{
    var currentCommandRaHours = startingCommandRaHours;
    var currentCommandDecDeg = startingCommandDecDeg;

    var previousError = null;
    var correctiveSlewsMade = 0;
    var maxSolves = Number(MAX_CORRECTIVE_SLEWS) + 1;

    var safeTag = sanitizeName(requestTag);

    for (var solveNumber = 1; solveNumber <= maxSolves; solveNumber++)
    {
        var requestId =
            runId + "_" + safeTag + "_" + pad2(solveNumber);

        log("");
        log("------------------------------------------------------------");
        log(
            "SWIR CENTER " + requestTag +
            " - solve " + solveNumber + "/" + maxSolves +
            "  (corrective slews made: " + correctiveSlewsMade +
            "/" + MAX_CORRECTIVE_SLEWS + ")"
        );
        log("------------------------------------------------------------");
        log("Requesting automated SWIR pointing exposure.");

        var result = acquireAndSolve(
            requestId,
            solveNumber,
            runId,
            targetRaHours,
            targetDecDeg,
            currentCommandRaHours,
            currentCommandDecDeg
        );

        printResult(
            "SWIR CENTER " + requestTag +
            " - SOLVE " + solveNumber + " RESULT",
            result
        );

        var error = Number(result.total_error_arcsec);

        if (error <= SUCCESS_TOLERANCE_ARCSEC)
        {
            log("");
            log("============================================================");
            log(
                "CENTERING SUCCESS: residual " +
                error.toFixed(2) +
                " arcsec is within " +
                SUCCESS_TOLERANCE_ARCSEC.toFixed(2) +
                " arcsec tolerance."
            );
            log("Corrective slews used: " + correctiveSlewsMade);
            log("Total SWIR solves used: " + solveNumber);
            log("============================================================");

            return {
                ra: currentCommandRaHours,
                dec: currentCommandDecDeg
            };
        }

        if (previousError != null &&
            error > previousError * DIVERGENCE_FACTOR &&
            (error - previousError) > DIVERGENCE_MIN_INCREASE_ARCSEC)
        {
            throw new Error(
                "Pointing appears to be diverging during " + requestTag +
                ". Previous error=" +
                previousError.toFixed(2) +
                " arcsec, current error=" +
                error.toFixed(2) +
                " arcsec. No further corrective slew will be attempted."
            );
        }

        if (correctiveSlewsMade >= MAX_CORRECTIVE_SLEWS)
        {
            throw new Error(
                "Pointing did not converge during " + requestTag +
                " within " +
                SUCCESS_TOLERANCE_ARCSEC.toFixed(2) +
                " arcsec after " +
                correctiveSlewsMade +
                " corrective slew(s) and " +
                solveNumber +
                " solve(s). Final error=" +
                error.toFixed(2) +
                " arcsec."
            );
        }

        if (error > MAX_CORRECTION_ARCSEC)
        {
            throw new Error(
                "Correction rejected during " + requestTag +
                ": error " +
                error.toFixed(2) +
                " arcsec exceeds " +
                MAX_CORRECTION_ARCSEC.toFixed(2) +
                " arcsec safety limit."
            );
        }

        // Apply the correction to the LAST COMMAND, not the solved image center.
        var correctedRaDeg =
            currentCommandRaHours * 15.0 +
            Number(result.dra_coord_deg);

        var correctedDecDeg =
            currentCommandDecDeg +
            Number(result.ddec_deg);

        correctedRaDeg = wrapRaDeg(correctedRaDeg);

        var correctedRaHours = correctedRaDeg / 15.0;

        if (!isValidRaHoursDecDeg(correctedRaHours, correctedDecDeg))
        {
            throw new Error(
                "Calculated corrected coordinates are invalid during " +
                requestTag + "."
            );
        }

        log("");
        log(
            "Applying corrective slew " +
            (correctiveSlewsMade + 1) +
            "/" + MAX_CORRECTIVE_SLEWS + "."
        );
        log(
            "  Previous command: RA " +
            formatRA(currentCommandRaHours) +
            "  Dec " +
            formatDec(currentCommandDecDeg)
        );
        log(
            "  Correction: RA sky " +
            Number(result.dra_sky_arcsec).toFixed(2) +
            " arcsec, Dec " +
            Number(result.ddec_arcsec).toFixed(2) +
            " arcsec"
        );
        log(
            "  New command: RA " +
            formatRA(correctedRaHours) +
            "  Dec " +
            formatDec(correctedDecDeg)
        );

        if (!gotoRADec(correctedRaHours, correctedDecDeg))
            throw new Error("Corrective gotoRADec() failed during " + requestTag + ".");

        previousError = error;
        correctiveSlewsMade++;

        currentCommandRaHours = correctedRaHours;
        currentCommandDecDeg = correctedDecDeg;

        Util.WaitForMilliseconds(SETTLE_AFTER_SLEW_MS);
    }

    throw new Error(
        "Unexpected exit from iterative centering loop during " +
        requestTag + "."
    );
}


// =====================================================================
// EXPLICIT PIER-FLIP CONTROL
// =====================================================================

function pierSideName(side)
{
    side = Number(side);

    if (side == 0) return "pierEast / Normal";
    if (side == 1) return "pierWest / Through-the-pole";
    if (side == -1) return "pierUnknown";

    return "Unknown(" + side + ")";
}


function getCurrentPierSide()
{
    if (!Telescope.Connected)
        throw new Error("Cannot read SideOfPier: telescope is not connected.");

    var side;

    try
    {
        side = Number(Telescope.SideOfPier);
    }
    catch (e)
    {
        throw new Error(
            "Could not read Telescope.SideOfPier: " + errText(e)
        );
    }

    if (side != 0 && side != 1)
    {
        throw new Error(
            "Telescope.SideOfPier returned an unknown value: " + side
        );
    }

    return side;
}


function getDestinationPierSide(raJ2000, decJ2000)
{
    var mountCoords = getMountCoordinates(raJ2000, decJ2000);
    var side;

    try
    {
        side = Number(
            Telescope.DestinationSideOfPier(
                mountCoords.ra,
                mountCoords.dec
            )
        );
    }
    catch (e)
    {
        throw new Error(
            "DestinationSideOfPier() failed. " +
            "RunPOET will not risk an uncontrolled pier flip. " +
            errText(e)
        );
    }

    if (side != 0 && side != 1)
    {
        throw new Error(
            "DestinationSideOfPier() returned an unknown value: " + side
        );
    }

    return side;
}


function performPierFlipIfRequired(
    scienceRaHours,
    scienceDecDeg,
    context)
{
    if (!HANDLE_PIER_FLIPS)
        return false;

    var currentSide = getCurrentPierSide();
    var destinationSide =
        getDestinationPierSide(scienceRaHours, scienceDecDeg);

    log("");
    log("PIER-SIDE CHECK: " + context);
    log("  Current side     : " + pierSideName(currentSide));
    log("  Destination side : " + pierSideName(destinationSide));

    if (destinationSide == currentSide)
    {
        log("  No pier flip required.");
        return false;
    }

    log("");
    log("============================================================");
    log("PIER FLIP REQUIRED");
    log("============================================================");
    log("Context            : " + context);
    log("Current side       : " + pierSideName(currentSide));
    log("Expected new side  : " + pierSideName(destinationSide));
    log("Triggering deliberate same-target slew now.");

    // The AP driver decides the mechanical path. Because
    // DestinationSideOfPier() predicts the opposite pointing state,
    // this same-target GoTo is intentionally the command that performs
    // the flip rather than allowing a later background/return slew to
    // trigger it unexpectedly.
    if (!gotoRADec(scienceRaHours, scienceDecDeg))
    {
        throw new Error(
            "Deliberate pier-flip gotoRADec() failed during " + context + "."
        );
    }

    Util.WaitForMilliseconds(SETTLE_AFTER_SLEW_MS);

    var newSide = getCurrentPierSide();

    log("  Side after slew   : " + pierSideName(newSide));

    if (newSide == currentSide)
    {
        throw new Error(
            "Pier flip was expected during " + context +
            " but Telescope.SideOfPier did not change."
        );
    }

    if (newSide != destinationSide)
    {
        throw new Error(
            "Pier flip verification mismatch during " + context +
            ". Expected " + pierSideName(destinationSide) +
            ", got " + pierSideName(newSide) + "."
        );
    }

    log("PIER FLIP VERIFIED.");
    log("============================================================");

    return true;
}


function handlePierFlipAndRecenterIfNeeded(
    runId,
    flipNumber,
    targetRaHours,
    targetDecDeg,
    currentCommandRaHours,
    currentCommandDecDeg,
    context)
{
    var flipped = performPierFlipIfRequired(
        currentCommandRaHours,
        currentCommandDecDeg,
        context
    );

    if (!flipped)
    {
        return {
            flipped: false,
            nextFlipNumber: flipNumber,
            ra: currentCommandRaHours,
            dec: currentCommandDecDeg
        };
    }

    log("");
    log("Pier flip complete. Re-centering with SWIR before continuing.");

    var centered = centerSWIRTarget(
        runId,
        "flip" + pad2(flipNumber),
        targetRaHours,
        targetDecDeg,
        currentCommandRaHours,
        currentCommandDecDeg
    );

    return {
        flipped: true,
        nextFlipNumber: flipNumber + 1,
        ra: centered.ra,
        dec: centered.dec
    };
}


// =====================================================================
// MAIN POET OBSERVING SEQUENCE
// =====================================================================

function runPOET()
{
    ensureFolder(SHARED_ROOT);
    ensureFolder(REQUEST_DIR);
    ensureFolder(RESULT_DIR);

    var targetRaHours = parseRAHMS(TARGET_RA_HMS);
    var targetDecDeg = parseDecDMS(TARGET_DEC_DMS);

    if (!isValidRaHoursDecDeg(targetRaHours, targetDecDeg))
        throw new Error("Target coordinates are invalid.");

    if (!isFinite(Number(POINTING_EXPOSURE_MS)) ||
        Number(POINTING_EXPOSURE_MS) <= 0)
    {
        throw new Error("POINTING_EXPOSURE_MS must be positive.");
    }

    if (!isFinite(Number(POINTING_GAIN)))
        throw new Error("POINTING_GAIN must be finite.");

    if (!isFinite(Number(POINTING_TEC_C)))
        throw new Error("POINTING_TEC_C must be finite.");

    if (!isFinite(Number(SCIENCE_EXPOSURE_MS)) ||
        Number(SCIENCE_EXPOSURE_MS) <= 0)
    {
        throw new Error("SCIENCE_EXPOSURE_MS must be positive.");
    }

    if (!isFinite(Number(SCIENCE_GAIN)))
        throw new Error("SCIENCE_GAIN must be finite.");

    if (!isFinite(Number(SCIENCE_TEC_C)))
        throw new Error("SCIENCE_TEC_C must be finite.");

    if (!isFinite(Number(TOTAL_SCIENCE_MINUTES)) ||
        Number(TOTAL_SCIENCE_MINUTES) <= 0)
    {
        throw new Error("TOTAL_SCIENCE_MINUTES must be positive.");
    }

    if (!isFinite(Number(BACKGROUND_INTERVAL_MINUTES)) ||
        Number(BACKGROUND_INTERVAL_MINUTES) <= 0)
    {
        throw new Error("BACKGROUND_INTERVAL_MINUTES must be positive.");
    }

    if (!isFinite(Number(MAX_CORRECTIVE_SLEWS)) ||
        Number(MAX_CORRECTIVE_SLEWS) < 0 ||
        Math.floor(Number(MAX_CORRECTIVE_SLEWS)) != Number(MAX_CORRECTIVE_SLEWS))
    {
        throw new Error("MAX_CORRECTIVE_SLEWS must be a non-negative integer.");
    }

    if (!isFinite(Number(DIVERGENCE_FACTOR)) ||
        Number(DIVERGENCE_FACTOR) <= 1.0)
    {
        throw new Error("DIVERGENCE_FACTOR must be greater than 1.0.");
    }

    if (!isFinite(Number(DIVERGENCE_MIN_INCREASE_ARCSEC)) ||
        Number(DIVERGENCE_MIN_INCREASE_ARCSEC) < 0.0)
    {
        throw new Error(
            "DIVERGENCE_MIN_INCREASE_ARCSEC must be non-negative."
        );
    }

    var runId = makeRunId();

    var currentCommandRaHours = targetRaHours;
    var currentCommandDecDeg = targetDecDeg;

    log("============================================================");
    log("RUNPOET: CENTER + SCIENCE + BACKGROUND + PIER-FLIP CONTROL");
    log("============================================================");
    log("Run ID      : " + runId);
    log("Target      : " + TARGET_NAME);
    log("Target RA   : " + TARGET_RA_HMS + " J2000");
    log("Target Dec  : " + TARGET_DEC_DMS + " J2000");
    log("Exposure    : " + POINTING_EXPOSURE_MS + " ms");
    log("Gain        : " + POINTING_GAIN);
    log("TEC         : " + POINTING_TEC_C + " C");
    log("Tolerance   : " + SUCCESS_TOLERANCE_ARCSEC + " arcsec");
    log("Max correction per iteration: " + MAX_CORRECTION_ARCSEC + " arcsec");
    log("Max corrective slews: " + MAX_CORRECTIVE_SLEWS);
    log("Science exposure: " + SCIENCE_EXPOSURE_MS + " ms");
    log("Science gain    : " + SCIENCE_GAIN);
    log("Science TEC     : " + SCIENCE_TEC_C + " C");
    log("Total science   : " + TOTAL_SCIENCE_MINUTES + " min");
    log("Background every: " + BACKGROUND_INTERVAL_MINUTES + " min science");
    log("Frames/block    : " + getScienceFramesPerBlock());
    log("Total frames    : " + getTotalScienceFrames());
    log("Pier flips      : " + (HANDLE_PIER_FLIPS ? "EXPLICIT" : "DISABLED"));
    log("");

    // --------------------------------------------------------------
    // 1) Initial nominal slew and SWIR centering.
    // --------------------------------------------------------------

    log("STEP 1: Initial slew to nominal target.");

    if (!gotoRADec(currentCommandRaHours, currentCommandDecDeg))
        throw new Error("Initial gotoRADec() failed.");

    Util.WaitForMilliseconds(SETTLE_AFTER_SLEW_MS);

    var centered = centerSWIRTarget(
        runId,
        "initial",
        targetRaHours,
        targetDecDeg,
        currentCommandRaHours,
        currentCommandDecDeg
    );

    currentCommandRaHours = centered.ra;
    currentCommandDecDeg = centered.dec;

    // --------------------------------------------------------------
    // 2) Repeated finite science blocks with background visits.
    //    Pier flips are checked explicitly at all transitions where
    //    a later GoTo could otherwise cause a surprise flip.
    // --------------------------------------------------------------

    var totalScienceFrames = getTotalScienceFrames();
    var framesPerBlock = getScienceFramesPerBlock();
    var framesRemaining = totalScienceFrames;

    var blockNumber = 1;
    var backgroundVisit = 1;
    var flipNumber = 1;

    while (framesRemaining > 0)
    {
        // ----------------------------------------------------------
        // Before science: if a same-target GoTo would now change
        // pointing state, perform that flip deliberately and recenter.
        // ----------------------------------------------------------

        var flipState = handlePierFlipAndRecenterIfNeeded(
            runId,
            flipNumber,
            targetRaHours,
            targetDecDeg,
            currentCommandRaHours,
            currentCommandDecDeg,
            "before science block " + blockNumber
        );

        currentCommandRaHours = flipState.ra;
        currentCommandDecDeg = flipState.dec;
        flipNumber = flipState.nextFlipNumber;

        var framesThisBlock =
            Math.min(framesPerBlock, framesRemaining);

        log("");
        log("============================================================");
        log("SCIENCE BLOCK " + blockNumber);
        log("Frames this block : " + framesThisBlock);
        log("Frames remaining before block: " + framesRemaining);
        log("============================================================");

        runScienceBlock(
            runId,
            blockNumber,
            framesThisBlock
        );

        framesRemaining -= framesThisBlock;

        // ----------------------------------------------------------
        // Science may have tracked through the AP driver's flip
        // threshold. Check BEFORE the first background slew so the
        // background motion cannot accidentally be the flip trigger.
        // ----------------------------------------------------------

        flipState = handlePierFlipAndRecenterIfNeeded(
            runId,
            flipNumber,
            targetRaHours,
            targetDecDeg,
            currentCommandRaHours,
            currentCommandDecDeg,
            "after science block " + blockNumber +
            ", before background visit " + backgroundVisit
        );

        currentCommandRaHours = flipState.ra;
        currentCommandDecDeg = flipState.dec;
        flipNumber = flipState.nextFlipNumber;

        // ----------------------------------------------------------
        // Background visit.
        // ----------------------------------------------------------

        var backgroundPierFlipOccurred = runBackgroundSequence(
            runId,
            backgroundVisit,
            currentCommandRaHours,
            currentCommandDecDeg
        );

        // ----------------------------------------------------------
        // If more science remains, return to the final corrected
        // science coordinates. Check the intended return first; if
        // a flip would trigger during the background visit, the explicit
        // flip routine itself performs the return slew and then recenters.
        // ----------------------------------------------------------

        if (framesRemaining > 0)
        {
            flipState = handlePierFlipAndRecenterIfNeeded(
                runId,
                flipNumber,
                targetRaHours,
                targetDecDeg,
                currentCommandRaHours,
                currentCommandDecDeg,
                "return to science after background visit " + backgroundVisit
            );

            currentCommandRaHours = flipState.ra;
            currentCommandDecDeg = flipState.dec;
            flipNumber = flipState.nextFlipNumber;

            if (!flipState.flipped)
            {
                log("");
                log("Returning to centered science position...");

                var pierSideBeforeReturn = null;

                if (HANDLE_PIER_FLIPS)
                    pierSideBeforeReturn = getCurrentPierSide();

                if (!gotoRADec(
                    currentCommandRaHours,
                    currentCommandDecDeg))
                {
                    throw new Error(
                        "Failed to return to science target after background visit."
                    );
                }

                if (HANDLE_PIER_FLIPS &&
                    getCurrentPierSide() != pierSideBeforeReturn)
                {
                    throw new Error(
                        "Unexpected pier flip while returning from background visit " +
                        backgroundVisit + "."
                    );
                }

                Util.WaitForMilliseconds(SETTLE_AFTER_SLEW_MS);
                log("Returned to science position.");

                // If any background dither caused a flip,
                // recenter SWIR before beginning more science.
                if (backgroundPierFlipOccurred)
                {
                    log("Background visit included a pier flip.");
                    log("Re-centering SWIR before next science block.");

                    centered = centerSWIRTarget(
                        runId,
                        "background_return" + pad2(backgroundVisit),
                        targetRaHours,
                        targetDecDeg,
                        currentCommandRaHours,
                        currentCommandDecDeg
                    );

                    currentCommandRaHours = centered.ra;
                    currentCommandDecDeg = centered.dec;
                }
            }
            else
            {
                log(
                    "Pier flip + SWIR recenter already returned the telescope " +
                    "to the science field."
                );
            }
        }

        blockNumber++;
        backgroundVisit++;
    }

    // All requested on-target science and the final background visit
    // have completed successfully.
    parkTelescope();

    log("");
    log("============================================================");
    log("RUNPOET COMPLETE");
    log("Pointing + science + background sequence completed.");
    log("Telescope parked.");
    log("============================================================");
}


// =====================================================================
// ACP ENTRY POINT
//
// Catch everything here so an external camera/solver failure is reported
// cleanly instead of intentionally re-throwing an unhandled script error.
// =====================================================================

function main()
{
    try
    {
        runPOET();
    }
    catch (e)
    {
        log("");
        log("============================================================");
        log("RUNPOET FAILED");
        log(errText(e));
        log("Attempting emergency telescope park...");
        log("============================================================");

        try
        {
            parkTelescope();
        }
        catch (parkError)
        {
            log("");
            log("============================================================");
            log("ERROR: TELESCOPE PARK ALSO FAILED");
            log(errText(parkError));
            log("MANUAL INTERVENTION REQUIRED.");
            log("============================================================");
        }
    }
}
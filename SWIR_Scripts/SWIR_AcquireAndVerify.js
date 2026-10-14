// SWIR_AcquireAndVerify.js
//
// SUPERVISED FIRST LIVE TEST
//
// Workflow:
//   1) Human edits target/settings below and runs this script in ACP.
//   2) ACP slews to the nominal J2000 target using gotoRADec().
//   3) ACP writes a capture request into D:\SWIR_Pointing\requests.
//   4) POET camera watcher sees the request and acquires the SWIR FITS.
//   5) REDBIRD solve watcher plate-solves it and writes a result JSON.
//   6) ACP reads the result.
//   7) If outside tolerance, ACP performs EXACTLY ONE corrective slew.
//   8) ACP requests a second automated SWIR exposure and solve.
//   9) ACP reports the residual and STOPS. No second corrective slew.
//
// This is deliberately NOT the final multi-iteration centering loop.

// =====================================================================
// HUMAN-EDITABLE SETTINGS
// =====================================================================

var TARGET_NAME = "NGC869";

// J2000 / ICRS target coordinates
var TARGET_RA_HMS  = "02:20:54.9";
var TARGET_DEC_DMS = "+57:14:28.3";

var POINTING_EXPOSURE_MS = 15000;
var POINTING_GAIN = 1.5;
var POINTING_TEC_C = -15.0;

// Shared folder as seen locally on REDBIRD.
var SHARED_ROOT = "D:\\SWIR_Pointing";
var REQUEST_DIR = SHARED_ROOT + "\\requests";
var RESULT_DIR  = SHARED_ROOT + "\\results";

// Pointing/safety settings
var SUCCESS_TOLERANCE_ARCSEC = 15.0;
var MAX_CORRECTION_ARCSEC = 3600.0;       // 1 degree
var TARGET_MATCH_TOLERANCE_ARCSEC = 1.0;  // result must match requested target
var RESULT_TIMEOUT_MS = 10 * 60 * 1000;   // 10 minutes
var POLL_MS = 500;
var SETTLE_AFTER_SLEW_MS = 5000;

// Same coordinate behavior as current RunColibri.
var USE_TOPOCENTRIC_SLEWS = true;
var ELEVATION_LIMIT_DEG = 10.0;
var MAX_SLEW_ATTEMPTS = 10;


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
// gotoRADec - SAFE STANDALONE VERSION FOR THIS SUPERVISED TEST
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
// TEST SEQUENCE
// =====================================================================

function runTest()
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
    {
        throw new Error("POINTING_GAIN must be finite.");
    }

    if (!isFinite(Number(POINTING_TEC_C)))
    {
        throw new Error("POINTING_TEC_C must be finite.");
    }

    var runId = makeRunId();

    var firstId  = runId + "_01";
    var secondId = runId + "_02";

    var currentCommandRaHours = targetRaHours;
    var currentCommandDecDeg = targetDecDeg;

    log("============================================================");
    log("SWIR SUPERVISED ACQUIRE + ONE-CORRECTION TEST");
    log("============================================================");
    log("Run ID      : " + runId);
    log("Target      : " + TARGET_NAME);
    log("Target RA   : " + TARGET_RA_HMS + " J2000");
    log("Target Dec  : " + TARGET_DEC_DMS + " J2000");
    log("Exposure    : " + POINTING_EXPOSURE_MS + " ms");
    log("Gain        : " + POINTING_GAIN);
    log("TEC         : " + POINTING_TEC_C + " C");
    log("Tolerance   : " + SUCCESS_TOLERANCE_ARCSEC + " arcsec");
    log("");
    log("This test allows at most ONE corrective slew.");
    log("");

    // --------------------------------------------------------------
    // 1) Initial nominal slew
    // --------------------------------------------------------------

    log("STEP 1: Initial slew to nominal target.");

    if (!gotoRADec(currentCommandRaHours, currentCommandDecDeg))
        throw new Error("Initial gotoRADec() failed.");

    Util.WaitForMilliseconds(SETTLE_AFTER_SLEW_MS);

    // --------------------------------------------------------------
    // 2) Automated capture + first solve
    // --------------------------------------------------------------

    log("");
    log("STEP 2: Requesting first automated SWIR pointing exposure.");

    var first = acquireAndSolve(
        firstId,
        1,
        runId,
        targetRaHours,
        targetDecDeg,
        currentCommandRaHours,
        currentCommandDecDeg
    );

    printResult("FIRST SWIR SOLVE", first);

    var firstError = Number(first.total_error_arcsec);

    // --------------------------------------------------------------
    // If already centered, don't manufacture a corrective slew.
    // We still request a second automated exposure so the camera
    // request/capture path is exercised twice.
    // --------------------------------------------------------------

    if (firstError <= SUCCESS_TOLERANCE_ARCSEC)
    {
        log("");
        log(
            "Initial pointing is already within tolerance. " +
            "No corrective slew will be made."
        );

        log("");
        log("STEP 3: Requesting verification exposure without a slew.");

        var alreadyCentered = acquireAndSolve(
            secondId,
            2,
            runId,
            targetRaHours,
            targetDecDeg,
            currentCommandRaHours,
            currentCommandDecDeg
        );

        printResult("VERIFICATION SWIR SOLVE", alreadyCentered);

        log("");
        log("TEST COMPLETE.");
        log("Camera automation was exercised twice.");
        log("Corrective-slew path was not exercised because it was unnecessary.");
        return;
    }

    if (firstError > MAX_CORRECTION_ARCSEC)
    {
        throw new Error(
            "First correction rejected: error " +
            firstError.toFixed(2) +
            " arcsec exceeds " +
            MAX_CORRECTION_ARCSEC.toFixed(2) +
            " arcsec safety limit."
        );
    }

    // --------------------------------------------------------------
    // 3) Calculate corrected command from the LAST COMMAND,
    //    not from the solved center.
    // --------------------------------------------------------------

    var correctedRaDeg =
        currentCommandRaHours * 15.0 +
        Number(first.dra_coord_deg);

    var correctedDecDeg =
        currentCommandDecDeg +
        Number(first.ddec_deg);

    correctedRaDeg = wrapRaDeg(correctedRaDeg);

    var correctedRaHours =
        correctedRaDeg / 15.0;

    if (!isValidRaHoursDecDeg(correctedRaHours, correctedDecDeg))
    {
        throw new Error(
            "Calculated corrected coordinates are invalid."
        );
    }

    log("");
    log("STEP 3: Applying ONE corrective slew.");
    log(
        "  Previous command: RA " +
        formatRA(currentCommandRaHours) +
        "  Dec " +
        formatDec(currentCommandDecDeg)
    );
    log(
        "  Correction: RA sky " +
        Number(first.dra_sky_arcsec).toFixed(2) +
        " arcsec, Dec " +
        Number(first.ddec_arcsec).toFixed(2) +
        " arcsec"
    );
    log(
        "  New command: RA " +
        formatRA(correctedRaHours) +
        "  Dec " +
        formatDec(correctedDecDeg)
    );

    if (!gotoRADec(correctedRaHours, correctedDecDeg))
        throw new Error("Corrective gotoRADec() failed.");

    currentCommandRaHours = correctedRaHours;
    currentCommandDecDeg = correctedDecDeg;

    Util.WaitForMilliseconds(SETTLE_AFTER_SLEW_MS);

    // --------------------------------------------------------------
    // 4) Automated verification exposure + solve
    // --------------------------------------------------------------

    log("");
    log("STEP 4: Requesting automated verification exposure.");

    var second = acquireAndSolve(
        secondId,
        2,
        runId,
        targetRaHours,
        targetDecDeg,
        currentCommandRaHours,
        currentCommandDecDeg
    );

    printResult("POST-CORRECTION SWIR SOLVE", second);

    var secondError = Number(second.total_error_arcsec);

    log("");
    log("============================================================");

    if (secondError <= SUCCESS_TOLERANCE_ARCSEC)
    {
        log(
            "SUCCESS: residual " +
            secondError.toFixed(2) +
            " arcsec is within " +
            SUCCESS_TOLERANCE_ARCSEC.toFixed(2) +
            " arcsec tolerance."
        );
    }
    else
    {
        log(
            "TEST COMPLETE: residual is still " +
            secondError.toFixed(2) +
            " arcsec."
        );
        log(
            "NO SECOND CORRECTIVE SLEW WILL BE MADE IN THIS TEST VERSION."
        );
    }

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
        runTest();
    }
    catch (e)
    {
        log("");
        log("============================================================");
        log("SWIR TEST ABORTED");
        log(errText(e));
        log("No further SWIR slew will be attempted by this script.");
        log("============================================================");
    }
}

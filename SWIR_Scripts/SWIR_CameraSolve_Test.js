// SWIR_CameraSolve_Test.js
//
// Tests:
//
// ACP request
// -> POET camera watcher
// -> student's camera CLI
// -> FITS transfer
// -> REDBIRD Astrometry.net
// -> result returned to ACP
//
// NO TELESCOPE MOVEMENT.

// ============================================================
// TEST SETTINGS
// ============================================================

var TARGET_NAME = "NGC869";

var TARGET_RA_HMS  = "02:20:54.9";
var TARGET_DEC_DMS = "+57:14:28.3";

var EXPOSURE_MS = 15000;
var GAIN = 1.5;
var TEC_C = -15;

var SHARED_ROOT = "D:\\SWIR_Pointing";

var REQUEST_DIR =
    SHARED_ROOT + "\\requests";

var RESULT_DIR =
    SHARED_ROOT + "\\results";

// Give the whole camera + solver chain up to x * minutes.
var TIMEOUT_MS = 10 * 60 * 1000;

var POLL_MS = 500;


// ============================================================
// HELPERS
// ============================================================

function log(msg)
{
    Console.PrintLine(msg);
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


function makeRequestId()
{
    var d = new Date();

    return "camera_test_" +
        d.getUTCFullYear() +
        pad2(d.getUTCMonth() + 1) +
        pad2(d.getUTCDate()) +
        "_" +
        pad2(d.getUTCHours()) +
        pad2(d.getUTCMinutes()) +
        pad2(d.getUTCSeconds()) +
        pad3(d.getUTCMilliseconds());
}


function parseRAHMS(text)
{
    var p = text.split(":");

    if (p.length != 3)
        throw new Error("Invalid RA: " + text);

    var h = Number(p[0]);
    var m = Number(p[1]);
    var s = Number(p[2]);

    return h +
        m / 60.0 +
        s / 3600.0;
}


function parseDecDMS(text)
{
    var raw = String(text);

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
        throw new Error(
            "Invalid Dec: " + text
        );

    var d = Number(p[0]);
    var m = Number(p[1]);
    var s = Number(p[2]);

    return sign *
        (
            d +
            m / 60.0 +
            s / 3600.0
        );
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
    var fso =
        new ActiveXObject(
            "Scripting.FileSystemObject"
        );

    var f =
        fso.OpenTextFile(
            path,
            1,
            false
        );

    var text =
        f.ReadAll();

    f.Close();

    return text;
}


function parseJson(text)
{
    return eval("(" + text + ")");
}


// ============================================================
// WRITE CAMERA REQUEST
// ============================================================

function writeRequest(
    requestId,
    targetRaHours,
    targetDecDeg)
{
    var fso =
        new ActiveXObject(
            "Scripting.FileSystemObject"
        );

    var finalPath =
        REQUEST_DIR +
        "\\" +
        requestId +
        ".json";

    var tempPath =
        finalPath +
        ".part";

    var targetRaDeg =
        targetRaHours * 15.0;

    var json =
        "{\r\n" +

        '  "id": "' +
        jsonEscape(requestId) +
        '",\r\n' +

        '  "target_name": "' +
        jsonEscape(TARGET_NAME) +
        '",\r\n' +

        '  "target_ra": "' +
        jsonEscape(TARGET_RA_HMS) +
        '",\r\n' +

        '  "target_dec": "' +
        jsonEscape(TARGET_DEC_DMS) +
        '",\r\n' +

        '  "target_ra_deg": ' +
        targetRaDeg.toFixed(12) +
        ',\r\n' +

        '  "target_dec_deg": ' +
        targetDecDeg.toFixed(12) +
        ',\r\n' +

        '  "exposure_ms": ' +
        EXPOSURE_MS +
        ',\r\n' +

        '  "gain": ' +
        GAIN +
        ',\r\n' +

        '  "tec_c": ' +
        TEC_C +
        '\r\n' +

        "}\r\n";

    var f =
        fso.CreateTextFile(
            tempPath,
            true
        );

    f.Write(json);

    f.Close();

    // Atomic finalization.
    fso.MoveFile(
        tempPath,
        finalPath
    );

    log(
        "Request written:"
    );

    log(
        finalPath
    );
}


// ============================================================
// WAIT FOR CAMERA / SOLVER
// ============================================================

function waitForOutcome(requestId)
{
    var fso =
        new ActiveXObject(
            "Scripting.FileSystemObject"
        );

    var resultPath =
        RESULT_DIR +
        "\\" +
        requestId +
        ".json";

    var cameraFailPath =
        REQUEST_DIR +
        "\\" +
        requestId +
        ".camera_failed";

    var start =
        new Date().getTime();

    var lastMessage =
        start;

    while (true)
    {
        // ----------------------------------------------------
        // CAMERA FAILURE
        // ----------------------------------------------------

        if (
            fso.FileExists(
                cameraFailPath
            )
        )
        {
            log("");
            log(
                "CAMERA ACQUISITION FAILED"
            );

            log(
                "-------------------------"
            );

            log(
                readTextFile(
                    cameraFailPath
                )
            );

            return;
        }

        // ----------------------------------------------------
        // SOLVER RETURNED SOMETHING
        // ----------------------------------------------------

        if (
            fso.FileExists(
                resultPath
            )
        )
        {
            var result =
                parseJson(
                    readTextFile(
                        resultPath
                    )
                );

            log("");
            log(
                "RESULT RECEIVED"
            );

            log(
                "---------------"
            );

            if (
                result.solved === true
            )
            {
                log(
                    "PLATE SOLVE SUCCESS"
                );

                log(
                    "Center RA: " +
                    Number(
                        result.center_ra_deg
                    ).toFixed(8) +
                    " deg"
                );

                log(
                    "Center Dec: " +
                    Number(
                        result.center_dec_deg
                    ).toFixed(8) +
                    " deg"
                );

                log(
                    "Total error: " +
                    Number(
                        result.total_error_arcsec
                    ).toFixed(2) +
                    " arcsec"
                );
            }
            else
            {
                log(
                    "PLATE SOLVE FAILED"
                );

                if (result.error)
                {
                    log(
                        "Reason: " +
                        result.error
                    );
                }
            }

            return;
        }

        // ----------------------------------------------------
        // TIMEOUT
        // ----------------------------------------------------

        var now =
            new Date().getTime();

        if (
            now - start >
            TIMEOUT_MS
        )
        {
            log("");
            log(
                "TIMEOUT"
            );

            log(
                "No result or camera-failure marker "
                + "was received."
            );

            return;
        }

        // Print something every 10 seconds so ACP
        // doesn't look frozen.

        if (
            now - lastMessage >
            10000
        )
        {
            log(
                "Still waiting... " +
                Math.round(
                    (now - start) /
                    1000
                ) +
                " s"
            );

            lastMessage = now;
        }

        Util.WaitForMilliseconds(
            POLL_MS
        );
    }
}


// ============================================================
// MAIN
// ============================================================

function main()
{
    try
    {
        log(
            "=============================================="
        );

        log(
            "SWIR CAMERA + ASTROMETRY TEST"
        );

        log(
            "=============================================="
        );

        log(
            "NO TELESCOPE MOVEMENT WILL OCCUR."
        );

        log("");

        var targetRaHours =
            parseRAHMS(
                TARGET_RA_HMS
            );

        var targetDecDeg =
            parseDecDMS(
                TARGET_DEC_DMS
            );

        var requestId =
            makeRequestId();

        log(
            "Request ID: " +
            requestId
        );

        log(
            "Exposure: " +
            EXPOSURE_MS +
            " ms"
        );

        log(
            "Gain: " +
            GAIN
        );

        log(
            "TEC: " +
            TEC_C +
            " C"
        );

        log("");

        writeRequest(
            requestId,
            targetRaHours,
            targetDecDeg
        );

        log("");
        log(
            "Waiting for POET camera and REDBIRD solver..."
        );

        waitForOutcome(
            requestId
        );

        log("");
        log(
            "TEST FINISHED"
        );

        log(
            "=============================================="
        );
    }
    catch (e)
    {
        log("");
        log(
            "TEST SCRIPT ERROR"
        );

        log(
            e.message ||
            e.description ||
            e
        );
    }
}
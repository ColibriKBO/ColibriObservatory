// Example ACP/JScript helper for integrating PyFocus_ColibriGrab.py into RunColibri.
// This is NOT a complete modification to your CURRENT RunColibri.js, because
// that current version and its weather/abort control path were not supplied.
// Do not enable unattended operation until your existing safety checks and
// abort handling have been connected and tested.
//
// Run ONLY between ColibriGrab science acquisitions and AFTER a safe telescope
// slew. This helper neither slews nor opens/closes the dome.
//
// Usage (after defining a REAL weather/dome/mount safety function):
//    var success = runColibriAutofocus(
//        "C:\\path\\to\\python.exe",
//        "C:\\path\\to\\PyFocus_ColibriGrab.py",
//        function () { return myExistingWeatherAndDomeSafetyCheck(); }
//    );
//    if (!success) { /* do not treat focus as successful */ }

function runColibriAutofocus(pythonExe, pyFocusScript, isSafeForAutofocus)
{
    if (typeof isSafeForAutofocus !== "function")
        throw new Error("A real RunColibri safety-check function is required.");
    if (!isSafeForAutofocus())
        throw new Error("Cannot start autofocus: observatory is unsafe.");
    if (isProcessRunningByName("ColibriGrab.exe"))
        throw new Error("Cannot start autofocus: ColibriGrab is still running.");

    var shell = new ActiveXObject("WScript.Shell");
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    var resultFile = "D:\\tmp\\pyfocus_autofocus_result.json";
    var stopFile = "D:\\tmp\\pyfocus_autofocus.stop";
    var proc = null;

    // D:\tmp must exist. Never permit a stale stop or result file.
    if (!fso.FolderExists("D:\\tmp"))
        throw new Error("Create D:\\tmp before using this helper.");
    if (fso.FileExists(resultFile)) fso.DeleteFile(resultFile, true);
    if (fso.FileExists(stopFile)) fso.DeleteFile(stopFile, true);

    var command = '"' + pythonExe + '" "' + pyFocusScript + '"' +
        ' --autofocus --exposure 0.025 --binning 2' +
        ' --step-size 50 --steps-each-side 3 --frames-per-position 3' +
        ' --settle-time 1 --grab-temperature -10 --grab-timeout 120' +
        ' --output-json "' + resultFile + '"' +
        ' --stop-file "' + stopFile + '"';

    function stopWorker()
    {
        if (!proc || proc.Status !== 0) return;
        var out = fso.CreateTextFile(stopFile, true);
        out.WriteLine("ACP requested cancellation");
        out.Close();
        var deadline = (new Date()).getTime() + 10000;
        while (proc.Status === 0 && (new Date()).getTime() < deadline)
            Util.WaitForMilliseconds(200);
        if (proc.Status === 0)
            shell.Run('taskkill /PID ' + proc.ProcessID + ' /T /F', 0, true);
    }

    try
    {
        Console.PrintLine("Starting ColibriGrab-based PyFocus autofocus...");
        proc = shell.Exec(command); // NONBLOCKING: ACP can continue safety checks.
        // Scope safety polling here. Integrate with your actual RunColibri
        // weather-abort and dome-close path; do not rely on this alone.
        while (proc.Status === 0)
        {
            if (!isSafeForAutofocus())
                throw new Error("Autofocus cancelled: observatory became unsafe.");
            Util.WaitForMilliseconds(250);
        }
        if (proc.ExitCode !== 0)
        {
            Console.PrintLine("PyFocus exited with error code " + proc.ExitCode);
            return false;
        }
        if (!fso.FileExists(resultFile))
        {
            Console.PrintLine("ERROR: PyFocus completed but no JSON result exists.");
            return false;
        }
        var reader = fso.OpenTextFile(resultFile, 1);
        var json = reader.ReadAll();
        reader.Close();
        // Do not use eval. Python's 0 exit code AND a success flag are required.
        if (!/"success"\s*:\s*true\b/i.test(json))
        {
            Console.PrintLine("ERROR: PyFocus did not report success.");
            return false;
        }
        Console.PrintLine("PyFocus autofocus reported success: " + resultFile);
        return true;
    }
    catch (err)
    {
        Console.PrintLine("PyFocus error: " + err.message);
        return false;
    }
    finally
    {
        // Best effort; an externally terminated ACP process may not execute
        // its finally block. This must be addressed before unattended use.
        try { stopWorker(); } catch (cleanupError) {
            Console.PrintLine("PyFocus stop failed: " + cleanupError.message);
        }
    }
}

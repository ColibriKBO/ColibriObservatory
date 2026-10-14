
// PHD2_ClosedDome_Profile_Test.js
//
// ACP/JScript test for PHD2 profile selection,
// camera/mount connection, saved calibration verification,
// and closed-dome guide-camera exposures.
//
// NO guiding, calibration, guide pulses, mount slews,
// dome opening, or telescope parking commands.
//
// Uses the working PowerShell TCP bridge.


// ============================================================
// SETTINGS
// ============================================================

var PHD2_HOST = "127.0.0.1";
var PHD2_PORT = 4400;

// Existing calibrated equipment profile.
var PHD2_PROFILE = "ASI_Guiding";

// Closed-dome camera test.
var TEST_FRAME_COUNT = 5;
var TEST_EXPOSURE_MS = 1000;
var FRAME_TIMEOUT_MS = 60000;

// Connect the equipment automatically if needed.
// This includes the Astro-Physics GTO ASCOM connection.
var AUTO_CONNECT_EQUIPMENT = true;

var MAX_TEST_RUNTIME_MS = 4 * 60 * 1000;


// ============================================================
// ACP HELPERS
// ============================================================

function printLine(msg)
{
    Console.PrintLine(String(msg));
}

function readWholeFile(fso, path)
{
    var f = fso.OpenTextFile(path, 1, false);
    var contents = f.ReadAll();
    f.Close();
    return contents;
}

function writeWholeFile(fso, path, contents)
{
    var f = fso.CreateTextFile(path, true, false);
    f.Write(contents);
    f.Close();
}

function checkSettings()
{
    if (!/^[A-Za-z0-9_ .-]+$/.test(PHD2_PROFILE))
        throw new Error("Invalid PHD2_PROFILE.");

    if (!/^[A-Za-z0-9_.:-]+$/.test(PHD2_HOST))
        throw new Error("Invalid PHD2_HOST.");

    if (!isFinite(PHD2_PORT) ||
        PHD2_PORT < 1 ||
        PHD2_PORT > 65535)
        throw new Error("Invalid PHD2_PORT.");

    if (!isFinite(TEST_FRAME_COUNT) ||
        TEST_FRAME_COUNT < 1 ||
        Math.floor(TEST_FRAME_COUNT) != TEST_FRAME_COUNT)
        throw new Error("Invalid TEST_FRAME_COUNT.");

    if (!isFinite(TEST_EXPOSURE_MS) ||
        TEST_EXPOSURE_MS < 0)
        throw new Error("Invalid TEST_EXPOSURE_MS.");
}


// ============================================================
// POWERSHELL BRIDGE
// ============================================================
//
// This helper is written automatically to a temporary .ps1
// file by ACP.
//
// It uses PHD2's JSON-RPC TCP interface.
//
// ============================================================

var HELPER_SOURCE = [

"param(",
"    [string]$PhdHost = '127.0.0.1',",
"    [int]$Port = 4400,",
"    [int]$Frames = 5,",
"    [int]$ExposureMs = 1000,",
"    [int]$CaptureTimeoutMs = 60000,",
"    [int]$AutoConnect = 1,",
"    [string]$ProfileName = 'ASI_Guiding',",
"    [string]$LogFile",
")",
"",
"$ErrorActionPreference = 'Stop'",
"",
"$script:tcp = $null",
"$script:reader = $null",
"$script:writer = $null",
"$script:rpcId = 0",
"$script:framesSeen = 0",
"$script:attemptedLoop = $false",
"$script:connectedByTest = $false",
"$script:originalProfile = $null",
"$script:profileChanged = $false",
"$script:calibrationAvailable = $null",
"$script:oldExposure = $null",
"$script:exposureChanged = $false",
"$script:failure = $null",
"$script:cleanupErrors = New-Object System.Collections.Generic.List[string]",
"$script:framesRequested = $Frames",
"",

// ------------------------------------------------------------
// LOGGING
// ------------------------------------------------------------

"function Write-Status([string]$Message) {",
"    $line = ('{0:u}  {1}' -f (Get-Date).ToUniversalTime(), $Message)",
"",
"    # Retry when ACP temporarily holds the log file open.",
"    for ($attempt = 1; $attempt -le 30; $attempt++) {",
"        try {",
"            Add-Content -LiteralPath $LogFile -Value $line -Encoding ASCII -ErrorAction Stop",
"            return",
"        }",
"        catch {",
"            if ($attempt -eq 30) {",
"                throw",
"            }",
"            Start-Sleep -Milliseconds 100",
"        }",
"    }",
"}",

// ------------------------------------------------------------
// READ JSON MESSAGES
// ------------------------------------------------------------

"function Read-PhdMessage([int]$TimeoutMs) {",
"    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)",
"",
"    while ([DateTime]::UtcNow -lt $deadline) {",
"        try {",
"            $line = $script:reader.ReadLine()",
"",
"            if ($null -eq $line) {",
"                throw 'PHD2 closed the TCP connection.'",
"            }",
"",
"            if ($line.Length -eq 0) { continue }",
"",
"            return (ConvertFrom-Json -InputObject $line)",
"        }",
"        catch [System.IO.IOException] {",
"            # A read timeout is normal.",
"            if (-not $script:tcp.Connected) {",
"                throw 'The TCP connection to PHD2 was lost.'",
"            }",
"        }",
"    }",
"",
"    return $null",
"}",
"",

// ------------------------------------------------------------
// PHD2 EVENTS
// ------------------------------------------------------------

"function Handle-PhdEvent($Message) {",
"    if ($null -eq $Message) { return }",
"    if (-not $Message.PSObject.Properties['Event']) { return }",
"",
"    switch ([string]$Message.Event) {",
"",
"        'Version' {",
"            Write-Status ('PHD2 version: ' + [string]$Message.PHDVersion)",
"        }",
"",
"        'LoopingExposures' {",
"            $script:framesSeen++",
"            Write-Status ('Frame {0}/{1} completed (PHD2 frame #{2}).' -f $script:framesSeen, $script:framesRequested, $Message.Frame)",
"        }",
"",
"        'LoopingExposuresStopped' {",
"            Write-Status 'PHD2 reports looping stopped.'",
"        }",
"",
"        'Alert' {",
"            Write-Status ('PHD2 alert: ' + [string]$Message.Msg)",
"",
"            if ([string]$Message.Type -eq 'error') {",
"                throw ('PHD2 error: ' + [string]$Message.Msg)",
"            }",
"        }",
"    }",
"}",
"",

// ------------------------------------------------------------
// JSON-RPC
// ------------------------------------------------------------

"function Invoke-Phd([string]$Method, [object[]]$Parameters = @(), [int]$TimeoutMs = 30000) {",
"",
"    $script:rpcId++",
"    $id = $script:rpcId",
"",
"    $command = @{",
"        jsonrpc = '2.0'",
"        method = $Method",
"        params = $Parameters",
"        id = $id",
"    }",
"",
"    $json = ConvertTo-Json -InputObject $command -Depth 12 -Compress",
"    $script:writer.WriteLine($json)",
"",
"    $deadline = [DateTime]::UtcNow.AddMilliseconds($TimeoutMs)",
"",
"    while ([DateTime]::UtcNow -lt $deadline) {",
"",
"        $remaining = [int][Math]::Max(1, ($deadline - [DateTime]::UtcNow).TotalMilliseconds)",
"",
"        $msg = Read-PhdMessage -TimeoutMs ([Math]::Min($remaining, 1200))",
"",
"        if ($null -eq $msg) { continue }",
"",
"        if ($msg.PSObject.Properties['id'] -and [int]$msg.id -eq $id) {",
"",
"            if ($msg.PSObject.Properties['error'] -and $null -ne $msg.error) {",
"                throw ('PHD2 ' + $Method + ' failed: ' + [string]$msg.error.message)",
"            }",
"",
"            return $msg.result",
"        }",
"",
"        Handle-PhdEvent -Message $msg",
"    }",
"",
"    throw ('Timed out awaiting PHD2 response to ' + $Method)",
"}",
"",

// ------------------------------------------------------------
// CONNECTION WAIT
// ------------------------------------------------------------

"function Wait-ForConnection([int]$MaxMs) {",
"",
"    $deadline = [DateTime]::UtcNow.AddMilliseconds($MaxMs)",
"",
"    while ([DateTime]::UtcNow -lt $deadline) {",
"",
"        if ([bool](Invoke-Phd -Method 'get_connected')) {",
"            return",
"        }",
"",
"        Start-Sleep -Milliseconds 500",
"    }",
"",
"    throw 'Equipment connection timed out.'",
"}",
"",

// ============================================================
// TEST EXECUTION
// ============================================================

"try {",
"",
"    Write-Status '=== CLOSED-DOME PHD2 PROFILE TEST ==='",
"    Write-Status ('Connecting to PHD2 at ' + $PhdHost + ':' + $Port)",
"",
"    $script:tcp = New-Object System.Net.Sockets.TcpClient",
"    $async = $script:tcp.BeginConnect($PhdHost, $Port, $null, $null)",
"",
"    try {",
"        if (-not $async.AsyncWaitHandle.WaitOne(5000)) {",
"            throw 'PHD2 TCP connection timed out.'",
"        }",
"",
"        $script:tcp.EndConnect($async)",
"    }",
"    finally {",
"        $async.AsyncWaitHandle.Close()",
"    }",
"",
"    $stream = $script:tcp.GetStream()",
"    $stream.ReadTimeout = 650",
"    $stream.WriteTimeout = 3000",
"",
"    $script:reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::UTF8)",
"    $script:writer = [System.IO.StreamWriter]::new($stream, [System.Text.UTF8Encoding]::new($false))",
"    $script:writer.NewLine = \"`r`n\"",
"    $script:writer.AutoFlush = $true",
"",

// ------------------------------------------------------------
// VERIFY IDLE STATE
// ------------------------------------------------------------

"    $initialState = [string](Invoke-Phd -Method 'get_app_state')",
"    Write-Status ('Initial PHD2 state: ' + $initialState)",
"",
"    if ($initialState -ne 'Stopped' -and $initialState -ne 'Selected') {",
"        throw ('Refusing to interrupt PHD2 state: ' + $initialState)",
"    }",
"",

// ------------------------------------------------------------
// ENUMERATE AND SELECT PROFILE
// ------------------------------------------------------------

"    $profiles = @(Invoke-Phd -Method 'get_profiles')",
"",
"    Write-Status ('Available profiles: ' + (ConvertTo-Json -InputObject $profiles -Compress -Depth 6))",
"",
"    $script:originalProfile = Invoke-Phd -Method 'get_profile'",
"",
"    Write-Status ('Original profile: ' + (ConvertTo-Json -InputObject $script:originalProfile -Compress))",
"",
"    $connectedInitially = [bool](Invoke-Phd -Method 'get_connected')",
"    $originalEquipment = Invoke-Phd -Method 'get_current_equipment'",
"    $anyDeviceInitiallyConnected = $false",
"",
"    foreach ($entry in $originalEquipment.PSObject.Properties) {",
"        $v = $entry.Value",
"",
"        if ($null -ne $v -and $v.PSObject.Properties['connected'] -and [bool]$v.connected) {",
"            $anyDeviceInitiallyConnected = $true",
"        }",
"    }",
"",
"    if ($anyDeviceInitiallyConnected -and -not $connectedInitially) {",
"        throw 'Partially connected equipment detected. Disconnect all devices manually first.'",
"    }",
"",
"    $matchingProfiles = @($profiles | Where-Object { [string]$_.name -eq $ProfileName })",
"",
"    if ($matchingProfiles.Count -ne 1) {",
"        throw ('Expected one profile named ' + $ProfileName + '; found ' + $matchingProfiles.Count)",
"    }",
"",
"    $target = $matchingProfiles[0]",
"",
"    if ([int]$script:originalProfile.id -ne [int]$target.id) {",
"",
"        if ($anyDeviceInitiallyConnected) {",
"            throw 'Cannot switch profiles while equipment is connected.'",
"        }",
"",
"        Write-Status ('Selecting profile: ' + $ProfileName)",
"",
"        $script:profileChanged = $true",
"",
"        $null = Invoke-Phd -Method 'set_profile' -Parameters @([int]$target.id)",
"    }",
"    else {",
"        Write-Status ('Requested profile already selected: ' + $ProfileName)",
"    }",
"",
"    $selected = Invoke-Phd -Method 'get_profile'",
"",
"    if ([int]$selected.id -ne [int]$target.id) {",
"        throw 'PHD2 did not select the requested profile.'",
"    }",
"",

// ------------------------------------------------------------
// VERIFY CONFIGURED EQUIPMENT
// ------------------------------------------------------------

"    $equipment = Invoke-Phd -Method 'get_current_equipment'",
"",
"    Write-Status ('Selected equipment: ' + (ConvertTo-Json -InputObject $equipment -Compress -Depth 8))",
"",
"    $cameraName = [string]$equipment.camera.name",
"    $mountName = [string]$equipment.mount.name",
"",
"    if ($cameraName -notlike '*ZWO*ASI*') {",
"        throw ('Wrong camera selected: ' + $cameraName)",
"    }",
"",
"    if ([string]::IsNullOrWhiteSpace($mountName)) {",
"        Write-Status 'Mount name unavailable before connection; will verify after connecting.'",
"    }",
"    else {",
"        Write-Status ('Pre-connection mount: ' + $mountName)",
"    }",
"",
"    Write-Status ('Camera verified: ' + $cameraName)",
"    Write-Status ('Mount verified: ' + $mountName)",
"",

// ------------------------------------------------------------
// CONNECT CAMERA AND MOUNT
// ------------------------------------------------------------

"    if (-not $connectedInitially) {",
"",
"        if ($AutoConnect -ne 1) {",
"            throw 'Equipment disconnected and AUTO_CONNECT_EQUIPMENT disabled.'",
"        }",
"",
"        Write-Status 'Connecting PHD2 equipment (NO mount movement)...'",
"",
"        $script:connectedByTest = $true",
"",
"        $null = Invoke-Phd -Method 'set_connected' -Parameters @($true) -TimeoutMs 40000",
"",
"        Wait-ForConnection -MaxMs 25000",
"",
"        Write-Status 'PHD2 equipment connected.'",
"    }",
"",
"    $equipment = Invoke-Phd -Method 'get_current_equipment'",
"",
"    Write-Status ('Connected equipment: ' + (ConvertTo-Json -InputObject $equipment -Compress -Depth 8))",
"",
"    if (-not [bool]$equipment.camera.connected) {",
"        throw 'ZWO guide camera failed to connect.'",
"    }",
"",
"    if (-not [bool]$equipment.mount.connected) {",
"        throw 'Astro-Physics mount failed to connect.'",
"    }",
"",
"    $connectedMountName = [string]$equipment.mount.name",
"",
"    if ($connectedMountName -ne 'AstroPhysicsV2 (ASCOM)' -and",
"        $connectedMountName -ne 'AstroPhysics GTO V2 Mount (ASCOM)') {",
"        throw ('Unexpected connected mount: ' + $connectedMountName)",
"    }",
"",
"    Write-Status ('AP1600 mount verified: ' + $connectedMountName)",
"",

// ------------------------------------------------------------
// READ SAVED CALIBRATION
// ------------------------------------------------------------

"    $script:calibrationAvailable = [bool](Invoke-Phd -Method 'get_calibrated')",
"",
"    Write-Status ('Calibration available: ' + $script:calibrationAvailable)",
"",
"    if ($script:calibrationAvailable) {",
"",
"        $calData = Invoke-Phd -Method 'get_calibration_data' -Parameters @('Mount')",
"",
"        Write-Status ('Mount calibration data: ' + (ConvertTo-Json -InputObject $calData -Compress -Depth 8))",
"    }",
"    else {",
"        Write-Status 'WARNING: No active calibration restored. Check PHD2 Auto restore calibration.'",
"    }",
"",

// ------------------------------------------------------------
// CONFIRM NO GUIDING WAS STARTED
// ------------------------------------------------------------

"    $state = [string](Invoke-Phd -Method 'get_app_state')",
"",
"    if ($state -ne 'Stopped' -and $state -ne 'Selected') {",
"        throw ('Unexpected PHD2 state before camera test: ' + $state)",
"    }",
"",

// ------------------------------------------------------------
// EXPOSURE TEST
// ------------------------------------------------------------

"    $script:oldExposure = [int](Invoke-Phd -Method 'get_exposure')",
"",
"    Write-Status ('Original exposure: ' + $script:oldExposure + ' ms')",
"",
"    if ($ExposureMs -gt 0 -and $ExposureMs -ne $script:oldExposure) {",
"",
"        Write-Status ('Setting exposure to ' + $ExposureMs + ' ms')",
"",
"        $null = Invoke-Phd -Method 'set_exposure' -Parameters @($ExposureMs)",
"",
"        $script:exposureChanged = $true",
"    }",
"",
"    Write-Status ('Beginning closed-dome exposure loop: ' + $Frames + ' frames')",
"",
"    $script:framesSeen = 0",
"    $script:attemptedLoop = $true",
"",
"    $null = Invoke-Phd -Method 'loop' -TimeoutMs 15000",
"",
"    $deadline = [DateTime]::UtcNow.AddMilliseconds($CaptureTimeoutMs)",
"",
"    while ($script:framesSeen -lt $Frames -and [DateTime]::UtcNow -lt $deadline) {",
"",
"        $remaining = [int][Math]::Max(1, ($deadline - [DateTime]::UtcNow).TotalMilliseconds)",
"",
"        $msg = Read-PhdMessage -TimeoutMs ([Math]::Min($remaining, 1200))",
"",
"        if ($null -ne $msg) {",
"",
"            if ($msg.PSObject.Properties['Event'] -and [string]$msg.Event -eq 'LoopingExposuresStopped') {",
"                throw 'PHD2 stopped looping before completing frames.'",
"            }",
"",
"            Handle-PhdEvent -Message $msg",
"        }",
"    }",
"",
"    if ($script:framesSeen -lt $Frames) {",
"        throw ('Only {0}/{1} frames received.' -f $script:framesSeen, $Frames)",
"    }",
"",
"    Write-Status 'All requested guide-camera frames completed.'",
"",
"}",
"catch {",
"    $script:failure = $_.Exception.Message",
"    Write-Status ('TEST ERROR: ' + $script:failure)",
"}",

// ============================================================
// CLEANUP
// ============================================================

"finally {",
"",
"    if ($script:attemptedLoop -and $null -ne $script:writer) {",
"        try {",
"            Write-Status 'Cleanup: stopping PHD2 capture...'",
"",
"            $null = Invoke-Phd -Method 'stop_capture' -TimeoutMs 15000",
"",
"            $stopped = $false",
"",
"            for ($k = 0; $k -lt 12; $k++) {",
"",
"                $state = [string](Invoke-Phd -Method 'get_app_state' -TimeoutMs 5000)",
"",
"                if ($state -eq 'Stopped' -or $state -eq 'Selected') {",
"                    $stopped = $true",
"                    break",
"                }",
"",
"                Start-Sleep -Milliseconds 500",
"            }",
"",
"            if (-not $stopped) {",
"                throw 'PHD2 did not stop exposures.'",
"            }",
"",
"            Write-Status 'Cleanup: exposures stopped.'",
"        }",
"        catch {",
"            $script:cleanupErrors.Add('stop_capture: ' + $_.Exception.Message)",
"        }",
"    }",
"",

// Restore previous exposure time.

"    if ($script:exposureChanged -and $null -ne $script:writer) {",
"        try {",
"            Write-Status ('Cleanup: restoring exposure to ' + $script:oldExposure + ' ms')",
"",
"            $null = Invoke-Phd -Method 'set_exposure' -Parameters @($script:oldExposure)",
"        }",
"        catch {",
"            $script:cleanupErrors.Add('restore exposure: ' + $_.Exception.Message)",
"        }",
"    }",
"",

// Disconnect only equipment this test connected.

"    if ($script:connectedByTest -and $null -ne $script:writer) {",
"        try {",
"            Write-Status 'Cleanup: disconnecting equipment...'",
"",
"            $null = Invoke-Phd -Method 'set_connected' -Parameters @($false) -TimeoutMs 40000",
"",
"            Write-Status 'Cleanup: equipment disconnected.'",
"        }",
"        catch {",
"            $script:cleanupErrors.Add('disconnect: ' + $_.Exception.Message)",
"        }",
"    }",
"",

// Restore previous PHD2 profile, if this test switched it.

"    if ($script:profileChanged -and $null -ne $script:writer) {",
"        try {",
"",
"            $postEquipment = Invoke-Phd -Method 'get_current_equipment'",
"",
"            foreach ($entry in $postEquipment.PSObject.Properties) {",
"",
"                $v = $entry.Value",
"",
"                if ($null -ne $v -and $v.PSObject.Properties['connected'] -and [bool]$v.connected) {",
"                    throw 'Cannot restore profile while equipment remains connected.'",
"                }",
"            }",
"",
"            Write-Status ('Cleanup: restoring profile ' + $script:originalProfile.name)",
"",
"            $null = Invoke-Phd -Method 'set_profile' -Parameters @([int]$script:originalProfile.id)",
"",
"            $restored = Invoke-Phd -Method 'get_profile'",
"",
"            if ([int]$restored.id -ne [int]$script:originalProfile.id) {",
"                throw 'Original profile restoration failed.'",
"            }",
"",
"            Write-Status 'Cleanup: original profile restored.'",
"        }",
"        catch {",
"            $script:cleanupErrors.Add('restore profile: ' + $_.Exception.Message)",
"        }",
"    }",
"",
"    foreach ($cleanupError in $script:cleanupErrors) {",
"        Write-Status ('CLEANUP ERROR: ' + $cleanupError)",
"    }",
"",
"    try { if ($null -ne $script:writer) { $script:writer.Dispose() } } catch {}",
"    try { if ($null -ne $script:reader) { $script:reader.Dispose() } } catch {}",
"    try { if ($null -ne $script:tcp) { $script:tcp.Close() } } catch {}",
"}",
"",

// ------------------------------------------------------------
// FINAL RESULT
// ------------------------------------------------------------

"if ($null -eq $script:failure -and $script:cleanupErrors.Count -eq 0 -and $script:framesSeen -ge $Frames) {",
"",
"    Write-Status ('PASS: ' + $script:framesSeen + ' frames; profile and equipment verified.')",
"",
"    if ($script:calibrationAvailable) {",
"        Write-Status 'CALIBRATION CHECK: PASS - active calibration available.'",
"    }",
"    else {",
"        Write-Status 'CALIBRATION CHECK: NOT READY - no active calibration restored.'",
"    }",
"",
"    exit 0",
"}",
"",
"Write-Status ('FAIL: ' + $script:failure + ' ; ' + ($script:cleanupErrors -join ' | '))",
"exit 1"

].join("\r\n") + "\r\n";


// ============================================================
// ACP ENTRY POINT
// ============================================================

function main()
{
    var proc = null;
    var fso = new ActiveXObject("Scripting.FileSystemObject");
    var shell = new ActiveXObject("WScript.Shell");

    var logFile = "";
    var printedLines = 0;
    var startedAt = new Date().getTime();

    function showLatestLog()
    {
        if (!logFile || !fso.FileExists(logFile))
            return;

        var content;

        try
        {
            content = readWholeFile(fso, logFile);
        }
        catch (e)
        {
            // PowerShell may briefly be writing to the file.
            // Skip this polling cycle and try again later.
            return;
        }

        var lines = content.split(/\r?\n/);

        // Display only complete lines.
        var completeLines = lines.length - 1;

        for (var i = printedLines; i < completeLines; i++)
        {
            if (lines[i].length > 0)
                printLine(lines[i]);
        }

        printedLines = completeLines;
    }

    try
    {
        checkSettings();

        var temp = shell.ExpandEnvironmentStrings("%TEMP%");
        var folder = temp + "\\ACP_PHD2_ClosedDomeTest";

        if (!fso.FolderExists(folder))
            fso.CreateFolder(folder);

        var suffix =
            String(new Date().getTime()) + "_" +
            String(Math.floor(Math.random() * 100000));

        var helperPath =
            folder + "\\PHD2_Bridge_" + suffix + ".ps1";

        logFile =
            folder + "\\PHD2_Test_" + suffix + ".log";

        writeWholeFile(fso, helperPath, HELPER_SOURCE);

        var psExe =
            shell.ExpandEnvironmentStrings("%SystemRoot%") +
            "\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";

        if (!fso.FileExists(psExe))
            throw new Error("Windows PowerShell not found.");

        printLine("============================================================");
        printLine("CLOSED-DOME PHD2 PROFILE AUTOMATION TEST");
        printLine("============================================================");
        printLine("Endpoint     : " + PHD2_HOST + ":" + PHD2_PORT);
        printLine("PHD2 profile : " + PHD2_PROFILE);
        printLine("Test frames  : " + TEST_FRAME_COUNT);
        printLine("Exposure     : " + TEST_EXPOSURE_MS + " ms");
        printLine("Auto-connect : " + AUTO_CONNECT_EQUIPMENT);
        printLine("Log          : " + logFile);
        printLine("No telescope movement or guiding will be requested.");
        printLine("");

        var cmd =
            '"' + psExe + '"' +
            ' -NoProfile -NonInteractive -ExecutionPolicy Bypass' +
            ' -File "' + helperPath + '"' +
            ' -PhdHost "' + PHD2_HOST + '"' +
            ' -Port ' + PHD2_PORT +
            ' -Frames ' + TEST_FRAME_COUNT +
            ' -ExposureMs ' + TEST_EXPOSURE_MS +
            ' -CaptureTimeoutMs ' + FRAME_TIMEOUT_MS +
            ' -AutoConnect ' + (AUTO_CONNECT_EQUIPMENT ? 1 : 0) +
            ' -ProfileName "' + PHD2_PROFILE + '"' +
            ' -LogFile "' + logFile + '"';

        proc = shell.Exec(cmd);

        while (proc.Status == 0)
        {
            showLatestLog();

            if ((new Date().getTime() - startedAt) >
                MAX_TEST_RUNTIME_MS)
            {
                proc.Terminate();

                throw new Error(
                    "Overall helper timeout exceeded. " +
                    "Check PHD2 manually for active looping."
                );
            }

            Util.WaitForMilliseconds(600);
        }

        showLatestLog();

        var exitCode = proc.ExitCode;

        if (exitCode != 0)
        {
            var stderr = proc.StdErr.ReadAll();

            if (stderr)
                printLine("PowerShell error: " + stderr);

            throw new Error(
                "PHD2 test failed with exit code " + exitCode
            );
        }

        printLine("============================================================");
        printLine("ACP TEST PASSED");
        printLine("Profile, equipment connection and camera test succeeded.");
        printLine("See calibration verification above.");
        printLine("============================================================");
    }
    catch (e)
    {
        showLatestLog();

        printLine("============================================================");
        printLine("ACP TEST FAILED: " + (e.message || String(e)));
        printLine("No mount slews or guiding commands were requested.");
        printLine("If cleanup failed, inspect PHD2 manually.");
        printLine("============================================================");
    }
}

// ACP automatically invokes main().

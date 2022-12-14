'tabs=4
'------------------------------------------------------------------------------
'
' Script:       FocusOffsets.vbs
' Author:       Robert B. Denny <rdenny@dc3.com>
' Version:      8.2.1
' Requires:     ACP 8.1 or later!
'               Windows Script 5.6 or later
'
' Environment:  This script is written to run under the ACP scripting
'               console. 
'
' Description:  This script uses FocusMax to determine the focus offsets of
'               all filters with respect to a given reference filter number.
'               Focus is made 5 degrees west of the meridian (to avoid meridian
'               problems of German mounts)
'
' Revision History:
'
' Date      Who     Description
' --------- ---     --------------------------------------------------
' 04-Mar-04 rbd     Initial edit
' 07-Mar-04 rbd     Fixed range check on filter number.
' 18-Mar-04 rbd     3.2 - Now version 3.2
' 15-Apr-05 rbd     4.1.2 - Craeate log file for this script.
' 18-Apr-06 rbd     4.2.1 - Wait for slew, fix reminder logging
' 31-Aug-06 rbd     4.3.1 - Start west of meridian not east, for GEM safety
'                   Don't use SUP.AutoFocus() to avoid slewing back and forth
'                   to selected focus star, select it here and stay on it.
'                   Do multiple runs and average offsets. Save logs, date
'                   stamp the log file names.
' 06-Sep-06 rbd     4.3.2 - Ignore filter slots with empty names. Pre-slew 
'                   scope to focus area (west) so FindBrightStar will return
'                   a focus star on the right side of a GEM.
' 31-Jan-07 rbd     5.0.1 - Fix retrieving of focus position for new code. 
'                   Turn focus light off after each SimpleAF(). Add 
'                   simulation.
' 14-Mar-07 rbd     5.0.2 - Fix bug when there is one or more focus failures.
'                   Turn off tracking at end. Preserve existing FilterInfo
'                   file across failures, etc. Don't save to FilterInfoOLD
'                   until the last second, when about to create new one.
' 03-Dec-08 rbd     5.0.3 (HF8) Fix filter selection for new filter logic
'                   introduced in Hot Fix 7.
' 02-Jun-09 rbd     5.0.4 (HF9) Fix for 'localweb' user
' 14-Oct-09 rbd     5.0.5 (HF10) - GEM:215 - Test for "Filter n" names in 
'                   MaxIm. Almost certainly bogus.
' 21-Sep-11 rbd     6.0.1 (6.0HF2) Delete existing FilterInfoOLD.
' 27-Jun-12 rbd     7.0.1 - GEM:80 FindBrightStar() now takes a filter number.
'                   Major upgrade to use mag range in FilterInfo if present.
'                   Means focus stars may get changed during the process.
'                   GEM:700 Do not Set FocusMax exposure.
' 13-Jul-12 rbd     7.0.1 - GEM:760 Infinite timeout on AskYesNo for web
'                   users. 
' 12-Sep-12 rbd     7.0.1 (7.0) - GEM:857 Config file now written to "new" 
'                   UAC-friendly location.
' 19-Jun-14 rbd/ki  7.2.1 (7.2) - GEM:1138 For PlaneWave PWI (missing edit track 8/26)
' 26-Aug-14 rbd     7.2.2 (7.2) - GEM:1138 Fixed by Kevin for new Prefs.AutoFocus.UsePWI 
' 11-Aug-16 rbd     8.1.0 (8.0) - GEM:1179 Start each pass with reference filter focus
' 27-Aug-18 rbd     8.2.0 (8.2) - No GEM, force offsets in file to be integer. See Comm
'                   center thread #11542
' 28-Nov-18 ki      8.2.1 (8.2) - No GEM (Kevin Ivarsen, PlaneWave) several changes to 
'                   PWI specific code to handle various variations of the Focuser (ID).
'                   plus fix bugs in the PWI focuser control logic. (THANKS!)
' 11-Dec-12 rbd     8.2.2 (8.2) - No GEM Comm Center #11956 - Show filter names
'                   and make clear numbers start with 0.
'----------------------------------------------------------------------------
'
Option Explicit                     ' Enforce variable declarations

Const RPT_COUNT = 5                 ' Take 5 sets of measurements, average
Const MXAFTIME = 600                ' Kill FocusMax if it runs longer than 10 min (600 sec)

Dim SUP                             ' As usual
Dim FMx                             ' Used in SimpleAF()
Dim FMf                             ' For restoring reference focus
Dim PWAutoFocus                     ' Used for PWI to focus (already simple!)
Dim PWIFocuser                      ' For restoring reference focus
Dim simOffs()                       ' Same here

Sub TrackOff()                                                  ' Used in several places
    If Telescope.CanSetTracking Then                            ' Turn tracking off
        If Telescope.Tracking Then                              ' Avoid needless change
            Console.PrintLine "  (tracking off)"
            Telescope.Tracking = False
        End If
    End If
End Sub

Sub Main()
    Dim CT, FSO, logName, foName, foStream, cFile, ocFile
    Dim filterNames, maxFilterNum, refFilterNum, refFilterFocus
    Dim i, n, ans, buf, focusOffset(), avgOffs(), brightMag(), faintMag(), pwExposureLength()
    Dim starRA, starDec, starMag, PA, includedCount, filt
    
    Set FSO = CreateObject("Scripting.FileSystemObject")
    
    Set SUP = CreateObject("ACP.AcquireSupport")
    SUP.Initialize
    If Not SUP.HaveFilters Then                                 ' Must have filters on system
        Console.PrintLine "No filters on this system. Stopping."
        TrackOff
        Exit Sub
    End If

    filterNames = Camera.FilterNames                            ' Need local copy (why?) 
    maxFilterNum = UBound(FilterNames)                          ' Max filter number
    For i = 0 To maxFilterNum
        If Left(LCase(filterNames(i)), 6) = "filter" Then
            Err.Raise vbObjectError, "FocusOffsets.vbs", _
                "Questionable filter " & filterNames(i) & ". Remove filter names from unused slots in MaxIm"
        End If
    Next
    For i = 0 To maxFilterNum
        Console.PrintLine filterNames(i) & " is #" & i
    Next    
    ReDim focusOffset(RPT_COUNT - 1, maxFilterNum)              ' Array for focus offset values
    ReDim avgOffs(maxFilterNum)                                 ' Array for final/average offsets
    ReDim brightMag(maxFilterNum)
    ReDim faintMag(maxFilterNum)
    ReDim pwExposureLength(maxFilterNum)
    If Prefs.PointingUpdates.Simulate Then                      ' If simulating
        ReDim simOffs(maxFilterNum)                             ' Create array for simulated offsets
        For i = 0 To maxFilterNum	                            ' Populate with some random numbers -300 to +300
            simOffs(i) = Fix(SUP.UnifRand(600) - 300)           ' (Integer, global, used in SimpleAF())
        Next
    End If
    
    ''Console.PrintLine "FYI, ACP ref. filter is #" & Prefs.CameraPrefs.ClearFilterNumber
    Do While True 
        ans = Console.ReadLine("Reference filter number (0-based, see list below):", 1)   ' Ask for reference filter #
        If ans = 13 Then                                        ' User pressed Cancel
            SUP.Terminate
            TrackOff
            Exit Sub                                            ' [RET] Exit script
        End If        
        refFilterNum = CInt(Console.LastReadResult)             ' Reference filter number
        If refFilterNum >= 0 And refFilterNum <= maxFilterNum Then
            Exit Do
        Else
            Console.PrintLine "Filter # must be between 0 and " & maxFilterNum
        End If
    Loop

    If Prefs.AutoFocus.UsePWI Then
        Dim filterIndex
        For filterIndex = 0 To maxFilterNum
            ans = Console.ReadLine("Exposure length for filter " & filterIndex & " (" & filterNames(filterIndex) & "):", 1)
            If ans = 13 Then                                        ' User pressed Cancel
                SUP.Terminate
                TrackOff
                Exit Sub                                            ' [RET] Exit script
            End If        
            pwExposureLength(filterIndex) = CInt(Console.LastReadResult)
        Next
    End If
        
    '
    ' Enable logging to date-stamped logfile
    '
    logName = "\FocusOffsets-" & _
        Util.FormatVar(Util.SysUTCDate, "dd-mmm-yyyy@HhNnSs") & ".log"  ' Used for reminder at end of log
    If Lock.Username = "local_user"  Or Lock.Username = "localweb" Then ' If this is a local user
        Console.LogFile = Prefs.LocalUser.DefaultLogDir & logName
    Else
        Console.LogFile = Prefs.WebRoot & "\logs\" & Lock.Username & logName
    End If
    Console.Logging = True

    Console.PrintLine "Starting FocusOffset run..."
    Console.PrintLine "Selected " & filterNames(refFilterNum) & " as reference"
    
    '
    ' Begin process, slew to focus area
    '
    Set CT = Util.NewCTHereAndNow()                             ' Get RA/Dec of zenith + 15 deg west
    CT.Azimuth = 270
    CT.Elevation = 75
    '
    ' FindBrightStar requires GEM to be looking west in order to
    ' return a star that is west. So slew there, possibly flipping.
    '
    Call SUP.StartSlewJ2000("FocusArea", CT.RightAscension, CT.Declination)
    Call SUP.WaitForSlew()
    
    If Prefs.AutoFocus.UsePWI Then
        Set PWAutoFocus = CreateObject("PlaneWave.AutoFocus")
        If PWAutoFocus.FocusServer = "PWI2" Then
            Console.printLine("Using PWI2 for focus control")
            Set PWIFocuser = CreateObject("ASCOM.PWI_Foc_20.Focuser")
        ElseIf PWAutoFocus.FocusServer = "PWI3" Then
            Console.printLine("Using PWI3 for focus control")
        Set PWIFocuser = CreateObject("ASCOM.PWI3.Focuser")
        ElseIf PWAutoFocus.FocusServer = "PWI4" Then
            Console.printLine("Using PWI4 for focus control")
            Set PWIFocuser = CreateObject("ASCOM.PWI4.Focuser")
        Else
            Console.printLine "**Unsupported PlaneWave focuser server: " & PWAutoFocus.FocusServer
            SUP.Terminate
        End If

        Console.printLine("Connecting to PWI focus control server...")
        PWIFocuser.Connected = True
        Console.printLine("Connection established")
    Else
        '
        ' Start up and set up FocusMax
        '
        Set FMx = CreateObject("FocusMax.FocusControl")
        FMx.FocusRoutineReturnToStartPositionEnable = True      ' Don't leave things out of whack
        Set FMf = CreateObject("FocusMax.Focuser")
    End If

    '
    ' REPEAT LOOP
    '
    refFilterFocus = Null                                       ' [sentinel]
    For n = 0 To RPT_COUNT - 1
        '
        ' On second and later passes, restore the reference filter focus from the
        ' previous pass. THis avoids a giant out of focus condition for e.g. a
        ' narrowband filter being the last one in the list when there is no
        ' existing FilterInfo.txt.
        '
        If n > 0 And Not IsNull(refFilterFocus) Then
            Console.printLine("Moving back to reference filter focus position " & refFilterFocus)
            If Prefs.AutoFocus.UsePWI Then
                PWIFocuser.Move refFilterFocus
                Util.WaitForMilliseconds 1000 
                While PWIFocuser.IsMoving
                    Util.WaitForMilliseconds 1000 
                Wend
            Else
                FMf.Move refFilterFocus
            End If

            Console.printLine("Move complete")
        End If
        
        '
        ' Measure reference Filter
        '
        Console.PrintLine "Measuring reference filter " & filterNames(refFilterNum)
        SUP.SelectFilter refFilterNum
        SUP.SetFilterForTask 1                                  ' Always uses selected filter (FO_FORIMAGE)

        If n = 0 Then                                           ' Pick up mag range on first round
            brightMag(refFilterNum) = SUP.BrightStarMinMag
            faintMag(refFilterNum) = SUP.BrightStarMaxMag
        End If

        If Prefs.AutoFocus.UsePWI Then
            PWAutoFocus.ExposureLengthSeconds = pwExposureLength(refFilterNum)
            SUP.PlaneWaveAutoFocus(PWAutoFocus)
            If PWAutoFocus.Success Then
                refFilterFocus = PWAutoFocus.BestPosition 
                Console.printLine "Set refFilterFocus = " & refFilterFocus
            Else
                Console.printLine "**AutoFocus failed."
                SUP.Terminate
                TrackOff
                Exit Sub
            End If
        Else
            '
            ' Select the focus star for this filter (may differ with mag limits)
            '
            If Not SUP.FindBrightStar(CT.RightAscension, CT.Declination, _
                                        refFilterNum, starRA, starDec, starMag) Then
                Console.PrintLine "**Failed to find suitable focus star"
                TrackOff
                SUP.Terminate
                Exit Sub                                            ' [RET] Exit script
            End If
            '
            ' Now slew there and do a pointing update
            '
            Console.PrintLine "  Using star at mag " & Util.FormatVar(starMag, "0.0") & _
                    " Slew to star."
            Call SUP.StartSlewJ2000("Focus", starRA, starDec)
            Call SUP.WaitForSlew()
            If SUP.HaveRotator Then PA = SUP.RotatorPositionAngle Else PA = 0.0
            Call SUP.UpdatePointing("Focus", starRA, starDec, PA)
            Console.PrintLine "  Focus star is now centered in view"
            If Not SimpleAF(refFilterNum) Then
                Console.printLine "**AutoFocus failed."
                SUP.Terminate
                TrackOff
                Exit Sub
            End If
            refFilterFocus = FMx.Position                           ' Focus position of reference
        End If

        focusOffset(n, refFilterNum) = 0                        ' Reference has 0 offset

        Dim FoundBestFocus                          ' True if FocusMax or PW AutoFocus completed successfully
        Dim BestFocusPosition                       ' Best position from FocusMax or PW AutoFocus if FoundBestFocus = True

        '
        ' Measure all but reference filter and calculate offsets
        '
        For i = 0 To maxFilterNum
            If i <> refFilterNum And filterNames(i) <> "" Then  ' Skip reference filter and blank slots
                Console.PrintLine "Measuring " & filterNames(i) & " filter..."
                SUP.SelectFilter i                              ' Select the imaging filter 'i'
                SUP.SetFilterForTask 1                          ' Needed to get mag range
                If n = 0 Then                                   ' Pick up mag range on first round
                    brightMag(i) = SUP.BrightStarMinMag
                    faintMag(i) = SUP.BrightStarMaxMag
                End If

                If Prefs.AutoFocus.UsePWI Then
                    PWAutoFocus.ExposureLengthSeconds = pwExposureLength(i)
                    SUP.PlaneWaveAutoFocus(PWAutoFocus)
                    FoundBestFocus = PWAutoFocus.Success
                    If PWAutoFocus.Success Then
                        BestFocusPosition = PWAutoFocus.BestPosition 
                    End If
                Else
                    If Not (starMag >= brightMag(i) And starMag <= faintMag(i)) Then ' Only if need new star
                        Console.PrintLine "  Need new focus star (last one out of mag range)"
                        If Not SUP.FindBrightStar(CT.RightAscension, CT.Declination, _
                                                    i, starRA, starDec, starMag) Then
                            Console.PrintLine "**Failed to find suitable focus star"
                            TrackOff
                            SUP.Terminate
                            Exit Sub                                                ' [RET] Exit script
                        End If
                        '
                        ' Now slew there and do a pointing update
                        '
                        Console.PrintLine "  Using star at mag " & Util.FormatVar(starMag, "0.0") & _
                                " Slew to star."
                        Call SUP.StartSlewJ2000("Focus", starRA, starDec)
                        Call SUP.WaitForSlew()
                        If SUP.HaveRotator Then PA = SUP.RotatorPositionAngle Else PA = 0.0
                        Call SUP.UpdatePointing("Focus", starRA, starDec, PA)
                        Console.PrintLine "  Focus star is now centered in view"
                    Else
                        Console.PrintLine "  Last focus star is usable for this filter"
                    End If
                    SUP.SetFilterForTask 1                         ' Re-select after possible star change etc.

                    FoundBestFocus = SimpleAF(i)
                    If FoundBestFocus Then
                        BestFocusPosition = FMx.Position
                    End If
                End If


                If Not FoundBestFocus Then
                    focusOffset(n, i) = "**failed**"
                    Console.printLine "**AutoFocus failed for " & filterNames(i)
                Else
                    focusOffset(n, i) = BestFocusPosition - refFilterFocus
                    If Prefs.PointingUpdates.Simulate Then          ' If simulating, add simulated offset
                        focusOffset(n, i) = focusOffset(n, i) + simOffs(i)
                    End If
                    Console.PrintLine "Offset is " & focusOffset(n, i)
                End If
            End If
        Next
    Next
    Set FMx = Nothing
    Set FMf = Nothing
    Set PWAutoFocus = Nothing
    Set PWIFocuser = Nothing
    '
    ' Write the final report
    '
    Console.PrintLine "Finished. " & RPT_COUNT & " passes, reference filter is " & filterNames(refFilterNum)
    For i = 0 To maxFilterNum
        If filterNames(i) <> "" Then
            avgOffs(i) = 0
            includedCount = 0
            For n = 0 To RPT_COUNT - 1
                If Not (focusOffset(n, i) = "**failed**") Then
                    avgOffs(i) = avgOffs(i) + focusOffset(n, i)
                    includedCount = includedCount + 1
                End If
            Next
            If includedCount > 0 Then
                avgOffs(i) = avgOffs(i) / includedCount
                Console.PrintLine " Filter #" & i & " (" & filterNames(i) & ") offset: " & avgOffs(i)
            Else
                avgOffs(i) = 0                                          ' No calculation
                Console.PrintLine " **Filter #" & i & " (" & filterNames(i) & ") failed all focus attempts!"
            End If
        End If
    Next
    SUP.Terminate
    TrackOff
    Console.Logging = False
    Console.PrintLine "REMINDER: This run was logged in " & logName
    
    '
    ' Ask if these settings are to be used for ACP
    '
    If Console.AskYesNo("Use these offsets in ACP?", 0) Then    ' 0 for web usage, no timeout!
        '
        ' Try to remove old FilterInfo in the old foolder
        '
        On Error Resume Next
        cFile = ACPApp.Path & "\FilterInfo.txt"
        If FSO.FileExists(buf) Then FSO.DeleteFile buf
        cFile = ACPApp.Path & "\FilterInfoOLD.txt"
        If FSO.FileExists(buf) Then FSO.DeleteFile buf
        On Error GoTo 0
        '
        ' If FilterInfo.txt exists, rename it to FilterInfoOLD.txt
        '
        cFile = ACPApp.ConfigPath & "\FilterInfo.txt"
        ocFile = ACPApp.ConfigPath & "\FilterInfoOLD.txt"
        If FSO.FileExists(cFile) Then
            If FSO.FileExists(ocFile) Then FSO.DeleteFile ocFile
            FSO.MoveFile cFile, ocFile
        End If
        '
        ' Now create the new one...
        '
        Set foStream = FSO.CreateTextFile(cFile)
        foStream.WriteLine "; FilterInfo created by FocusOffsets.vbs"
        foStream.WriteLine "; " & Util.FormatVar(Now(), "Medium Date")
        foStream.WriteLine "; offset,ref-filt,ptg-filt,af-minmag,af-maxmag"
        For i = 0 To maxFilterNum
            foStream.WriteLine CInt(avgOffs(i)) & "," & refFilterNum & "," & _
                    refFilterNum & "," & brightMag(i) & "," & faintMag(i)
        Next
        foStream.Close
        Console.PrintLine "NOTE: Filter " & refFilterNum & " will be used for pointing and autofocus"
    End If
    Set FSO = Nothing
    
End Sub

'
' Simple Autofocus. Just call FocusMax to do the job. DO NOT USE
' ACQUIRESTAR! Filter number passed for simulation.
'
Function SimpleAF(fNum)
    Dim AFTime
    
    SUP.AutoFocusActive = True
    Util.WaitForMilliseconds 2000                               ' Allow AF light to come On
    SimpleAF = False                                            ' Assume failure
    If FMx.FocusAsync() Then                                    ' Keep UI alive via Async...
        Util.WaitForMilliseconds 2000                           ' FM 3.2.1 has race condition
        AFTime = MXAFTIME                                       ' FM timeout counter
        Do While (FMx.FocusAsyncStatus = -1) And (AFTime > 0)   ' Loop while FM is running and not timed out
            Util.WaitForMilliseconds 1000
            AFTime = AFTime - 1
        Loop
        If AFTime <= 0 Then                                     ' If FM ran too long
            Console.PrintLine "**Autofocus took too long. Check FocusMax log for details."
            FMx.Halt                                            ' Stop FocusMax focus cycle
        ElseIf (FMx.FocusAsyncStatus = 1) And (FMx.HalfFluxDiameter <> 0) Then
            Console.PrintLine "  FocusMax auto-focus successful!"
            Console.PrintLine "    HFD = " & Util.FormatVar(FMx.HalfFluxDiameter, "###.00")
            If Prefs.PointingUpdates.Simulate Then
                Console.PrintLine "    Focus position (simulated) = " & (FMx.Position + simOffs(fNum))
            Else
                Console.PrintLine "    Focus position = " & FMx.Position
            End If
            SimpleAF = True                                     ' Report success to caller
        Else
            Util.Console.PrintLine "**AutoFocus failed. Check FocusMax log for details."
        End If
    Else
        Util.Console.PrintLine "**AutoFocus failed. Check FocusMax log for details."
    End If
    SUP.AutoFocusActive = False

End Function

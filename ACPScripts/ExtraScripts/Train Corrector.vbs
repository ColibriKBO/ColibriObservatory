'tabs=4
'------------------------------------------------------------------------------
'
' Script:       TrainCorrector.vbs
' Author:       Robert B. Denny <rdenny@dc3.com>
' Version:      5.0.3
' Requires:     ACP 5.0 or later
'               Windows Script 5.6 or later
'
' Environment:  This script is written to run under the ACP scripting
'               console. 
'
' Description:  This script will train the ACP pointing corrector. If simulation
'               is in effect it will still work, using the pointing error generator.
'               If you set FAST_TEST to True, the siomulated image and plate solving
'               will be skipped and you'll see the behavior of the pointing
'               corrector in hyper-time. Very useful for learning about the
'               behavior of the corrector.
'
'               It generates the given number of points randomly in the sky, 
'               honoring the slewing limits. As it visits each point, it plate
'               solves and syncs, and sync is what adds the mapping point To
'               the corrector.
'
'               For GEM mounts, the mapping points are split into east and west
'               quadri-spheres. The east points are done first, then the west
'               points. So there will be just one mount flip. By the time the 
'               mount flips, there will already be a bunch of points in the model
'               (the east-side points), so the chances of the mount being close
'               enough after the clip to do a plate solution are improved.
'
'               Finally, the order of visiting the points is no longer arbitrary.
'               Instead, it picks the highest altitude point then "works outward"
'               visiting the closest point, then the closest point to that one,
'               etc. This maximizes the chances that plate solutions can be done
'               in the presence of large raw pointing errors. By starting at the
'               highest point, the effects of the flip between the east and west
'               groups is imininzed!
'
' Mapping Point Generation: This version of TrainCorrector attempts to improve the
'               distribution of mapping points over the local horizontal (Alt/Az)
'               sphere. Rather than generating uniformly distributed values of Az
'               and Alt, it tries to generate points uniformly distributed over the
'               sphere. The old method suffered badly from bunching at high Alts
'               plus the VB random number generator was poor at generating small 
'               sets of uniformly distributed random numbers.
'
'               The algorithm for generating the equally-spaced random numbers was
'               taken from the sci.math.num-analysis newsgroup, in an article 
'               written by Dave Seaman. The article can be found at
'
'                   http://www.math.niu.edu/~rusin/known-math/96/sph.rand
'
'               In particular, the "Trig Method" was chosen as the fastest and 
'               simplest. The algorithm was modified to generate points above the
'               local horizon by choosing z uniformly distributed in [0,1]
'               instead of [-1,1]. Also, it is run separately for the east and west
'               quadri-spheres by choosing t uniformly distributed in [0,PI]
'               instead of [0,2PI], with the west call simply adding 180 degrees
'               to the generated points' azimuths.
'
'               Finally, the generated points are limited in their closeness to any
'               other point generated so far, to avoid multiple "too close" points.
'
' NOTE:         Yes, this code is "inefficient". Tradeoff between simplicity and time.
'
' Revision History:
'
' Date      Who     Description
' --------- ---     --------------------------------------------------
' 04-Apr-03 rbd     Initial edit
' 19-May-03 rbd     Don't use UpdatePointing, avoid re-slew. More efficient.
' 01-Jul-03 rbd     Add Alt/Az output to script.
' 30-Jul-03 rbd     3.1 - Re-check slew limit at acquisition time.
' 07-Aug-03 rbd     3.1 - Fic CheckSlewLimits() for German mount
' 09-Sep-03 rbd     3.1.1 - Add MaxPoint observation list export, remove
'                   setting for image simulator RMS error, allow 
'                   AcquireSupport to use registry config for this.
' 14-Sep-03 rbd     3.1.1 - Fix for failed plate solves, was leaving blank
'                   line in MaxPoint export.
' 23-Sep-03 rbd     3.1.1 - Fix MaxPoint export for case where the call To
'                   TakePointingImage() leaves the scope at offset coordinates.
' 01-Mar-03 rbd     3.1.3 - Select Clear filter before doing run using New
'                   SUP.SelectFilter() which supports focus offsets.
' 04-Mar-04 rbd     3.1.3 - New SUP.Terminate() call at script end
' 18-Mar-04 rbd     3.2 - Now version 3.2
' 14-Sep-04 rbd     4.0 - Remove MaxPoint export, ACP stores model in 
'                   MaxPoint compatible model files now.
' 24-Sep-04 rbd     4.0 - Check new pref that prevents mapping points from
'                   being added.
' 05-Nov-04 rbd     4.0 - Voice announcements
' 05-Dec-04 rbd     4.0 - Remove dead code
' 04-Mar-05 rbd     4.1.1 - Split east/west points and do them separately
'                   for GEM mounts.
' 05-Mar-05 rbd     4.1.1 - New method for generating random points (see 
'                   comments above), "work-outward" pathing in each quadri-
'                   sphere.
' 14-Mar-05 rbd     4.1.2 - Remove timing window for slew limits from 
'                   DoMapPoint. The actual slew is now trapped for errors
'                   and skipped if the StartSlewJ2000() fails.
' 15-Apr-04 rbd     4.1.3 - Ask to clear pointing model and if so, ask To
'                   save the existing model somewhere.
' 25-Apr-05 rbd     4.1.4 - Save current model to "WebSavedModel" if web
'                   user.
' 02-Aug-05 rbd     4.1.5 - Change to TakePointingImage for rotators, Do
'                   at 0 deg. PA
' 24-Aug-05 rbd     4.1.6 - Change to StartRotateToPA()
' 01-Dec-06 rbd		5.0.1 - Fix "highest alt" calculation (Peter Simpson)
' 11-Jun-09 rbd     5.0.2 (HF9) - Disallow points above/below 70/-70 dec.
' 28-Jun-09 rbd     5.0.3 (HF9) - Oops fix the above code...
' 10-Jul-14 rbd     7.2.1 - GEM:1151 Use "new" default images folder for 
'                   pointing exps.
'----------------------------------------------------------------------------
'
Option Explicit                                                 ' Enforce variable declarations

Const FAST_TEST = False                                         ' True to test without any images
Const PI = 3.14159265359
Const D2R = 0.017453292520                                      ' Degrees to radians
'
' Variables used in multiple functions
'
Dim SUP                                                         ' Acquire support object
Dim FSO                                                         ' A FileSystemObject
Dim CT

' -------
' Atn4Q() - 4-quadrant arctangent (radians, safe for dx = 0)
' -------
'
Function Atn4Q(dy, dx)
    Dim at

    If dx = 0 Then
        If dy > 0 Then
            Atn4Q = PI / 2
        Else
            Atn4Q = PI * 1.5
        End If
    Else
        at = Atn(dy / dx)
        If dx < 0 Then
            Atn4Q = PI + at
        ElseIf dy < 0 Then
            Atn4Q = PI + PI + at
        Else
            Atn4Q = at
        End If
    End If
End Function

' ------
' ACos() - Arc cosine (radians)
' ------
'
Function ACos(x)

    If x = 1. Then
      ACos = 0.
    ElseIf x = -1. Then
      ACos = 4.*Atn(1.0)
    Else
      ACos = 2.*Atn(1.) - Atn( x/sqr(1.-x*x) )
    End If

End Function


' ---------
' SphDist() - Return sperical distance between points, degrees
' ---------
'
Function SphDist(az1, alt1, az2, alt2)

    Dim x1, x2, y1, y2, z1, z2, R
    Dim cz1, sz1, ca1, sa1, cz2, sz2, ca2, sa2
    Dim z1rad, a1rad, z2rad, a2rad

    z1rad = D2R*az1
    z2rad = D2R*az2
    a1rad = D2R*alt1
    a2rad = D2R*alt2   
      
    cz1 = Cos(z1rad)
    cz2 = Cos(z2rad)
    sz1 = Sin(z1rad)
    sz2 = Sin(z2rad)

    ca1 = Cos(a1rad)
    ca2 = Cos(a2rad)
    sa1 = Sin(a1rad)
    sa2 = Sin(a2rad)

    x1 = ca1*cz1
    x2 = ca2*cz2
    y1 = ca1*sz1
    y2 = ca2*sz2
    z1 = sa1
    z2 = sa2

    R = x1*x2 + y1*y2 + z1*z2

    If R > 1. Then R = 1.
    If R < -1. Then R = -1.

    SphDist = ACos(R) / D2R
        
End Function

' -----------------
' CheckSlewLimits() - Check alt/az coordinates for configured slew limits
' ----------------
'
' Cannot conveniently use Util.EnforceSlewLimits() because it is for the current
' time and takes RA/Dec. The mapping process takes time, so we must convert to 
' RA/Dec at the last possible moment. We need this check during winnowing of points
' before starting the mapping run... The conversion to RA/Dec for polar tilt-up 
' limit is not time sensitive. Also enforce limit of Dec > 70 since ACP will
' not slew above that.
'
Function CheckSlewLimits(Az, Alt)
    Dim CT, RA, DE
    
    CheckSlewLimits = True                                      ' Assume success
    If Alt <= Prefs.MinimumElevation Then  
        CheckSlewLimits = False
        Exit Function
    End If
    If Alt <= Prefs.GetHorizon(Az) Then 
        CheckSlewLimits = False
        Exit Function
    End If
    Set CT = Util.NewCTHereAndNow()                             ' Need Dec for tests
    CT.Azimuth = Az
    CT.Elevation = Alt
    Select Case Telescope.AlignmentMode
        Case 0:                                                 ' ALt/Az mount
            If Alt >= Prefs.TiltUpLimit Then CheckSlewLimits = False
        Case 2:                                                 ' German equatorial
            If Alt >= Prefs.TiltUpLimit Then CheckSlewLimits = False
        Case Else:                                              ' Simple polar (fork)
            If CT.Declination > Prefs.TiltUpLimit Then CheckSlewLimits = False
    End Select
    If CT.Declination >= 70 Or CT.Declination < -70 Then CheckSlewLimits = False
    
End Function

' ----------------
' GeneratePoints() - Generate mapping points in east or west
' ----------------
'
Sub GeneratePoints(Az(), Alt(), N, West)
    Dim I, J, z, t, r, x, y
    Dim IHiAlt, tAz, tAlt, dist, distMin, JMin
    
    '
    ' Generate N points in Alt/Az, evenly distributed on the 
    ' quadri-sphere. Remember the one with the highest Alt
    ' for the next step.
    '
    IHiAlt = 0.0
    For I = 1 To N
        '
        ' Generate a point within ACP's slew limits, below 85
        ' degrees altitude, and not "too close" to any points
        ' generated so far. Loop till we get one that satisfies
        ' those criteria.
        '
        Do While True
            '
            ' Generate a point in xyz
            '
            z = Rnd()                                       ' [0,1]
            t = Rnd() * PI
            r = Sqr(1.0 - (z * z))
            x = r * Cos(t)
            y = r * Sin(t)
            '
            ' Transform into Alt/Az
            '
            r = Sqr((x * x) + (y * y))
            Az(I) = Atn4Q(y, x) / D2R                       ' Degrees
            Alt(I) = Atn4Q(z, r) / D2R                      ' Degrees
            If West Then Az(I) = 180.0 + Az(I)
            '
            ' There are Pi steradians in a quadri-sphere. Allow the
            ' points to be no closer than 2/3 the nominal equi-spacing
            ' distance. This prevents mapping points that are "too close"
            ' to each other. Remember they are not generated in any 
            ' order!
            '
            distMin = 1000.0
            For J = 1 To I - 1                              ' Find distance to closest point already generated
                dist = SphDist(Az(I), Alt(I), Az(J), Alt(J))
                If dist < distMin Then distMin = dist
            Next
            If distMin > (120.0 / N) And _
                CheckSlewLimits(Az(I), Alt(I)) And _
                Alt(I) < 85.0 Then Exit Do                  ' GOT A GOOD POINT!
        Loop
        If Alt(I) > Alt(IHiAlt) Then IHiAlt = I             ' Remember index of point with highest alt
    Next
    '
    ' Re-order them in drunkards-walk order starting with the 
    ' point having the highest altitude. This minimizes the distance
    ' between points on each side of the meridian for GEM mounts
    ' while producing a sort of "work outward" that actually 
    ' works better than some spiral thang.
    '
    If IHiAlt <> 1 Then                                     ' Swap the hi-alt point into the first slot
        tAz = Az(1)
        tAlt = Alt(1)
        Az(1) = Az(IHiAlt)
        Alt(1) = Alt(IHiAlt)
        Az(IHiAlt) = tAz
        Alt(IHiAlt) = tAlt
    End If
    For I = 1 To (N - 1)
        distMin = 1000.0
        For J = (I + 1) To N
            dist = SphDist(Az(I), Alt(I), Az(J), Alt(J))
            If dist < distMin Then
                distMin = dist
                JMin = J
            End If
        Next
        If JMin <> (I + 1) Then
            tAz = Az(I + 1)
            tAlt = Alt(I + 1)
            Az(I + 1) = Az(JMin)
            Alt(I + 1) = Alt(JMin)
            Az(JMin) = tAz
            Alt(JMin) = tAlt
        End If
     Next

End Sub

' -----------------
' AcquireMapPoint() - Acquire a mapping point
' -----------------
'
' This is a sub-set of UpdatePointing() in the support component, except it does
' not re-slew to the target after doing solve/sync. Much more efficient.
' It also writes MaxPoint mapping records to the array for later filing. 
' Failure is non-fatal.
'
Function AcquireMapPoint(Num, RightAscension, Declination)
    Dim fn, plate, tn, rRA, rDec, cRA, cDec, ST
    
    Util.Console.PrintLine "  Acquiring mapping point..."
    tn = "Map-" & Util.FormatVar(Num, "000")
    
    If Util.Prefs.PointingUpdates.Simulate And FAST_TEST Then
        Util.MapIdealToRawEqu RightAscension, Declination, rRA, rDec   ' Recover raw scope coordinates
        cRA = SUP.SimImageRA                                    ' Sim image locations set on slew
        cDec = SUP.SimImageDec
        '
        ' Deperation convergence debugging...
        '
        Console.PrintLine "    Tgt " & Util.Hours_HMS(RightAscension,,,,1) & " " & Util.Degrees_DMS(Declination)
        Console.PrintLine "    Img " & Util.Hours_HMS(cRA,,,,1) & " " & Util.Degrees_DMS(cDec)
        Console.PrintLine "    Err=" & Util.FormatVar(SUP.EquDist(RightAscension, Declination, cRA, cDec) * 60, "0.0")
        Console.PrintLine "    Corr=" & Util.FormatVar(SUP.EquDist(rRA, rDec, cRA, cDec) * 60, "0.0")
    Else
        '
        ' Make the pointing exposure pathname (no ext. per TakeImage)
        '
        fn = Util.Prefs.LocalUser.DefaultImageDir & "\PointingExps\" & tn
        '
        ' Acquire the pointing exposure and try to solve it. Note that
        ' TakePointingImage may leave the scope at offset coordiantes, 
        ' so we cannot recover the raw scope coordinates until afterward!
        '
        If Not SUP.TakePointingImage(tn, fn, RightAscension, Declination, 0.0) Then
            AcquireMapPoint = False
            Exit Function                                       ' FAILED, JUST RETURN
        End If
        '
        ' OK we now have the real J2000 RA/Dec of the center of the 
        ' picture we just took. Sync the scope to update its coordinates,
        ' which adds an observation to the Pointing Corrector.
        '
        Set plate = CreateObject("PinPoint.Plate")
        
        If SUP.HavePinPoint4 Then                               ' If PinPoint 4 installed
            plate.AttachNoImage fn & ".fts"                     ' Fast attach, to read ra/dec
        Else
            plate.AttachFITS fn & ".fts"                        ' Attach, read ra/dec
        End If
        cRA = plate.RightAscension
        cDec = plate.Declination
        plate.DetachFITS
        Set plate = Nothing
    End If
    
    Call SUP.SyncToJ2000(cRA, cDec)                             ' UPDATE CORRECTOR
    
    AcquireMapPoint = True
    
End Function

' -------------
' DoMapPoints() - Process points in Alt/Az array sets, update I with total good points
' -------------
'
Function DoMapPoints(Az(), Alt(), N, I)
    Dim J

    For J = 1 To N
        Call CT.InitHereAndNow()                                ' Update transform
        CT.Azimuth = Az(J)
        CT.Elevation = Alt(J)
        On Error Resume Next
        Call SUP.StartSlewJ2000("Map-" & Util.FormatVar(I, "000"), _
                                CT.RightAscension, CT.Declination)
        If Err.Number = 0 Then
            On Error GoTo 0
            Console.PrintLine "  Az = " & CInt(Az(J)) & "  Alt = " & CInt(Alt(J))
            Voice.Speak "Doing mapping point " & I & "."
            Voice.Speak "Azimuth is " & Util.FormatVar(Az(J), "0") & ", altitude is " & Util.FormatVar(Alt(J), "0") & "."
            If SUP.HaveRotator Then SUP.StartRotateToPA 0.0, CT.RightAscension
            Call SUP.WaitForSlew
            If SUP.HaveRotator Then SUP.WaitForRotator
            If AcquireMapPoint(I, CT.RightAscension, CT.Declination) Then 
                Voice.Speak "OK, pointing error is " & Util.FormatVar(SUP.LastSolvePosErr, "0.00") & " arc minutes." 
                I = I + 1
            Else
                Voice.Speak "Point skipped, plate solution failed."
                Console.PrintLine "  **Point skipped, plate solution failed."
            End If
        Else                                                    ' Went unsafe
            On Error GoTo 0
            Voice.Speak "Point skipped, drifted out of limits during mapping."
            Console.PrintLine "  **Point skipped, out of limits during mapping."
        End If
    Next

End Function

' ------
' Main() - Main entry point for this script
' ------
'
Sub Main
    Dim AzE(), AzW(), AltE(), AltW()
    Dim ET, I, J, N, buf
    Dim dtStart, dtEnd

    Set CT = Util.NewCTHereAndNow()
    

    '
    ' Skip if corrector is off or Update Pointing turned off in prefs
    '
    If Not Util.PointingCorrectionEnabled Then
        Util.Console.PrintLine "  Pointing corrector is disabled. No point in continuing."
        Exit Sub
    End If
    If Not Util.AutoMappingEnabled Then
        Util.Console.PrintLine "  Auto-mapping is disabled. Cannot train corrector."
        Exit Sub
    End If
    If Not Prefs.PointingUpdates.Enabled Then
        Util.Console.PrintLine "  Pointing update (sync) is disabled. Cannot train corrector."
        Exit Sub
    End If
    
    Set FSO = CreateObject("Scripting.FileSystemObject")

    dtStart = Util.SysUTCDate
    buf = Util.FormatVar(dtStart, "dd-mmm-yyyy@HhNnSs") & ".log"    ' Typical Log Name
    Console.LogFile = Prefs.LocalUser.DefaultLogDir & "\" & buf     ' Log to this file
    Console.Logging = True

    Set SUP = CreateObject("ACP.AcquireSupport")
    Call SUP.Initialize()                                           ' (may log)
    If SUP.HaveFilters Then                                         ' If we have filters
        SUP.SelectFilter Prefs.CameraPrefs.ClearFilterNumber
    End If
    '
    ' (0) Ask if want existing model cleared (only if local)
    '
    buf = Util.PointingModelDir & "\Active.clb"
    If FSO.FileExists(buf) Then                                     ' If there is a current model
        If Console.AskYesNo("Clear/Save current model?") Then
            If Lock.Username = "local_user" Then
                FileDialog.DefaultExt = ".clb"                      ' Use a file browse box
                FileDialog.DialogTitle = "Save Active Model"
                FileDialog.Filter = "Calibration files (*.clb)|*.clb|All files (*.*)|*.*"
                FileDialog.FilterIndex = 1
                FileDialog.InitialDirectory = Util.PointingModelDir
                FileDialog.Flags = 2 + 4 + 2048                     ' Overwrite prompt, hide read only, path must exist
                If FileDialog.ShowSave  Then                        ' Show the box
                    FSO.CopyFile buf, FileDialog.FileName, True     ' If OK, copy active model
                End If
            Else
                FSO.CopyFile buf, Util.PointingModelDir & "\WebSavedModel.clb", True
                Console.PrintLine "Model saved to WebSavedModel.clb"
            End If
            Util.ResetPointingCorrection                        ' RESET THE MODEL
        End If
    End If
    '
    ' (1) Input number of points
    '
    Call Console.ReadLine("Number of points (empty to stop)?", 3)
    buf = Console.LastReadResult
    If buf = "" Then 
        SUP.Terminate
        Exit Sub
    End If
    N = CInt(buf)
    
    Voice.Speak "Starting " & N & " point training run."

    '
    ' (2) Form new arrays of Alt/Az. See GeneratePoints().
    '
    ' NOTE: Since the actual time of mapping is later than the time at which
    '       these "safe" points are generated, we'll re-check just before 
    '       acquiring and skip out of limits points.
    '
    Console.PrintLine "Beginning training run at " & Util.FormatVar(dtStart, "Hh:Nn:Ss") & " UTC"
    If FAST_TEST Then Console.PrintLine "Fast-Test mode, no image simulation"
    
    ReDim AzE(N/2)
    ReDim AltE(N/2)
    ReDim AzW(N/2)
    ReDim AltW(N/2)
    Randomize

    GeneratePoints AzE, AltE, N/2, False                        ' Generate points in east
    GeneratePoints AzW, AltW, N/2, True                         ' Generate points in west
    '
    ' (3) Now visit & do pointing update at each point
    '
    I = 1
    DoMapPoints AzE, AltE, N/2, I                               ' Do the eastern points
    DoMapPoints AzW, AltW, N/2, I                               ' Do the western points
    
    '
    ' (4) Wrap up...
    '
    dtEnd = Util.SysUTCDate
    ET = (CDbl(dtEnd) - CDbl(dtStart)) * 24.0
    Console.PrintLine "Training run completed at " & Util.FormatVar(dtEnd, "Hh:Nn:Ss") & " UTC"
    Console.PrintLine "Elapsed time " & Util.Hours_HMS(ET)
    SUP.Terminate
    Voice.Speak "Training run completed, " & I - 1 & " successful points."
    Console.Logging = False

End Sub                                                         ' Main

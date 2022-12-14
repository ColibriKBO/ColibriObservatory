'tabs=4
'------------------------------------------------------------------------------
'
' Script:       FindLimitingMagnitude.vbs
' Author:       Robert B. Denny <rdenny@dc3.com>
' Version:      8.0.1
' Requires:     ACP 8.0 or later!
'               Windows Script 5.6 or later
'
' Environment:  This script is written to run under the ACP scripting
'               console. 
'
' Description:  This script finds the limiting magnitude and corresponding
'               exposure time for the observatory. Run this on a night 
'               with conditions you would describe as "good". Do not 
'               run when there are any clouds, even high cirrus, or unusually
'               high humidity (for your location, that is).
'
'               Results are shown on the console (no log is produced)
'
' Revision History:
'
' Date      Who     Description
' --------- ---     --------------------------------------------------
' 17-Aug-04 rbd     Initial edit
' 08-Nov-04 rbd     New PlateScaleH/V properties in AcquireSupport.
' 28-Jul-05 rbd     4.1.1 - SUP.TakePicture() has 2 new parameters And
'                   SUP.SolvePlate() has one new param, for rotators
' 02-Aug-05 rbd     4.1.1 - Explicitly rotate to 0 PA 
' 24-Aug-05 rbd     4.1.2 - Change to StartRotateToPA()
' 21-Nov-05 rbd     4.1.3 - TakePicture() calling signature change
' 27-Oct-06	rbd		4.3.1 - Turn on autoguiding if it is enabled
' 19-Nov-06 rbd     5.0.2 - Change to SUP.TakePicture() for new #calibrate
'                   directive.
' 04-Dec-06	rbd		5.0.4 - Don't use 180 az! Use 165, for GEM flip avoidance.
' 24-Oct-08 rbd     5.1.0 (HF7) - New filter selection logic
' 06-Aug-14 rbd     7.2.1 - GEM: 838 Change to SUP.SolvePlate() for FWHM
'                   management. Don't bother here.
' 21-Feb-15 rbd     8.0.1 - GEM:1233 Several problems with this ancient script.
'----------------------------------------------------------------------------
'
Option Explicit                     ' Enforce variable declarations

Const InitExpTime = 30              ' Start with 30 sec exposure
Const MagStep = 1.0                 ' Step exposures For 1 mag deeper
Const MaxExpTime = 900              ' Up To 15 minutes exposure Time
Const MinimumSNR = 3.0              ' SNR for "detectable" objects

Dim SUP                             ' Global for annunciators

Function Log10(x)                                               ' Log in VB is natural Log
    Log10 = Log(x) / Log(10)
End Function

'
' Return the limiting magnitude (per PinPoint) for the given exposure interval
' If plate solution fails, (exposure too short) return 0. Measures at current
' telescope location, and possibly offsets if can't solve at that loc (galaxy
' or whatever). Leaves the scope at the location where the successful solve 
' was done.
'
Function CheckLimitingMag(ExpTime, RA, Dec)
    Dim P, ImageFile, Stars, Star, LM
    '
    ' (1) Make target And file names (no extension). Delete old image file.
    '
    ImageFile = Prefs.LocalUser.DefaultImageDir & "\LimMagTest" ' No extension
    On Error Resume Next
    FSO.DeleteFile ImageFile & ".fts"                           ' Delete old image with this name
    On Error Goto 0
    '
    ' (2) Take an image at the given exposure interval
    '
    Call SUP.TakePicture(ExpTime, 1, 1.0, 0.0, Prefs.CameraPrefs.ClearFilterNumber, _
                        ImageFile, "", True, False, False, False, Prefs.LocalUser.Name, _
                        "LimMagTest", RA, Dec, _
                        False, "", "", 0.0, 0.0, False, 0.0)
    '
    ' (3) Plate solve it
    '
    If Not SUP.SolvePlate(ImageFile & ".fts", RA, Dec, 0.0, SUP.PlateScaleH, SUP.PlateScaleV, _
                        0, Prefs.PointingUpdates.Sigma, 300, _
                        Prefs.PointingUpdates.CatalogMaximumMagnitude, _
                        60, False, False) Then
        Console.PrintLine "**Failed to solve at " & Util.FormatVar(ExpTime, "0.0") & "sec."
        CheckLimitingMag = 0.0                                  ' Failure value
        Exit Function
    End If
    
    '
    ' OK, it solved :-) Now we have the Magnitude transformation (well, more or less)
    '
    Set P = CreateObject("PinPoint.Plate")
    Call P.AttachFITS(ImageFile & ".fts")
    P.SigmaAboveMean = 2.5                                      ' Scan at high sensitivity
    P.ArcsecPerPixelHoriz = SUP.PlateScaleH
    P.ArcsecPerPixelVert = SUP.PlateScaleV
    P.InnerAperture = 12                                        ' Fixed aperture for consistent flux measurements
    P.OuterAperture = 36                                        ' These are Landolt standard sizes
    P.ColorBand = 3                                             ' Mag fits require specified band
    P.FindImageStars()
    Set Stars = P.ImageStars
    Call Stars.Sort(0, 0)                                       ' Sort by raw flux, ascending, so...
    For Each Star In Stars                                      ' ... starts with faintest detected star!
        '
        ' We assume that the faintest usable Star is at MinimumSNR
        '
        If (Star.RawFlux / Star.Area) > (MinimumSNR * P.LocalBackgroundSigma(Star.X, Star.Y)) Then
            CheckLimitingMag = Star.RedMagnitude                ' Specific band here too
            Exit Function                                       ' DONE!!!
        End If
    Next
    '
    ' Something is really wrong
    '
    Console.PrintLine "** No usable stars detected at " & Util.FormatVar(ExpTime, "0.0") & "sec."
    CheckLimitingMag = 0.0                                      ' Failure value
End Function


'
' Entry For ACP console
'
Sub Main()
    Dim CT, LM, LMPrev, ExpTime, ExpTimePrev, ExpStepMultiple, ConvergenceTol
    
    Set SUP = CreateObject("ACP.AcquireSupport")
    SUP.Initialize
    '
    ' Slew to some reasonable location that's safe for German mounts
    ' The slew stes the image simulator coordinates too.
    '
    Set CT = Util.NewCTHereAndNow()
    CT.Azimuth = 165
    CT.Elevation = 60
    Call SUP.StartSlewJ2000("LimMagTest", CT.RightAscension, CT.Declination)
    If SUP.HaveRotator Then SUP.StartRotateToPA 0.0, CT.RightAscension ' Do this at 0 PA, tgt RA
    Call SUP.WaitForSlew()
    If SUP.HaveRotator Then SUP.WaitForRotator

    Call SUP.SelectFilter(Prefs.CameraPrefs.ClearFilterNumber)
	
    ExpTime = InitExpTime
    ExpTimePrev = InitExpTime
    ExpStepMultiple = 10 ^ (MagStep / 2.5)
    ConvergenceTol = MagStep / 3                                ' Stop when mag increases only 1/3 of the Step
    LMPrev = -1
	If Prefs.AutoGuiding.Enabled Then 							' If have guider, just turn it on
		Console.PrintLine "  Guider available, starting it now for the whole series..."
		SUP.AutoGuide(True)
		If Not SUP.Guiding Then Exit Sub
	End If
    Do While ExpTime <= MaxExpTime
        LM = CheckLimitingMag(ExpTime, CT.RightAscension, CT.Declination)
        If LM = 0.0 Then
            Console.PrintLine "**Try increasing the initial exposure interval"
		If Prefs.AutoGuiding.Enabled Then SUP.AutoGuide(False)
            Exit Sub                                            ' SCRIPT ENDS IN FAILURE
        End If
        Console.PrintLine "  Got LM of " & Util.FormatVar(LM, "0.00") & " @ " & ExpTime & " sec."
        '
        ' There's more to this than meets the eye: When exposures get too
        ' long, PinPoint starts detecting noise as stars, and the
        ' limiting mag can go backwards. This is also a termination
        ' condition. 
        '
        If (LM - LMPrev) < ConvergenceTol Then Exit Do          ' GOT IT!
        LMPrev = LM
        ExpTimePrev = ExpTime
        ExpTime = CInt(ExpTime * ExpStepMultiple)
    Loop
	If Prefs.AutoGuiding.Enabled Then SUP.AutoGuide(False)
    If ExpTime >= MaxExpTime Then 
        Console.PrintLine "Failed to converge"
    Else
        '
        ' The last measurement failed to increase the faintest mag by
        ' more than ConvergenceTol, so the previous step was the one 
        ' that achieved the limiting mag.
        '
        Console.PrintLine "------------------------------------------------"
        Console.PrintLine "For minimum star SNR of " & Util.FormatVar(MinimumSNR, "0.0") & " the"
        Console.PrintLine "limiting mag is " & Util.FormatVar(LMPrev, "0.00") & _
                            " @ " & CInt(ExpTimePrev) & " sec."
        Console.PrintLine "------------------------------------------------"
    End If
    
    SUP.Terminate
End Sub

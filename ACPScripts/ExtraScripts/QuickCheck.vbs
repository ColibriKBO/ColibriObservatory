Option Explicit
'
' MaxPoint calibration file format is comma delimited text, 8 fields per line.
' Booleans are "#TRUE#" and "#FALSE#". File extension is ".clb" (calibration)
'
' First line:   Number of entries to follow
'
' Remaining lines - Fields:
'
'   1.  Observed RA (local topo, rad)
'   2.  Observed Dec (local topo, rad)
'   3.  True RA (local topo, rad)
'   4.  True Dec (local topo, rad)
'   5.  Point taken west of GEM pier (boolean, #TRUE#/#FALSE#, no quotes)
'   6.  Local Sidereal Time (rad)
'   7.  Target name (string, enclosed in double quotes)
'   8.  Include obs in calibration (boolean, #TRUE#/#FALSE#, no quotes)
'
'
' Variables used in multiple functions
Dim SUP                                                     ' Acquire support object
Dim FSO                                                     ' A FileSystemObject
Const PI = 3.141592653589793
Const RADDEG = 57.2957795131
Const DEGRAD = 0.0174532925
Const HRRAD = 0.2617993878
'
' Required by SUP.TakePicture())
'
Dim exposureInterval
Dim exposureProgress
Dim exposureActive
Dim previewReady

'----------------------------------------------------------------------------------------
'
' ----------
' CheckPoint() - Return the pointing error, arcmin, at coordinates
' ----------
'
' Parameters:
'   N                   Point number
'   RightAscension      J2000 RA of point, hours
'   Declination         J2000 Dec of point, degrees
'   CalFile             Full pathnameof cal file to append map point
'
' Returns:              MaxPoint calibration file record (string)
'
'----------------------------------------------------------------------------------------
Function CheckPoint(N, RightAscension, Declination)
    Dim P, TgtName, ImageFile, RATrue, DecTrue, buf
    '
    ' (1) Make target and file names (no extension). Delete old image file.
    '
    TgtName = "Map-" & CStr(N)
    ImageFile = Prefs.LocalUser.DefaultImageDir & "\" & TgtName ' No extension
    On Error Resume Next
    FSO.DeleteFile ImageFile & ".fts"                           ' Delete old image with this name
    On Error Goto 0
    '
    ' (2) Slew to the mapping point unless GEM and within 4 deg of meridian
    '
    Console.PrintLine "Doing point " & N & " - slew to point."
    If Telescope.AlignmentMode = 2 And Abs(Util.HourAngle12(RightAscension) * 15.0) < 4.0 Then
        Console.printLine "**Too close to meridian now. Cannot know flip state, skipped."
        CheckPoint = 0.0                                          ' Impossibly good value, error
        Exit Function
    End If
    SUP.StartSlewJ2000 TgtName, RightAscension, Declination
    If SUP.HaveRotator Then SUP.StartRotateToPA 0.0, RightAscension
    SUP.WaitForSlew
    If SUP.HaveRotator Then SUP.WaitForRotator
    '
    ' (3) Take a pointing image. If successful, this leaves the scope at the
    ' possibly offset location.
    '
    If Not SUP.TakePointingImage(TgtName, ImageFile, RightAscension, Declination, 0.0) Then
        Console.PrintLine "**Failed to check at point " & N
        CheckPoint = 0.0                                        ' Impossibly good value, error
        Exit Function                                           ' Slewed back from offset
    End If
    '
    ' (4) Grab the true coordinates from the pointing image. We know it solved.
    '
    Set P = CreateObject("PinPoint.Plate")
    If SUP.HavePinPoint4 Then
        Call P.AttachNoImage(ImageFile & ".fts")                ' Fast attach
    Else
        Call P.AttachFITS(ImageFile & ".fts")
    End If
    RATrue = P.RightAscension
    DecTrue = P.Declination
    Console.PrintLine "  Plate shows " & Util.Hours_HMS(RATrue) & " " & Util.Degrees_DMS(DecTrue)
    '
    ' (5) Return the pointing error
    '
    CheckPoint = SUP.EquDist(RightAscension, Declination, RATrue, DecTrue)
     
End Function

'----------------------------------------------------------------------------------------
'
' -----------------
' CheckSlewLimits() - Check alt/az coordinates for configured slew limits
' ----------------
'
' Cannot conveniently use Util.EnforceSlewLimits() because it is for the current
' time and takes RA/Dec. The mapping process takes time, so we must convert to 
' RA/Dec at the last possible moment. We need this check during winnowing of points
' before starting the mapping run... The conversion to RA/Dec for polar tilt-up 
' limit is not time sensitive.
'----------------------------------------------------------------------------------------
Function CheckSlewLimits(Az, Alt)
    Dim CT, RA, DE
    
    CheckSlewLimits = True                                  ' Assume success
    If Alt <= Prefs.MinimumElevation Then  
        CheckSlewLimits = False
        Exit Function
    End If
    If Alt <= Prefs.GetHorizon(Az) Then 
        CheckSlewLimits = False
        Exit Function
    End If
    Select Case Telescope.AlignmentMode
        Case 0:                                             ' ALt/Az mount
            If Alt >= Prefs.TiltUpLimit Then
                CheckSlewLimits = False
            Exit Function
    End If
        Case Else:                                          ' Polar (fork or german)
            Set CT = Util.NewCTHereAndNow()                 ' Need Dec for test
            CT.Azimuth = Az
            CT.Elevation = Alt
            If CT.Declination > Prefs.TiltUpLimit Then CheckSlewLimits = False
            Set CT = Nothing
    End Select
    
End Function

'----------------------------------------------------------------------------------------
'
' ------
' Main() - Main entry point for this script
' ------
'
'----------------------------------------------------------------------------------------
Sub Main
    Dim buf
    
    Set FSO = CreateObject("Scripting.FileSystemObject")
    Set SUP = CreateObject("ACP.AcquireSupport")
    Call SUP.Initialize()
    
    buf = Util.FormatVar(Util.SysUTCDate, "dd-mmm-yyyy@HhNnSs") & ".log"    ' Typical Log Name
    Console.LogFile = Prefs.LocalUser.DefaultLogDir & "\" & buf ' Log to this file
    Console.Logging = True

    Console.PrintLine Util.FormatVar(CheckPoint(1, 22, 20) * 60, "0.000") & " arcmin error"
    '
    ' (8) Wrap up...
    '
    SUP.Terminate
    Console.Logging = False

End Sub                                                         ' MAIN

'tabs=4
'------------------------------------------------------------------------------
'
' Script:       FindFocalLength.vbs
' Author:       Robert B. Denny <rdenny@dc3.com>
' Version:      4.1.2
' Requires:     ACP 4.0 or later!
'               Windows Script 5.6 or later
'
' Environment:  This script is written to run under the ACP scripting
'               console. 
'
' Description:  This script takes an image, plate solves, then reports
'               both true focal length and plate scales.

' Revision History:
'
' Date      Who     Description
' --------- ---     --------------------------------------------------
' 19-May-03 rbd     Initial edit
' 03-Mar-04 rbd     Select clear filter, using new focus offset call
' 04-Mar-04 rbd     3.1.3 - New SUP.Terminate() call at script end
' 18-Mar-04 rbd     3.2 - Now version 3.2
' 24-Sep-04 rbd     4.0 - Cleanups, use J2000
' 02-Aug-05 rbd     4.1.1 - Change to TakePointingImage for rotators
'                   rotate to 0 deg.
' 24-Aug-05 rbd     4.1.2 - Change to StartRotateToPA()
' 28-Jun-12 rbd     7.0.1 - Report FL in millimeters
' 24-May-15 rbd     8.0.1 - GEM:1315 Cannot put image files into ProgFiles!
'----------------------------------------------------------------------------
'
Option Explicit                                                 ' Enforce variable declarations

Dim SUP

Sub Main()
    Dim RA, Dec, fn, plate, sx, sy, fl
    
    Set SUP = CreateObject("ACP.AcquireSupport")
    SUP.Initialize
    If SUP.HaveFilters Then                                     ' If we have filters
        SUP.SelectFilter Prefs.CameraPrefs.ClearFilterNumber
    End If
    RA = Telescope.RightAscension                               ' Some close J2000 coordinates
    Dec = Telescope.Declination
    SUP.StartSlewJ2000 "test point", RA, Dec                    ' Just to be sure
    If SUP.HaveRotator Then SUP.StartRotateToPA 0.0, RA         ' Do this at 0 PA, tgt RA
    SUP.WaitForSlew
    If SUP.HaveRotator Then SUP.WaitForRotator
    
    Util.Console.PrintLine "  Acquiring mapping point..."
    '
    ' Make the pointing exposure pathname (no ext. per TakeImage)
    '
    fn = Util.Prefs.LocalUser.DefaultImageDir & "\PointingExps\GetFL"
    '
    ' Acquire the pointing exposure and try to solve it. 
    '
    If Not SUP.TakePointingImage("GetFL", fn, RA, Dec, 0) Then
        Util.Console.PrintLine "** Failed to solve plate"
        SUP.Terminate
        Exit Sub                                                ' FAILED, JUST RETURN
    End If
    '
    ' OK we now have the real plate scales. Knowing the pixel sizes,
    ' we can compute the focal length.
    '
    Set plate = CreateObject("PinPoint.Plate")
    
    If SUP.HavePinPoint4 Then                                    ' If PinPoint 4 installed
        plate.AttachNoImage fn & ".fts"                         ' Fast attach, to read ra/dec
    Else
        plate.AttachFITS fn & ".fts"                            ' Attach, read ra/dec
    End If
    sx = Abs(plate.ArcsecPerPixelHoriz) / CDbl(plate.ReadFITSValue("XBINNING"))
    sy = Abs(plate.ArcsecPerPixelVert) / CDbl(plate.ReadFITSValue("YBINNING"))
    Console.PrintLine "Solved. True optical characteristics:"
    Console.PrintLine "  Horiz plate scale = " & Util.FormatVar(sx, "0.00")
    Console.PrintLine "  Vert  plate scale = " & Util.FormatVar(sy, "0.00")
    Console.PrintLine "  Focal Length = " & _
            Util.FormatVar(Camera.PixelSizeX * 206.0 / sx, "0.0") & " mm."
    plate.DetachFITS
    Set plate = Nothing
    SUP.Terminate

End Sub

'tabs=4
'------------------------------------------------------------------------------
'
' Script:       FindBrightStar.vbs
' Author:       Robert B. Denny <rdenny@dc3.com>
' Version:      7.0.1
' Requires:     ACP 7.0 or later!
'               Windows Script 5.6 or later
'
' Environment:  This script is written to run under the ACP scripting
'               console. 
'
' Description:  This script slews the scope to the nearest mag 6-9 star
'               which does not have anything else within 10 arcseconds.
'               It then does a pointing update and if needed a re-slew
'               to get the star centered.
'
' Revision History:
'
' Date      Who     Description
' --------- ---     --------------------------------------------------
' 11-Mar-04 rbd     Initial edit
' 07-Apr-04 rbd     3.0 - Move exposure progress vars and preview ready into 
'                   SUP properties. Eliminate dependence of SUP on vars
'                   defined here.
' 24-Sep-04 rbd     4.0 - Add slewing and pointing update.
' 12-Aug-05 rbd     4.1.1 - UpdatePointing() changed for rotator support,
'                   Leave rotator where it is for this.
' 27-Jun-12 rbd     7.0.1 - GEM:80 Function now takes a filter number, so
'                   just use the configured "clear" one.
' 24-Jan-14 rbd     7.1.0 - GEM:1004 Catch failure of SUP.FindBrightStar()
'----------------------------------------------------------------------------
'
Option Explicit                     ' Enforce variable declarations

Dim SUP                             ' Global for annunciators

Sub Main()
    Dim starRA, starDec, starMag, PA, ans, filt
    
    Set SUP = CreateObject("ACP.AcquireSupport")
    Call SUP.Initialize()
    If SUP.HaveFilters Then
        Console.PrintLine "FYI, clear filter is #" & Prefs.CameraPrefs.ClearFilterNumber
        Do While True 
            ans = Console.ReadLine("Filter to use:", 1)   ' Ask for reference filter #
            If ans = 13 Then                                        ' User pressed Cancel
                SUP.Terminate
                TrackOff
                Exit Sub                                            ' [RET] Exit script
            End If        
            filt = CInt(Console.LastReadResult)             ' Reference filter number
            If filt >= 0 And filt <= UBound(Camera.FilterNames) Then
                Exit Do
            Else
                Console.PrintLine "Filter # must be between 0 and " & maxFilterNum
            End If
        Loop

    End If
    If SUP.HaveRotator Then PA = SUP.RotatorPositionAngle Else PA = 0.0
    If Not SUP.FindBrightStar(Telescope.RightAscension, Telescope.Declination, _
                                filt,  starRA, starDec, starMag) Then
        Console.PrintLine "** NO STARS FOUND **"
    Else
        Console.PrintLine "  Found star at mag " & Util.FormatVar(starMag, "0.0") & _
                " Slew to star."
        Call SUP.StartSlewJ2000("Bright Star", starRA, starDec)
        Call SUP.WaitForSlew()
        Call SUP.UpdatePointing("Bright Star", starRA, starDec, PA)
        Console.PrintLine "Star is now centered in view"
    End If
    SUP.Terminate
    
End Sub

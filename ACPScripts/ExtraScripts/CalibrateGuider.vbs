'tabs=4
'------------------------------------------------------------------------------
'
' Script:       CalibrateGuider.vbs
' Author:       Robert B. Denny <rdenny@dc3.com>
' Version:      8.0
' Requires:     ACP 8.0 or later!
'               Windows Script 5.6 or later
'
' Environment:  This script is written to run under the ACP scripting
'               console. 
'
' Description:  This script performs a "smart" guider calibration using
'               the ACP AcquireSupport component method.

' Revision History:
'
' Date      Who     Description
' --------- ---     --------------------------------------------------
' 11-Mar-03 rbd     Initial edit
' 07-Apr-03 rbd     3.0 - Move exposure progress vars and preview ready into 
'                   SUP properties. Eliminate dependence of SUP on vars
'                   defined here.
' 04-Mar-04 rbd     3.1.3 - New SUP.Terminate() call at script end
' 18-Mar-04 rbd     3.2 - Now version 3.2
' 20-Jun-12 rbd     7.0 - GEM:712 Assure looking east (on west of pier)
' 23-Jan-14 rbd     7.1 - GEM:957 Test SideOfPier only if known GEM
' 18-May-15 rbd     8.0 - GEM:1350 Move east-west check into AcquireSupport,
'                   Add startup questions, connect rotator as needed.
'----------------------------------------------------------------------------
'
Option Explicit                     ' Enforce variable declarations

Dim SUP

Sub Main()
    Dim ans

    If Not Prefs.Autoguiding.Enabled Then
        Console.PrintLine "Autoguiding is disabled in ACP, cannot continue."
        Exit Sub
    End If
    If Rotator.Configured And Not Rotator.Available Then
        If Console.AskYesNo("Shall I connect the rotator now?") Then
            Util.RotatorConnected = True
        Else
            Console.PrintLine "Rotator is required. Connect or fix it."
            Exit Sub
        End If
    End If
    If Prefs.Autoguiding.SensorType <> 0 Then           ' 1 or 2 => Internal/OAG
        If Not Console.AskYesNo("Bright star already in guider?") Then Exit Sub
    End If
    
    Set SUP = CreateObject("ACP.AcquireSupport")
    SUP.Initialize
    If Not SUP.CalibrateGuider(Telescope.RightAscension, Telescope.Declination) Then _
        Console.printLine "***Calibration failed."
    SUP.Terminate

End Sub

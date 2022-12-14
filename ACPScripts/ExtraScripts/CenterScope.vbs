'tabs=4
'------------------------------------------------------------------------------
'
' Script:       CenterScope.vbs
' Author:       Robert B. Denny <rdenny@dc3.com>
' Version:      7.1.1
' Requires:     ACP 7.0 or later!
'               Windows Script 5.6 or later
'
' Environment:  This script is written to run under the ACP scripting
'               console. 
'
' Description:  This script performs a normal pointing update using PinPoint
'               to center the scope. If the scope can be synced, it will do
'               that, else it will jog the scope.

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
' 21-Jun-04 rbd     3.3 - Display camera roll angle
' 25-Feb-05 rbd     4.1.1 - Remove roll angle, now shown by AcquireSupport.
'                   Use new SUP.LocalTopocentricToJ2000(), no slew needed
'                   unless using image simulator.
' 06-Aug-05 rbd     4.1.2 - Rotator support, changes to AcquireSupport functions.
' 24-Aug-05 rbd     4.1.3 - Change to StartRotateToPA()
' 01-Nov-05 rbd     4.1.4 - Remove slew for simulation, use new 
'                   CalcSimImageCoordinates().
' 29-Nov-10 rbd     6.0.1 - no GEM, turn tracking on.
' 06-Jul-12 rbd     7.0.1 - no GEM, Rename this so it's clear it can be used
'                   with scopes that cannot be synced.
' 24-Oct-13 rbd     7.1.1 (7.1) - GEM:1028 Handle scopes that use J2000
'----------------------------------------------------------------------------
'
Option Explicit                     ' Enforce variable declarations

Dim SUP                             ' Global for annunciators

Sub Main()
    Dim RA, Dec, PA
    
    Set SUP = CreateObject("ACP.AcquireSupport")
    SUP.Initialize
    If SUP.ScopeNeedsLocalTopo Then
        SUP.LocalTopocentricToJ2000 Telescope.RightAscension, Telescope.Declination
        RA = SUP.J2000RA
        Dec = SUP.J2000Dec
    Else
        RA = Telescope.RightAscension
        Dec = Telescope.Declination
    End If
    If SUP.HaveRotator Then PA = SUP.RotatorPositionAngle Else PA = 0.0
    If Prefs.PointingUpdates.Simulate Then  ' Using sim, need coordinates for image simulator
        SUP.CalcSimImageCoordinates RA, Dec
    End If
    If Telescope.CanSetTracking Then Telescope.Tracking = True
    If Not SUP.UpdatePointing("ScopeCenter", RA, Dec, PA) Then 
        Console.printLine "***Scope centering failed."
    End If
    SUP.Terminate

End Sub

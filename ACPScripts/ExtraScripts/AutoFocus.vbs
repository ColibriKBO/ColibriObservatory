'tabs=4
'------------------------------------------------------------------------------
'
' Script:       AutoFocus.vbs
' Author:       Robert B. Denny <rdenny@dc3.com>
' Version:      5.1.2
' Requires:     ACP 5.1 or later!
'               Windows Script 5.6 or later
'
' Environment:  This script is written to run under the ACP scripting
'               console. 
'
' Description:  This script performs a "smart" autoFocus using
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
' 04-Dec-06	rbd		4.0 - Ask for filter, switch. 
' 02-Sep-07 rbd     5.1 - Add logging
' 17-Apr-08 rbd		5.1.1 - (HF6) Fix no-filter use
' 24-Oct-08 rbd     5.1.2 - (HF7) New filter control logic
' 11-Aug-16 rbd     8.1.0 - GEM:1430 Fix tracking control and make logging 
'                   start right at the beginning.
'----------------------------------------------------------------------------
'
Option Explicit                     ' Enforce variable declarations

Dim SUP                             ' Global for annunciators

Sub Main()
	Dim Filt, dtStart, buf

    dtStart = Util.SysUTCDate
    buf = "AutoFocus-" & Util.FormatVar(dtStart, "dd-mmm-yyyy@HhNnSs") & ".log"    ' Typical Log Name
    Console.LogFile = Prefs.LocalUser.DefaultLogDir & "\" & buf     ' Log to this file
    Console.Logging = True

	If Not Telescope.Tracking Then 
		Console.PrintLine "Turning on Tracking for AP mounts"
		Telescope.Tracking = True	' For Astro-Physics
	End If
	
    Set SUP = CreateObject("ACP.AcquireSupport")
    SUP.Initialize
    
    If SUP.HaveFilters Then
    	If Console.ReadLine("Filter to use:", consOkCancel) = consCancel Then 
	    	SUP.Terminate
			If Telescope.Tracking then Telescope.Tracking = False
	    	Exit Sub
	    End If
	End If

    Filt = Console.LastReadResult
    
    If SUP.HaveFilters Then
        SUP.SelectFilter SUP.DecodeFilter(Filt)
	    Console.PrintLine "Autofocus through " & Filt
	End If
	
    If Not SUP.AutoFocus(Telescope.RightAscension, Telescope.Declination) Then _
        Console.printLine "***AutoFocus failed."
        
    SUP.Terminate
	If Telescope.Tracking then Telescope.Tracking = False
	
    Console.Logging = False

End Sub

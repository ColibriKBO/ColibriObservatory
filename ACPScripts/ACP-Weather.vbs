'
' Standard ACP Weather Safety script. Please see ACP Help, Customizing ACP, 
' Adding to ACP's Logic, Weather Safety Script. If you have a real dome Or
' if the scope can clear your roll-off roof under all conditions, then 
' you can adjust this so that the dome/roof closes right away. 
'
' NOTE: This assumes tht you have the ACP Dome Control option "Close and 
'       park/home [dome] AFTER scope is parked by script" ON/Set. 
'
' NOTE: To have your safe roof or real dome close right away, turn OFF the 
'       above option and uncomment the indicated lines for opening the dome
'
' This runs when there is a weather unsafe event.
'
Sub Main()
    Dim FMX, PWAF
    Console.PrintLine "Weather Safety... script initiated"
    On Error Resume Next                        ' Best efforts...
    '
    ' FOR SAFE DOME/ROOF - See the two NOTEs above, then
    ' Uncomment next 4 lines after turning option in ACP OFF
    '
   If Dome.ScopeClearsClosedDome Then
       Console.PrintLine "Closing roof/shutter."
       Dome.CloseShutter                       ' Harmless if no dome/roof
   End If
    '
    ' ACP 8 and later stops focusing internally, no need for doing that here.
    '
    ' *** Park Telescope 
    If Telescope.Connected Then
        Console.PrintLine "...scope is connected, parking now"
        Telescope.Park     ' Default setting in ACP, this parks and closes the dome/roof in that order
        Console.PrintLine "...scope is parked"
    End If
    '
    Console.PrintLine "Weather Safety...script completed successfully"

    Console.PrintLine "Starting scheduling script..."
    Util.ChainScript("RunColibri.js")
End Sub

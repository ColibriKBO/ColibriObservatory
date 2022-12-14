'tabs=4
'------------------------------------------------------------------------------
'
' Script:       Sky6MosaicToPlan.vbs
' Author:       Robert B. Denny <rdenny@dc3.com>
' Version:      1.1
' Requires:     ACP 4.2 or later!
'               Windows Script 5.6 or later
'
' Environment:  This script is written to run on the desktop via Windows Script.
'               If run in the ACP scripting console. it will pop up a message
'               explaining that  and refer to the help docs.
'
' Description:  This script converts a mosaic export from TheSky 6 into the 
'               start of ACP Plan, then displays the result in Notepad. At
'               that time, the user can add directives.
'
' Usage:        1. Put a shortcut to this script on your Desktop.
'               2. Export your mosaic from TheSky 6 as a text file
'               3. Drag and drop the export file to the icon for this script
'               4. When Notepad openes, add directives as needed and save 
'                  to your Plans folder.
'
' Revision History:
'
' Date      Who     Description
' --------- ---     --------------------------------------------------
' 30-Jan-06 rbd     Initial edit
' 09-Jan-07 rbd     Fix negative dec (oops!)
'----------------------------------------------------------------------------
'
Option Explicit
Dim FSO, ARGS, SHL, InFile, TmpName, TmpFile, buf, tile, ra, dec

Set FSO = CreateObject("Scripting.FileSystemObject")
On Error Resume Next                                    ' Catch running inside ACP
Set ARGS = WScript.Arguments
If Err.Number = 0 Then
    On Error GoTo 0
    If ARGS.Count = 0 Then
        WScript.Echo "Drop a Sky6 mosaic file onto the script icon."
        WScript.Quit
        
    End If
    Set InFile = FSO.OpenTextFile(ARGS(0))
    TmpName = FSO.GetTempName()
    Set TmpFile = FSO.CreateTextFile(TmpName, True)
    TmpFile.WriteLine "; Save this mosaic plan to your Plans folder."
    Do While Not InFile.AtEndOfStream
        buf = InFile.ReadLine()
        If buf <> "" Then
            tile = CInt(Trim(Mid(buf, 7, 4)))
            ra = CDbl(Trim(Mid(buf, 13, 11)))
            dec = CDbl(Trim(Mid(buf, 25, 12)))
            TmpFile.WriteLine "Mosaic_" & tile & Chr(9) & ra & Chr(9) & dec
        End If
    Loop
    InFile.Close
    TmpFile.Close
    
    Set SHL = CreateObject("Wscript.Shell")
    SHL.Run "Notepad """ & TmpName & """"
End If

Sub Main()
    MsgBox "This script is designed to run from your desktop." & VbCrLf & _
            "See ACP Help, Standard Scripts for more info", _
            (vbOKOnly + vbInformation), "TheSky 6 Mosaic To Plan"
End Sub
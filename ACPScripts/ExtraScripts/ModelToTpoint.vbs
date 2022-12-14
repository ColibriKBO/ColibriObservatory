'tabs=4
'------------------------------------------------------------------------------
'
' Script:       ModelToTpoint.vbs
' Author:       Robert B. Denny <rdenny@dc3.com>
' Version:      4.0
' Requires:     ACP 4.0 or later!
'               Windows Script 5.6 or later
'
' Environment:  This script is written to run under the ACP scripting
'               console. 
'
' Description:  This script converts an ACP model file into a file that
'               can be read into the TPOINT Telescope Analysis Software.
'               The output is a text file suitable for IMPORT into
'               TPOINT. To get thi

' Revision History:
'
' Date      Who     Description
' --------- ---     --------------------------------------------------
' 08-Oct-04 rbd     Initial edit - From old MP2TP script
'----------------------------------------------------------------------------
'
Option Explicit

Const RADDEG = 57.29577951308                               ' 180 / pi

Function TPointDMS(val, dp)
    TPointDMS = Util.Degrees_DMS(val, " ", " ", "", dp)
    If Left(TPointDMS, 1) <> "-" Then TPointDMS = "+" & TPointDMS
End Function

Sub Main()
    Dim n, nObs, MPLine, bits, TPLine
    Dim MPFile, TPFile, MPStream, TPStream
    Dim FSO
    
    Set FSO = CreateObject("Scripting.FileSystemObject")
    
    FileDialog.DefaultExt = ".clb"                          ' Use a file browse box
    FileDialog.DialogTitle = "Specify ACP Model File"
    FileDialog.Filter = "Calibration files (*.clb)|*.clb|All files (*.*)|*.*"
    FileDialog.FilterIndex = 1
    FileDialog.Flags = 4 + 4096                             'Hide read only, file must exist
    FileDialog.InitialDirectory = Util.PointingModelDir
    If Not FileDialog.ShowOpen  Then
        Exit Sub
    End If
    MPFile = FileDialog.FileName 
    
    
    FileDialog.FileName = FSO.GetBaseName(MPFile) & ".dat"
    FileDialog.DefaultExt = ".dat"                          ' Use a file browse box
    FileDialog.DialogTitle = "Specify TPoint import file"
    FileDialog.Filter = "TPoint text files (*.dat)|*.dat|All files (*.*)|*.*"
    FileDialog.FilterIndex = 1
    FileDialog.Flags = 2 + 4 + 2048                         ' Overwrite prompt, hide read only, path must exist
    If Not FileDialog.ShowSave  Then                        ' Show the box
        Exit Sub
    End If
    TPFile = FileDialog.FileName
    
    Console.PrintLine "Converting " & FSO.GetFileName(MPFile) & " to " & FSO.GetFileName(TPFile)
    
    Set MPStream = FSO.OpenTextFile(MPFile, 1)              ' Open the MaxPoint CLB file
    Set TPStream = FSO.CreateTextFile(TPFile, 2)            ' Create the TPoint DAT file
    
    '
    ' Telescope name
    '
    TPStream.WriteLine Telescope.Name & " (ASCOM)"          ' First line, name of scope
    '
    ' Observing parameters. ACP does not have pressure; use 1012 mB,
    ' use 40% humidity, 550nm wavelength, .0065 adiabatic lapse rate
    '
    TPStream.WriteLine TPointDMS(Telescope.SiteLatitude, 0) & _
                    "  " & CStr(Year(Now())) & " " & CStr(Month(Now())) & " " & CStr(Day(Now())) & _
                    " " & Util.FormatVar(Util.Prefs.SiteTemperature, "#0.00") & _
                    " 1000.00" & _
                    " " & Util.FormatVar(Telescope.SiteElevation, "###0.00") & _
                    "  0.40 0.5500 0.0065"
    '
    ' Convert the observation lines
    '
    nObs = CInt(MPStream.ReadLine())
    For n = 1 To nObs                                       ' For each line of the CLB file
        TPLine = ""                                         ' Build TPoint line here
        MPLine = MPStream.ReadLine()                        ' Read a line
        bits = Split(MPLine, ",")                           ' Split into bits on commas
        TPLine = TPLine & Util.Hours_HMS((CDbl(bits(0)) * RADDEG / 15.0), " ", " ", "", 2) & "  "
        TPLine = TPLine & TPointDMS(CDbl(bits(1)) * RADDEG, 1) & "  "
        TPLine = TPLine & Util.Hours_HMS((CDbl(bits(2)) * RADDEG / 15.0), " ", " " , "", 2) & "  "
        TPLine = TPLine & TPointDMS(CDbl(bits(3)) * RADDEG, 1) & "   "
        TPLine = TPLine & Util.Hours_HM((CDbl(bits(5)) * RADDEG / 15.0), " ", "", 2)
        Call TPStream.WriteLine(TPLine)
    Next
    TPStream.Close
    MPStream.Close
    Console.PrintLine "Conversion completed."
    
End Sub
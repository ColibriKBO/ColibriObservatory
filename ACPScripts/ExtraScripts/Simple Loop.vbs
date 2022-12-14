'
' History
'
' 05-Jun-2002   rbd 2.1C    Start version control
'
Option Explicit

Dim g_bQuit

Sub Main()
    Dim i

    i = 0
    g_bQuit = False
    Console.PrintLine "Click ""Signal Script"" to stop"
    While Not g_bQuit
        Console.PrintLine i & " sheep"
        Util.WaitForMilliseconds 1000
        i = i + 1
    Wend
    Console.PrintLine "Stopped by signal."

End Sub

Sub Alert()
    g_bQuit = True
End Sub


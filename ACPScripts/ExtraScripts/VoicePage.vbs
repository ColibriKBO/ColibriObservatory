'
' History
'
' 05-Jun-2002   rbd 2.1C    Start version control
'
Sub Main()
    If Not Voice.Active Then
        Console.PrintLine "Sysop has voice disabled"
        Exit Sub
    End If
    button = Console.ReadLine("Voice message for sysop:", consOkCancel)
    If button = consOK Then Voice.Speak Console.LastReadResult
    Console.PrintLine "Sysop has been voice-paged with your message"
End Sub
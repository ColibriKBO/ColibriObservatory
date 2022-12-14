'
' History
'
' 05-Jun-2002   rbd 2.1C    Start version control
' 04-Dec-2006	rbd	5.0		(yeah, 4 years) Add modal alert test (new in V5)
'
Sub Main()
    Console.PrintLine "Reading input from console..."
    button = Console.ReadLine("What is your name?", consOkCancel)
    Console.PrintLine "button = " & button
    Console.PrintLine "test = """ & _
            Console.LastReadResult & """"
    Console.PrintLine "Asking yes/no question..."
    Console.PrintLine "It was answered " & _
                CStr(Console.AskYesNo("Is this cool?"))
    Console.Printline "Displaying modal alert..."
    Console.Alert consIconOK, "This should be a modal alert"
    Console.PrintLine "... closed!"
End Sub


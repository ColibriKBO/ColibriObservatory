
function main() {
    do {
        Console.PrintLine("Scheduler Installed: " + Scheduler.Installed);
        Console.PrintLine("Scheduler Available: " + Scheduler.Available);
        Console.PrintLine("Scheduler Dispatcher Enabled: " + Scheduler.DispatcherEnabled);
        Console.PrintLine("Scheduler Dispatcher Status: " + Scheduler.DispatcherStatus);
        Console.PrintLine("Scheduler Database: " + Scheduler.Database);
    }
    while (Scheduler.DispatcherEnabled);
}
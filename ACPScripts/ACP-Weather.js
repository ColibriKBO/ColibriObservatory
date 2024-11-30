var SUP;

//////////////////////////////
// Returns date as yyyymmdd
// MJM - June 2021
//////////////////////////////


function getDate()
{
	var d, s, month, day;

	d = new Date();
	s = d.getUTCFullYear();

	month = (d.getUTCMonth()+1).toString()
	day   = (d.getUTCDate()).toString()

	if (month.length == 1)
	{
		s += "0" + month;
	}
	else
	{
		s += month;
	}

	if (day.toString().length == 1)
	{
		s += "0" + day;
	}
	else
	{
		s += day;
	}
	return(s)
}


function main()
{
	var fso, f1, ts;
	var Mode = 8;

	LogFile = "d:\\Logs\\ACP\\" + getDate() + "-ACP_WeatherSafety.log";

	fso = new ActiveXObject("Scripting.FileSystemObject");

	if (fso.FileExists(LogFile))
	{
		Console.PrintLine("Log file exists. Appending to existing.")
	}
	else
	{
		fso.CreateTextFile(LogFile);
	}

	f1 = fso.GetFile(LogFile);
	ts = f1.OpenAsTextStream(Mode, true);

	Console.PrintLine(Util.SysUTCDate + " ALERT: Weather Safety Script Activated!");
	// ts.WriteBlankLines(2);
	ts.WriteLine(Util.SysUTCDate + " ALERT: ####################################");
	ts.WriteLine(Util.SysUTCDate + " ALERT: # Weather Safety Script Activated! #");
	ts.WriteLine(Util.SysUTCDate + " ALERT: ####################################");

	Console.PrintLine("Closing dome...");
	ts.WriteLine(Util.SysUTCDate + " ALERT: Closing dome...");

	Dome.CloseShutter();
	Console.PrintLine("Dome closed!");
	ts.WriteLine(Util.SysUTCDate + " ALERT: Dome closed!");

	if (Telescope.Connected)
	{
		Console.PrintLine("Parking telescope...");
		ts.WriteLine(Util.SysUTCDate + " ALERT: Parking telescope...");

		Telescope.Park();
		Console.PrintLine("Telescope parked!");
		ts.WriteLine(Util.SysUTCDate + " ALERT: Telescope parked!");
	}

	Console.PrintLine("Restarting scheduler...")
	// ts.WriteBlankLines(2)
	ts.WriteLine(Util.SysUTCDate + " ALERT: ###########################");
	ts.WriteLine(Util.SysUTCDate + " ALERT: # Restarting scheduler... #")
	ts.WriteLine(Util.SysUTCDate + " ALERT: ###########################");
	// ts.WriteBlankLines(2);

	Util.ChainScript("RunColibri.js");
	Util.WaitForMilliseconds(3000);
}

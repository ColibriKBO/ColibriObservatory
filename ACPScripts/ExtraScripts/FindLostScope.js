//tabs=4
//------------------------------------------------------------------------------
//
// Script:      FindLostScope.js
// Author:      Robert B. Denny <rdenny@dc3.com>
// Version:     7.1.0
// Requires:    ACP 7.1 or later (PinPoint 6 or later)
//              Windows Script 5.6 or later
//
// Environment: This script is written to run under the ACP scripting
//              console. 
//
// Description: Uses BlindSolve.exe and AcquireSupport to perform an all-sky
//              plate solution via Astrometry.net and optionally re-sync 
//              the telescope (if it supports it)
//
// Revision History:
//
// Date      Who    Description
// --------- ---    --------------------------------------------------
// 11-May-12 rbd    GEM:861 Initial edit
// 16-May-12 rbd    Oh duh, cannot use TakePointingImage as it tries to solve
// 06-Jul-12 rbd    GEM:861 Lots has been done to the A.N app, now this
//                  script will be included with ACP as a utility. Renamed
//                  to FindLostScope.js.
// 23-Mar-13 rbd    Trap failure of BlindSolver to make error output file and
//                  prevent script error. 
// 01-Dec-13 rbd    GEM:992 Using PinPoint 6 all-sky solving now.
//----------------------------------------------------------------------------
//
var SUP, FSO;

function trkOff()
{
    if (Telescope.CanSetTracking) 
    {
        Telescope.Tracking = false;
        Console.PrintLine("  Tracking turned off.");
    }
}
    
function main()
{
    if (!Prefs.EnableAllSkySolving)
    {
        Console.PrintLine("FYI: All-sky plate solving is disabled in ACP.");
    }
    SUP = new ActiveXObject("ACP.AcquireSupport");
    FSO = new ActiveXObject("Scripting.FileSystemObject");
    
    var imageFile = Prefs.LocalUser.DefaultImageDir + "\\LostScopeImage";
    var ftsPath = imageFile + ".fts";
    if (FSO.FileExists(ftsPath)) FSO.DeleteFile(ftsPath);
    
    SUP.Initialize();
    if (Telescope.CanSetTracking)
    {
        Telescope.Tracking = true;
        Console.PrintLine("Tracking turned on.");
    }
    Console.PrintLine("Acquiring pointing image...");
    var ras, des;
    if(Prefs.DoLocalTopo)                               // Get scope J2000 RA/Dec
    {
        SUP.LocalTopocentricToJ2000(Telescope.RightAscension, Telescope.Declnation);
        ras = SUP.J2000RA;
        des = SUP.J2000Dec;
    }
    else
    {
        ras = Telescope.RightAscension;
        des = Telescope.Declination;
    }
    if (Prefs.PointingUpdates.Simulate)         // Using sim, need coordinates for image simulator
        SUP.CalcSimImageCoordinates(ras, des);
    var pixScale = SUP.PlateScaleH;
    var maxBinXY = Math.min(4, Camera.MaxBinX); // Limit to bin4

    var pixBin = [2.0, 1.0, 0.0];               // Bin up to 4"/pix
    var bin = 1;
    for(var i = 0; i < 3; i++)
    {
        if (pixScale >= pixBin[i]) break;
        bin *= 2;                               // Skip bin3 (some cams can't)
        if (bin >= maxBinXY) break;
    }
    var ptgPrefs = Prefs.PointingUpdates;
    var intv = ptgPrefs.Interval * 2;
    SUP.SelectFilter(Prefs.CameraPrefs.ClearFilterNumber);
    var filt = SUP.SetFilterForTask(3);  // FO_FORPOINTING
    if (!SUP.TakePicture(intv, bin, 1.0, 0.0, filt,
                    imageFile, "", true, false, false, false, "ACP",
                    "Pointing Image", ras, des,
                    false, "", "", 0, 0, false, 0.0))
    {
        Console.PrintLine("Failed to acquire pointing image.");
        SUP.Terminate();
        trkOff();
        return;
    }
    
    if(!SUP.AllSkySolve(ftsPath))
    {
        Console.PrintLine("Maybe try a different place in the sky or in better weather");
        SUP.Terminate();
        trkOff();
        return;
    }
    
    var PL = new ActiveXObject("PinPoint.Plate");       // Get solved/actual J200 RA/Dec
    PL.AttachFITS(ftsPath);
    var ra = PL.RightAscension;
    var de = PL.Declination;
    PL.DetachFITS();
    PL = null;
    
    Console.PrintLine("All-sky solution successful!");
    Console.PrintLine("  Scope:  " + Util.Hours_HMS(ras) + " " + Util.Degrees_DMS(des));
    Console.PrintLine("  Actual: " + Util.Hours_HMS(ra) + " " + Util.Degrees_DMS(de));
    var ptgErr = (SUP.EquDist2(ras, des, ra, de)) * 60;
    Console.PrintLine("  Pointing error is " + Util.FormatVar(ptgErr, "0.0") + " arcmin.");
    if (Telescope.CanSync)
    {
        SUP.SyncToJ2000(ra, de);
        Console.PrintLine("  Scope synced to correct coordinates successfully!");
    }
    else
    {
        Console.PrintLine("**Telescope cannot be synced, cannot correct it.");
    }
    SUP.Terminate();
    trkOff();
}

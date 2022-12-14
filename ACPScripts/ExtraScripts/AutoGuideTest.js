//tabs=4
//------------------------------------------------------------------------------
//
// Script:       AutoGuideTest.js
// Author:       Robert B. Denny <rdenny@dc3.com>
// Version:      5.1.0
// Requires:     ACP 5.1 or later!
//               Windows Script 5.6 or later
//
// Environment:  This script is written to run under the ACP scripting
//               console. 
//
// Description:  Before running this script, place a guide star on the guide
//               sensor with the mount tracking. Then start the script and 
//               it will run through ACP's smart autoguiding startup process.
//               It will then wait for user input, leaving the autoguider
//               running. When the user presses OK, autoguiding will be shut
//               down, again using ACP's logic.
//
// Revision History:
//
// Date      Who     Description
// --------- ---     --------------------------------------------------
// 25-Oct-09 rbd     Initial edit
//----------------------------------------------------------------------------
//
var SUP;

function main()
{
    SUP = new ActiveXObject("ACP.AcquireSupport");
    SUP.Initialize();
    SUP.AutoGuide(true);
    Console.ReadLine("Click OK to stop guiding", 3);
    SUP.AutoGuide(false);
    SUP.Terminate();
}

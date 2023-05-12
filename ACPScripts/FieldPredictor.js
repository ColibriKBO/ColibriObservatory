//tabs=4
//------------------------------------------------------------------------------
//
// Script:      FieldPredictor.js
// Authors:     Peter Quigley
// Requires:    ACP 7.1 or later (PinPoint 6 or later)
//              Windows Script 5.6 or later
//
// Environment: This script is written to run under the ACP scripting
//              console. 
//
// Description: Schedules and runs automated observations with the 
//              Colibri telesopes
//


/* ----------------------------- Setup --------------------------------------*/

var SUP;

String.prototype.trim = function()
{
    return this.replace(/(^\s*)|(\s*$)/g, "");
}

// Magic numbers
var elevationLimit = 10; // minimum elevation of field in degrees
var minMoonOffset = 15; // angular seperation from moon in degrees
var timestep = 0.5; // time between fields in hours
var minDiff = 2; // minimum difference between fields to justify a switch
var magnitudeLimit = 12; // dimmest visible star
var extScale = 0.4; // extinction scaling factor

// Field coordinates
var field1  = [273.736, -18.640];
var field2  = [92.419,  23.902];
var field3  = [287.740, -17.914];
var field4  = [105.436, 22.379];
var field5  = [254.789, -27.225];
var field6  = [129.972, 19.312];
var field7  = [75.678,  23.580];
var field8  = [306.006, -14.551];
var field9  = [239.923, -25.287];
var field10 = [56.973,  23.942];
var field11 = [318.700, -11.365];
var field12 = [226.499, -22.274];
var field13 = [334.365, -10.910];
var field14 = [212.040, -17.675];
var field15 = [39.313,  17.413];
var field16 = [143.292, 10.261];
var field17 = [348.814, -0.699];
var field18 = [155.530, 5.914];
var field19 = [1.693,   3.707];
var field20 = [15.529,  2.557];
var field21 = [25.171,  14.130];
var field22 = [198.755, -11.953];
var field23 = [184.631, -3.816];
var field24 = [172.488, 0.500];

// Elevation, Azimuth, field, field name, moon angle, HA, airmass, # of M13 stars, a, b, # of stars visible, rank, ct time #
// TODO: update a,b parameters for all new fields
fieldInfo = [
    [0, 0, field1, "field1",   0, 0, 1.0, 5005, 0.0005, 1.0, 5005, 0, 0],
    [0, 0, field2, "field2",   0, 0, 1.0, 1696, 0.0005, 1.0, 1696, 0, 0],
    [0, 0, field3, "field3",   0, 0, 1.0, 1696, 0.0005, 1.0, 1696, 0, 0],
    [0, 0, field4, "field4",   0, 0, 1.0, 967,  0.0005, 1.0, 967, 0, 0],
    [0, 0, field5, "field5",   0, 0, 1.0, 2442, 0.0005, 1.0, 2442, 0, 0],
    [0, 0, field6, "field6",   0, 0, 1.0, 495,  0.0005, 1.0, 495, 0, 0],
    [0, 0, field7, "field7",   0, 0, 1.0, 840,  0.0005, 1.0, 840, 0, 0],
    [0, 0, field8, "field8",   0, 0, 1.0, 588,  0.0005, 1.0, 588, 0, 0],
    [0, 0, field9, "field9",   0, 0, 1.0, 754,  0.0005, 1.0, 754, 0, 0],
    [0, 0, field10, "field10", 0, 0, 1.0, 489,  0.0005, 1.0, 489, 0, 0],
    [0, 0, field11, "field11", 0, 0, 1.0, 394,  0.0005, 1.0, 394, 0, 0],
    [0, 0, field12, "field12", 0, 0, 1.0, 387,  0.0005, 1.0, 387, 0, 0],
    [0, 0, field13, "field13", 0, 0, 1.0, 251,  0.0005, 1.0, 251, 0, 0],
    [0, 0, field14, "field14", 0, 0, 1.0, 305,  0.0005, 1.0, 305, 0, 0],
    [0, 0, field15, "field15", 0, 0, 1.0, 269,  0.0005, 1.0, 269, 0, 0],
    [0, 0, field16, "field16", 0, 0, 1.0, 258,  0.0005, 1.0, 258, 0, 0],
    [0, 0, field17, "field17", 0, 0, 1.0, 247,  0.0005, 1.0, 247, 0, 0],
    [0, 0, field18, "field18", 0, 0, 1.0, 213,  0.0005, 1.0, 213, 0, 0],
    [0, 0, field19, "field19", 0, 0, 1.0, 226,  0.0005, 1.0, 226, 0, 0],
    [0, 0, field20, "field20", 0, 0, 1.0, 218,  0.0005, 1.0, 218, 0, 0],
    [0, 0, field21, "field21", 0, 0, 1.0, 238,  0.0005, 1.0, 238, 0, 0],
    [0, 0, field22, "field22", 0, 0, 1.0, 231,  0.0005, 1.0, 231, 0, 0],
    [0, 0, field23, "field23", 0, 0, 1.0, 184,  0.0005, 1.0, 184, 0, 0],
    [0, 0, field24, "field24", 0, 0, 1.0, 184,  0.0005, 1.0, 184, 0, 0]
];


/* --------------------------- Functions ------------------------------------*/

function twilightTimes(jDate) // Returns astronomical twilight end (sunrise) and start (sunset) times as JD
{
	lat = Telescope.SiteLatitude
	lon = Telescope.SiteLongitude
	n = Math.floor(jDate - 2451545.0 + 0.0008)
	Jstar = n - (lon/360.0)
	M = (357.5291 + 0.98560028 * Jstar) % 360
	C = 1.9148*Math.sin(Util.Degrees_Radians(M)) + 0.02*Math.sin(2*Util.Degrees_Radians(M)) + 0.0003*Math.sin(3*Util.Degrees_Radians(M))
	lam = (M + C + 180 + 102.9372) % 360
	Jtransit = 2451545.0 + Jstar + 0.0053*Math.sin(Util.Degrees_Radians(M)) - 0.0069*Math.sin(2*Util.Degrees_Radians(lam))
	sindec = Math.sin(Util.Degrees_Radians(lam)) * Math.sin(Util.Degrees_Radians(23.44))
	cosHA = (Math.sin(Util.Degrees_Radians(-12)) - (Math.sin(Util.Degrees_Radians(lat))*sindec)) / (Math.cos(Util.Degrees_Radians(lat))*Math.cos(Math.asin(sindec)))
	Jrise = Jtransit - (Util.Radians_Degrees(Math.acos(cosHA)))/360
	Jset = Jtransit + (Util.Radians_Degrees(Math.acos(cosHA)))/360

	return [Jrise, Jset]
}

function sortFields(fieldtosort) // Sorts fields based on the number of visible stars (accounting for extinction)
{
    // Sort available fields based on # of stars fieldInfo[i][10] 
    sortedFields = []
    sortedFields = fieldtosort.sort(function(a,b) {return b[10] - a[10]})

    return sortedFields
}

function getMoon()
{
	// finding moon elevation and azimuth
    Util.Console.PrintLine("== Moon Coordinates ==");
    var SH = new ActiveXObject("WScript.Shell");
    var BS = SH.Exec(ACPApp.Path + "\\aa.exe -moon");
    var coords = "";

    while(BS.Status != 1)
    {
        while(!BS.StdOut.AtEndOfStream)
        {
            coords += BS.StdOut.Read(1);
        }
        Util.WaitForMilliseconds(100);
    }
    coords = coords.trim();
    Util.Console.PrintLine("== " + coords + " ==");

    var bits = coords.split(" ");

    ct = Util.NewCThereAndNow();
    ct.RightAscension = bits[0];
    ct.Declination = bits[1];

    return ct
}


/*---------------------------------------------------------------------------*/
/*-----------------------------------Main------------------------------------*/
/*---------------------------------------------------------------------------*/

function main()
{
    // Get times of sunrise and sunset
    // twilightTimes: [0] - JD of sunrise, [1] - JD of sunset
    // Note! The calculation for sunsetLST only works if you are west of Greenwich
    sunset  = twilightTimes(Util.SysJulianDate)[1]
    sunrise = twilightTimes(Util.SysJulianDate + 1)[0]
    sunsetLST  = (Util.Julian_GMST(sunset)  + Telescope.SiteLongitude/15).toFixed(1)
    sunriseLST = (Util.Julian_GMST(sunrise) + Telescope.SiteLongitude/15).toFixed(1)

    // Length of night
    darkHours = (sunrise - sunset)*24
    timeUntilSunset = (sunset - Util.SysJulianDate)*24 // hours
    timeUntilSunrise = (sunrise - Util.SysJulianDate)*24 // hours

    // Dark hours left
    if (darkHours > timeUntilSunrise):
        darkHoursLeft = timeUntilSunrise
    else:
        darkHoursLeft = darkHours

    // Print today's time of nautical sunrise and sunset.
    Console.PrintLine("Sunrise GMST: " + Util.Julian_GMST(sunrise))
    Console.PrintLine("Sunset GMST: " + Util.Julian_GMST(sunset))
    Console.PrintLine("Current GMST: " + Util.Julian_GMST(Util.SysJulianDate))
    Console.PrintLine("Sunrise UTC: " + Util.Julian_Date(sunrise))
    Console.PrintLine("Sunset UTC: " + Util.Julian_Date(sunset))
    Console.PrintLine("Sunset LST: " + sunsetLST)
    Console.PrintLine("Current LST: " + Util.NowLST())
    
    Console.PrintLine("Length of the Night: " + darkHours + "hours")
    Console.PrintLine("Time until sunset: " + timeUntilSunset + " hours")
    Console.PrintLine("Time until sunrise: " + timeUntilSunrise + " hours")
    Console.PrintLine("Dark hours left: " + darkHoursLeft + " hours")
    
    
/*-----------------------------Observing Plan--------------------------------*/

    // Calculate field-moon angle for each field.
    moonAngles = []
    moonct = getMoon()
    for (i=0; i<fieldInfo.length; i++)
    {
        b = (90-fieldInfo[i][2][1])*Math.PI/180
        c = (90-moonct.Declination)*Math.PI/180
        aa = Math.abs(fieldInfo[i][2][0]-moonct.RightAscension)*Math.PI/180
        moonAngle = Math.acos((Math.cos(b)*Math.cos(c)) + (Math.sin(b)*Math.sin(c)*Math.cos(aa)))*180/Math.PI
        moonAngles.push(moonAngle)
        fieldInfo[i][4] = moonAngle
    }

    fieldsToObserve = [] // Array containing best field info in 6 minute increments

    // Elevation [0], Azimuth [1], field [2], field name [3], moon angle [4], HA [5], airmass [6],
    // # of M13 stars [7], a [8], b [9], # of stars visible [10], rank [11], LST [12]
    
    // n is the number of samples in one observing block (length = timestep)
    // that will be computed.
    n = Math.round(darkHours.toFixed(2)/timestep)
    Console.PrintLine("# of samples tonight: " + n)


    // Calcuate the local coordinates of each field at each timestep and the
    // number of visible stars in each field when accounting for extinction
    prevField = ""
    for (k=0; k<n; k++)
    {
        // Assume that the moon angle is constant throughout the night
        // In reality, it will move about 0.5 deg per hour
        // aa.exe doesn't allow time input from command line, so we'll
        // fix this later

        // Create a new coordinate transform at intervals of timestep
        newLST = parseFloat(sunsetLST) + k*timestep
        ct = Util.NewCT(Telescope.SiteLatitude, newLST)

        // Start a loop to calculate approximate number of stars in fields
        for (j=0; j < fieldInfo.length; j++)
        {
            // Set RA and DEC to field 'j' coordinates  
            ct.RightAscension = fieldInfo[j][2][0] / 15; // in hours
            ct.Declination = parseFloat(fieldInfo[j][2][1]);; // in degrees

            // Field coordinate definitions
            lat = ct.Latitude
            alt = ct.Elevation
            LST = ct.SiderealTime
            HA = LST - ct.RightAscension
            

            // Set fieldInfo fields for spatial/temporal fields
            fieldInfo[j][0] = ct.Elevation
            fieldInfo[j][1] = ct.Azimuth
            fieldInfo[j][5] = HA
            fieldInfo[j][12] = LST

            // Calculate approx. # of stars in field using airmass/extinction
            // Know limiting magnitude at zenith (say 12 in 25 ms)
            // Know # of stars at M12 in each field
            // Calculate extinction at current airmass
            // With this new magnitude calculate approx. # of stars

            // Calculate airmass and extinction
            airmass = 1 / Math.cos((90-alt)*Math.PI/180)
            fieldInfo[j][6] = airmass
            extinction = (airmass-1) * extScale

            // Calculate the true number of visible stars, accounting for extinction
            numVisibleStars = parseInt(fieldInfo[j][8] * Math.exp(fieldInfo[j][9]*(magnitudeLimit-extinction)))
            fieldInfo[j][10] = numVisibleStars
            // Console.PrintLine("Airmass: " + airmass)
            // Console.PrintLine("Number of visible M" + (magnitudeLimit-extinction).toPrecision(3) + " stars: " + numVisibleStars)

        }

        // Create goodFields array to hold fields that are above the horizon
        // and far enough from the moon
        goodFields = []
        for (j=0; j < fieldInfo.length; j++)
        {
            if (fieldInfo[j][0] > elevationLimit && moonAngles[j] > minMoonOffset)
            {
                goodFields.push([fieldInfo[j][0],fieldInfo[j][1],fieldInfo[j][2],fieldInfo[j][3],fieldInfo[j][4],fieldInfo[j][5],fieldInfo[j][6],fieldInfo[j][7],fieldInfo[j][8],fieldInfo[j][9],fieldInfo[j][10],fieldInfo[j][11],fieldInfo[j][12]])
            }
        }

        // Require that any new field be better than the old field by at least
        // minDiff. Otherwise, continue observing the old field.
        // TODO: make this if/else more clever
        sortFields(goodFields)
        if (sortedFields.length == 1)
        {
            fieldsToObserve.push([sortedFields[0][0],sortedFields[0][1],sortedFields[0][2],sortedFields[0][3],sortedFields[0][4],sortedFields[0][5],sortedFields[0][6],sortedFields[0][7],sortedFields[0][8],sortedFields[0][9],sortedFields[0][10],sortedFields[0][11],sortedFields[0][12]]);
            prevField = sortedFields[0][3]
        }
        else if (sortedFields[0][3] != prevField && sortedFields[1][3] == prevField && sortedFields[0][10] - sortedFields[1][10] < minDiff)
        {
            fieldsToObserve.push([sortedFields[1][0],sortedFields[1][1],sortedFields[1][2],sortedFields[1][3],sortedFields[1][4],sortedFields[1][5],sortedFields[1][6],sortedFields[1][7],sortedFields[1][8],sortedFields[1][9],sortedFields[1][10],sortedFields[1][11],sortedFields[1][12]]);
            prevField = sortedFields[1][3]
        }
        else
        {
            fieldsToObserve.push([sortedFields[0][0],sortedFields[0][1],sortedFields[0][2],sortedFields[0][3],sortedFields[0][4],sortedFields[0][5],sortedFields[0][6],sortedFields[0][7],sortedFields[0][8],sortedFields[0][9],sortedFields[0][10],sortedFields[0][11],sortedFields[0][12]]);
            prevField = sortedFields[0][3]
        }
        
    }


/*---------------------------Order & Print Plan------------------------------*/

    // Check length of fields to observe
    Console.PrintLine("# of selected time blocks: " + fieldsToObserve.length)
    Console.PrintLine("")


    // Push first field, then check if the following field is the same. If it
    // is, move onto the next field. Repeat until the end of the list and
    // then push the final field
    finalFields = []
    finalFields.push([fieldsToObserve[0][0],fieldsToObserve[0][1],fieldsToObserve[0][2],fieldsToObserve[0][3],fieldsToObserve[0][4],fieldsToObserve[0][5],fieldsToObserve[0][6],fieldsToObserve[0][7],fieldsToObserve[0][8],fieldsToObserve[0][9],fieldsToObserve[0][10],fieldsToObserve[0][11],fieldsToObserve[0][12]])
    for (i=0; i<fieldsToObserve.length-1; i++)
    {
        if (fieldsToObserve[i][3] != fieldsToObserve[i+1][3])
        {
            finalFields.push([fieldsToObserve[i+1][0],fieldsToObserve[i+1][1],fieldsToObserve[i+1][2],fieldsToObserve[i+1][3],fieldsToObserve[i+1][4],fieldsToObserve[i+1][5],fieldsToObserve[i+1][6],fieldsToObserve[i+1][7],fieldsToObserve[i+1][8],fieldsToObserve[i+1][9],fieldsToObserve[i+1][10],fieldsToObserve[i+1][11],fieldsToObserve[i+1][12]])
        }
    }
    finalFields.push([fieldsToObserve[fieldsToObserve.length-1][0],fieldsToObserve[fieldsToObserve.length-1][1],fieldsToObserve[fieldsToObserve.length-1][2],fieldsToObserve[fieldsToObserve.length-1][3],fieldsToObserve[fieldsToObserve.length-1][4],fieldsToObserve[fieldsToObserve.length-1][5],fieldsToObserve[fieldsToObserve.length-1][6],fieldsToObserve[fieldsToObserve.length-1][7],fieldsToObserve[fieldsToObserve.length-1][8],fieldsToObserve[fieldsToObserve.length-1][9],fieldsToObserve[fieldsToObserve.length-1][10],fieldsToObserve[fieldsToObserve.length-1][11],fieldsToObserve[fieldsToObserve.length-1][12]])


    // Calculate the duration of each field and append it onto the end of its
    // finalFields object. The last element goes to sunrise
    for (i=0; i<finalFields.length-1; i++)
    {
        finalFields[i].push(finalFields[i+1][12]-finalFields[i][12])
    }
    finalFields[finalFields.length-1].push(sunriseLST - finalFields[finalFields.length-1][12])


    // Print table of raw finalFields array
    Console.PrintLine("")
    Console.PrintLine("=== finalFields ===")
    for (k=0; k < finalFields.length; k++)
    {
        Console.PrintLine(finalFields[k])
    }

    // Print table of formatted finalFields array
    Console.PrintLine("")
    Console.PrintLine("=== Final Field Short List ===")

    for (i=0; i<finalFields.length-1; i++)
    {
        Console.PrintLine(finalFields[i][3] + " starts " + finalFields[i][12].toFixed(3) + " ends " + finalFields[i+1][12].toFixed(3) + " for " + finalFields[i][13].toFixed(3) + " hours")
        Console.PrintLine("     with " + finalFields[i][10].toString() + " visible stars")
    }
    
}
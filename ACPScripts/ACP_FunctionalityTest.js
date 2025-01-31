function moveDomeToOtherSide() {
    var currentPierSide = Telescope.SideOfPier;
    var pierside = (currentPierSide == 0) ? "E" : "W";
    Console.PrintLine("Pier side: " + pierside);

    // Determine the target azimuth based on the current pier side
    var targetAzimuth = (currentPierSide == 0) ? 180 : 0; // 180° for West, 0° for East

    // Move the dome to the opposite side
    Console.PrintLine("Moving dome to azimuth: " + targetAzimuth + "°...");
    Dome.SlewToAzimuth(targetAzimuth);

    // Wait for the dome to finish moving
    while (Dome.Slewing) {
        Console.PrintLine("Dome is slewing...");
        Util.WaitForMilliseconds(500); // Check every 500ms
    }
    Console.PrintLine("Dome movement completed.");
}

if (Dome.slave == false)
    {
        Console.PrintLine("Unparking dome and slaving to telescope...");
        Dome.slave = true;
    }

///////////////////////////
function domeHome()
{
    ////////////////////////////////////////
    // Home the dome if not already done. //
    ////////////////////////////////////////
    if (!Dome.AtHome)
    {
        Util.WaitForMilliseconds(2000);

        Dome.FindHome();

        while (!Dome.AtHome)
        {
            Console.PrintLine("*** Homing dome...");
            Util.WaitForMilliseconds(2000);
        }
        Console.PrintLine("--> Dome is homed... Bigly.");
    }
    Dome.UnparkHome()
}

function captureImage() {
    try {
        Console.PrintLine("Attempting to create ActiveX object for MaxIM DL...");
        // Create ActiveX object for MaxIM DL
        var maximDL = new ActiveXObject("MaxIm.Application");
        Console.PrintLine("MaxIM DL ActiveX object created successfully.");

        var ccdCamera = maximDL.CCDCamera;
        Console.PrintLine("Accessing the CCD camera object...");

        // Try linking the camera
        if (!ccdCamera.LinkEnabled) {
            Console.PrintLine("Camera is not linked. Attempting to link...");
            ccdCamera.LinkEnabled = true;  // Try to link the camera

            if (ccdCamera.LinkEnabled) {
                Console.PrintLine("Camera linked successfully.");
            } else {
                Console.PrintLine("Failed to link the camera.");
                return;
            }
        } else {
            Console.PrintLine("Camera already linked.");
        }

        // Try starting an exposure
        try {
            Console.PrintLine("Starting exposure...");
            ccdCamera.BinX = 2;  // Set binning to 1x1
            ccdCamera.BinY = 2;
            ccdCamera.Expose(5.0, 1);  // 5 second exposure, Light frame
            Console.PrintLine("Exposure started successfully.");
        } catch (e) {
            Console.PrintLine("Error starting exposure: " + e.message);
        }

        // Wait for the image to become ready
        var maxWaitTime = 20000;  // Maximum wait time of 10 seconds
        var waitInterval = 500;   // Check every 500ms
        var elapsedTime = 0;

        try {
            while (!ccdCamera.ImageReady && elapsedTime < maxWaitTime) {
                Console.PrintLine("Waiting for image to be ready...");
                Util.WaitForMilliseconds(waitInterval);  // Wait 500ms
                elapsedTime += waitInterval;
            }

            if (ccdCamera.ImageReady) {
                var filePath = "D:\\MaxIMDL_CameraCaptures\\image_" + new Date().getTime() + ".fits";
                Console.PrintLine("Saving image to: " + filePath);
                ccdCamera.SaveImage(filePath);  // Save the image
                Console.PrintLine("Image saved successfully to: " + filePath);
            } else {
                Console.PrintLine("Image not ready after waiting.");
            }
        } catch (e) {
            Console.PrintLine("Error saving image: " + e.message);
        }

        // Disconnect from camera
        ccdCamera.LinkEnabled = false;
        Console.PrintLine("Camera disconnected.");

    } catch (e) {
        Console.PrintLine("An error occurred: " + e.message);
    }
}

function main() {
    Console.PrintLine("Starting dome movement and image capture...");

    // Ensure the telescope is connected before doing anything
    if (!Telescope.Connected) {
        Console.PrintLine("Telescope is not connected. Attempting to connect...");
        Telescope.Connected = true;  // Attempt to connect to the telescope

        if (!Telescope.Connected) {
            Console.PrintLine("Failed to connect to the telescope.");
            return;
        }
    }

    // Move the dome and capture images
    moveDomeToOtherSide();  // Start dome movement (blocking until done)
    captureImage();         // Start capturing the image (independently)

    // Optionally, you can check status or log while waiting
}

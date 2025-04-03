function main() {
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
        var maxWaitTime = 10000;  // Maximum wait time of 10 seconds
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

function Degrees_Radians(degrees) {
    return degrees * (Math.PI / 180); // Converts degrees to radians
}

function Radians_Degrees(radians) {
    return radians * (180 / Math.PI); // Converts radians to degrees
}

// Export the functions so they can be used in other files
module.exports = { Degrees_Radians, Radians_Degrees };
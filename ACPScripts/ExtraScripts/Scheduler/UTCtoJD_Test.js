// Equation from https://aa.usno.navy.mil/faq/JD_formula
function UTCtoJD(UTC) {
    var dividedUTC = UTC.split(":");
    var K = parseInt(dividedUTC[0]);
    var M = parseInt(dividedUTC[1]);
    var I = parseInt(dividedUTC[2]);
    var H = parseInt(dividedUTC[3]);
    var m = parseInt(dividedUTC[4]);

    var ut = H + (m / 60);
    var JD = (367 * K) - Math.trunc((7 * (K + Math.trunc((M + 9) / 12))) / 4) + Math.trunc((275 * M) / 9) + I + 1721013.5 + (ut / 24) - (0.5 * Math.sign(100 * K + M - 190002.5)) + 0.5;

    return JD;
}

// Test Cases
UTC1 = "2024:07:30:19:05";
UTC2 = "2004:08:19:01:19";
UTC3 = "2021:12:25:12:20";

JD1 = UTCtoJD(UTC1);
JD2 = UTCtoJD(UTC2);
JD3 = UTCtoJD(UTC3);

console.log("1: " + JD1);
console.log("2: " + JD2);
console.log("3: " + JD3);
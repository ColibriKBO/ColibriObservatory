copy KBO-Weather.js ../ACP-Weather.js
del ../WhichWeatherScript.txt
echo "KBO-Weather.js" > ../WhichWeatherScript.txt

echo "Copied over KBO-Weather.js"

../../Weather/CloudMonitor/CloudLogger.bat
../../Weather/WeatherPlotter/WeatherPlot.bat

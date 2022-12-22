@echo off
set /p WeatherName="Name of your weather script: "

copy %WeatherName% ../ACP-Weather.js
del ../WhichWeatherScript.txt
echo %WeatherName% > ../WhichWeatherScript.txt

echo Copied over %WeatherName%...

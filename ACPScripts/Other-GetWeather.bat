@echo off
set /p WeatherName="Name of your weather script: "

copy %WeatherName% C:\Program Files (x86)\ACP Obs Control\ACP-Weather.js

echo Copied over %WeatherName%...

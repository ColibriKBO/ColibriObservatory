@setlocal enableextensions enabledelayedexpansion
@echo off
for /f "tokens=3" %%a in ('dir d:\') do (
    set bytesfree=%%a
)
set bytesfree=%bytesfree:,=%
echo %bytesfree%
endlocal && set bytesfree=%bytesfree%
call %userprofile%\anaconda3\Scripts\activate.bat
cd %userprofile%\Documents\GitHub\ColibriObservatory\PipelineAutomation
python processdata.py 2> D:\Logs\Pipeline\tmp.log
pause

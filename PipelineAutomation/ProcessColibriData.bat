:: call %userprofile%\anaconda3\Scripts\activate.bat
cd %userprofile%\Documents\GitHub\ColibriObservatory\PipelineAutomation
set COLIBRI_ENV=real
python pipeline_automation.py --env real
:: python pipeline_automation.py > D:\Logs\Pipeline\%date%.log 2>&1
pause

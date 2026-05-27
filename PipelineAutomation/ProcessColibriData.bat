:: call %userprofile%\anaconda3\Scripts\activate.bat
cd %userprofile%\Documents\GitHub\ColibriObservatory\PipelineAutomation
python pipeline_automation.py
:: python pipeline_automation.py > D:\Logs\Pipeline\%date%.log 2>&1
pause

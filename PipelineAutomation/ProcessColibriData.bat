:: call %userprofile%\anaconda3\Scripts\activate.bat
cd %userprofile%\Documents\GitHub\ColibriObservatory\PipelineAutomation
:: python processdata.py
python pipeline_automation.py > D:\Logs\Pipeline\%date%.log 2>&1
:: python processdata.py 2> D:\Logs\Pipeline\%date%.log
pause

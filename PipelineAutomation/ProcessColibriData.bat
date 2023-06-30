:: call %userprofile%\anaconda3\Scripts\activate.bat
cd %userprofile%\Documents\GitHub\ColibriObservatory\PipelineAutomation
:: python processdata.py
python pipeline_automation.py
:: python processdata.py 2> D:\Logs\Pipeline\%date%.log
pause

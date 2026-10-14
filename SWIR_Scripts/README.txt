SWIR supervised automation test bundle

Files:
- SWIR_AcquireAndVerify.js       Run in ACP on REDBIRD.
- SWIR_POET_CameraWatcher.py     Run continuously on POET.
- SWIR_WatchAndSolve.py          Run continuously on REDBIRD.

The camera watcher contains the explicit placeholder function:
    capture_with_student_code()

Shared directories:
REDBIRD: D:\SWIR_Pointing\requests, incoming, results, solves
POET:    Z:\requests, Z:\incoming

Python syntax checks passed.
JavaScript syntax check passed.

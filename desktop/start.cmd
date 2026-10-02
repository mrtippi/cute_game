@echo off
rem Starts the control app (clears ELECTRON_RUN_AS_NODE, which VS Code terminals set).
set ELECTRON_RUN_AS_NODE=
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0." %*

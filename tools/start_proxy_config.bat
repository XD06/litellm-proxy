@echo off
title LiteLLM Proxy (config.json)
cd /d "%~dp0"

:: ============================================================
::  Start script using config.json (recommended)
::  1) Copy config.example.jsonc to config.json and fill in providers/keys
::  2) Double-click this script to start
::
::  Optional overrides:
::    set PROXY_PORT=4894
::    set PROXY_DEBUG=true
::    set PROXY_PYTHON=C:\path\to\python.exe
:: ============================================================

set PROXY_CONFIG_PATH=%~dp0..\config.json

echo.
echo  === LiteLLM Proxy (config.json) ===
echo  Config:   %PROXY_CONFIG_PATH%
if "%PROXY_PORT%"=="" (
  echo  Endpoint: server.port from config.json
) else (
  echo  Endpoint: http://localhost:%PROXY_PORT%/v1/messages
)
echo.
echo  Close this window to stop the proxy
echo.

:: "python3" / "python" are often Microsoft Store stubs on Windows that
:: silently exit without running anything. Prefer the py launcher, then fall
:: back to python; PROXY_PYTHON pins an interpreter explicitly.
if not "%PROXY_PYTHON%"=="" goto :custom_python
py -3 -c "import sys" >nul 2>&1
if errorlevel 1 goto :plain_python
echo  Interpreter: py -3
py -3 ..\sse2json.py
goto :done

:custom_python
echo  Interpreter: %PROXY_PYTHON%
"%PROXY_PYTHON%" ..\sse2json.py
goto :done

:plain_python
echo  Interpreter: python
python ..\sse2json.py

:done
pause

@echo off
chcp 65001>nul
:: Match start_proxy_config.bat: prefer the py launcher over the Microsoft
:: Store "python" stub, and honor an explicit PROXY_PYTHON override.
if not "%PROXY_PYTHON%"=="" goto :custom_python
py -3 -c "import sys" >nul 2>&1
if errorlevel 1 goto :plain_python
py -3 stop_sse2json.py
goto :done

:custom_python
"%PROXY_PYTHON%" stop_sse2json.py
goto :done

:plain_python
python stop_sse2json.py

:done
echo.
pause

@echo off
title Anthropic-to-OpenAI Proxy (config.json)
cd /d "%~dp0"

:: ============================================================
::  Start script using config.json (recommended)
::  1) Copy config.example.jsonc to config.json and fill in providers/keys
::  2) Double-click this script to start
::
::  Optional overrides:
::    set PROXY_PORT=4894
::    set PROXY_DEBUG=true
:: ============================================================

set PROXY_CONFIG_PATH=%~dp0config.json

echo.
echo  === Anthropic Messages - OpenAI Proxy (config.json) ===
echo  Config:   %PROXY_CONFIG_PATH%
if "%PROXY_PORT%"=="" (
  echo  Endpoint: server.port from config.json
) else (
  echo  Endpoint: http://localhost:%PROXY_PORT%/v1/messages
)
echo.
echo  Close this window to stop the proxy
echo.

python3 sse2json.py
pause

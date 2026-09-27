@echo off
title Signal-X Local Agent

cd /d "%~dp0backend"

echo.
echo ==========================================
echo        Signal-X Local Agent
echo ==========================================
echo.
echo Starting local Wi-Fi monitoring backend...
echo.
echo Keep this window open while using Signal-X.
echo.

python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

pause
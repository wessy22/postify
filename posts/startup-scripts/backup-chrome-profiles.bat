@echo off
echo.
echo ===================================
echo   Chrome Profiles Backup Tool
echo ===================================
echo.

cd /d "C:\postify\posts\startup-scripts"
node backup-chrome-profiles.js

timeout /t 10 
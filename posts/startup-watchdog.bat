@echo off
cd /d C:\postify\posts
node startup-watchdog.js

echo.
echo 🕒 סוגר בעוד 10 שניות...
timeout /t 10 >nul
exit

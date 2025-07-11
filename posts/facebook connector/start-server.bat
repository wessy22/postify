@echo off
echo 🚀 Starting Facebook Remote Browser System...
echo.
echo Configuration:
echo - Chrome Path: C:\Program Files\Google\Chrome\Application\chrome.exe
echo - User Data: C:\postify\chrome-profiles\postify
echo - Server Port: 3000
echo.

REM יצירת תיקיות אם לא קיימות
if not exist "C:\postify\chrome-profiles\postify" (
    echo 📁 Creating user data directory...
    mkdir "C:\postify\chrome-profiles\postify"
)

echo ✅ Starting server...
node server.js

pause

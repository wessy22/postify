@echo off
cd /d C:\postify\postify-clone

echo 👋 מתחילים...

echo 🚀 מפעיל את השרת עם חלון מזהה...
start "CLONE-SERVER" cmd /k node server.js

timeout /t 2 > nul

echo 🌐 פותח את הדפדפן...
start http://localhost:3000/clone.html

pause

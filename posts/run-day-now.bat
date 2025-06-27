@echo off
cd /d C:\postify\posts
node run-day.js --now
echo 🕒 סוגר בעוד 10 שניות...
timeout /t 10 >nul
exit

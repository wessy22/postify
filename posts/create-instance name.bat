@echo off
echo 🚀 מריץ יצירת instance-name.txt...

cd /d C:\postify\posts

echo 📦 מריץ: node get-instance-name.js
node get-instance-name.js

echo ✅ סיום! הקובץ instance-name.txt נוצר או עודכן בהצלחה.

echo 🕒 Waiting 10 seconds before closing...
timeout /t 10 

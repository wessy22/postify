@echo off
echo 📁 מעבר לתיקיית הפרויקט...
cd /d C:\postify

echo 🔄 מוסיף את כל הקבצים ל-Git...
git add .

echo 📝 יוצר קומיט עם הודעת ניקוי...
git commit -m "🚀 Force push - ניקוי והעלאה מחדש"

echo ⬆️ דוחף בכוח ל-GitHub (master)...
git push -f origin master

echo.
echo ✅ סיום! הקוד המקומי הועלה בכוח ל-GitHub.
pause

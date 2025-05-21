@echo off
echo מחיקת היסטוריית Git קיימת...
rd /s /q .git

echo יצירת ריפו Git חדש...
git init

echo הוספת כל הקבצים...
git add .

echo יצירת קומיט ראשוני...
git commit -m "🔥 התחלה חדשה - מחיקה מלאה והעלאה מחדש"

echo קביעת הסניף הראשי כ-master...
git branch -M master

echo הוספת ריפו מרוחק...
git remote add origin https://github.com/wessy22/postify.git

echo העלאה בכוח ל-GitHub...
git push -f origin master

echo.
echo ✅ סיום: הקוד הועלה מחדש ל-GitHub בהצלחה.
pause

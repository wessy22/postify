@echo off
chcp 65001
title התקנת מערכת בדיקת סטטוס פרסומים
color 0A

echo ╔══════════════════════════════════════════════════════╗
echo ║          🔍 מערכת בדיקת סטטוס פרסומים               ║
echo ║                   התקנה אוטומטית                    ║
echo ╚══════════════════════════════════════════════════════╝
echo.

:: בדיקת Node.js
echo [INFO] בודק התקנת Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js לא מותקן! יש להתקין Node.js מ-https://nodejs.org
    pause
    exit /b 1
)
echo [SUCCESS] Node.js מותקן ✓

:: בדיקת קבצים נדרשים
echo.
echo [INFO] בודק קבצים נדרשים...

if not exist "config.json" (
    echo [WARNING] קובץ config.json לא קיים - יוצר קובץ דוגמה...
    call :create_config
)

if not exist "log.txt" (
    echo [WARNING] קובץ log.txt לא קיים - יוצר קובץ דוגמה...
    call :create_log
)

if not exist "instance-name.txt" (
    echo [WARNING] קובץ instance-name.txt לא קיים - יוצר קובץ דוגמה...
    call :create_instance
)

:: בדיקת תיקיות
echo.
echo [INFO] יוצר תיקיות נדרשות...
if not exist "output" mkdir output
if not exist "logs" mkdir logs

:: העתקת קבצים
echo.
echo [INFO] מעתיק קבצים...
copy "client-files\scan-groups-post-status.js" "." >nul 2>&1
copy "batch-scripts\*.bat" "." >nul 2>&1

:: יצירת קיצורי דרך
echo.
echo [INFO] יוצר קיצורי דרך לשולחן העבודה...
call :create_shortcuts

echo.
echo ╔══════════════════════════════════════════════════════╗
echo ║                   ✅ התקנה הושלמה!                  ║
echo ╚══════════════════════════════════════════════════════╝
echo.
echo קבצים זמינים:
echo   📄 scan-groups-post-status.js     - הסקריפט הראשי
echo   ⚡ scan-groups-status.bat         - הרצה מהירה
echo   🔧 scan-groups-status-advanced.bat - הרצה מתקדמת
echo.
echo לשימוש ראשון:
echo   1. ערוך את config.json עם הנתיבים שלך
echo   2. וודא שיש נתוני פרסומים ב-log.txt
echo   3. הרץ: scan-groups-status.bat
echo.
echo ℹ️  לעזרה נוספת, קרא את README.md
echo.
pause
goto :eof

:create_config
echo {> config.json
echo   "chromePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",>> config.json
echo   "userDataDir": "C:\\postify\\chrome-profiles\\postify">> config.json
echo }>> config.json
echo [SUCCESS] נוצר config.json דוגמה ✓
goto :eof

:create_log
echo [2025-09-09T10:00:00] 📢 posting to group(1/1): https://www.facebook.com/groups/123456789> log.txt
echo [SUCCESS] נוצר log.txt דוגמה ✓
goto :eof

:create_instance
echo postify-demo> instance-name.txt
echo [SUCCESS] נוצר instance-name.txt דוגמה ✓
goto :eof

:create_shortcuts
:: יצירת קיצור דרך לשולחן העבודה
set desktop=%USERPROFILE%\Desktop
if exist "scan-groups-status.bat" (
    copy "scan-groups-status.bat" "%desktop%\📊 בדיקת סטטוס פרסומים.bat" >nul 2>&1
)
echo [SUCCESS] נוצרו קיצורי דרך ✓
goto :eof

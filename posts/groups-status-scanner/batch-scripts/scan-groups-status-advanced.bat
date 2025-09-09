@echo off
echo ======================================
echo      סריקת סטטוס פרסומים בקבוצות  
echo             גרסה מתקדמת
echo ======================================
echo.

cd /d "C:\postify\posts"

echo בחר אפשרות:
echo [1] סריקת קבוצות מהיום
echo [2] סריקת קבוצות מתאריך ספציפי
echo [3] סריקת קבוצה ספציפית
echo [4] צפייה בתוצאות אחרונות
echo.

set /p choice="הכנס מספר אפשרות (1-4): "

if "%choice%"=="1" (
    echo מתחיל סריקת קבוצות מהיום...
    node groups-status-scanner\client-files\scan-groups-post-status.js
    goto end
)

if "%choice%"=="2" (
    set /p date="הכנס תאריך (YYYY-MM-DD): "
    echo מתחיל סריקת קבוצות מתאריך %date%...
    node groups-status-scanner\client-files\scan-groups-post-status.js --date=%date%
    goto end
)

if "%choice%"=="3" (
    set /p url="הכנס URL של הקבוצה: "
    echo מתחיל סריקת קבוצה ספציפית...
    node groups-status-scanner\client-files\scan-groups-post-status.js --group="%url%"
    goto end
)

if "%choice%"=="4" (
    echo פותח את דף התוצאות...
    start groups-post-status-viewer.html
    goto end
)

echo אפשרות לא חוקית!

:end
echo.
echo ======================================
echo הפעולה הושלמה!
echo.
echo קבצי התוצאות:
echo - latest-groups-post-status.json
echo - groups-post-status-summary.json  
echo - groups-post-status-viewer.html
echo ======================================
echo.

pause

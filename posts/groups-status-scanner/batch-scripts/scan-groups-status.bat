@echo off
echo ======================================
echo      סריקת סטטוס פרסומים בקבוצות
echo ======================================
echo.

echo מתחיל סריקת קבוצות...
node ..\client-files\scan-groups-post-status.js

echo.
echo ======================================
echo הסריקה הושלמה!
echo.
echo קבצי התוצאות נוצרו:
echo - latest-groups-post-status.json
echo - groups-post-status-summary.json
echo - groups-post-status-[תאריך].json
echo.
echo פותח תצוגת דוח...
start ..\viewers\groups-post-status-viewer-enhanced.html
echo.
echo לצפייה בתוצאות באתר:
echo פתח את הקובץ: groups-post-status-viewer.html
echo ======================================
echo.

pause

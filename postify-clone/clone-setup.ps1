# עדכון מייל לקוח ב-email-config.js
(Get-Content "C:\postify\email-config.js") -replace 'to: ".*"', 'to: "yehiadmanor@gmail.com"' | Set-Content "C:\postify\email-config.js"

# עדכון מייל לקוח בקובץ config.json
(Get-Content "C:\postify\config.json") -replace '"to":\s*".*"', '"to": "yehiadmanor@gmail.com"' | Set-Content "C:\postify\config.json"

# מחיקת קבצי spreadsheet
Remove-Item -Path "C:\postify\spreadsheet-*.json" -Force -ErrorAction SilentlyContinue

# מחיקת instance-name
Remove-Item -Path "C:\postify\instance-name.txt" -Force -ErrorAction SilentlyContinue

# מחיקת פוסטים ותמונות
Remove-Item -Path "C:\postify\posts\post*.json" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "C:\postify\images\*" -Recurse -Force -ErrorAction SilentlyContinue

# מחיקת עצמי
Remove-Item -Path "C:\postify\clone-setup.ps1" -Force -ErrorAction SilentlyContinue
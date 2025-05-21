@echo off
echo 🚀 Launching Chrome with Postify profile...
start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
--remote-debugging-port=9222 ^
--user-data-dir="C:\postify\chrome-profiles\postify"

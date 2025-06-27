@echo off
cd /d C:\postify\posts
node monitor-postify.js
timeout /t 10 

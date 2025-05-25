@echo off
cd /d %~dp0
node run-day.js --file test.json --now

@echo off
cd /d C:\postify

echo ≡ƒôª Adding system files...
git add posts/*.js posts/*.bat posts/*.json posts/*.ps1

echo ≡ƒô¥ Commiting...
git commit -m "🔄 Update system files"

echo ≡ƒÜÇ Pushing to GitHub...
git push origin master

pause

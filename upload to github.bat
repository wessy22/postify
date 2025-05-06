from pathlib import Path

# נוודא שהתיקייה קיימת
folder = Path("C:/postify")
folder.mkdir(parents=True, exist_ok=True)

# יצירת תוכן קובץ .bat
bat_content = r"""@echo off
cd /d C:\postify\posts

:: הגדרת שם משתמש ואימייל אם לא הוגדרו עדיין
git config --global user.name "yehiad"
git config --global user.email "yehiad82@gmail.com"

:: הגדרת התיקייה כבטוחה (אם צריך)
git config --global --add safe.directory C:/postify

:: העלאה מלאה
git add .
git commit -m "🔥 עדכון כולל של כל הקבצים"
git push origin master

pause
"""

# שמירת הקובץ
bat_path = folder / "upload-to-git.bat"
bat_path.write_text(bat_content, encoding="utf-8")

str(bat_path)
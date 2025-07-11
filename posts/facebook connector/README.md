# מערכת דפדפן מרוחק לפייסבוק עם Puppeteer 🌐

מערכת שמאפשרת ללקוחות להתחבר לפייסבוק דרך דפדפן מרוחק ללא חשיפת פרטי כניסה.

## ✨ תכונות

- **🔒 אבטחה מקסימלית** - אתה לא רואה שם משתמש/סיסמה של הלקוח
- **💾 שמירת Session** - ה-cookies נשמרים בתיקיה מותאמת אישית
- **🖥️ ממשק נוח** - הלקוח רואה בדיוק מה קורה בדפדפן ויכול לשלוט
- **⚡ Puppeteer** - מהיר ויציב יותר מ-VNC
- **🎯 מותאם לפייסבוק** - אופטימיזציה מיוחדת לפלטפורמה

## 🚀 התקנה מהירה

### דרישות מקדימות:
- Node.js 16+
- Google Chrome מותקן
- Windows/Linux/Mac

### שלבי התקנה:

1. **התקנת התלויות:**
```bash
npm install
```

2. **עריכת הגדרות:**
ערוך את `config.json` עם הנתיבים שלך:
```json
{
  "chrome": {
    "executablePath": "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "userDataBaseDir": "C:\\postify\\chrome-profiles\\postify"
  }
}
```

3. **בדיקת הגדרות:**
```bash
npm test
```

4. **הפעלת המערכת:**
```bash
npm start
```

5. **גישה למערכת:**
פתח דפדפן בכתובת: `http://localhost:3000`

## 📋 איך זה עובד?

### תהליך הכניסה של הלקוח:
1. הלקוח נכנס לאתר שלך (`http://localhost:3000`)
2. לוחץ על "פתח דפדפן"
3. רואה screenshot בזמן אמת של דפדפן Chrome שרץ על השרת
4. יכול לקלוט ולהקליד ישירות על המסך
5. נכנס לפייסבוק עם הפרטים שלו
6. ההתחברות נשמרת בתיקיה `C:\postify\chrome-profiles\postify`

### יתרונות לך:
- ✅ לא רואה פרטי כניסה
- ✅ יכול להשתמש ב-session לפרסום אוטומטי
- ✅ הכל מוצפן ומאובטח
- ✅ כל שרת מיועד ללקוח יחיד
- ✅ פרופיל Chrome יחיד ומתמשך לכל שרת

## 🛠️ פקודות שימושיות

```bash
# הפעלת שרת הניהול
npm start

# בדיקת הגדרות Chrome
npm test

# הפעלה עם פיתוח (restart אוטומטי)
npm run dev
```

## ⚙️ הגדרות מתקדמות

### קובץ `config.json`:
```json
{
  "chrome": {
    "executablePath": "נתיב ל-Chrome",
    "userDataDir": "תיקיית פרופיל Chrome",
    "defaultArgs": ["פרמטרים נוספים לChrome"]
  },
  "server": {
    "port": 3000,
    "screenshotInterval": 2000
  },
  "facebook": {
    "defaultUrl": "https://www.facebook.com"
  }
}
```

### API Endpoints:
- `POST /api/create-browser/:sessionId` - יצירת דפדפן חדש
- `POST /api/close-browser/:sessionId` - סגירת דפדפן
- WebSocket events: `click`, `type`, `key`, `navigate`

## 🔧 פתרון בעיות נפוצות

### Chrome לא נפתח:
1. בדוק שהנתיב בconfig.json נכון
2. וודא שיש הרשאות לתיקיה
3. בדוק שChrome לא רץ כבר

### בעיות חיבור:
1. וודא שהפורט 3000 פנוי
2. בדוק firewall settings
3. נסה לגשת ל-`http://localhost:3000`

### Screenshot לא מעודכן:
1. בדוק שהדפדפן פתוח ופעיל
2. נסה לרענן את הדף
3. בדוק ביוגים בקונסולה

## 📁 מבנה הפרויקט

```
📦 facebook-remote-browser/
├── 📄 server.js             # שרת Node.js עיקרי
├── 📄 config.json           # הגדרות מערכת
├── 📄 test-browser.js       # בדיקת Chrome
├── 📄 package.json          # תלויות ומטאדטא
├── 📁 public/
│   └── 📄 index.html        # ממשק המשתמש
└── 📁 user-sessions/        # פרופילי לקוחות (נוצר אוטומטית)
```

## 🔒 אבטחה

- **הפרדת פרופילים** - כל לקוח בתיקיה נפרדת
- **ללא אחסון סיסמאות** - רק cookies מוצפנים
- **חיבור מאובטח** - WebSocket over HTTPS (בייצור)
- **ניטור פעילות** - לוגים מפורטים

## 🌐 פריסה ל-Google Cloud

### הכנת השרת:
1. צור VM ב-Google Cloud
2. התקן Node.js ו-Chrome
3. העלה את הקבצים
4. הרץ `npm install && npm start`
5. פתח פורט 3000 בפיירוול

### עדכון config.json לשרת:
```json
{
  "chrome": {
    "executablePath": "/usr/bin/google-chrome",
    "userDataDir": "/home/user/chrome-profile"
  },
  "server": {
    "port": 3000
  }
}
```

## 📞 תמיכה

אם יש בעיות:
1. בדוק את הלוגים בקונסולה
2. וודא שכל הנתיבים נכונים
3. נסה להפעיל `npm test` לבדיקה

## 📝 רישיון

MIT License - משתמש בחופשיות!

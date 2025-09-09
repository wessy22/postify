# 🔍 מערכת בדיקת סטטוס פרסומים בקבוצות פייסבוק

מערכת מתקדמת וחכמה לבדיקת סטטוס פרסומים בקבוצות פייסבוק עם לוגים מפורטים ותמיכה בשרת.

## 📁 מבנה התיקייה

```
groups-status-scanner/
│
├── 📋 README.md                           # קובץ זה
├── 📖 README-Server-Setup.md              # הוראות הקמת שרת
├── 📖 README-groups-status-scanner.md     # תיעוד בסיסי
│
├── 🖥️ client-files/                       # קבצים לצד הלקוח
│   └── scan-groups-post-status.js         # הסקריפט הראשי עם לוגים מפורטים
│
├── 🌐 server-files/                       # קבצים לשרת
│   └── wp-content/
│       └── postify-api/
│           ├── save-groups-status.php     # API לשמירת נתונים
│           └── get-groups-status.php      # API לקריאת נתונים
│
├── 👁️ viewers/                            # ממשקי תצוגה
│   ├── groups-post-status-viewer-enhanced.html    # תצוגה מקומית מתקדמת
│   └── groups-post-status-viewer-server.html      # תצוגה עם גישה לשרת
│
└── ⚡ batch-scripts/                      # קבצי הרצה מהירה
    ├── scan-groups-status.bat             # הרצה פשוטה
    └── scan-groups-status-advanced.bat    # הרצה עם אפשרויות מתקדמות
```

## 🚀 התחלה מהירה

### לקוח (Client):
1. העתק את `client-files/scan-groups-post-status.js` לתיקיית העבודה
2. וודא שקיימים: `config.json`, `log.txt`, `instance-name.txt`
3. הרץ: `node scan-groups-post-status.js`

### שרת (Server):
1. העלה את התוכן של `server-files/` לשרת
2. וודא הרשאות כתיבה לתיקייה
3. גש ל-`groups-post-status-viewer-server.html`

### תצוגה מקומית:
פתח `viewers/groups-post-status-viewer-enhanced.html` בדפדפן

## ✨ תכונות המערכת

### 🔍 **סריקה חכמה:**
- זיהוי אוטומטי של קבוצות מלוג הפרסומים
- תמיכה בתאריכים מותאמים אישית
- סריקה של קבוצה ספציפית

### 📊 **לוגים מפורטים:**
- לוגים צבעוניים עם אמוג'י
- מעקב מפורט אחר כל שלב
- רמות שונות: DEBUG, INFO, SUCCESS, ERROR, WARNING

### 🌐 **תמיכה בשרת:**
- API מלא לשמירה וקריאה
- ממשק תצוגה משרת עם סינונים
- רענון אוטומטי כל 5 דקות

### 📈 **תצוגה מתקדמת:**
- סיכום סטטיסטי
- אקורדיון לקבוצות
- ייצוא לExcel/CSV
- עיצוב רספונסיבי

## 🎯 דוגמאות שימוש

### הרצה בסיסית:
```bash
node scan-groups-post-status.js
```

### הרצה עם תאריך ספציפי:
```bash
node scan-groups-post-status.js --date=2025-06-06
```

### בדיקת קבוצה ספציפית:
```bash
node scan-groups-post-status.js --group=https://www.facebook.com/groups/123456
```

## 📋 דרישות מערכת

### לקוח:
- Node.js 14+
- Chrome/Chromium
- קובץ config.json מוגדר
- לוג פרסומים עם שורות "posting to group"

### שרת:
- PHP 7.4+
- הרשאות כתיבה לתיקיות
- תמיכה ב-JSON

## 🔧 התאמה אישית

### הוספת סלקטורים חדשים:
ערוך את המערך `postSelectors` בסקריפט

### שינוי URL השרת:
ערוך את המשתנה `API_BASE` בקובץ ההצגה

### הוספת רמות לוג:
הוסף רמות חדשות לפונקציית `writeDetailedLog`

## 🐛 פתרון בעיות

### "לא נמצאו קבוצות"
- בדוק קובץ log.txt
- וודא שיש שורות עם "posting to group"
- נסה תאריך אחר

### "דפדפן לא נפתח"
- בדוק config.json
- וודא נתיב Chrome נכון
- בדוק הרשאות תיקיית פרופיל

### "שגיאה בשרת"
- וודא קבצי PHP מותקנים
- בדוק הרשאות כתיבה
- עיין בלוגי השרת

## 📈 שיפורים עתידיים

- [ ] מסד נתונים במקום קבצים
- [ ] התראות Telegram
- [ ] Dashboard עם גרפים
- [ ] תמיכה במספר מכונות
- [ ] גיבוי ענן אוטומטי

## 📞 תמיכה

לשאלות או בעיות, פנה עם:
- לוגים מהסקריפט
- קובץ config.json
- פרטי השגיאה המדויקים

---

**פותח על ידי צוות Postify** 🚀

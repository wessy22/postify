# 🔍 מערכת בדיקת סטטוס פרסומים בקבוצות פייסבוק - גרסת שרת

מערכת מתקדמת לבדיקת סטטוס פרסומים בקבוצות פייסבוק עם תמיכה בשרת ותצוגה מרוחקת.

## 📋 קבצים נדרשים בשרת

### Backend API Files (שרת):
```
wp-content/postify-api/
├── save-groups-status.php     # קליטת נתונים מהלקוח
├── get-groups-status.php      # החזרת נתונים לתצוגה
└── groups-status-data/        # תיקיית נתונים (נוצרת אוטומטית)
    ├── *.json                 # קבצי נתונים
    └── upload_log.txt         # לוג העלאות
```

### Frontend Files (שרת או לקוח):
```
groups-post-status-viewer-server.html    # תצוגה מתקדמת עם גישה לשרת
groups-post-status-viewer-enhanced.html  # תצוגה מקומית
```

## 🖥️ קבצים נדרשים בלקוח

### Main Files:
```
scan-groups-post-status.js     # הסקריפט הראשי
config.json                    # הגדרות Chrome ונתיבים
log.txt                        # לוג פרסומים (מקור הנתונים)
instance-name.txt              # שם המכונה/לקוח
```

### Batch Files:
```
scan-groups-status.bat         # הרצה פשוטה
scan-groups-status-advanced.bat # הרצה מתקדמת עם אפשרויות
```

### Output Files (נוצרים אוטומטית):
```
groups-post-status-YYYY-MM-DD.json    # תוצאות מפורטות
latest-groups-post-status.json        # תוצאות אחרונות
groups-post-status-summary.json       # סיכום סטטיסטי
```

## 🚀 הוראות התקנה והפעלה

### שלב 1: הכנת השרת
1. העלה את קבצי ה-API לשרת:
   ```
   wp-content/postify-api/save-groups-status.php
   wp-content/postify-api/get-groups-status.php
   ```

2. וודא שתיקיית השרת יכולה לכתוב קבצים:
   ```bash
   chmod 755 wp-content/postify-api/
   chmod 644 wp-content/postify-api/*.php
   ```

### שלב 2: הכנת הלקוח
1. וודא שקיימים הקבצים הבסיסיים:
   - `config.json` (הגדרות דפדפן)
   - `log.txt` (לוג פרסומים)
   - `instance-name.txt` (שם המכונה)

2. הרץ את הסקריפט:
   ```bash
   node scan-groups-post-status.js
   ```

### שלב 3: צפייה בתוצאות
1. **מקומית**: פתח `groups-post-status-viewer-enhanced.html`
2. **משרת**: פתח `groups-post-status-viewer-server.html` בדפדפן

## 🔧 הגדרות API

### URL Endpoints:

#### שמירת נתונים (POST):
```
POST: wp-content/postify-api/save-groups-status.php
Content-Type: application/json

Body:
{
  "instance": "postify-yehiad",
  "scanType": "groups-post-status", 
  "data": {
    "scanDate": "2025-09-09T...",
    "totalGroups": 4,
    "results": [...]
  }
}
```

#### קריאת נתונים (GET):
```
# נתונים אחרונים למכונה ספציפית
GET: wp-content/postify-api/get-groups-status.php?instance=postify-yehiad&latest=true

# נתונים לתאריך ספציפי
GET: wp-content/postify-api/get-groups-status.php?instance=postify-yehiad&date=2025-09-09

# רשימת כל הקבצים
GET: wp-content/postify-api/get-groups-status.php
```

## 📊 מבנה הנתונים

### קובץ תוצאות JSON:
```json
{
  "instance": "postify-yehiad",
  "scanType": "groups-post-status",
  "timestamp": "2025-09-09 06:59:45",
  "data": {
    "scanDate": "2025-09-09T03:59:45.120Z",
    "totalGroups": 4,
    "successfulScans": 4,
    "failedScans": 0,
    "results": [
      {
        "groupName": "קבוצה 251476145048376",
        "groupUrl": "https://www.facebook.com/groups/251476145048376",
        "statusUrl": "https://www.facebook.com/groups/251476145048376/my_posted_content",
        "posts": [
          {
            "status": "פורסם בהצלחה",
            "content": "תוכן הפוסט...",
            "date": "2025-09-09",
            "index": 0
          }
        ],
        "scanTime": "2025-09-09T03:59:30.123Z",
        "success": true
      }
    ]
  }
}
```

## 🎯 תכונות מתקדמות

### 1. **Logging מפורט**
- לוגים צבעוניים עם רמות שונות (DEBUG, INFO, SUCCESS, ERROR)
- מעקב מפורט אחר כל שלב בתהליך
- זמני ביצוע ומדדי ביצועים

### 2. **טיפול בשגיאות**
- Retry אוטומטי בכישלונות רשת
- המשך עבודה גם אם קבוצה אחת נכשלת
- שמירת שגיאות בקובץ לוג

### 3. **אופטימיזציה**
- המתנות אינטליגנטיות בין קבוצות
- גלילה אוטומטית לטעינת תוכן
- זיהוי מתקדם של סלקטורים בפייסבוק

### 4. **תצוגה מתקדמת**
- ממשק ידידותי למשתמש
- סינון לפי מכונה ותאריך
- ייצוא לExcel/CSV
- רענון אוטומטי

## 🔍 פתרון בעיות נפוצות

### בעיה: "לא נמצאו קבוצות"
**פתרון**: בדוק שקובץ `log.txt` מכיל שורות עם "posting to group" בתאריך הרלוונטי

### בעיה: "שגיאה בשליחה לשרת"
**פתרון**: וודא שקבצי ה-API מותקנים בשרת ושהנתיב נכון

### בעיה: "דפדפן לא נפתח"
**פתרון**: בדוק את ההגדרות ב-`config.json` (נתיב Chrome, תיקיית פרופיל)

### בעיה: "לא נמצאו פוסטים"
**פתרון**: הפוסטים נמחקו או שהתאריכים בפייסבוק שונים מהלוג

## 📈 שיפורים עתידיים

- [ ] תמיכה במסדי נתונים (MySQL/PostgreSQL)
- [ ] התראות באמצעות Telegram/Email
- [ ] Dashboard מתקדם עם גרפים
- [ ] API למערכות חיצוניות
- [ ] גיבוי אוטומטי לענן

## 🆘 תמיכה

לשאלות או בעיות, פנה למפתח המערכת עם פרטי השגיאה מהלוגים.

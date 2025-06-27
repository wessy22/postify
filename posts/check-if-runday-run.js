const fs = require('fs');
const nodemailer = require('nodemailer');
const { execSync } = require('child_process');
const path = require('path');

// קריאת קונפיג
const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
const email = config.email;
const serverName = fs.existsSync('instance-name.txt') ? fs.readFileSync('instance-name.txt', 'utf-8').trim() : 'Unknown';

// נתיב heartbeat
const alivePath = 'C:/postify/alive.txt';

// 1. בדוק אם יש תהליך node שרץ עם run-day.js
let isProcessRunning = false;
try {
  const out = execSync('wmic process where "CommandLine like \'%run-day.js%\'" get ProcessId,CommandLine').toString();
  isProcessRunning = out.toLowerCase().includes('run-day.js');
} catch (e) {
  isProcessRunning = false;
}

// 2. בדוק אם ה-heartbeat alive.txt קיים ועדכני
let isHeartbeatFresh = false;
let heartbeatStatus = '';
if (fs.existsSync(alivePath)) {
  const mtime = fs.statSync(alivePath).mtime;
  const diffMin = (Date.now() - mtime.getTime()) / (1000 * 60);
  if (diffMin < 6) { // עד 6 דקות, כדי להימנע מהתראות שווא
    isHeartbeatFresh = true;
    heartbeatStatus = `עודכן לפני ${diffMin.toFixed(1)} דקות`;
  } else {
    heartbeatStatus = `לא עודכן מעל 6 דקות! (עודכן לפני ${diffMin.toFixed(1)} דקות)`;
  }
} else {
  heartbeatStatus = "לא נמצא בכלל!";
}

// 3. שלח התראה אם יש תקלה
if (!isProcessRunning || !isHeartbeatFresh) {
  const subject = 'שגיאה חמורה 🚨';
  const body = [
    `🚨 התראה דחופה משרת: ${serverName}`,
    '',
    `run-day.js לא פועל כראוי!`,
    `סטטוס תהליך: ${isProcessRunning ? 'רץ' : 'לא רץ'}`,
    `סטטוס heartbeat: ${heartbeatStatus}`,
    '',
    `נבדק בתאריך: ${new Date().toLocaleString('he-IL')}`,
    '',
    'אנא בדוק את השרת בדחיפות!',
  ].join('\n');

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: email.user, pass: email.pass }
  });

  transporter.sendMail(
    {
      from: `"Postify" <${email.user}>`,
      to: email.to,
      subject,
      text: body,
    },
    (err, info) => {
      if (err) console.error('❌ שגיאה בשליחת מייל:', err.message);
      else console.log('✅ מייל התראה נשלח:', info.response);
    }
  );
} else {
  console.log('✅ run-day.js חי ופעיל (תהליך + heartbeat תקינים)');
}

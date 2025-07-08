const fs = require('fs');
const nodemailer = require('nodemailer');

const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
const email = config.email;
const serverName = fs.existsSync('instance-name.txt')
  ? fs.readFileSync('instance-name.txt', 'utf-8').trim()
  : 'Unknown';

const alivePath = 'C:/postify/alive.txt';
const maxMinutes = 30;

let isHeartbeatFresh = false;
let heartbeatStatus = '';
let heartbeatContent = {};

if (fs.existsSync(alivePath)) {
  const raw = fs.readFileSync(alivePath, 'utf-8');
  try {
    heartbeatContent = JSON.parse(raw);
  } catch (e) {
    heartbeatContent = { datetime: null };
  }
  const mtime = fs.statSync(alivePath).mtime;
  const diffMin = (Date.now() - mtime.getTime()) / (1000 * 60);
  if (diffMin < maxMinutes) {
    isHeartbeatFresh = true;
    heartbeatStatus = `עודכן לפני ${diffMin.toFixed(1)} דקות`;
  } else {
    heartbeatStatus = `לא עודכן מעל ${maxMinutes} דקות! (עודכן לפני ${diffMin.toFixed(1)} דקות)`;
  }
} else {
  heartbeatStatus = "לא נמצא בכלל!";
}

if (!isHeartbeatFresh) {
  const subject = `שגיאה חמורה 🚨 משרת "${serverName}"`;
  const body = [
    `🚨 התראה דחופה משרת: ${serverName}`,
    '',
    `run-day.js לא פועל כראוי!`,
    `סטטוס heartbeat: ${heartbeatStatus}`,
    '',
    heartbeatContent.datetime ? `* עדכון אחרון: ${heartbeatContent.datetime}` : '',
    heartbeatContent.lastGroup ? `* קבוצה אחרונה: ${heartbeatContent.lastGroup}` : '',
    heartbeatContent.status ? `* סטטוס אחרון: ${heartbeatContent.status}` : '',
    heartbeatContent.postFile ? `* קובץ פוסט: ${heartbeatContent.postFile}` : '',
    (heartbeatContent.groupIndex !== undefined && heartbeatContent.groupIndex !== null)
      ? `* אינדקס קבוצה: ${heartbeatContent.groupIndex}` : '',
    '',
    `נבדק בתאריך: ${new Date().toLocaleString('he-IL')}`,
    '',
    'אנא בדוק את השרת בדחיפות!',
  ].filter(Boolean).join('\n');

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
  console.log(`✅ run-day.js חי ופעיל | ${heartbeatStatus}`);
  console.log('💓 מצב אחרון מה-heartbeat:', heartbeatContent);
}

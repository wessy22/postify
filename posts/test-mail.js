const { sendMail } = require('./mailer');
sendMail("Test Mail", "This is a test").then(() => {
  console.log("✅ Sent");
}).catch((e) => {
  console.error("❌ Error:", e.message);
});

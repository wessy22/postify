const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

// קובץ JSON לפי argv או ברירת מחדל
const postJson = process.argv[2] || "post1.json";
const jsonPath = path.join(__dirname, postJson);
const postData = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
const groups = postData.groups;

// ספירה לאחור מוצגת
const countdown = async (seconds) => {
  for (let i = seconds; i > 0; i--) {
    process.stdout.write(`⏳ ${i}s remaining...\r`);
    await new Promise(r => setTimeout(r, 1000));
  }
  console.log(); // ירידת שורה
};

// הרצה על קבוצות אחת־אחת
async function runPostFromIndex(index) {
  if (index >= groups.length) {
    console.log("✅ All groups processed!");
    return;
  }

  const groupUrl = groups[index];
  console.log(`📢 Posting to group (${index + 1}/${groups.length}): ${groupUrl}`);

  const child = spawn("node", ["post.js", groupUrl, postJson], {
    stdio: "inherit"
  });

  child.on("exit", async (code) => {
    const status = code === 0 ? "✅ Success" : `❌ Failed (code ${code})`;
    console.log(`${status} – ${groupUrl}`);

    // השהייה רנדומלית בין 10 דקות ל־15:59
    const delaySec = 600 + Math.floor(Math.random() * 360);
    const minutes = Math.floor(delaySec / 60);
    const seconds = delaySec % 60;
    console.log(`⏱ Waiting ${minutes}m ${seconds}s before next group...`);
    await countdown(delaySec);

    runPostFromIndex(index + 1);
  });
}

runPostFromIndex(0);

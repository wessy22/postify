const { keyboard, Key, sleep } = require("@nut-tree-fork/nut-js");

(async () => {
  try {
    console.log("⌨️ Waiting 3 seconds before pasting...");
    await sleep(3000); // תן לך זמן לעבור לפייסבוק ידנית

    console.log("📋 Pasting clipboard image (Ctrl+V)...");
    await keyboard.pressKey(Key.LeftControl, Key.V);
    await keyboard.releaseKey(Key.LeftControl, Key.V);

    console.log("✅ Paste triggered. Check if the image appeared.");
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();

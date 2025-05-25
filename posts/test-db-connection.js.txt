const mysql = require("mysql2/promise");
const dbConfig = require("./db-config");

(async () => {
  try {
    const connection = await mysql.createConnection(dbConfig);
    const [rows] = await connection.execute("SHOW TABLES");
    console.log("✅ התחברות הצליחה. הטבלאות במסד:");
    console.table(rows);
    await connection.end();
  } catch (err) {
    console.error("❌ שגיאה בחיבור ל־MySQL:", err.message);
  }
})();

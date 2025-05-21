const mysql = require('mysql2/promise');

const config = {
  host: 'localhost',
  user: 'root',
  password: 'P7193317p!', 
  multipleStatements: true
};

(async () => {
  try {
    const connection = await mysql.createConnection(config);
    console.log("🔌 Connected to MySQL");

    // יצירת בסיס הנתונים אם לא קיים
    await connection.query(`
      CREATE DATABASE IF NOT EXISTS postify
      CHARACTER SET utf8mb4
      COLLATE utf8mb4_general_ci;
    `);
    console.log("✅ Database 'postify' is ready.");

    // בחירת בסיס הנתונים
    await connection.query(`USE postify`);

    // יצירת הטבלאות
    const createTablesSQL = `
      CREATE TABLE IF NOT EXISTS posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) NOT NULL UNIQUE,      -- post1, post6 וכו'
        title VARCHAR(255),                    -- "פוסט דירה התחיה"
        text TEXT,                             -- טקסט חופשי
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS post_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        image_path VARCHAR(512),               -- נתיב התמונה
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS post_groups (
        id INT AUTO_INCREMENT PRIMARY KEY,
        post_id INT NOT NULL,
        group_url VARCHAR(512),                -- קישור לקבוצת פייסבוק
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
      );
    `;

    await connection.query(createTablesSQL);
    console.log("✅ Tables created successfully.");

    await connection.end();
  } catch (err) {
    console.error("❌ Error:", err.message);
  }
})();

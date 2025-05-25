const fs = require("fs");
const path = require("path");
const mysql = require("mysql2/promise");

const config = {
  host: "localhost",
  user: "root",
  password: "P7193317p!", 
  database: "postify"
};

async function importPosts() {
  const connection = await mysql.createConnection(config);
  console.log("🔌 Connected to MySQL");

  const files = process.argv[2]
  ? [process.argv[2]]
  : fs.readdirSync(__dirname).filter(f => /^post\d+\.json$/.test(f));


  for (const file of files) {
    const name = path.basename(file, ".json"); // post1, post2...
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, file), "utf-8"));
    const title = data.note || "";
    const text = data.text || "";
    const images = data.images || [];
    const groups = data.groups || [];

    // הכנס לרשומת posts
    const [postResult] = await connection.execute(
      "INSERT INTO posts (name, title, text) VALUES (?, ?, ?)",
      [name, title, text]
    );
    const postId = postResult.insertId;
    console.log(`📄 Inserted ${name} (ID: ${postId})`);

    // הכנס תמונות
    for (const imagePath of images) {
      await connection.execute(
        "INSERT INTO post_images (post_id, image_path) VALUES (?, ?)",
        [postId, imagePath]
      );
    }

    // הכנס קבוצות
    for (const groupUrl of groups) {
      await connection.execute(
        "INSERT INTO post_groups (post_id, group_url) VALUES (?, ?)",
        [postId, groupUrl]
      );
    }

    console.log(`🖼️ ${images.length} images, 👥 ${groups.length} groups added for ${name}`);
  }

  await connection.end();
  console.log("✅ Import finished.");
}

importPosts().catch(err => {
  console.error("❌ Error:", err.message);
});

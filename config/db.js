const mysql = require("mysql2");

const db = mysql.createConnection({
  host: process.env.DB_HOST,       // MySQL 호스트 (예: 'localhost' 또는 '127.0.0.1')
  user: process.env.DB_USER,       // MySQL 사용자 이름
  password: process.env.DB_PASSWORD, // MySQL 비밀번호
  database: process.env.DB_NAME,   // 사용할 데이터베이스 이름
  port: process.env.DB_PORT || 3306, // MySQL 포트 (기본값: 3306)
});

db.connect((err) => {
  if (err) {
    console.error("❌ MySQL Connection Error:", err);
    process.exit(1); // 서버 실행 중지
  }
  console.log("✅ MySQL connected...");
});

module.exports = db;

require("dotenv").config();
const express = require("express");
const path = require("path");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const db = require("./config/db");

const app = express();

// EJS 설정
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

// 정적 파일 (CSS, 이미지)
app.use(express.static(path.join(__dirname, "public")));

// POST 요청을 위한 미들웨어
app.use(express.json());  
app.use(express.urlencoded({ extended: true }));

// MongoDB 기반 세션 설정
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
      autoRemove: "native",
    }),
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 3600 * 1000 },
  })
);

// ✅ EJS 전역 변수 설정 (모든 EJS 파일에서 사용 가능)
app.use((req, res, next) => {
  res.locals.authenticated = !!req.session.user;  // 로그인 상태 확인
  res.locals.username = req.session.user || "";  // 로그인된 사용자명

  db.query("SELECT emoji_id, emoji_code FROM emoji", (err, results) => {
    if (err) {
      console.error("Error fetching emojis:", err);
      res.locals.availableEmojis = []; // 오류 발생 시 빈 배열
    } else {
      res.locals.availableEmojis = results; // DB에서 가져온 이모지 목록
    }
    next();
  });
});

// 라우트 설정
app.use(require("./routes/auth"));
app.use(require("./routes/rooms"));
app.use(require("./routes/messages"));

// 홈 페이지
app.get("/", (req, res) => {
  res.render("index"); // 이제 `authenticated`와 `username`을 따로 넘길 필요 없음 (res.locals에서 자동으로 사용 가능)
});

// 404 에러 페이지
app.use((req, res) => {
  res.status(404).render("404");
});

// 서버 실행
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});

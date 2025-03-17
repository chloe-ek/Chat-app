const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../config/db");
const router = express.Router();

// 회원가입 페이지
router.get("/signup", (req, res) => {
  res.render("signup");
});

// 회원가입 처리
router.post("/signup", async (req, res) => {
  const { email, username, password } = req.body;

  if (!email || !username || !password) {
    return res.redirect("/signup?error=Missing fields");
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const query = `INSERT INTO user (email, username, password_hash) VALUES (?, ?, ?)`;
    
    db.query(query, [email, username, hashedPassword], (err) => {
      if (err) {
        console.error("MySQL Insert Error:", err);
        return res.redirect("/signup?error=Database error");
      }

      req.session.user = { id: user.user_id, username: user.username };
      req.session.save(() => res.redirect("/rooms"));

    });
  } catch (err) {
    console.error("Error processing signup:", err);
    res.redirect("/signup?error=Unknown error");
  }
});

// 로그인 페이지
router.get("/login", (req, res) => {
  res.render("login");
});

// 로그인 처리
router.post("/login", (req, res) => {
  const { username, password } = req.body;

  const query = `SELECT * FROM user WHERE username = ?`;
  db.query(query, [username], async (err, results) => {
    if (err) {
      console.error("Database error: ", err);
      return res.redirect("/login?error=Database error");
    }

    if (results.length > 0) {
      const user = results[0];

      const match = await bcrypt.compare(password, user.password_hash);
      if (match) {
        req.session.user = user.username;
        req.session.userId = user.user_id;
        req.session.save(() => res.redirect("/rooms"));
      } else {
        res.redirect("/login?error=Invalid credentials");
      }
    } else {
      res.redirect("/login?error=Invalid credentials");
    }
  });
});

// 로그아웃
router.get("/logout", (req, res) => {
  req.session.destroy(() => {
    res.redirect("/");
  });
});

module.exports = router;

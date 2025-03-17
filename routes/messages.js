const express = require("express");
const db = require("../config/db");
const router = express.Router();

// ✅ 인증 미들웨어
function isAuthenticated(req, res, next) {
  if (!req.session.user || !req.session.userId) {
    return res.redirect("/login");
  }
  next();
}


// ✅ 메시지 전송
router.post("/rooms/:roomId/send", isAuthenticated, (req, res) => {
  const roomId = req.params.roomId;
  const userId = req.session.userId;
  const { message } = req.body;

  if (!message.trim()) {
    console.error("❌ Error: Cannot send empty message");
    return res.redirect(`/rooms/${roomId}?error=Message cannot be empty`);
  }

  // ✅ 사용자의 room_user_id 찾기
  db.query(
    "SELECT room_user_id FROM room_user WHERE room_id = ? AND user_id = ?",
    [roomId, userId],
    (err, result) => {
      if (err) {
        console.error("❌ Error finding room_user_id:", err);
        return res.redirect(`/rooms/${roomId}?error=Database error`);
      }

      if (result.length === 0) {
        console.error("❌ Error: User not in room");
        return res.redirect(`/rooms/${roomId}?error=User not in room`);
      }

      const roomUserId = result[0].room_user_id;

      // ✅ 메시지 저장
      db.query("INSERT INTO message (room_user_id, text, sent_datetime) VALUES (?, ?, CONVERT_TZ(NOW(), 'UTC', 'America/Vancouver'))", 

    [roomUserId, message], 
    (err) => {
        if (err) {
            console.error("❌ Error sending message:", err);
        }
        console.log("✅ Message sent successfully");
        res.redirect(`/rooms/${roomId}`);
    }
);



    }
  );
});

router.post("/rooms/:roomId/messages/:messageId/react", isAuthenticated, (req, res) => {
    console.log("🔹 Received request:", req.body); // ✅ 요청 데이터 확인용 로그 추가

    const { emoji } = req.body;
    const userId = req.session.userId;
    const { roomId, messageId } = req.params;

    if (!emoji) {
      console.error(
        "❌ Error: No emoji received in request. req.body:",
        req.body
      );
      return res.status(400).json({ error: "Emoji is required" });
    }

    console.log(
      `🔹 User ${userId} reacting with ${emoji} to message ${messageId}`
    );

    // ✅ 1. emoji_code로 emoji_id 조회
    const findEmojiQuery = "SELECT emoji_id FROM emoji WHERE emoji_code = ?";
    db.query(findEmojiQuery, [emoji], (err, result) => {
      if (err) {
        console.error("❌ Error finding emoji:", err);
        return res.status(500).json({ error: "Database error" });
      }

      if (result.length === 0) {
        console.error("❌ Emoji not found in DB:", emoji);
        return res.status(404).json({ error: "Emoji not found" });
      }

      const emojiId = result[0].emoji_id;

      // ✅ 2. message_reaction 테이블에 추가 (중복 방지)
      const checkReactionQuery = `
    SELECT * FROM message_reaction WHERE message_id = ? AND user_id = ? AND emoji_id = ?
`;
      db.query(
        checkReactionQuery,
        [messageId, userId, emojiId],
        (err, result) => {
          if (err) {
            console.error("Database error checking reaction:", err);
            return res.status(500).json({ error: "Database error" });
          }

          if (result.length > 0) {
            // 이미 반응한 경우 삭제
            const deleteQuery =
              "DELETE FROM message_reaction WHERE message_id = ? AND user_id = ? AND emoji_id = ?";
            db.query(deleteQuery, [messageId, userId, emojiId], (err) => {
              if (err) {
                console.error("Error removing reaction:", err);
                return res.status(500).json({ error: "Database error" });
              }
              res.status(200).json({ success: true, removed: true });
            });
          } else {
            // 새로운 반응 추가
            const insertQuery =
              "INSERT INTO message_reaction (message_id, emoji_id, user_id) VALUES (?, ?, ?)";
            db.query(insertQuery, [messageId, emojiId, userId], (err) => {
              if (err) {
                console.error("Error adding reaction:", err);
                return res.status(500).json({ error: "Database error" });
              }
              res.status(200).json({ success: true, added: true });
            });
          }
        }
      );
    });
  }
);

module.exports = router;

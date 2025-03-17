const express = require("express");
const db = require("../config/db");
const router = express.Router();

function isAuthenticated(req, res, next) {
  if (!req.session.userId) {
    return res.redirect("/login");
  }
  next();
}

// 🔹 "Create Group" 페이지 렌더링 (여기에서 users와 userId 전달)
router.get("/rooms/new", isAuthenticated, (req, res) => {
  const userId = req.session.userId;  // ✅ 현재 로그인한 사용자의 ID 가져오기

  db.query("SELECT user_id, username FROM user", (err, results) => {
    if (err) {
      console.error("Error fetching users:", err);
      return res.redirect("/rooms?error=Database error");
    }

    res.render("new-room", { users: results, userId });  // ✅ userId를 EJS로 전달
  });
});

// 🔹 채팅방 목록 페이지
router.get("/rooms", isAuthenticated, (req, res) => {
    const userId = req.session.userId;

    const query = `
    SELECT r.room_id, r.name, 
        (SELECT text FROM message m 
         JOIN room_user ru ON m.room_user_id = ru.room_user_id 
         WHERE ru.room_id = r.room_id 
         ORDER BY m.sent_datetime DESC LIMIT 1) AS last_message,
        (SELECT MAX(m.sent_datetime) 
         FROM message m 
         JOIN room_user ru ON m.room_user_id = ru.room_user_id 
         WHERE ru.room_id = r.room_id) AS last_message_time,
        (SELECT COUNT(*) FROM message m 
         JOIN room_user ru ON m.room_user_id = ru.room_user_id 
         WHERE ru.room_id = r.room_id 
         AND m.message_id > IFNULL((SELECT last_read_message_id 
                                    FROM room_user 
                                    WHERE user_id = ? AND room_id = r.room_id), 0)) AS unread_messages
    FROM room r
    JOIN room_user ru ON r.room_id = ru.room_id
    WHERE ru.user_id = ?;
    `;

    db.query(query, [userId, userId], (err, rooms) => {
        if (err) {
            console.error("❌ SQL 실행 오류:", err);
            return res.redirect("/?error=Database error");
        }

        console.log("📌 Fetched Rooms Data:", rooms); // ✅ 데이터 확인

        rooms.forEach(room => {
            room.last_message_time = room.last_message_time ? 
                new Date(room.last_message_time).toLocaleString("en-US", { timeZone: "America/Vancouver" }) : "No messages yet";
        });

        res.render("rooms", { rooms });
    });
});


// ✅ 특정 채팅방 메시지 로드
router.get("/rooms/:roomId", isAuthenticated, (req, res) => {
  const roomId = req.params.roomId;
  console.log("📌 Requested Room ID:", roomId); // ✅ 디버깅 로그 추가
  if (!roomId || isNaN(roomId)) {
    console.error("❌ Invalid roomId:", roomId);
    return res.redirect("/rooms?error=Invalid Room ID");
  }

  const userId = req.session.userId;

  // ✅ 1. 채팅방 이름 가져오기
  db.query("SELECT name FROM room WHERE room_id = ?", [roomId], (err, roomResult) => {
    if (err || roomResult.length === 0) {
      console.error("❌ Error fetching room name:", err);
      return res.redirect("/rooms?error=Room not found");
    }

    const roomName = roomResult[0].name;

    // ✅ 2. 특정 채팅방 메시지 가져오기
    const query = `
      SELECT 
          m.message_id, 
          m.text, 
          m.sent_datetime, 
          ru.user_id,
          u.username,
          IFNULL((
              SELECT JSON_ARRAYAGG(
                  JSON_OBJECT('emoji', sub.emoji_code, 'count', sub.count)
              )
              FROM (
                  SELECT e.emoji_code, COUNT(*) AS count
                  FROM message_reaction mr
                  JOIN emoji e ON mr.emoji_id = e.emoji_id
                  WHERE mr.message_id = m.message_id
                  GROUP BY e.emoji_code
              ) AS sub
          ), '[]') AS reactions
      FROM message m
      JOIN room_user ru ON m.room_user_id = ru.room_user_id
      JOIN user u ON ru.user_id = u.user_id
      WHERE ru.room_id = ? 
      ORDER BY m.sent_datetime ASC;
    `;

    db.query(query, [roomId], (err, messages) => {
      if (err) {
        console.error("❌ Error fetching messages:", err);
        return res.redirect("/rooms?error=Database error");
      }

      const formattedMessages = messages.map(msg => ({
        username: msg.username,
        text: msg.text,
        time: msg.sent_datetime 
          ? new Date(msg.sent_datetime).toLocaleString("en-US", { timeZone: "America/Vancouver" }) 
          : "No Timestamp",
        isOwn: msg.user_id === userId,
        message_id: msg.message_id,
        reactions: msg.reactions ? JSON.parse(msg.reactions) : [],
      }));

      // ✅ 3. 사용자의 마지막 읽은 메시지 ID 가져오기 & 업데이트
      db.query(
        "SELECT last_read_message_id FROM room_user WHERE room_id = ? AND user_id = ?",
        [roomId, userId],
        (err, lastReadResult) => {
          const lastReadMessageId = lastReadResult?.[0]?.last_read_message_id || 0;

          db.query(
            "UPDATE room_user SET last_read_message_id = ? WHERE room_id = ? AND user_id = ?",
            [lastReadMessageId, roomId, userId],
            (err) => {
              if (err) console.error("❌ Error updating last read message ID:", err);
            }
          );

          // ✅ 4. 방에 없는 유저 목록 가져오기 (초대할 수 있는 유저)
          db.query(
            "SELECT user_id, username FROM user WHERE user_id NOT IN (SELECT user_id FROM room_user WHERE room_id = ?)",
            [roomId],
            (err, availableUsers) => {
              if (err) {
                console.error("❌ Error fetching available users:", err);
                return res.redirect("/rooms?error=Database error");
              }

              console.log("📌 Available Users:", availableUsers || []);

              res.render("chat", {
                roomId,
                roomName,
                messages: formattedMessages,
                lastReadMessageId,
                availableUsers: availableUsers || [],
              });
            }
          );
        }
      );
    });
  });
});

router.post("/rooms/:roomId/invite", isAuthenticated, (req, res) => {
    const roomId = req.params.roomId;
    const { userId } = req.body;

    // ✅ 초대할 유저가 이미 방에 있는지 확인
    db.query(
        "SELECT * FROM room_user WHERE room_id = ? AND user_id = ?",
        [roomId, userId],
        (err, result) => {
            if (err) {
                console.error("❌ Error checking user in room:", err);
                return res.json({ success: false, error: "Database error" });
            }

            if (result.length > 0) {
                return res.json({ success: false, error: "User is already in this room" });
            }

            // ✅ 방에 없는 유저라면 초대하기
            db.query(
                "INSERT INTO room_user (room_id, user_id) VALUES (?, ?)",
                [roomId, userId],
                (err) => {
                    if (err) {
                        console.error("❌ Error inviting user:", err);
                        return res.json({ success: false, error: "Database error" });
                    }
                    console.log(`✅ User ${userId} invited to room ${roomId}`);
                    res.json({ success: true });
                }
            );
        }
    );
});


router.post("/rooms/create", isAuthenticated, (req, res) => {
  const { roomName } = req.body;
  let selectedUsers = req.body.selectedUsers || [];
  const creatorId = req.session.userId;

  // ✅ selectedUsers가 배열인지 확인하고 변환
  if (!Array.isArray(selectedUsers)) {
    selectedUsers = [selectedUsers];  // 체크박스를 하나만 선택하면 배열로 변환
  }

  if (!roomName || selectedUsers.length === 0) {
    return res.redirect("/rooms/new?error=Please select users");
  }

  // exclude creator from selected users
  selectedUsers = selectedUsers.filter(userId => userId != creatorId);

  // 1️⃣ 방 생성
  db.query("INSERT INTO room (name) VALUES (?)", [roomName], (err, result) => {
    if (err) {
      console.error("Error creating room:", err);
      return res.redirect("/rooms/new?error=Database error");
    }

    const roomId = result.insertId;
    const userIds = [creatorId, ...selectedUsers];
    const values = userIds.map(userId => [userId, roomId]);

    db.query("INSERT IGNORE INTO room_user (user_id, room_id) VALUES ?", [values], (err) => {
      if (err) {
        console.error("Error adding users to room:", err);
        return res.redirect("/rooms/new?error=Database error");
      }
      res.redirect("/rooms");
    });
  });
});

module.exports = router;

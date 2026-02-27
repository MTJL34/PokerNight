const db = require("../config/db");

async function getBuyins(req, res, next) {
  try {
    const { session_id, player_id } = req.query;

    let sql = `
      SELECT session_id, player_id, buyin_no, amount
      FROM entry_buyins
      WHERE 1 = 1
    `;
    const params = [];

    if (session_id) {
      sql += " AND session_id = ?";
      params.push(session_id);
    }

    if (player_id) {
      sql += " AND player_id = ?";
      params.push(player_id);
    }

    sql += " ORDER BY session_id ASC, player_id ASC, buyin_no ASC";

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function addBuyin(req, res, next) {
  try {
    const { session_id, player_id } = req.body;

    if (!session_id || !player_id) {
      return res
        .status(400)
        .json({ message: "session_id and player_id are required" });
    }

    const [maxRows] = await db.query(
      "SELECT COALESCE(MAX(buyin_no), 0) AS max_buyin FROM entry_buyins WHERE session_id = ? AND player_id = ?",
      [session_id, player_id]
    );

    const nextBuyinNo = Number(maxRows[0].max_buyin) + 1;
    if (nextBuyinNo > 3) {
      return res.status(400).json({ message: "Maximum 3 buy-ins per player/session" });
    }

    await db.query(
      "INSERT INTO entry_buyins (session_id, player_id, buyin_no, amount) VALUES (?, ?, ?, 10)",
      [session_id, player_id, nextBuyinNo]
    );

    res.status(201).json({
      message: "Buy-in added",
      session_id: Number(session_id),
      player_id: Number(player_id),
      buyin_no: nextBuyinNo,
      amount: 10,
    });
  } catch (err) {
    next(err);
  }
}

async function deleteBuyin(req, res, next) {
  try {
    const { session_id, player_id, buyin_no } = req.params;

    const [result] = await db.query(
      "DELETE FROM entry_buyins WHERE session_id = ? AND player_id = ? AND buyin_no = ?",
      [session_id, player_id, buyin_no]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Buy-in not found" });
    }

    res.json({ message: "Buy-in deleted" });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getBuyins,
  addBuyin,
  deleteBuyin,
};

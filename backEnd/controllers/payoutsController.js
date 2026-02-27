const db = require("../config/db");

async function getPayouts(req, res, next) {
  try {
    const { session_id } = req.query;
    let sql = `
      SELECT
        sp.session_id,
        sp.rank_no,
        sp.player_id,
        p.player_name,
        sp.amount
      FROM session_payouts sp
      INNER JOIN players p ON p.player_id = sp.player_id
    `;
    const params = [];

    if (session_id) {
      sql += " WHERE sp.session_id = ?";
      params.push(session_id);
    }

    sql += " ORDER BY sp.session_id ASC, sp.rank_no ASC";

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function upsertPayout(req, res, next) {
  try {
    const { session_id, rank_no, player_id, amount } = req.body;

    if (!session_id || !rank_no || !player_id || amount == null) {
      return res.status(400).json({
        message: "session_id, rank_no, player_id and amount are required",
      });
    }

    await db.query(
      `
      INSERT INTO session_payouts (session_id, rank_no, player_id, amount)
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        player_id = VALUES(player_id),
        amount = VALUES(amount)
      `,
      [session_id, rank_no, player_id, amount]
    );

    res.json({ message: "Payout upserted" });
  } catch (err) {
    next(err);
  }
}

async function deletePayout(req, res, next) {
  try {
    const { session_id, rank_no } = req.params;
    const [result] = await db.query(
      "DELETE FROM session_payouts WHERE session_id = ? AND rank_no = ?",
      [session_id, rank_no]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Payout not found" });
    }

    res.json({ message: "Payout deleted" });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPayouts,
  upsertPayout,
  deletePayout,
};

const db = require("../config/db");

async function getEntries(req, res, next) {
  try {
    const { session_id } = req.query;
    let sql = `
      SELECT
        se.session_id,
        se.player_id,
        p.player_name,
        se.position_id,
        pos.rank_no
      FROM session_entries se
      INNER JOIN players p ON p.player_id = se.player_id
      INNER JOIN positions pos ON pos.position_id = se.position_id
    `;
    const params = [];

    if (session_id) {
      sql += " WHERE se.session_id = ?";
      params.push(session_id);
    }

    sql += " ORDER BY se.session_id ASC, pos.rank_no ASC";

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function createEntry(req, res, next) {
  try {
    const { session_id, player_id, position_id } = req.body;

    if (!session_id || !player_id || !position_id) {
      return res
        .status(400)
        .json({ message: "session_id, player_id and position_id are required" });
    }

    await db.query(
      "INSERT INTO session_entries (session_id, player_id, position_id) VALUES (?, ?, ?)",
      [session_id, player_id, position_id]
    );

    res.status(201).json({ message: "Entry created" });
  } catch (err) {
    next(err);
  }
}

async function updateEntry(req, res, next) {
  try {
    const { session_id, player_id } = req.params;
    const { position_id } = req.body;

    if (!position_id) {
      return res.status(400).json({ message: "position_id is required" });
    }

    const [result] = await db.query(
      "UPDATE session_entries SET position_id = ? WHERE session_id = ? AND player_id = ?",
      [position_id, session_id, player_id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Entry not found" });
    }

    res.json({ message: "Entry updated" });
  } catch (err) {
    next(err);
  }
}

async function deleteEntry(req, res, next) {
  try {
    const { session_id, player_id } = req.params;
    const [result] = await db.query(
      "DELETE FROM session_entries WHERE session_id = ? AND player_id = ?",
      [session_id, player_id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Entry not found" });
    }

    res.json({ message: "Entry deleted" });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getEntries,
  createEntry,
  updateEntry,
  deleteEntry,
};

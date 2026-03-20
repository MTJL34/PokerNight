const db = require("../config/db");

function parseEliminatedFlag(value) {
  if (value === true || value === 1 || value === "1") return 1;
  return 0;
}

async function getEntries(req, res, next) {
  try {
    const { session_id } = req.query;
    let sql = `
      SELECT
        se.session_id,
        se.player_id,
        p.player_name,
        se.position_id,
        se.is_eliminated,
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
    const {
      session_id,
      player_id,
      position_id,
      is_eliminated,
    } = req.body;

    if (!session_id || !player_id || !position_id) {
      return res
        .status(400)
        .json({ message: "session_id, player_id and position_id are required" });
    }

    const eliminatedFlag = parseEliminatedFlag(is_eliminated);

    await db.query(
      `
        INSERT INTO session_entries (session_id, player_id, position_id, is_eliminated)
        VALUES (?, ?, ?, ?)
      `,
      [session_id, player_id, position_id, eliminatedFlag]
    );

    res.status(201).json({ message: "Entry created" });
  } catch (err) {
    next(err);
  }
}

async function updateEntry(req, res, next) {
  try {
    const { session_id, player_id } = req.params;
    const { position_id, is_eliminated } = req.body;

    const updates = [];
    const values = [];

    if (position_id != null && position_id !== "") {
      updates.push("position_id = ?");
      values.push(position_id);
    }

    if (is_eliminated != null) {
      updates.push("is_eliminated = ?");
      values.push(parseEliminatedFlag(is_eliminated));
    }

    if (!updates.length) {
      return res.status(400).json({ message: "position_id or is_eliminated is required" });
    }

    const [result] = await db.query(
      `UPDATE session_entries SET ${updates.join(", ")} WHERE session_id = ? AND player_id = ?`,
      [...values, session_id, player_id]
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

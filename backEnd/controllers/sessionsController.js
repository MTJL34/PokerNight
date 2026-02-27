const db = require("../config/db");

async function getSessions(_req, res, next) {
  try {
    const [rows] = await db.query(
      "SELECT session_id, session_name FROM sessions ORDER BY session_id ASC"
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getSessionById(req, res, next) {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      "SELECT session_id, session_name FROM sessions WHERE session_id = ?",
      [id]
    );

    if (!rows.length) return res.status(404).json({ message: "Session not found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function createSession(req, res, next) {
  try {
    const { session_id, session_name } = req.body;
    if (!session_id || !session_name) {
      return res
        .status(400)
        .json({ message: "session_id and session_name are required" });
    }

    await db.query(
      "INSERT INTO sessions (session_id, session_name) VALUES (?, ?)",
      [session_id, session_name]
    );

    res.status(201).json({
      message: "Session created",
      session_id: Number(session_id),
      session_name,
    });
  } catch (err) {
    next(err);
  }
}

async function updateSession(req, res, next) {
  try {
    const { id } = req.params;
    const { session_name } = req.body;

    if (!session_name) {
      return res.status(400).json({ message: "session_name is required" });
    }

    const [result] = await db.query(
      "UPDATE sessions SET session_name = ? WHERE session_id = ?",
      [session_name, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Session not found" });
    }

    res.json({ message: "Session updated" });
  } catch (err) {
    next(err);
  }
}

async function deleteSession(req, res, next) {
  let conn;
  try {
    const { id } = req.params;
    conn = await db.getConnection();
    await conn.beginTransaction();

    await conn.query("DELETE FROM session_payouts WHERE session_id = ?", [id]);
    await conn.query(
      "DELETE FROM entry_buyins WHERE session_id = ?",
      [id]
    );
    await conn.query("DELETE FROM session_entries WHERE session_id = ?", [id]);
    const [result] = await conn.query(
      "DELETE FROM sessions WHERE session_id = ?",
      [id]
    );

    if (!result.affectedRows) {
      await conn.rollback();
      return res.status(404).json({ message: "Session not found" });
    }

    await conn.commit();
    res.json({ message: "Session deleted" });
  } catch (err) {
    if (conn) await conn.rollback();
    next(err);
  } finally {
    if (conn) conn.release();
  }
}

module.exports = {
  getSessions,
  getSessionById,
  createSession,
  updateSession,
  deleteSession,
};

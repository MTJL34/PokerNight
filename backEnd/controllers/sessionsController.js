const db = require("../config/db");

function parseClosedFlag(value) {
  if (value === true || value === 1 || value === "1") return 1;
  return 0;
}

function parseOptionalPositiveInt(value, fieldName) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return n;
}

function parseOptionalPositiveNumber(value, fieldName) {
  if (value == null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${fieldName} must be a positive number`);
  }
  return n;
}

async function getSessions(_req, res, next) {
  try {
    const [rows] = await db.query(
      `
        SELECT
          session_id,
          session_name,
          is_closed,
          stack_per_10_eur,
          chip_value
        FROM sessions
        ORDER BY session_id ASC
      `
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
      `
        SELECT
          session_id,
          session_name,
          is_closed,
          stack_per_10_eur,
          chip_value
        FROM sessions
        WHERE session_id = ?
      `,
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
    const {
      session_id,
      session_name,
      is_closed,
      stack_per_10_eur,
      chip_value,
    } = req.body;

    if (!session_id || !session_name) {
      return res
        .status(400)
        .json({ message: "session_id and session_name are required" });
    }

    const closedFlag = parseClosedFlag(is_closed);
    let stackPer10Eur;
    let chipValue;
    try {
      stackPer10Eur = parseOptionalPositiveInt(stack_per_10_eur, "stack_per_10_eur");
      chipValue = parseOptionalPositiveNumber(chip_value, "chip_value");
    } catch (validationErr) {
      return res.status(400).json({ message: validationErr.message });
    }

    await db.query(
      `
        INSERT INTO sessions (
          session_id,
          session_name,
          is_closed,
          stack_per_10_eur,
          chip_value
        ) VALUES (?, ?, ?, ?, ?)
      `,
      [session_id, session_name, closedFlag, stackPer10Eur, chipValue]
    );

    res.status(201).json({
      message: "Session created",
      session_id: Number(session_id),
      session_name,
      is_closed: closedFlag,
      stack_per_10_eur: stackPer10Eur,
      chip_value: chipValue,
    });
  } catch (err) {
    next(err);
  }
}

async function updateSession(req, res, next) {
  try {
    const { id } = req.params;
    const {
      session_name,
      is_closed,
      stack_per_10_eur,
      chip_value,
    } = req.body;

    if (!session_name) {
      return res.status(400).json({ message: "session_name is required" });
    }

    const closedFlag = parseClosedFlag(is_closed);
    let stackPer10Eur;
    let chipValue;
    try {
      stackPer10Eur = parseOptionalPositiveInt(stack_per_10_eur, "stack_per_10_eur");
      chipValue = parseOptionalPositiveNumber(chip_value, "chip_value");
    } catch (validationErr) {
      return res.status(400).json({ message: validationErr.message });
    }

    const [result] = await db.query(
      `
        UPDATE sessions
        SET
          session_name = ?,
          is_closed = ?,
          stack_per_10_eur = ?,
          chip_value = ?
        WHERE session_id = ?
      `,
      [session_name, closedFlag, stackPer10Eur, chipValue, id]
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

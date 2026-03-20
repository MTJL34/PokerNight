const db = require("../config/db");

function parseNonNegativeNumber(value, fieldName, { allowNull = true } = {}) {
  if (value == null || value === "") {
    if (allowNull) return null;
    throw new Error(`${fieldName} is required`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(`${fieldName} must be a non-negative number`);
  }
  return n;
}

async function getLiveStacks(req, res, next) {
  try {
    const { session_id, player_id } = req.query;

    let sql = `
      SELECT
        ls.session_id,
        ls.player_id,
        p.player_name,
        ls.current_stack,
        ls.blind_amount,
        ls.blinds_remaining_exact,
        ls.updated_at
      FROM session_live_stacks ls
      INNER JOIN players p ON p.player_id = ls.player_id
      WHERE 1 = 1
    `;
    const params = [];

    if (session_id) {
      sql += " AND ls.session_id = ?";
      params.push(session_id);
    }

    if (player_id) {
      sql += " AND ls.player_id = ?";
      params.push(player_id);
    }

    sql += " ORDER BY ls.session_id ASC, ls.player_id ASC";

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function upsertLiveStack(req, res, next) {
  try {
    const {
      session_id,
      player_id,
      current_stack,
      blind_amount,
      blinds_remaining_exact
    } = req.body;

    if (!session_id || !player_id) {
      return res.status(400).json({ message: "session_id and player_id are required" });
    }

    let parsedCurrentStack;
    let parsedBlindAmount;
    let parsedBlindsRemainingExact;
    try {
      parsedCurrentStack = parseNonNegativeNumber(current_stack, "current_stack", { allowNull: false });
      parsedBlindAmount = parseNonNegativeNumber(blind_amount, "blind_amount", { allowNull: true });
      parsedBlindsRemainingExact = parseNonNegativeNumber(blinds_remaining_exact, "blinds_remaining_exact", { allowNull: true });
    } catch (validationErr) {
      return res.status(400).json({ message: validationErr.message });
    }

    await db.query(
      `
        INSERT INTO session_live_stacks (
          session_id,
          player_id,
          current_stack,
          blind_amount,
          blinds_remaining_exact
        ) VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          current_stack = VALUES(current_stack),
          blind_amount = VALUES(blind_amount),
          blinds_remaining_exact = VALUES(blinds_remaining_exact)
      `,
      [
        Number(session_id),
        Number(player_id),
        parsedCurrentStack,
        parsedBlindAmount,
        parsedBlindsRemainingExact
      ]
    );

    res.json({
      message: "Live stack upserted",
      session_id: Number(session_id),
      player_id: Number(player_id),
      current_stack: parsedCurrentStack,
      blind_amount: parsedBlindAmount,
      blinds_remaining_exact: parsedBlindsRemainingExact
    });
  } catch (err) {
    next(err);
  }
}

async function deleteLiveStack(req, res, next) {
  try {
    const { session_id, player_id } = req.params;

    const [result] = await db.query(
      "DELETE FROM session_live_stacks WHERE session_id = ? AND player_id = ?",
      [session_id, player_id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Live stack not found" });
    }

    res.json({ message: "Live stack deleted" });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getLiveStacks,
  upsertLiveStack,
  deleteLiveStack
};

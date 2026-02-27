const db = require("../config/db");

async function getPlayers(_req, res, next) {
  try {
    const [rows] = await db.query(
      "SELECT player_id, player_name FROM players ORDER BY player_id ASC"
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

async function getPlayerById(req, res, next) {
  try {
    const { id } = req.params;
    const [rows] = await db.query(
      "SELECT player_id, player_name FROM players WHERE player_id = ?",
      [id]
    );

    if (!rows.length) return res.status(404).json({ message: "Player not found" });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

async function createPlayer(req, res, next) {
  try {
    const { player_id, player_name } = req.body;
    if (!player_id || !player_name) {
      return res
        .status(400)
        .json({ message: "player_id and player_name are required" });
    }

    await db.query(
      "INSERT INTO players (player_id, player_name) VALUES (?, ?)",
      [player_id, player_name]
    );

    res.status(201).json({
      message: "Player created",
      player_id: Number(player_id),
      player_name,
    });
  } catch (err) {
    next(err);
  }
}

async function updatePlayer(req, res, next) {
  try {
    const { id } = req.params;
    const { player_name } = req.body;

    if (!player_name) {
      return res.status(400).json({ message: "player_name is required" });
    }

    const [result] = await db.query(
      "UPDATE players SET player_name = ? WHERE player_id = ?",
      [player_name, id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Player not found" });
    }

    res.json({ message: "Player updated" });
  } catch (err) {
    next(err);
  }
}

async function deletePlayer(req, res, next) {
  try {
    const { id } = req.params;
    const [result] = await db.query(
      "DELETE FROM players WHERE player_id = ?",
      [id]
    );

    if (!result.affectedRows) {
      return res.status(404).json({ message: "Player not found" });
    }

    res.json({ message: "Player deleted" });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPlayers,
  getPlayerById,
  createPlayer,
  updatePlayer,
  deletePlayer,
};

const db = require("../config/db");

async function getFinancials(req, res, next) {
  try {
    const { session_id } = req.query;
    let sql = `
      SELECT session_id, session_name, total_buyins, total_payouts, balance
      FROM v_session_financials
    `;
    const params = [];

    if (session_id) {
      sql += " WHERE session_id = ?";
      params.push(session_id);
    }

    sql += " ORDER BY session_id ASC";

    const [rows] = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

module.exports = { getFinancials };

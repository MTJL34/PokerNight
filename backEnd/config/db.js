const mysql = require("mysql2/promise");

const useSsl = String(process.env.DB_SSL || "").toLowerCase() === "true";
const rejectUnauthorized = String(process.env.DB_SSL_REJECT_UNAUTHORIZED || "true").toLowerCase() === "true";

const pool = mysql.createPool({
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME || "poker_night_db",
  port: Number(process.env.DB_PORT || 3306),
  ssl: useSsl ? { rejectUnauthorized } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

module.exports = pool;

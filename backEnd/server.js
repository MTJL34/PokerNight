require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./config/db");
const adminWriteGuard = require("./middleware/adminWriteGuard");

const playersRoutes = require("./routes/playersRoutes");
const sessionsRoutes = require("./routes/sessionsRoutes");
const entriesRoutes = require("./routes/entriesRoutes");
const buyinsRoutes = require("./routes/buyinsRoutes");
const payoutsRoutes = require("./routes/payoutsRoutes");
const financialsRoutes = require("./routes/financialsRoutes");
const liveStacksRoutes = require("./routes/liveStacksRoutes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "frontEnd")));

app.get("/health", async (_req, res, next) => {
  try {
    await db.query("SELECT 1");
    res.json({ status: "ok" });
  } catch (err) {
    next(err);
  }
});

app.use("/api", adminWriteGuard);

app.use("/api/players", playersRoutes);
app.use("/api/sessions", sessionsRoutes);
app.use("/api/entries", entriesRoutes);
app.use("/api/buyins", buyinsRoutes);
app.use("/api/payouts", payoutsRoutes);
app.use("/api/financials", financialsRoutes);
app.use("/api/live-stacks", liveStacksRoutes);

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "..", "frontEnd", "home.html"));
});

app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

app.use((err, _req, res, _next) => {
  if (err && err.code) {
    return res.status(400).json({
      message: "Database error",
      code: err.code,
      detail: err.sqlMessage || err.message,
    });
  }

  return res.status(500).json({ message: "Internal server error" });
});

const PORT = Number(process.env.PORT || 8000);

async function ensureSchemaUpgrades() {
  const hasTable = async (tableName) => {
    const [rows] = await db.query(
      `
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = DATABASE()
          AND table_name = ?
        LIMIT 1
      `,
      [tableName]
    );
    return rows.length > 0;
  };

  const hasColumn = async (tableName, columnName) => {
    const [rows] = await db.query(
      `
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = DATABASE()
          AND table_name = ?
          AND column_name = ?
        LIMIT 1
      `,
      [tableName, columnName]
    );
    return rows.length > 0;
  };

  if (!(await hasColumn("sessions", "is_closed"))) {
    await db.query("ALTER TABLE sessions ADD COLUMN is_closed TINYINT(1) NOT NULL DEFAULT 0");
  }
  if (!(await hasColumn("sessions", "stack_per_10_eur"))) {
    await db.query("ALTER TABLE sessions ADD COLUMN stack_per_10_eur INT NULL");
  }
  if (!(await hasColumn("sessions", "chip_value"))) {
    await db.query("ALTER TABLE sessions ADD COLUMN chip_value DECIMAL(10,4) NULL");
  }
  if (!(await hasColumn("sessions", "chip_value_orange"))) {
    await db.query("ALTER TABLE sessions ADD COLUMN chip_value_orange DECIMAL(10,4) NULL");
  }
  if (!(await hasColumn("sessions", "chip_value_black"))) {
    await db.query("ALTER TABLE sessions ADD COLUMN chip_value_black DECIMAL(10,4) NULL");
  }
  if (!(await hasColumn("sessions", "chip_value_green"))) {
    await db.query("ALTER TABLE sessions ADD COLUMN chip_value_green DECIMAL(10,4) NULL");
  }
  if (!(await hasColumn("sessions", "chip_value_yellow"))) {
    await db.query("ALTER TABLE sessions ADD COLUMN chip_value_yellow DECIMAL(10,4) NULL");
  }
  if (!(await hasColumn("sessions", "chip_value_red"))) {
    await db.query("ALTER TABLE sessions ADD COLUMN chip_value_red DECIMAL(10,4) NULL");
  }
  if (!(await hasColumn("sessions", "chip_value_white"))) {
    await db.query("ALTER TABLE sessions ADD COLUMN chip_value_white DECIMAL(10,4) NULL");
  }
  if (!(await hasColumn("session_entries", "is_eliminated"))) {
    await db.query("ALTER TABLE session_entries ADD COLUMN is_eliminated TINYINT(1) NOT NULL DEFAULT 0");
  }
  if (!(await hasTable("session_live_stacks"))) {
    await db.query(`
      CREATE TABLE session_live_stacks (
        session_id INT NOT NULL,
        player_id INT NOT NULL,
        current_stack DECIMAL(14,4) NOT NULL DEFAULT 0,
        blind_amount DECIMAL(14,4) NULL,
        blinds_remaining_exact DECIMAL(14,6) NULL,
        chip_values_json LONGTEXT NULL,
        chip_counts_json LONGTEXT NULL,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (session_id, player_id),
        CONSTRAINT fk_live_stack_entry
          FOREIGN KEY (session_id, player_id)
          REFERENCES session_entries(session_id, player_id)
          ON DELETE CASCADE
      )
    `);
  }
  if (!(await hasColumn("session_live_stacks", "chip_values_json"))) {
    await db.query("ALTER TABLE session_live_stacks ADD COLUMN chip_values_json LONGTEXT NULL");
  }
  if (!(await hasColumn("session_live_stacks", "chip_counts_json"))) {
    await db.query("ALTER TABLE session_live_stacks ADD COLUMN chip_counts_json LONGTEXT NULL");
  }

  await db.query(`
    UPDATE sessions s
    SET s.is_closed = 1
    WHERE s.is_closed = 0
      AND EXISTS (
        SELECT 1
        FROM session_payouts sp
        WHERE sp.session_id = s.session_id
      )
  `);
}

async function startServer() {
  try {
    await ensureSchemaUpgrades();
    app.listen(PORT, "0.0.0.0", () => {
      // eslint-disable-next-line no-console
      console.log(`API running on http://localhost:${PORT}`);
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to initialize database schema:", err?.message || err);
    process.exit(1);
  }
}

startServer();

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const db = require("./config/db");

const playersRoutes = require("./routes/playersRoutes");
const sessionsRoutes = require("./routes/sessionsRoutes");
const entriesRoutes = require("./routes/entriesRoutes");
const buyinsRoutes = require("./routes/buyinsRoutes");
const payoutsRoutes = require("./routes/payoutsRoutes");
const financialsRoutes = require("./routes/financialsRoutes");

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

app.use("/api/players", playersRoutes);
app.use("/api/sessions", sessionsRoutes);
app.use("/api/entries", entriesRoutes);
app.use("/api/buyins", buyinsRoutes);
app.use("/api/payouts", payoutsRoutes);
app.use("/api/financials", financialsRoutes);

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
app.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`API running on http://localhost:${PORT}`);
});

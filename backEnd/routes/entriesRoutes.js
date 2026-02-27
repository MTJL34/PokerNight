const express = require("express");
const controller = require("../controllers/entriesController");

const router = express.Router();

router.get("/", controller.getEntries);
router.post("/", controller.createEntry);
router.put("/:session_id/:player_id", controller.updateEntry);
router.delete("/:session_id/:player_id", controller.deleteEntry);

module.exports = router;

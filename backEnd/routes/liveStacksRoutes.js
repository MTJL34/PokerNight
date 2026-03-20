const express = require("express");
const controller = require("../controllers/liveStacksController");

const router = express.Router();

router.get("/", controller.getLiveStacks);
router.post("/", controller.upsertLiveStack);
router.delete("/:session_id/:player_id", controller.deleteLiveStack);

module.exports = router;

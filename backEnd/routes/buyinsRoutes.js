const express = require("express");
const controller = require("../controllers/buyinsController");

const router = express.Router();

router.get("/", controller.getBuyins);
router.post("/", controller.addBuyin);
router.delete("/:session_id/:player_id/:buyin_no", controller.deleteBuyin);

module.exports = router;

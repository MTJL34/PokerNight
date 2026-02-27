const express = require("express");
const controller = require("../controllers/payoutsController");

const router = express.Router();

router.get("/", controller.getPayouts);
router.post("/", controller.upsertPayout);
router.delete("/:session_id/:rank_no", controller.deletePayout);

module.exports = router;

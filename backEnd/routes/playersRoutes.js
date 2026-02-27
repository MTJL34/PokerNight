const express = require("express");
const controller = require("../controllers/playersController");

const router = express.Router();

router.get("/", controller.getPlayers);
router.get("/:id", controller.getPlayerById);
router.post("/", controller.createPlayer);
router.put("/:id", controller.updatePlayer);
router.delete("/:id", controller.deletePlayer);

module.exports = router;

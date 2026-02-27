const express = require("express");
const controller = require("../controllers/sessionsController");

const router = express.Router();

router.get("/", controller.getSessions);
router.get("/:id", controller.getSessionById);
router.post("/", controller.createSession);
router.put("/:id", controller.updateSession);
router.delete("/:id", controller.deleteSession);

module.exports = router;

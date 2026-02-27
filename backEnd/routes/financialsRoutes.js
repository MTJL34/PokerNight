const express = require("express");
const controller = require("../controllers/financialsController");

const router = express.Router();

router.get("/", controller.getFinancials);

module.exports = router;

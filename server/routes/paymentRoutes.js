const express = require("express");
const { createOrder, verifyPayment } = require("../controllers/paymentController");
const { requireAuth, requireRole } = require("../middleware/requireAuth");

const router = express.Router();

router.post("/create-order", requireAuth, requireRole("customer"), createOrder);
router.post("/verify", requireAuth, requireRole("customer"), verifyPayment);

module.exports = router;

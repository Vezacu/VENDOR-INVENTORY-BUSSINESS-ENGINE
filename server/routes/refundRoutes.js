const express = require("express");
const { requestRefund, listSellerRefunds, decideRefund } = require("../controllers/refundController");
const { requireAuth, requireRole } = require("../middleware/requireAuth");

const router = express.Router();

router.post("/", requireAuth, requireRole("customer"), requestRefund);
router.get("/", requireAuth, requireRole("seller", "admin"), listSellerRefunds);
router.patch("/:id", requireAuth, requireRole("seller", "admin"), decideRefund);

module.exports = router;

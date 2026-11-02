const express = require("express");
const {
    listCustomerOrders,
    getCustomerOrder,
    listSellerOrders,
    getSellerOrder,
    updateOrderStatus,
    getSellerAnalytics
} = require("../controllers/orderController");
const { requireAuth, requireRole } = require("../middleware/requireAuth");

const router = express.Router();

router.get("/mine", requireAuth, requireRole("customer"), listCustomerOrders);
router.get("/mine/:id", requireAuth, requireRole("customer"), getCustomerOrder);
router.get("/analytics", requireAuth, requireRole("seller", "admin"), getSellerAnalytics);
router.get("/", requireAuth, requireRole("seller", "admin"), listSellerOrders);
router.get("/:id", requireAuth, requireRole("seller", "admin"), getSellerOrder);
router.patch("/:id/status", requireAuth, requireRole("seller", "admin"), updateOrderStatus);

module.exports = router;

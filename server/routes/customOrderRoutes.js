const express = require("express");
const {
    listCustomerCustomOrders,
    markCustomerCustomOrdersRead,
    hideCustomerCustomOrder,
    createCustomerCustomOrder,
    listSellerCustomOrders,
    getCustomOrder,
    updateCustomOrderDecision,
    cancelCustomerCustomOrder,
    createCustomOrderPayment
} = require("../controllers/customOrderController");
const { requireAuth, requireRole } = require("../middleware/requireAuth");

const router = express.Router();

router.get("/mine", requireAuth, requireRole("customer"), listCustomerCustomOrders);
router.patch("/mine/read", requireAuth, requireRole("customer"), markCustomerCustomOrdersRead);
router.post("/", requireAuth, requireRole("customer"), createCustomerCustomOrder);
router.get("/", requireAuth, requireRole("seller", "admin"), listSellerCustomOrders);
router.patch("/:id/decision", requireAuth, requireRole("seller", "admin"), updateCustomOrderDecision);
router.patch("/:id/cancel", requireAuth, requireRole("customer"), cancelCustomerCustomOrder);
router.patch("/:id/remove", requireAuth, requireRole("customer"), hideCustomerCustomOrder);
router.post("/:id/payment-session", requireAuth, requireRole("customer"), createCustomOrderPayment);
router.get("/:id", requireAuth, requireRole("customer", "seller", "admin"), getCustomOrder);

module.exports = router;

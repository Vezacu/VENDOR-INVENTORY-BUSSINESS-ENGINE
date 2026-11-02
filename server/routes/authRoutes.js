const express = require("express");
const {
    registerSeller,
    registerCustomer,
    getCustomerProfile,
    updateCustomerProfile,
    loginSeller
} = require("../controllers/authController");
const { requireAuth, requireRole } = require("../middleware/requireAuth");

const router = express.Router();

router.post("/register", requireAuth, requireRole("admin"), registerSeller);
router.post("/customer/register", registerCustomer);
router.post("/login", loginSeller);
router.get("/profile", requireAuth, requireRole("customer"), getCustomerProfile);
router.patch("/profile", requireAuth, requireRole("customer"), updateCustomerProfile);

module.exports = router;
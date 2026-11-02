const express = require("express");
const { getMyShop, updateMyShop } = require("../controllers/shopController");
const { requireAuth, requireRole } = require("../middleware/requireAuth");

const router = express.Router();

router.get("/me", requireAuth, requireRole("seller"), getMyShop);
router.put("/me", requireAuth, requireRole("seller"), updateMyShop);

module.exports = router;

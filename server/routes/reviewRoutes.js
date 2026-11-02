const express = require("express");
const { createProductReview, listSellerReviews } = require("../controllers/reviewController");
const { requireAuth, requireRole } = require("../middleware/requireAuth");

const router = express.Router();

router.post("/", requireAuth, requireRole("customer"), createProductReview);
router.get("/", requireAuth, requireRole("seller", "admin"), listSellerReviews);

module.exports = router;

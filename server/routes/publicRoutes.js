const express = require("express");
const { getPublicShop, listPublicProducts, getDefaultShop } = require("../controllers/publicController");
const { listProductReviews } = require("../controllers/reviewController");

const router = express.Router();

router.get("/products", listPublicProducts);
router.get("/products/:productId/reviews", listProductReviews);
router.get("/shops", getDefaultShop);
router.get("/shops/:slug", getPublicShop);

module.exports = router;

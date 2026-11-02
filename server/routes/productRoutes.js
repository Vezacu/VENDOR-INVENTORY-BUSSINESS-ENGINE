const express = require("express");
const { createProduct, listProductShops, listProducts, updateProductDetails, updateProductInventory } = require("../controllers/productController");
const { requireAuth, requireRole } = require("../middleware/requireAuth");

const router = express.Router();

router.get("/shops", requireAuth, requireRole("admin"), listProductShops);
router.get("/", requireAuth, requireRole("admin", "seller"), listProducts);
router.post("/", requireAuth, requireRole("admin", "seller"), createProduct);
router.patch("/:id", requireAuth, requireRole("admin", "seller"), updateProductDetails);
router.patch("/:id/inventory", requireAuth, requireRole("admin", "seller"), updateProductInventory);

module.exports = router;

const express = require("express");
const multer = require("multer");
const {
    createUploadSignature,
    uploadProductImage,
    uploadReviewImage,
    uploadCustomOrderImage,
    uploadCustomerAvatar
} = require("../controllers/uploadController");
const { requireAuth, requireRole } = require("../middleware/requireAuth");

const router = express.Router();
const allowedImageTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, callback) => {
        if (!allowedImageTypes.has(file.mimetype)) {
            return callback(new Error("Only JPG, PNG, and WebP images are allowed"));
        }
        return callback(null, true);
    }
});

router.post("/signature", requireAuth, createUploadSignature);

router.post(
    "/products",
    requireAuth,
    requireRole("admin", "seller"),
    (req, res, next) => {
        upload.single("image")(req, res, (error) => {
            if (!error) return next();
            if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({ message: "Images must be 5 MB or smaller" });
            }
            return res.status(400).json({ message: error.message });
        });
    },
    uploadProductImage
);

const uploadSingleImage = (role, controller) => [
    requireAuth,
    requireRole(role),
    (req, res, next) => {
        upload.single("image")(req, res, (error) => {
            if (!error) return next();
            if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({ message: "Images must be 5 MB or smaller" });
            }
            return res.status(400).json({ message: error.message });
        });
    },
    controller
];

router.post("/reviews", ...uploadSingleImage("customer", uploadReviewImage));
router.post("/custom-orders", ...uploadSingleImage("customer", uploadCustomOrderImage));
router.post("/customer-avatar", ...uploadSingleImage("customer", uploadCustomerAvatar));

module.exports = router;

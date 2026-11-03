const express = require("express");
const { releaseExpiredReservations } = require("../controllers/paymentController");
const { requireCronSecret } = require("../middleware/requireCronSecret");

const router = express.Router();

router.get("/cleanup-expired-reservations", requireCronSecret, async (req, res) => {
    try {
        await releaseExpiredReservations();
        return res.json({ message: "Expired reservations cleaned up" });
    } catch (error) {
        console.error("Expired payment reservation cleanup failed:", error.code || "database error", error.message);
        return res.status(500).json({ message: "Expired reservation cleanup failed" });
    }
});

module.exports = router;

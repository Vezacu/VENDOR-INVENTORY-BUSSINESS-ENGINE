const express = require("express");
const cors = require("cors");

const pool = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const uploadRoutes = require("./routes/uploadRoutes");
const productRoutes = require("./routes/productRoutes");
const publicRoutes = require("./routes/publicRoutes");
const shopRoutes = require("./routes/shopRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const orderRoutes = require("./routes/orderRoutes");
const refundRoutes = require("./routes/refundRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const customOrderRoutes = require("./routes/customOrderRoutes");
const { releaseExpiredReservations } = require("./controllers/paymentController");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/uploads", uploadRoutes);
app.use("/api/products", productRoutes);
app.use("/api/public", publicRoutes);
app.use("/api/shops", shopRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/refunds", refundRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/custom-orders", customOrderRoutes);

app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({ message: "API endpoint not found" });
    }
    return next();
});

app.get("/", (req, res) => {
    res.send("VIBE Backend is running!");
});

app.get("/api/test-db", async (req, res) => {
    try {
        const result = await pool.query("SELECT NOW()");

        res.json({
            message: "Database connected!",
            time: result.rows[0].now
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            message: "Database connection failed"
        });
    }
});

const PORT = 5000;

const reservationCleanup = setInterval(() => {
    releaseExpiredReservations().catch((error) => {
        console.error("Expired payment reservation cleanup failed:", error.code || "database error", error.message);
    });
}, 60 * 1000);
reservationCleanup.unref();

app.listen(PORT, () => {
    console.log(`VIBE server running on port ${PORT}`);
});
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

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
const cronRoutes = require("./routes/cronRoutes");

const app = express();
const clientBuildDirectory = path.resolve(__dirname, "../client/dist");
const clientBuildIndex = path.join(clientBuildDirectory, "index.html");

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
app.use("/api/cron", cronRoutes);

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

app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
        return res.status(404).json({ message: "API endpoint not found" });
    }
    return next();
});

if (fs.existsSync(clientBuildIndex)) {
    app.use(express.static(clientBuildDirectory));
    app.get("/{*path}", (req, res, next) => {
        if (!req.accepts("html")) {
            return next();
        }
        return res.sendFile(clientBuildIndex);
    });
} else {
    app.get("/", (req, res) => {
        res.send("VIBE API is running. Build the client to serve the full application.");
    });
}

module.exports = app;

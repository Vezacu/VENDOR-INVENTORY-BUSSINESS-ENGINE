const app = require("./app");
const { releaseExpiredReservations } = require("./controllers/paymentController");

const PORT = Number(process.env.PORT) || 5000;

const reservationCleanup = setInterval(() => {
    releaseExpiredReservations().catch((error) => {
        console.error("Expired payment reservation cleanup failed:", error.code || "database error", error.message);
    });
}, 60 * 1000);
reservationCleanup.unref();

app.listen(PORT, () => {
    console.log(`VIBE server running on port ${PORT}`);
});
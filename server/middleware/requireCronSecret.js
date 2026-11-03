const crypto = require("crypto");

const requireCronSecret = (req, res, next) => {
    const expectedSecret = process.env.CRON_SECRET;
    if (!expectedSecret) {
        return res.status(503).json({ message: "Scheduled cleanup is not configured" });
    }

    const authorization = req.get("authorization") || "";
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    const provided = Buffer.from(match[1]);
    const expected = Buffer.from(expectedSecret);
    if (provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
        return res.status(401).json({ message: "Unauthorized" });
    }

    return next();
};

module.exports = { requireCronSecret };

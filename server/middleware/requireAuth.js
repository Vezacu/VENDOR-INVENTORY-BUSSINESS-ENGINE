const jwt = require("jsonwebtoken");

const requireAuth = (req, res, next) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        console.error("JWT_SECRET is not configured");
        return res.status(500).json({ message: "Authentication is not configured" });
    }

    const authorization = req.get("authorization");
    if (!authorization || !authorization.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Authentication required" });
    }

    try {
        req.user = jwt.verify(authorization.slice(7), secret);
        return next();
    } catch (error) {
        if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
            return res.status(401).json({ message: "Your session is invalid or has expired. Please log in again." });
        }
        return next(error);
    }
};

const requireRole = (...roles) => (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
        return res.status(403).json({ message: "You do not have permission to do that" });
    }
    return next();
};

module.exports = { requireAuth, requireRole };

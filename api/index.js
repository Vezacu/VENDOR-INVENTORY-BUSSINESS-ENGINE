const app = require("../server/app");

const originalPathParam = "__vibe_original_path";

module.exports = (req, res) => {
    const requestUrl = new URL(req.url, "http://localhost");
    const originalPath = requestUrl.searchParams.get(originalPathParam);

    if (!originalPath || originalPath.startsWith("/") || /[?#\u0000-\u001f\u007f]/.test(originalPath)) {
        return res.status(400).json({ message: "Invalid API request path" });
    }

    requestUrl.searchParams.delete(originalPathParam);
    req.url = `/api/${originalPath}${requestUrl.search}`;

    return app(req, res);
};

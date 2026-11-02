const pool = require("../config/db");

const listProductReviews = async (req, res) => {
    const productId = Number(req.params.productId);
    if (!Number.isSafeInteger(productId) || productId < 1) {
        return res.status(400).json({ message: "A valid product is required" });
    }
    try {
        const result = await pool.query(
            `SELECT r.id, r.customer_name, r.rating, r.comment, r.images, r.created_at
             FROM reviews r
             JOIN products p ON p.id = r.product_id
             WHERE r.product_id = $1 AND p.availability = TRUE
             ORDER BY r.created_at DESC`,
            [productId]
        );
        return res.json({ reviews: result.rows });
    } catch (error) {
        console.error("Product reviews lookup failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not load product reviews" });
    }
};

const createProductReview = async (req, res) => {
    const { orderId, productId, rating, comment = "", images = [] } = req.body || {};
    const parsedOrderId = Number(orderId);
    const parsedProductId = Number(productId);
    const parsedRating = Number(rating);
    if (!Number.isSafeInteger(parsedOrderId) || parsedOrderId < 1
        || !Number.isSafeInteger(parsedProductId) || parsedProductId < 1
        || !Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5
        || typeof comment !== "string" || comment.length > 2000
        || !Array.isArray(images) || images.length > 4
        || images.some((image) => typeof image !== "string" || image.length > 2000 || !image.startsWith("https://"))) {
        return res.status(400).json({ message: "A valid order, product, 1–5 star rating, review text, and up to four images are required" });
    }

    try {
        const result = await pool.query(
            `INSERT INTO reviews (
                order_id, product_id, customer_user_id, customer_name,
                rating, comment, images
             )
             SELECT o.id, oi.product_id, u.id, u.name, $4, $5, $6::jsonb
             FROM orders o
             JOIN order_items oi ON oi.order_id = o.id AND oi.product_id = $2
             JOIN users u ON u.id = o.customer_user_id
             JOIN payments p ON p.order_id = o.id AND p.status = 'paid'
             WHERE o.id = $1 AND o.customer_user_id = $3 AND o.status = 'delivered'
             ON CONFLICT (order_id, product_id, customer_user_id) DO NOTHING
             RETURNING id, order_id, product_id, customer_name, rating, comment, images, created_at`,
            [parsedOrderId, parsedProductId, req.user.id, parsedRating, comment.trim(), JSON.stringify(images)]
        );
        if (!result.rowCount) {
            const existing = await pool.query(
                `SELECT r.id, r.rating, r.comment, r.images, r.created_at,
                        o.status AS order_status
                 FROM reviews r
                 JOIN orders o ON o.id = r.order_id
                 WHERE r.order_id = $1 AND r.product_id = $2
                   AND r.customer_user_id = $3`,
                [parsedOrderId, parsedProductId, req.user.id]
            );
            if (existing.rowCount) {
                return res.status(409).json({ message: "You have already reviewed this product", review: existing.rows[0] });
            }
            return res.status(403).json({ message: "Only the customer who placed a paid, delivered order can review its products" });
        }
        return res.status(201).json({ review: result.rows[0] });
    } catch (error) {
        console.error("Product review submission failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not save your review" });
    }
};

const listSellerReviews = async (req, res) => {
    const sellerFilter = req.user.role === "admin" ? "" : "AND s.user_id = $1";
    const values = req.user.role === "admin" ? [] : [req.user.id];
    try {
        const result = await pool.query(
            `SELECT r.id, r.customer_name, r.rating, r.comment, r.images,
                    r.created_at, p.name AS product_name, o.id AS order_id,
                    s.shop_name
             FROM reviews r
             JOIN orders o ON o.id = r.order_id
             JOIN shops s ON s.id = o.shop_id
             LEFT JOIN products p ON p.id = r.product_id
             WHERE TRUE ${sellerFilter}
             ORDER BY r.created_at DESC`,
            values
        );
        return res.json({ reviews: result.rows });
    } catch (error) {
        console.error("Seller reviews lookup failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not load customer reviews" });
    }
};

module.exports = { listProductReviews, createProductReview, listSellerReviews };

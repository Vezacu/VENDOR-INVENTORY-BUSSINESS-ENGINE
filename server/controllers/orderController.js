const pool = require("../config/db");

const orderSelect = `
    SELECT o.id, o.customer_name, o.customer_email,
           o.customer_phone, o.shipping_address, o.shipping_city, o.shipping_postal_code,
           o.status, o.total_amount, o.created_at, o.updated_at,
           s.shop_name,
           pay.status AS payment_status,
           rr.id AS refund_request_id, rr.reason AS refund_reason,
           rr.details AS refund_details, rr.status AS refund_status,
           rr.rejection_reason, rr.provider_status AS refund_provider_status,
           rr.provider_refund_id,
           COALESCE(
               json_agg(
                   json_build_object(
                       'productId', oi.product_id,
                       'name', oi.product_name,
                       'image', COALESCE(oi.product_image, p.image, p.images->>0),
                       'quantity', oi.quantity,
                       'price', oi.price,
                       'reviewId', rv.id,
                       'reviewRating', rv.rating,
                       'reviewComment', rv.comment,
                       'reviewImages', rv.images
                   )
                   ORDER BY oi.id
               ) FILTER (WHERE oi.id IS NOT NULL),
               '[]'::json
           ) AS items
    FROM orders o
    JOIN shops s ON s.id = o.shop_id
    LEFT JOIN payments pay ON pay.order_id = o.id
    LEFT JOIN refund_requests rr ON rr.order_id = o.id
    LEFT JOIN order_items oi ON oi.order_id = o.id
    LEFT JOIN products p ON p.id = oi.product_id
    LEFT JOIN reviews rv ON rv.order_id = o.id
        AND rv.product_id = oi.product_id
        AND rv.customer_user_id = o.customer_user_id
`;

const groupBy = `
    GROUP BY o.id, s.shop_name, pay.status, rr.id
`;

const listCustomerOrders = async (req, res) => {
    try {
        const result = await pool.query(
            `${orderSelect}
             WHERE o.customer_user_id = $1
             ${groupBy}
             ORDER BY o.created_at DESC`,
            [req.user.id]
        );
        return res.json({ orders: result.rows });
    } catch (error) {
        console.error("Customer order list failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not load your orders" });
    }
};

const getCustomerOrder = async (req, res) => {
    const orderId = Number(req.params.id);
    if (!Number.isSafeInteger(orderId) || orderId < 1) {
        return res.status(400).json({ message: "A valid order is required" });
    }
    try {
        const result = await pool.query(
            `${orderSelect}
             WHERE o.id = $1 AND o.customer_user_id = $2
             ${groupBy}`,
            [orderId, req.user.id]
        );
        if (!result.rowCount) {
            return res.status(404).json({ message: "Order could not be found" });
        }
        return res.json({ order: result.rows[0] });
    } catch (error) {
        console.error("Customer order lookup failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not load this order" });
    }
};

const listSellerOrders = async (req, res) => {
    const sellerFilter = req.user.role === "admin" ? "" : "AND s.user_id = $1";
    const values = req.user.role === "admin" ? [] : [req.user.id];
    try {
        const result = await pool.query(
            `${orderSelect}
             WHERE pay.status IN ('paid', 'pending', 'failed', 'expired')
             ${sellerFilter}
             ${groupBy}
             ORDER BY o.created_at DESC`,
            values
        );
        return res.json({ orders: result.rows });
    } catch (error) {
        console.error("Seller order list failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not load shop orders" });
    }
};

const getSellerOrder = async (req, res) => {
    const orderId = Number(req.params.id);
    if (!Number.isSafeInteger(orderId) || orderId < 1) {
        return res.status(400).json({ message: "A valid order is required" });
    }
    try {
        const result = await pool.query(
            `${orderSelect}
             WHERE o.id = $1
               AND pay.status = 'paid'
               AND ($2 = 'admin' OR s.user_id = $3)
             ${groupBy}`,
            [orderId, req.user.role, req.user.id]
        );
        if (!result.rowCount) {
            return res.status(404).json({ message: "Order could not be found for your shop" });
        }
        return res.json({ order: result.rows[0] });
    } catch (error) {
        console.error("Seller order lookup failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not load this order" });
    }
};

const updateOrderStatus = async (req, res) => {
    const orderId = Number(req.params.id);
    const { status } = req.body || {};
    const allowed = new Set(["processing", "shipped", "delivered", "cancelled"]);
    if (!Number.isSafeInteger(orderId) || orderId < 1 || !allowed.has(status)) {
        return res.status(400).json({ message: "Choose a valid order status" });
    }

    try {
        const result = await pool.query(
            `UPDATE orders o
             SET status = $1, updated_at = CURRENT_TIMESTAMP
             FROM shops s, payments p
             WHERE o.id = $2
               AND s.id = o.shop_id
               AND p.order_id = o.id
               AND p.status = 'paid'
               AND ($3 = 'admin' OR s.user_id = $4)
               AND o.status NOT IN ('delivered', 'cancelled')
               AND (
                   o.status = $1
                   OR (o.status = 'processing' AND $1 IN ('shipped', 'cancelled'))
                   OR (o.status = 'shipped' AND $1 IN ('delivered', 'cancelled'))
               )
             RETURNING o.id, o.status, o.updated_at`,
            [status, orderId, req.user.role, req.user.id]
        );
        if (!result.rowCount) {
            return res.status(409).json({ message: "Order could not be updated. Check that it is paid, belongs to your shop, and can move to that status." });
        }
        return res.json({ order: result.rows[0] });
    } catch (error) {
        console.error("Order status update failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not update the order status" });
    }
};

const getSellerAnalytics = async (req, res) => {
    let client;
    try {
        client = await pool.connect();
        const scope = `($1 = 'admin' OR s.user_id = $2)`;
        const values = [req.user.role, req.user.id];
        const [summary, weeklySales, monthlySales, topProducts] = await Promise.all([
            client.query(
                `WITH scoped_orders AS (
                    SELECT o.id, o.customer_email, o.total_amount, o.status, o.created_at,
                           p.status AS payment_status, rr.provider_status,
                           rr.details AS refund_details,
                           rr.updated_at AS refunded_at
                    FROM orders o
                    JOIN shops s ON s.id = o.shop_id
                    JOIN payments p ON p.order_id = o.id
                    LEFT JOIN refund_requests rr ON rr.order_id = o.id
                    WHERE ${scope}
                 ),
                 sales AS (
                    SELECT
                        COALESCE(SUM(
                            CASE WHEN payment_status = 'paid' AND status <> 'cancelled'
                                      AND created_at >= date_trunc('month', CURRENT_TIMESTAMP)
                                 THEN total_amount ELSE 0 END
                        ) - SUM(
                            CASE WHEN payment_status = 'paid' AND status <> 'cancelled'
                                      AND provider_status = 'processed'
                                      AND refunded_at >= date_trunc('month', CURRENT_TIMESTAMP)
                                 THEN total_amount ELSE 0 END
                        ), 0)::numeric(10, 2) AS month_sales,
                        COUNT(id) FILTER (
                            WHERE payment_status = 'paid' AND status IN ('pending', 'processing')
                        )::integer AS orders_to_pack,
                        COUNT(id) FILTER (
                            WHERE payment_status = 'paid' AND status = 'delivered'
                        )::integer AS delivered_orders,
                        COUNT(id) FILTER (
                            WHERE provider_status = 'processed'
                        )::integer AS processed_refunds,
                        COUNT(id) FILTER (
                            WHERE customer_email LIKE 'demo-buyer-%@example.test'
                               OR customer_email IN (
                                    'customer1@example.test',
                                    'customer2@example.test',
                                    'customer3@example.test',
                                    'customer4@example.test'
                               )
                        )::integer AS demo_orders,
                        COUNT(id) FILTER (
                            WHERE provider_status = 'processed'
                              AND refund_details LIKE '[DEMO]%'
                        )::integer AS demo_refunds
                    FROM scoped_orders
                 )
                 SELECT * FROM sales`,
                values
            ),
            client.query(
                `WITH scoped_orders AS (
                    SELECT o.created_at, o.total_amount, o.status,
                           p.status AS payment_status, rr.provider_status,
                           rr.updated_at AS refunded_at
                    FROM orders o
                    JOIN shops s ON s.id = o.shop_id
                    JOIN payments p ON p.order_id = o.id
                    LEFT JOIN refund_requests rr ON rr.order_id = o.id
                    WHERE ${scope}
                 )
                 SELECT periods.bucket::date AS date,
                    COALESCE(SUM(
                        CASE WHEN o.payment_status = 'paid' AND o.status <> 'cancelled'
                                  AND o.created_at >= periods.bucket
                                  AND o.created_at < periods.bucket + INTERVAL '1 day'
                             THEN o.total_amount ELSE 0 END
                    ) - SUM(
                        CASE WHEN o.payment_status = 'paid' AND o.status <> 'cancelled'
                                  AND o.provider_status = 'processed'
                                  AND o.refunded_at >= periods.bucket
                                  AND o.refunded_at < periods.bucket + INTERVAL '1 day'
                             THEN o.total_amount ELSE 0 END
                    ), 0)::numeric(10, 2) AS amount
                 FROM generate_series(
                    CURRENT_DATE - INTERVAL '6 days',
                    CURRENT_DATE,
                    INTERVAL '1 day'
                 ) AS periods(bucket)
                 LEFT JOIN scoped_orders o
                    ON (o.created_at >= periods.bucket
                        AND o.created_at < periods.bucket + INTERVAL '1 day')
                    OR (o.provider_status = 'processed'
                        AND o.refunded_at >= periods.bucket
                        AND o.refunded_at < periods.bucket + INTERVAL '1 day')
                 GROUP BY periods.bucket
                 ORDER BY periods.bucket`,
                values
            ),
            client.query(
                `WITH scoped_orders AS (
                    SELECT o.created_at, o.total_amount, o.status,
                           p.status AS payment_status, rr.provider_status,
                           rr.updated_at AS refunded_at
                    FROM orders o
                    JOIN shops s ON s.id = o.shop_id
                    JOIN payments p ON p.order_id = o.id
                    LEFT JOIN refund_requests rr ON rr.order_id = o.id
                    WHERE ${scope}
                 )
                 SELECT periods.bucket::date AS month,
                    COALESCE(SUM(
                        CASE WHEN o.payment_status = 'paid' AND o.status <> 'cancelled'
                                  AND o.created_at >= periods.bucket
                                  AND o.created_at < periods.bucket + INTERVAL '1 month'
                             THEN o.total_amount ELSE 0 END
                    ) - SUM(
                        CASE WHEN o.payment_status = 'paid' AND o.status <> 'cancelled'
                                  AND o.provider_status = 'processed'
                                  AND o.refunded_at >= periods.bucket
                                  AND o.refunded_at < periods.bucket + INTERVAL '1 month'
                             THEN o.total_amount ELSE 0 END
                    ), 0)::numeric(10, 2) AS amount
                 FROM generate_series(
                    date_trunc('month', CURRENT_DATE) - INTERVAL '5 months',
                    date_trunc('month', CURRENT_DATE),
                    INTERVAL '1 month'
                 ) AS periods(bucket)
                 LEFT JOIN scoped_orders o
                    ON (o.created_at >= periods.bucket
                        AND o.created_at < periods.bucket + INTERVAL '1 month')
                    OR (o.provider_status = 'processed'
                        AND o.refunded_at >= periods.bucket
                        AND o.refunded_at < periods.bucket + INTERVAL '1 month')
                 GROUP BY periods.bucket
                 ORDER BY periods.bucket`,
                values
            ),
            client.query(
                `SELECT oi.product_id, oi.product_name AS name,
                        SUM(oi.quantity)::integer AS units_sold,
                        COALESCE(SUM(oi.quantity * oi.price), 0)::numeric(10, 2) AS sales
                 FROM order_items oi
                 JOIN orders o ON o.id = oi.order_id
                 JOIN shops s ON s.id = o.shop_id
                 JOIN payments p ON p.order_id = o.id
                 LEFT JOIN refund_requests rr ON rr.order_id = o.id
                 WHERE ${scope} AND p.status = 'paid' AND o.status <> 'cancelled'
                   AND oi.product_id IS NOT NULL
                   AND rr.provider_status IS DISTINCT FROM 'processed'
                 GROUP BY oi.product_id, oi.product_name
                 ORDER BY units_sold DESC, sales DESC
                 LIMIT 5`,
                values
            )
        ]);
        return res.json({
            summary: summary.rows[0],
            weeklySales: weeklySales.rows,
            monthlySales: monthlySales.rows,
            topProducts: topProducts.rows
        });
    } catch (error) {
        console.error("Seller analytics lookup failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not load shop analytics" });
    } finally {
        if (client) client.release();
    }
};

module.exports = {
    listCustomerOrders,
    getCustomerOrder,
    listSellerOrders,
    getSellerOrder,
    updateOrderStatus,
    getSellerAnalytics
};

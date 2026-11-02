const crypto = require("crypto");
const Razorpay = require("razorpay");
const pool = require("../config/db");
const { formatMinorUnits, toMinorUnits } = require("../utils/paymentUtils");

const getRazorpay = () => {
    const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } = process.env;
    if (!keyId || !keySecret || !keyId.startsWith("rzp_test_")) {
        const error = new Error("Razorpay Test Mode is not configured");
        error.status = 503;
        throw error;
    }
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

const customerSelect = `
    SELECT co.id, co.shop_id, co.customer_user_id, co.customer_name,
           co.customer_email, co.customer_phone, co.description,
           co.idea_images, co.quoted_price, co.seller_message, co.status,
           co.order_id, co.created_at, co.updated_at, s.shop_name,
           co.seller_message_viewed_at,
           p.status AS payment_status, o.status AS order_status,
           o.shipping_address, o.shipping_city, o.shipping_postal_code
    FROM custom_orders co
    JOIN shops s ON s.id = co.shop_id
    LEFT JOIN orders o ON o.id = co.order_id
    LEFT JOIN payments p ON p.order_id = co.order_id
`;

const listCustomerCustomOrders = async (req, res) => {
    try {
        const result = await pool.query(
            `${customerSelect}
             WHERE co.customer_user_id = $1
               AND co.customer_hidden_at IS NULL
             ORDER BY co.created_at DESC`,
            [req.user.id]
        );
        return res.json({ requests: result.rows });
    } catch (error) {
        console.error("Customer custom order list failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not load your custom requests" });
    }
};

const markCustomerCustomOrdersRead = async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE custom_orders
             SET seller_message_viewed_at = CURRENT_TIMESTAMP
             WHERE customer_user_id = $1
               AND customer_hidden_at IS NULL
               AND status IN ('accepted', 'declined')
               AND seller_message_viewed_at IS NULL
             RETURNING id`,
            [req.user.id]
        );
        return res.json({ readCount: result.rowCount });
    } catch (error) {
        console.error("Custom order replies could not be marked read:", error.code || "database error");
        return res.status(500).json({ message: "Could not update your message status" });
    }
};

const hideCustomerCustomOrder = async (req, res) => {
    const requestId = Number(req.params.id);
    if (!Number.isSafeInteger(requestId) || requestId < 1) {
        return res.status(400).json({ message: "A valid custom request is required" });
    }
    try {
        const result = await pool.query(
            `UPDATE custom_orders co
             SET customer_hidden_at = CURRENT_TIMESTAMP
             WHERE co.id = $1
               AND co.customer_user_id = $2
               AND co.customer_hidden_at IS NULL
               AND (
                   co.status = 'declined'
                   OR EXISTS (
                       SELECT 1 FROM orders o
                       WHERE o.id = co.order_id AND o.status = 'delivered'
                   )
               )
             RETURNING co.id`,
            [requestId, req.user.id]
        );
        if (!result.rowCount) {
            return res.status(409).json({
                message: "Only declined requests or delivered custom orders can be removed"
            });
        }
        return res.json({ hiddenId: result.rows[0].id });
    } catch (error) {
        console.error("Customer custom order removal failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not remove this message" });
    }
};

const createCustomerCustomOrder = async (req, res) => {
    const { shopId, description, phone = "", images = [] } = req.body || {};
    const parsedShopId = Number(shopId);
    if (!Number.isSafeInteger(parsedShopId) || parsedShopId < 1
        || typeof description !== "string" || !description.trim() || description.length > 5000
        || typeof phone !== "string" || phone.length > 20
        || !Array.isArray(images) || images.length > 3
        || images.some((image) => typeof image !== "string" || image.length > 2000 || !image.startsWith("https://"))) {
        return res.status(400).json({ message: "Describe your idea and add up to three images" });
    }
    try {
        const result = await pool.query(
            `INSERT INTO custom_orders (
                shop_id, customer_user_id, customer_name, customer_email,
                customer_phone, description, idea_images
             )
             SELECT s.id, u.id, u.name, u.email, $3, $4, $5::jsonb
             FROM shops s
             JOIN users u ON u.id = $2 AND u.role = 'customer'
             WHERE s.id = $1
             RETURNING id, shop_id, customer_name, customer_email,
                       description, idea_images, status, created_at`,
            [parsedShopId, req.user.id, phone.trim(), description.trim(), JSON.stringify(images)]
        );
        if (!result.rowCount) {
            return res.status(404).json({ message: "This maker’s shop could not be found" });
        }
        return res.status(201).json({ request: result.rows[0] });
    } catch (error) {
        console.error("Custom order submission failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not send your custom request" });
    }
};

const listSellerCustomOrders = async (req, res) => {
    const sellerFilter = req.user.role === "admin" ? "" : "AND s.user_id = $1";
    const values = req.user.role === "admin" ? [] : [req.user.id];
    try {
        const result = await pool.query(
            `SELECT co.id, co.customer_name, co.customer_email, co.customer_phone,
                    co.description, co.idea_images, co.quoted_price, co.seller_message,
                    co.status, co.order_id, co.created_at, co.updated_at,
                    s.shop_name, p.status AS payment_status
             FROM custom_orders co
             JOIN shops s ON s.id = co.shop_id
             LEFT JOIN payments p ON p.order_id = co.order_id
             WHERE TRUE ${sellerFilter}
             ORDER BY co.created_at DESC`,
            values
        );
        return res.json({ requests: result.rows });
    } catch (error) {
        console.error("Seller custom order list failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not load custom requests" });
    }
};

const getCustomOrder = async (req, res) => {
    const requestId = Number(req.params.id);
    if (!Number.isSafeInteger(requestId) || requestId < 1) {
        return res.status(400).json({ message: "A valid custom request is required" });
    }
    const isCustomer = req.user.role === "customer";
    const accessFilter = isCustomer
        ? "AND co.customer_user_id = $2"
        : "AND ($2 = 'admin' OR s.user_id = $3)";
    const values = isCustomer
        ? [requestId, req.user.id]
        : [requestId, req.user.role, req.user.id];
    try {
        const result = await pool.query(
            `${customerSelect}
             WHERE co.id = $1 ${accessFilter}`,
            values
        );
        if (!result.rowCount) {
            return res.status(404).json({ message: "Custom request could not be found" });
        }
        return res.json({ request: result.rows[0] });
    } catch (error) {
        console.error("Custom order lookup failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not load this custom request" });
    }
};

const updateCustomOrderDecision = async (req, res) => {
    const requestId = Number(req.params.id);
    const { decision, quotedPrice, message = "" } = req.body || {};
    const price = Number(quotedPrice);
    if (!Number.isSafeInteger(requestId) || requestId < 1
        || !["accepted", "declined"].includes(decision)
        || typeof message !== "string" || message.length > 2000
        || (decision === "accepted" && (!/^\d{1,8}(?:\.\d{1,2})?$/.test(String(quotedPrice))
            || !Number.isFinite(price) || price <= 0 || price > 99999999))) {
        return res.status(400).json({ message: "Accept with a valid price or decline the request with an optional reply" });
    }
    try {
        const result = await pool.query(
            `UPDATE custom_orders co
            SET status = $1::varchar,
                quoted_price = CASE WHEN $1::varchar = 'accepted' THEN $2::numeric ELSE NULL END,
                seller_message = NULLIF($3::text, ''),
                seller_message_viewed_at = NULL,
                 updated_at = CURRENT_TIMESTAMP
             FROM shops s
            WHERE co.id = $4::integer AND s.id = co.shop_id
              AND ($5::text = 'admin' OR s.user_id = $6::integer)
               AND co.status IN ('pending', 'in_progress')
               AND co.order_id IS NULL
             RETURNING co.id, co.status, co.quoted_price, co.seller_message, co.updated_at`,
            [decision, decision === "accepted" ? price : null, message.trim(), requestId, req.user.role, req.user.id]
        );
        if (!result.rowCount) {
            return res.status(409).json({ message: "This request is not available to update" });
        }
        return res.json({ request: result.rows[0] });
    } catch (error) {
        console.error("Custom order response failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not update the custom request" });
    }
};

const cancelCustomerCustomOrder = async (req, res) => {
    const requestId = Number(req.params.id);
    if (!Number.isSafeInteger(requestId) || requestId < 1) {
        return res.status(400).json({ message: "A valid custom request is required" });
    }
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            `SELECT co.id, co.order_id, p.status AS payment_status
             FROM custom_orders co
             LEFT JOIN payments p ON p.order_id = co.order_id
             WHERE co.id = $1 AND co.customer_user_id = $2
               AND co.status = 'accepted'
             FOR UPDATE OF co`,
            [requestId, req.user.id]
        );
        if (!result.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "An accepted custom request on your account could not be found" });
        }
        const request = result.rows[0];
        let paymentStatus = request.payment_status;
        if (request.order_id) {
            const payment = await client.query(
                "SELECT status FROM payments WHERE order_id = $1 FOR UPDATE",
                [request.order_id]
            );
            paymentStatus = payment.rows[0]?.status || null;
        }
        if (paymentStatus === "paid") {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "This custom order has already been paid. Request a refund from its order page instead." });
        }
        if (request.order_id) {
            await client.query(
                `UPDATE payments SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
                 WHERE order_id = $1 AND status = 'pending'`,
                [request.order_id]
            );
            await client.query(
                `UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND status = 'pending'`,
                [request.order_id]
            );
        }
        const update = await client.query(
            `UPDATE custom_orders
             SET status = 'declined', seller_message = 'The customer cancelled this accepted request.',
                 seller_message_viewed_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING id, status, seller_message`,
            [requestId]
        );
        await client.query("COMMIT");
        return res.json({ request: update.rows[0] });
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Custom order cancellation rollback failed:", rollbackError.code || "database error");
        }
        console.error("Custom order cancellation failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not cancel this custom request" });
    } finally {
        client.release();
    }
};

const createCustomOrderPayment = async (req, res) => {
    const requestId = Number(req.params.id);
    const { phone = "", address, city, pin } = req.body || {};
    if (!Number.isSafeInteger(requestId) || requestId < 1
        || ![phone, address, city, pin].every((value) => typeof value === "string")
        || phone.length > 20 || !address.trim() || !city.trim() || !pin.trim()
        || address.length > 1000 || city.length > 100 || pin.length > 20) {
        return res.status(400).json({ message: "Complete your delivery address before payment" });
    }
    let razorpay;
    try {
        razorpay = getRazorpay();
    } catch (error) {
        return res.status(error.status || 503).json({ message: error.message });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1, $2)", [req.user.id, requestId]);
        const result = await client.query(
            `SELECT co.id, co.shop_id, co.customer_name, co.customer_email,
                    co.customer_phone, co.description, co.idea_images,
                    co.quoted_price, co.status, co.order_id,
                    u.shipping_address, u.shipping_city, u.shipping_postal_code,
                    p.status AS payment_status, p.amount_minor, p.currency,
                    p.razorpay_order_id, p.expires_at, o.total_amount, o.created_at
             FROM custom_orders co
             JOIN users u ON u.id = co.customer_user_id
             LEFT JOIN orders o ON o.id = co.order_id
             LEFT JOIN payments p ON p.order_id = co.order_id
             WHERE co.id = $1 AND co.customer_user_id = $2
             FOR UPDATE OF co`,
            [requestId, req.user.id]
        );
        if (!result.rowCount || result.rows[0].status !== "accepted" || !result.rows[0].quoted_price) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "An accepted custom request with a seller quote could not be found" });
        }
        const custom = result.rows[0];
        if (custom.payment_status === "paid") {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "This custom order has already been paid" });
        }
        if (custom.payment_status === "pending" && new Date(custom.expires_at) > new Date()) {
            await client.query("COMMIT");
            return res.json({
                orderId: custom.order_id, razorpayOrderId: custom.razorpay_order_id,
                amount: Number(custom.amount_minor), currency: custom.currency,
                keyId: process.env.RAZORPAY_KEY_ID, subtotal: Number(custom.amount_minor),
                shipping: 0, total: Number(custom.total_amount),
                expiresAt: custom.expires_at
            });
        }
        if (custom.order_id) {
            await client.query(
                `UPDATE payments SET status = 'expired', updated_at = CURRENT_TIMESTAMP
                 WHERE order_id = $1 AND status = 'pending'`,
                [custom.order_id]
            );
            await client.query(
                `UPDATE orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
                 WHERE id = $1 AND status = 'pending'`,
                [custom.order_id]
            );
        }
        const amountMinor = toMinorUnits(custom.quoted_price);
        if (amountMinor < 1) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "The seller’s quoted price is invalid" });
        }
        const fingerprint = crypto.createHash("sha256").update(JSON.stringify({
            customOrderId: custom.id, amountMinor,
            address: address.trim(), city: city.trim(), pin: pin.trim(), phone: phone.trim()
        })).digest("hex");
        const orderResult = await client.query(
            `INSERT INTO orders (
                shop_id, customer_user_id, customer_name, customer_email, customer_phone,
                shipping_address, shipping_city, shipping_postal_code, total_amount
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, created_at`,
            [custom.shop_id, req.user.id, custom.customer_name, custom.customer_email,
                phone.trim() || custom.customer_phone, address.trim(), city.trim(), pin.trim(),
                formatMinorUnits(amountMinor)]
        );
        const orderId = orderResult.rows[0].id;
        const ideaImage = Array.isArray(custom.idea_images) ? custom.idea_images[0] : null;
        await client.query(
            `INSERT INTO order_items (order_id, product_id, product_name, product_image, quantity, price)
             VALUES ($1, NULL, $2, $3, 1, $4)`,
            [orderId, `Custom request #${custom.id}`, ideaImage || null, formatMinorUnits(amountMinor)]
        );
        const idempotencyKey = `custom_order_${custom.id}_${orderId}_payment`;
        const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
        await client.query(
            `INSERT INTO payments (
                order_id, shop_id, customer_user_id, amount_minor, currency,
                idempotency_key, request_fingerprint, expires_at
             )
             VALUES ($1, $2, $3, $4, 'INR', $5, $6, $7)`,
            [orderId, custom.shop_id, req.user.id, amountMinor, idempotencyKey, fingerprint, expiresAt]
        );
        const razorpayOrder = await razorpay.orders.create({
            amount: amountMinor,
            currency: "INR",
            receipt: `vibe-custom-order-${orderId}`,
            notes: { vibe_order_id: String(orderId), vibe_custom_order_id: String(custom.id) }
        });
        await client.query("UPDATE payments SET razorpay_order_id = $1 WHERE order_id = $2", [razorpayOrder.id, orderId]);
        await client.query("UPDATE custom_orders SET order_id = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2", [orderId, custom.id]);
        await client.query("UPDATE users SET phone = $1, shipping_address = $2, shipping_city = $3, shipping_postal_code = $4 WHERE id = $5",
            [phone.trim() || custom.customer_phone, address.trim(), city.trim(), pin.trim(), req.user.id]);
        await client.query("COMMIT");
        return res.status(201).json({
            orderId, razorpayOrderId: razorpayOrder.id, amount: amountMinor,
            currency: "INR", keyId: process.env.RAZORPAY_KEY_ID,
            subtotal: amountMinor, shipping: 0, total: Number(custom.quoted_price), expiresAt
        });
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Custom payment rollback failed:", rollbackError.code || "database error");
        }
        console.error(
            "Custom order payment preparation failed:",
            error.code || error.statusCode || "provider or database error",
            error.message
        );
        return res.status(500).json({ message: "Could not prepare secure payment for this custom order" });
    } finally {
        client.release();
    }
};

module.exports = {
    listCustomerCustomOrders, markCustomerCustomOrdersRead, hideCustomerCustomOrder,
    createCustomerCustomOrder,
    listSellerCustomOrders, getCustomOrder, updateCustomOrderDecision,
    cancelCustomerCustomOrder, createCustomOrderPayment
};

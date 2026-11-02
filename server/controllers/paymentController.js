const Razorpay = require("razorpay");
const crypto = require("crypto");
const pool = require("../config/db");
const { formatMinorUnits, toMinorUnits, verifyPaymentSignature } = require("../utils/paymentUtils");

const CHECKOUT_TTL_SECONDS = 15 * 60;
const MAX_TOTAL_MINOR = 999999999999;

const getRazorpay = () => {
    const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } = process.env;
    if (!keyId || !keySecret || !keyId.startsWith("rzp_test_")) {
        const error = new Error("Razorpay Test Mode is not configured");
        error.status = 503;
        throw error;
    }
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

const releaseExpiredReservations = async (db = pool) => {
    await db.query(
        `WITH expired AS (
             UPDATE payments
             SET status = 'expired', updated_at = CURRENT_TIMESTAMP
             WHERE status = 'pending' AND expires_at <= CURRENT_TIMESTAMP
             RETURNING order_id
         ), cancelled AS (
             UPDATE orders o
             SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
             FROM expired e
             WHERE o.id = e.order_id
             RETURNING o.id
         ), released AS (
             SELECT oi.product_id, SUM(oi.quantity)::integer AS quantity
             FROM order_items oi
             JOIN expired e ON e.order_id = oi.order_id
             WHERE oi.product_id IS NOT NULL
             GROUP BY oi.product_id
         )
         UPDATE products p
         SET stock = p.stock + released.quantity
         FROM released
         WHERE released.product_id = p.id`
    );
};

const createOrder = async (req, res) => {
    let razorpay;
    try {
        razorpay = getRazorpay();
    } catch (error) {
        return res.status(error.status || 503).json({ message: error.message });
    }

    const idempotencyKey = req.get("Idempotency-Key");
    const { items, name, phone = "", address, city, pin } = req.body || {};
    if (typeof idempotencyKey !== "string" || !/^[A-Za-z0-9_-]{16,100}$/.test(idempotencyKey)) {
        return res.status(400).json({ message: "A valid checkout request key is required" });
    }
    if (!Array.isArray(items) || items.length < 1 || items.length > 50
        || items.some((item) => !item || typeof item !== "object"
            || !/^\d+$/.test(String(item.productId))
            || !Number.isSafeInteger(Number(item.productId))
            || Number(item.productId) < 1
            || !Number.isInteger(item.quantity)
            || item.quantity < 1
            || item.quantity > 50)
        || new Set(items.map((item) => Number(item.productId))).size !== items.length) {
        return res.status(400).json({ message: "Choose valid products and quantities before checkout" });
    }
    if (![name, phone, address, city, pin].every((value) => typeof value === "string")
        || !name.trim() || !address.trim() || !city.trim() || !pin.trim()
        || name.length > 100 || phone.length > 20 || address.length > 1000
        || city.length > 100 || pin.length > 20) {
        return res.status(400).json({ message: "Your name and complete delivery details are required" });
    }
    const requestFingerprint = crypto.createHash("sha256").update(JSON.stringify({
        items: items
            .map((item) => ({ productId: Number(item.productId), quantity: item.quantity }))
            .sort((a, b) => a.productId - b.productId),
        name: name.trim(),
        phone: phone.trim(),
        address: address.trim(),
        city: city.trim(),
        pin: pin.trim()
    })).digest("hex");

    let client;
    try {
        client = await pool.connect();
        await client.query("BEGIN");
        await client.query("SELECT pg_advisory_xact_lock($1, hashtext($2))", [req.user.id, idempotencyKey]);
        await releaseExpiredReservations(client);

        const existing = await client.query(
            `SELECT p.order_id, p.amount_minor, p.currency, p.razorpay_order_id, p.status,
                    p.request_fingerprint,
                    p.expires_at, o.total_amount, o.created_at,
                    COALESCE((
                        SELECT SUM(oi.price * oi.quantity)
                        FROM order_items oi
                        WHERE oi.order_id = o.id
                    ), 0) AS subtotal
             FROM payments p
             JOIN orders o ON o.id = p.order_id
             WHERE p.customer_user_id = $1 AND p.idempotency_key = $2
               AND (p.status = 'paid'
                    OR (p.status = 'pending' AND p.expires_at > CURRENT_TIMESTAMP))`,
            [req.user.id, idempotencyKey]
        );
        if (existing.rowCount) {
            if (existing.rows[0].request_fingerprint !== requestFingerprint) {
                await client.query("ROLLBACK");
                return res.status(409).json({ message: "This checkout key was already used for different order details" });
            }
            await client.query("COMMIT");
            const payment = existing.rows[0];
            return res.status(200).json({
                orderId: payment.order_id,
                razorpayOrderId: payment.razorpay_order_id,
                amount: Number(payment.amount_minor),
                currency: payment.currency,
                ...(payment.status === "pending" && { keyId: process.env.RAZORPAY_KEY_ID }),
                subtotal: toMinorUnits(payment.subtotal),
                shipping: Number(payment.amount_minor) - toMinorUnits(payment.subtotal),
                total: Number(payment.total_amount),
                status: payment.status,
                createdAt: payment.created_at,
                expiresAt: payment.expires_at
            });
        }

        const userResult = await client.query(
            `SELECT id, email FROM users WHERE id = $1 AND role = 'customer' FOR UPDATE`,
            [req.user.id]
        );
        if (!userResult.rowCount) {
            await client.query("ROLLBACK");
            return res.status(403).json({ message: "A customer account is required to pay" });
        }

        const productIds = items.map((item) => Number(item.productId)).sort((a, b) => a - b);
        const productResult = await client.query(
            `SELECT p.id, p.shop_id, p.name, p.price, p.stock, p.availability
             FROM products p
             WHERE p.id = ANY($1::integer[])
             ORDER BY p.id
             FOR UPDATE`,
            [productIds]
        );
        if (productResult.rowCount !== items.length) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "One or more products are no longer available" });
        }

        const quantities = new Map(items.map((item) => [Number(item.productId), item.quantity]));
        const products = productResult.rows.map((product) => ({
            ...product,
            quantity: quantities.get(product.id),
            amountMinor: toMinorUnits(product.price)
        }));
        const shopId = products[0].shop_id;
        if (products.some((product) => product.shop_id !== shopId
            || !product.availability
            || product.stock < product.quantity)) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "A product is hidden or no longer has enough stock" });
        }

        const subtotalMinor = products.reduce((total, product) => total + product.amountMinor * product.quantity, 0);
        const shippingMinor = subtotalMinor >= 99900 ? 0 : 6000;
        const totalMinor = subtotalMinor + shippingMinor;
        if (!Number.isSafeInteger(totalMinor) || totalMinor < 1 || totalMinor > MAX_TOTAL_MINOR) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "The order total is outside the supported payment range" });
        }

        for (const product of products) {
            const reserved = await client.query(
                `UPDATE products
                 SET stock = stock - $1
                 WHERE id = $2 AND availability = TRUE AND stock >= $1`,
                [product.quantity, product.id]
            );
            if (!reserved.rowCount) {
                await client.query("ROLLBACK");
                return res.status(409).json({ message: `${product.name} no longer has enough stock` });
            }
        }

        const orderResult = await client.query(
            `INSERT INTO orders (
                shop_id, customer_user_id, customer_name, customer_email, customer_phone,
                shipping_address, shipping_city, shipping_postal_code, total_amount
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING id, created_at`,
            [
                shopId, req.user.id, name.trim(), userResult.rows[0].email, phone.trim(),
                address.trim(), city.trim(), pin.trim(), formatMinorUnits(totalMinor)
            ]
        );
        const orderId = orderResult.rows[0].id;
        for (const product of products) {
            await client.query(
                `INSERT INTO order_items (order_id, product_id, product_name, product_image, quantity, price)
                 VALUES ($1, $2, $3, $4, $5, $6)`,
                [orderId, product.id, product.name, product.image, product.quantity, formatMinorUnits(product.amountMinor)]
            );
        }
        const expiresAt = new Date(Date.now() + CHECKOUT_TTL_SECONDS * 1000);
        await client.query(
            `INSERT INTO payments (
                order_id, shop_id, customer_user_id, amount_minor, currency,
                idempotency_key, request_fingerprint, expires_at
             )
             VALUES ($1, $2, $3, $4, 'INR', $5, $6, $7)`,
            [orderId, shopId, req.user.id, totalMinor, idempotencyKey, requestFingerprint, expiresAt]
        );

        const razorpayOrder = await razorpay.orders.create({
            amount: totalMinor,
            currency: "INR",
            receipt: `vibe-${orderId}`,
            notes: { vibe_order_id: String(orderId), shop_id: String(shopId) }
        });
        await client.query(
            "UPDATE payments SET razorpay_order_id = $1 WHERE order_id = $2",
            [razorpayOrder.id, orderId]
        );
        await client.query("COMMIT");

        return res.status(201).json({
            orderId,
            razorpayOrderId: razorpayOrder.id,
            amount: totalMinor,
            currency: "INR",
            keyId: process.env.RAZORPAY_KEY_ID,
            subtotal: subtotalMinor,
            shipping: shippingMinor,
            total: totalMinor,
            expiresAt
        });
    } catch (error) {
        if (client) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Razorpay order rollback failed:", rollbackError.code || "database error");
            }
        }
        if (error.code === "23505") {
            return res.status(409).json({ message: "This checkout request has already been used. Please reload and try again." });
        }
        console.error("Razorpay order creation failed:", {
            code: error.code,
            statusCode: error.statusCode,
            message: error.message,
            providerDescription: error.error?.description
        });
        return res.status(500).json({ message: "Could not prepare secure checkout. Please try again." });
    } finally {
        client?.release();
    }
};

const verifyPayment = async (req, res) => {
    const { orderId, razorpay_order_id: razorpayOrderId, razorpay_payment_id: razorpayPaymentId, razorpay_signature: signature } = req.body || {};
    if (!/^\d+$/.test(String(orderId)) || !Number.isSafeInteger(Number(orderId)) || Number(orderId) < 1
        || typeof razorpayOrderId !== "string" || !razorpayOrderId.startsWith("order_")
        || typeof razorpayPaymentId !== "string" || !razorpayPaymentId.startsWith("pay_")
        || typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) {
        return res.status(400).json({ message: "Payment verification details are incomplete" });
    }

    let razorpay;
    try {
        razorpay = getRazorpay();
    } catch (error) {
        return res.status(error.status || 503).json({ message: error.message });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, signature, secret)) {
        return res.status(400).json({ message: "The payment signature could not be verified" });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query("BEGIN");
        const paymentResult = await client.query(
            `SELECT p.order_id, p.shop_id, p.amount_minor, p.currency, p.status,
                    p.razorpay_order_id, p.razorpay_payment_id, p.expires_at,
                    o.total_amount, o.status AS order_status
             FROM payments p
             JOIN orders o ON o.id = p.order_id
             WHERE p.order_id = $1 AND p.customer_user_id = $2
             FOR UPDATE OF p, o`,
            [Number(orderId), req.user.id]
        );
        if (!paymentResult.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "The order for this payment could not be found" });
        }
        const payment = paymentResult.rows[0];
        if (payment.razorpay_order_id !== razorpayOrderId) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "The payment does not match this order" });
        }
        if (payment.status === "paid") {
            if (payment.razorpay_payment_id !== razorpayPaymentId) {
                await client.query("ROLLBACK");
                return res.status(409).json({ message: "A different payment has already completed this order" });
            }
            await client.query("COMMIT");
            return res.json({
                order: {
                    id: payment.order_id,
                    total: Number(payment.total_amount),
                    status: payment.order_status
                }
            });
        }
        if (payment.status !== "pending" || new Date(payment.expires_at) <= new Date()) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "This checkout session has expired. Please start checkout again." });
        }

        const providerPayment = await razorpay.payments.fetch(razorpayPaymentId);
        if (providerPayment.order_id !== razorpayOrderId
            || Number(providerPayment.amount) !== Number(payment.amount_minor)
            || providerPayment.currency !== payment.currency) {
            await client.query("ROLLBACK");
            return res.status(400).json({ message: "The payment amount or currency does not match this order" });
        }
        if (providerPayment.status !== "captured") {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Payment is not captured yet. Please wait or try again." });
        }

        const duplicatePayment = await client.query(
            "SELECT order_id FROM payments WHERE razorpay_payment_id = $1 AND order_id <> $2",
            [razorpayPaymentId, Number(orderId)]
        );
        if (duplicatePayment.rowCount) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "This payment has already been used for another order" });
        }
        const paymentUpdate = await client.query(
            `UPDATE payments
             SET status = 'paid', razorpay_payment_id = $1, updated_at = CURRENT_TIMESTAMP
             WHERE order_id = $2 AND status = 'pending'`,
            [razorpayPaymentId, Number(orderId)]
        );
        if (!paymentUpdate.rowCount) {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "This payment has already been processed" });
        }
        const orderUpdate = await client.query(
            `UPDATE orders SET status = 'processing', updated_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND customer_user_id = $2
             RETURNING id, total_amount, status, created_at`,
            [Number(orderId), req.user.id]
        );
        if (!orderUpdate.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "The order for this payment could not be found" });
        }
        await client.query("COMMIT");

        const order = orderUpdate.rows[0];
        return res.json({
            order: {
                id: order.id,
                total: Number(order.total_amount),
                status: order.status,
                createdAt: order.created_at
            }
        });
    } catch (error) {
        if (client) {
            try {
                await client.query("ROLLBACK");
            } catch (rollbackError) {
                console.error("Razorpay verification rollback failed:", rollbackError.code || "database error");
            }
        }
        console.error("Razorpay payment verification failed:", error.code || error.status || "provider error", error.message);
        if (error.code === "23505") {
            return res.status(409).json({ message: "This payment has already been used for another order" });
        }
        return res.status(500).json({ message: "Could not verify the payment. Please try again." });
    } finally {
        client?.release();
    }
};

module.exports = { createOrder, verifyPayment, releaseExpiredReservations };

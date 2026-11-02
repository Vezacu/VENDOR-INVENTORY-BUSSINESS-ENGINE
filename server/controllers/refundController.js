const Razorpay = require("razorpay");
const pool = require("../config/db");

const createRazorpay = () => {
    const { RAZORPAY_KEY_ID: keyId, RAZORPAY_KEY_SECRET: keySecret } = process.env;
    if (!keyId || !keySecret || !keyId.startsWith("rzp_test_")) {
        const error = new Error("Razorpay Test Mode is not configured");
        error.status = 503;
        throw error;
    }
    return new Razorpay({ key_id: keyId, key_secret: keySecret });
};

const requestRefund = async (req, res) => {
    const orderId = Number(req.body?.orderId);
    const { reason, details = "" } = req.body || {};
    const reasons = new Set(["damaged", "wrong_item", "not_received", "other"]);
    if (!Number.isSafeInteger(orderId) || orderId < 1
        || !reasons.has(reason)
        || typeof details !== "string" || details.length > 1000) {
        return res.status(400).json({ message: "Choose a refund reason and provide details of at most 1,000 characters" });
    }

    let razorpay;
    try {
        razorpay = createRazorpay();
    } catch (error) {
        return res.status(error.status || 503).json({ message: error.message });
    }

    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await client.query(
            `SELECT o.id, o.shop_id, o.status AS order_status,
                    p.id AS payment_id, p.razorpay_payment_id
             FROM orders o
             JOIN payments p ON p.order_id = o.id
             WHERE o.id = $1 AND o.customer_user_id = $2
               AND p.status = 'paid' AND p.provider = 'razorpay'
             FOR UPDATE OF o, p`,
            [orderId, req.user.id]
        );
        if (!result.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "A paid order on your account could not be found" });
        }

        const order = result.rows[0];
        if (order.order_status === "delivered") {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "Refund requests are unavailable after an order is delivered" });
        }
        const providerPayment = await razorpay.payments.fetch(order.razorpay_payment_id);
        if (providerPayment.status !== "captured") {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "This payment is not captured and cannot be refunded yet" });
        }
        const refundResult = await client.query(
            `INSERT INTO refund_requests (
                order_id, payment_id, customer_user_id, shop_id, reason, details
             )
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (order_id) DO NOTHING
             RETURNING id, order_id, reason, details, status, provider_status, requested_at`,
            [order.id, order.payment_id, req.user.id, order.shop_id, reason, details.trim()]
        );
        if (!refundResult.rowCount) {
            const existing = await client.query(
                `SELECT id, order_id, reason, details, status, provider_status,
                        rejection_reason, requested_at
                 FROM refund_requests WHERE order_id = $1`,
                [order.id]
            );
            await client.query("COMMIT");
            return res.status(200).json({ refund: existing.rows[0], alreadyRequested: true });
        }
        await client.query("COMMIT");
        return res.status(201).json({ refund: refundResult.rows[0] });
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Refund request rollback failed:", rollbackError.code || "database error");
        }
        console.error("Customer refund request failed:", error.code || error.status || "provider or database error");
        return res.status(500).json({ message: "Could not submit your refund request" });
    } finally {
        client.release();
    }
};

const syncProviderRefundStatus = async (refund) => {
    if (!refund.provider_refund_id || !refund.razorpay_payment_id
        || !["pending", "processing"].includes(refund.provider_status)) {
        return refund;
    }
    try {
        const razorpay = createRazorpay();
        const providerRefund = await razorpay.refunds.fetch(refund.provider_refund_id, {
            payment_id: refund.razorpay_payment_id
        });
        const status = ["pending", "processed", "failed"].includes(providerRefund.status)
            ? providerRefund.status
            : refund.provider_status;
        const result = await pool.query(
            `UPDATE refund_requests
             SET provider_status = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
             RETURNING provider_status`,
            [status, refund.id]
        );
        return { ...refund, provider_status: result.rows[0].provider_status };
    } catch (error) {
        console.error("Razorpay refund status refresh failed:", error.statusCode || error.status || "provider error");
        return refund;
    }
};

const listSellerRefunds = async (req, res) => {
    const sellerFilter = req.user.role === "admin" ? "" : "AND s.user_id = $1";
    const values = req.user.role === "admin" ? [] : [req.user.id];
    try {
        const result = await pool.query(
            `SELECT rr.id, rr.order_id, rr.reason, rr.details, rr.status,
                    rr.rejection_reason, rr.provider_refund_id, rr.provider_status,
                    rr.provider_error, rr.requested_at, rr.updated_at,
                    o.customer_name, o.customer_email, o.total_amount,
                    o.status AS order_status, s.shop_name,
                    p.razorpay_payment_id,
                    COALESCE(
                        json_agg(
                            json_build_object(
                                'name', oi.product_name,
                                'image', COALESCE(oi.product_image, pr.image, pr.images->>0),
                                'quantity', oi.quantity,
                                'price', oi.price
                            ) ORDER BY oi.id
                        ) FILTER (WHERE oi.id IS NOT NULL),
                        '[]'::json
                    ) AS items
             FROM refund_requests rr
             JOIN orders o ON o.id = rr.order_id
             JOIN shops s ON s.id = rr.shop_id
             JOIN payments p ON p.id = rr.payment_id
             LEFT JOIN order_items oi ON oi.order_id = o.id
             LEFT JOIN products pr ON pr.id = oi.product_id
             WHERE TRUE ${sellerFilter}
             GROUP BY rr.id, o.id, s.shop_name, p.razorpay_payment_id
             ORDER BY rr.requested_at DESC`,
            values
        );
        const refreshedRefunds = await Promise.all(result.rows.map(syncProviderRefundStatus));
        const refunds = refreshedRefunds.map(({ razorpay_payment_id, ...refund }) => refund);
        return res.json({ refunds });
    } catch (error) {
        console.error("Seller refund list failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not load refund requests" });
    }
};

const decideRefund = async (req, res) => {
    const refundId = Number(req.params.id);
    const { decision, rejectionReason = "" } = req.body || {};
    if (!Number.isSafeInteger(refundId) || refundId < 1
        || !["approve", "reject"].includes(decision)
        || typeof rejectionReason !== "string" || rejectionReason.length > 500
        || (decision === "reject" && !rejectionReason.trim())) {
        return res.status(400).json({ message: "Choose whether to approve or reject and provide a reason when rejecting" });
    }

    const client = await pool.connect();
    let refund;
    try {
        await client.query("BEGIN");
        const result = await client.query(
            `SELECT rr.id, rr.order_id, rr.status, rr.provider_status,
                    rr.provider_refund_id, rr.payment_id,
                    p.razorpay_payment_id, p.amount_minor, p.currency
             FROM refund_requests rr
             JOIN shops s ON s.id = rr.shop_id
             JOIN payments p ON p.id = rr.payment_id
             WHERE rr.id = $1 AND ($2 = 'admin' OR s.user_id = $3)
             FOR UPDATE OF rr, p`,
            [refundId, req.user.role, req.user.id]
        );
        if (!result.rowCount) {
            await client.query("ROLLBACK");
            return res.status(404).json({ message: "Refund request could not be found for your shop" });
        }
        refund = result.rows[0];
        if (refund.status !== "requested" || refund.provider_status !== "not_started") {
            await client.query("ROLLBACK");
            return res.status(409).json({ message: "This refund request has already been decided or submitted to Razorpay" });
        }
        if (decision === "reject") {
            const rejected = await client.query(
                `UPDATE refund_requests
                 SET status = 'rejected', rejection_reason = $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2
                 RETURNING id, status, rejection_reason, provider_status`,
                [rejectionReason.trim(), refundId]
            );
            await client.query("COMMIT");
            return res.json({ refund: rejected.rows[0] });
        }
        await client.query(
            `UPDATE refund_requests
             SET status = 'approved', provider_status = 'processing',
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1`,
            [refundId]
        );
        await client.query("COMMIT");
    } catch (error) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackError) {
            console.error("Refund decision rollback failed:", rollbackError.code || "database error");
        }
        console.error("Refund decision failed:", error.code || "database error");
        return res.status(500).json({ message: "Could not update the refund request" });
    } finally {
        client.release();
    }

    try {
        const razorpay = createRazorpay();
        const providerPayment = await razorpay.payments.fetch(refund.razorpay_payment_id);
        if (providerPayment.status !== "captured"
            || Number(providerPayment.amount) !== Number(refund.amount_minor)
            || providerPayment.currency !== refund.currency) {
            throw new Error("The captured payment does not match this order");
        }
        const providerRefund = await razorpay.payments.refund(refund.razorpay_payment_id, {
            notes: { vibe_refund_request_id: String(refundId), vibe_order_id: String(refund.order_id) }
        });
        const status = ["pending", "processed", "failed"].includes(providerRefund.status)
            ? providerRefund.status
            : "pending";
        const result = await pool.query(
            `UPDATE refund_requests
             SET provider_refund_id = $1, provider_status = $2,
                 provider_error = NULL, updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING id, order_id, status, provider_refund_id, provider_status`,
            [providerRefund.id, status, refundId]
        );
        return res.json({ refund: result.rows[0] });
    } catch (error) {
        await pool.query(
            `UPDATE refund_requests
             SET provider_status = 'needs_review',
                 provider_error = $1, updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [(error.error?.description || error.message || "Provider status is uncertain").slice(0, 500), refundId]
        );
        console.error("Razorpay refund submission needs review:", error.statusCode || error.status || "provider error");
        return res.status(502).json({
            message: "The refund approval was recorded, but Razorpay did not confirm its result. Check the Razorpay dashboard before retrying.",
            refundNeedsReview: true
        });
    }
};

module.exports = { requestRefund, listSellerRefunds, decideRefund };

const Razorpay = require("razorpay");

const toMinorUnits = (value) => {
    const match = String(value).match(/^(\d+)(?:\.(\d{1,2}))?$/);
    if (!match) throw new Error("Invalid database price");
    return Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
};

const formatMinorUnits = (amount) => `${Math.floor(amount / 100)}.${String(amount % 100).padStart(2, "0")}`;

const verifyPaymentSignature = (orderId, paymentId, signature, secret) =>
    Razorpay.validateWebhookSignature(`${orderId}|${paymentId}`, signature, secret);

module.exports = { toMinorUnits, formatMinorUnits, verifyPaymentSignature };

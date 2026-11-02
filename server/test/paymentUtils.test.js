const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { formatMinorUnits, toMinorUnits, verifyPaymentSignature } = require("../utils/paymentUtils");

test("converts decimal rupee values to integer paise", () => {
    assert.equal(toMinorUnits("45"), 4500);
    assert.equal(toMinorUnits("45.6"), 4560);
    assert.equal(toMinorUnits("45.67"), 4567);
    assert.equal(formatMinorUnits(4567), "45.67");
});

test("rejects invalid prices rather than rounding floating-point values", () => {
    assert.throws(() => toMinorUnits("45.678"), /Invalid database price/);
    assert.throws(() => toMinorUnits("-1.00"), /Invalid database price/);
});

test("verifies payment signatures with the Razorpay SDK", () => {
    const orderId = "order_test123";
    const paymentId = "pay_test123";
    const secret = "unit-test-secret";
    const signature = crypto
        .createHmac("sha256", secret)
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

    assert.equal(verifyPaymentSignature(orderId, paymentId, signature, secret), true);
    assert.equal(verifyPaymentSignature(orderId, paymentId, signature, "wrong-secret"), false);
    assert.equal(verifyPaymentSignature(orderId, paymentId, "0".repeat(64), secret), false);
});

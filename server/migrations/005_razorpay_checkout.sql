BEGIN;

ALTER TABLE orders
    ADD COLUMN IF NOT EXISTS customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS shipping_address TEXT,
    ADD COLUMN IF NOT EXISTS shipping_city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS shipping_postal_code VARCHAR(20),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS product_name VARCHAR(150);

UPDATE order_items oi
SET product_name = COALESCE(p.name, 'Product')
FROM products p
WHERE oi.product_id = p.id
  AND oi.product_name IS NULL;

UPDATE order_items
SET product_name = 'Product'
WHERE product_name IS NULL;

ALTER TABLE order_items
    ALTER COLUMN product_name SET NOT NULL;

CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
    customer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    provider VARCHAR(20) NOT NULL DEFAULT 'razorpay' CHECK (provider = 'razorpay'),
    amount_minor BIGINT NOT NULL CHECK (amount_minor > 0),
    currency VARCHAR(3) NOT NULL DEFAULT 'INR' CHECK (currency = 'INR'),
    razorpay_order_id VARCHAR(80) UNIQUE,
    razorpay_payment_id VARCHAR(80) UNIQUE,
    idempotency_key VARCHAR(100) NOT NULL,
    request_fingerprint CHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid', 'failed', 'cancelled', 'expired')),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (customer_user_id, idempotency_key)
);

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS request_fingerprint CHAR(64);

UPDATE payments
SET request_fingerprint = repeat('0', 64)
WHERE request_fingerprint IS NULL;

ALTER TABLE payments
    ALTER COLUMN request_fingerprint SET NOT NULL;

CREATE INDEX IF NOT EXISTS payments_pending_expiration_idx
    ON payments (expires_at)
    WHERE status = 'pending';

COMMIT;

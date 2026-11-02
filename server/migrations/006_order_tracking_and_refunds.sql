BEGIN;

ALTER TABLE orders
    DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE orders
    ADD CONSTRAINT orders_status_check
        CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled'));

ALTER TABLE order_items
    ADD COLUMN IF NOT EXISTS product_image TEXT;

UPDATE order_items oi
SET product_image = p.image
FROM products p
WHERE oi.product_id = p.id
  AND oi.product_image IS NULL;

CREATE TABLE IF NOT EXISTS refund_requests (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL UNIQUE REFERENCES orders(id) ON DELETE RESTRICT,
    payment_id INTEGER NOT NULL UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,
    customer_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
    reason VARCHAR(40) NOT NULL
        CHECK (reason IN ('damaged', 'wrong_item', 'not_received', 'other')),
    details TEXT NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'requested'
        CHECK (status IN ('requested', 'approved', 'rejected')),
    rejection_reason TEXT,
    provider_refund_id VARCHAR(80) UNIQUE,
    provider_status VARCHAR(30) NOT NULL DEFAULT 'not_started'
        CHECK (provider_status IN ('not_started', 'processing', 'pending', 'processed', 'failed', 'needs_review')),
    provider_error TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS refund_requests_shop_status_idx
    ON refund_requests (shop_id, status, requested_at DESC);

COMMIT;

BEGIN;

ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE reviews
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE reviews
    ADD CONSTRAINT reviews_order_product_customer_unique
        UNIQUE (order_id, product_id, customer_user_id);

ALTER TABLE custom_orders
    ADD COLUMN IF NOT EXISTS customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS idea_images JSONB NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS quoted_price NUMERIC(10, 2)
        CHECK (quoted_price IS NULL OR quoted_price > 0),
    ADD COLUMN IF NOT EXISTS seller_message TEXT,
    ADD COLUMN IF NOT EXISTS order_id INTEGER UNIQUE REFERENCES orders(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE custom_orders
    DROP CONSTRAINT IF EXISTS custom_orders_status_check;

ALTER TABLE custom_orders
    ADD CONSTRAINT custom_orders_status_check
        CHECK (status IN ('pending', 'in_progress', 'accepted', 'declined', 'completed'));

CREATE INDEX IF NOT EXISTS custom_orders_customer_created_at_idx
    ON custom_orders (customer_user_id, created_at DESC);

COMMIT;

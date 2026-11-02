BEGIN;

ALTER TABLE custom_orders
    ADD COLUMN IF NOT EXISTS customer_hidden_at TIMESTAMPTZ;

COMMIT;

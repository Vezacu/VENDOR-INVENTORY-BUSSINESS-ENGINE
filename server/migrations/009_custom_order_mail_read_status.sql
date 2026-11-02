BEGIN;

ALTER TABLE custom_orders
    ADD COLUMN IF NOT EXISTS seller_message_viewed_at TIMESTAMPTZ;

COMMIT;

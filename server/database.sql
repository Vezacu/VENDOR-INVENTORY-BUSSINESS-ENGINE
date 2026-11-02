-- VIBE marketplace schema for a fresh Neon PostgreSQL database.
-- This defines the data model and role constraints; API authorization is
-- still required to restrict seller creation to the admin.

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'customer'
        CHECK (role IN ('admin', 'seller', 'customer')),
    phone VARCHAR(20),
    shipping_address TEXT,
    shipping_city VARCHAR(100),
    shipping_postal_code VARCHAR(20),
    profile_image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX users_email_lower_unique
    ON users (LOWER(email));

CREATE UNIQUE INDEX users_single_admin
    ON users (role)
    WHERE role = 'admin';

CREATE UNIQUE INDEX users_single_seller
    ON users (role)
    WHERE role = 'seller';

CREATE TABLE shops (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    shop_name VARCHAR(150) NOT NULL,
    slug VARCHAR(170) NOT NULL UNIQUE,
    description TEXT,
    instagram_link TEXT,
    other_social_link TEXT,
    announcement TEXT,
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    hero_image TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(80) NOT NULL,
    description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    image TEXT,
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    availability BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX products_shop_id_idx ON products (shop_id);
CREATE INDEX products_category_idx ON products (category);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
    customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    customer_name VARCHAR(100) NOT NULL,
    customer_email VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(20),
    shipping_address TEXT NOT NULL,
    shipping_city VARCHAR(100) NOT NULL,
    shipping_postal_code VARCHAR(20) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'shipped', 'delivered', 'cancelled')),
    tracking_number VARCHAR(120),
    total_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX orders_shop_id_created_at_idx ON orders (shop_id, created_at DESC);
CREATE INDEX orders_customer_user_id_idx ON orders (customer_user_id);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(150) NOT NULL,
    product_image TEXT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0)
);

CREATE INDEX order_items_order_id_idx ON order_items (order_id);

CREATE TABLE payments (
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

CREATE INDEX payments_pending_expiration_idx
    ON payments (expires_at)
    WHERE status = 'pending';

CREATE TABLE refund_requests (
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

CREATE INDEX refund_requests_shop_status_idx
    ON refund_requests (shop_id, status, requested_at DESC);

CREATE TABLE custom_orders (
    id SERIAL PRIMARY KEY,
    shop_id INTEGER NOT NULL REFERENCES shops(id) ON DELETE RESTRICT,
    customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    customer_name VARCHAR(100) NOT NULL,
    customer_email VARCHAR(150) NOT NULL,
    customer_phone VARCHAR(20),
    description TEXT NOT NULL,
    budget NUMERIC(10, 2) CHECK (budget IS NULL OR budget >= 0),
    idea_images JSONB NOT NULL DEFAULT '[]'::jsonb,
    quoted_price NUMERIC(10, 2) CHECK (quoted_price IS NULL OR quoted_price > 0),
    seller_message TEXT,
    order_id INTEGER UNIQUE REFERENCES orders(id) ON DELETE SET NULL,
    needed_by DATE,
    status VARCHAR(30) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'accepted', 'declined', 'completed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    seller_message_viewed_at TIMESTAMPTZ,
    customer_hidden_at TIMESTAMPTZ
);

CREATE INDEX custom_orders_shop_id_created_at_idx
    ON custom_orders (shop_id, created_at DESC);

CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    customer_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    customer_name VARCHAR(100) NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    images JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE reviews
    ADD CONSTRAINT reviews_order_product_customer_unique
        UNIQUE (order_id, product_id, customer_user_id);

CREATE INDEX reviews_product_id_created_at_idx
    ON reviews (product_id, created_at DESC);

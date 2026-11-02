BEGIN;

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS phone VARCHAR(20),
    ADD COLUMN IF NOT EXISTS shipping_address TEXT,
    ADD COLUMN IF NOT EXISTS shipping_city VARCHAR(100),
    ADD COLUMN IF NOT EXISTS shipping_postal_code VARCHAR(20);

ALTER TABLE public.shops
    ADD COLUMN IF NOT EXISTS content JSONB NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS hero_image TEXT,
    ADD COLUMN IF NOT EXISTS announcement TEXT,
    ADD COLUMN IF NOT EXISTS slug VARCHAR(170);

UPDATE public.shops
SET slug = COALESCE(
    NULLIF(trim(both '-' from regexp_replace(lower(shop_name), '[^a-z0-9]+', '-', 'g')), ''),
    'shop'
) || '-' || id
WHERE slug IS NULL OR btrim(slug) = '';

ALTER TABLE public.shops
    ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS shops_slug_unique
    ON public.shops (slug);

COMMIT;

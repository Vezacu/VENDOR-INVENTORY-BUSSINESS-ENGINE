BEGIN;

LOCK TABLE public.users, public.shops, public.products, public.orders, public.custom_orders
    IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
    primary_seller_id INTEGER;
    primary_shop_id INTEGER;
BEGIN
    SELECT id
    INTO primary_seller_id
    FROM public.users
    WHERE role = 'seller'
    ORDER BY created_at, id
    LIMIT 1;

    IF primary_seller_id IS NOT NULL THEN
        SELECT id
        INTO primary_shop_id
        FROM public.shops
        WHERE user_id = primary_seller_id;

        IF primary_shop_id IS NULL THEN
            SELECT s.id
            INTO primary_shop_id
            FROM public.shops s
            JOIN public.users u ON u.id = s.user_id
            WHERE u.role = 'seller'
            ORDER BY s.created_at, s.id
            LIMIT 1;

            IF primary_shop_id IS NOT NULL THEN
                UPDATE public.shops
                SET user_id = primary_seller_id
                WHERE id = primary_shop_id;
            END IF;
        END IF;

        IF primary_shop_id IS NOT NULL THEN
            UPDATE public.products p
            SET shop_id = primary_shop_id
            FROM public.shops s
            JOIN public.users u ON u.id = s.user_id
            WHERE p.shop_id = s.id
              AND u.role = 'seller'
              AND u.id <> primary_seller_id;

            UPDATE public.orders o
            SET shop_id = primary_shop_id
            FROM public.shops s
            JOIN public.users u ON u.id = s.user_id
            WHERE o.shop_id = s.id
              AND u.role = 'seller'
              AND u.id <> primary_seller_id;

            UPDATE public.custom_orders co
            SET shop_id = primary_shop_id
            FROM public.shops s
            JOIN public.users u ON u.id = s.user_id
            WHERE co.shop_id = s.id
              AND u.role = 'seller'
              AND u.id <> primary_seller_id;
        END IF;

        DELETE FROM public.shops s
        USING public.users u
        WHERE s.user_id = u.id
          AND u.role = 'seller'
          AND u.id <> primary_seller_id;

        DELETE FROM public.users
        WHERE role = 'seller'
          AND id <> primary_seller_id;
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS users_single_seller
    ON public.users (role)
    WHERE role = 'seller';

COMMIT;

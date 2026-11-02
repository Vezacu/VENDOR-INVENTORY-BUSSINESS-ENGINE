BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_role_allowed'
          AND conrelid = 'public.users'::regclass
    ) THEN
        ALTER TABLE public.users
            ADD CONSTRAINT users_role_allowed
            CHECK (role IN ('admin', 'seller', 'customer'));
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_unique
    ON public.users (LOWER(email));

CREATE UNIQUE INDEX IF NOT EXISTS users_single_admin
    ON public.users (role)
    WHERE role = 'admin';

COMMIT;

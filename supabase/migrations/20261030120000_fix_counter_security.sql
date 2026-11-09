-- Sequential number generators must run as the function owner.
--
-- Both triggers UPDATE public.app_settings to advance a counter, but the only
-- write policy on that table is "Super Admin full access to app_settings".
-- Running as the invoking user, the UPDATE silently matches zero rows for any
-- admin/sales/mechanic user — no error is raised — so the counter never
-- advances and every sale is stamped № 00001 (and every property form 0001).
--
-- SECURITY DEFINER makes them run as the owner, bypassing RLS on app_settings
-- while leaving the tables themselves protected. search_path is pinned so the
-- elevated function can't be redirected to another schema.

CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_num INT;
BEGIN
    IF NEW.sale_number IS NULL THEN
        SELECT value::INT INTO current_num
        FROM public.app_settings
        WHERE key = 'next_sale_number'
        FOR UPDATE;

        IF current_num IS NULL THEN
            current_num := 1;
            INSERT INTO public.app_settings (key, value) VALUES ('next_sale_number', '2')
            ON CONFLICT (key) DO UPDATE SET value = '2', updated_at = now();
        ELSE
            UPDATE public.app_settings
            SET value = (current_num + 1)::TEXT, updated_at = now()
            WHERE key = 'next_sale_number';
        END IF;

        NEW.sale_number := LPAD(current_num::TEXT, 5, '0');
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_property_form_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_num INT;
BEGIN
    IF NEW.form_number IS NULL THEN
        SELECT value::INT INTO current_num
        FROM public.app_settings
        WHERE key = 'next_property_form_number'
        FOR UPDATE;

        IF current_num IS NULL THEN
            current_num := 1;
            INSERT INTO public.app_settings (key, value) VALUES ('next_property_form_number', '2')
            ON CONFLICT (key) DO UPDATE SET value = '2', updated_at = now();
        ELSE
            UPDATE public.app_settings
            SET value = (current_num + 1)::TEXT, updated_at = now()
            WHERE key = 'next_property_form_number';
        END IF;

        NEW.form_number := LPAD(current_num::TEXT, 4, '0');
    END IF;

    RETURN NEW;
END;
$$;

-- Close a hole opened by 20261108090000.
--
-- That migration added:
--   CREATE POLICY "Authenticated can write settings"
--     ON public.app_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
--
-- Postgres ORs permissive policies together, so this one overrode the
-- admin-only policy beside it: any signed-in user — a mechanic, a sales rep —
-- could rewrite app_settings, including the `permissions` document that *is*
-- the access-control matrix. A user could grant themselves every right.
--
-- Reads stay open to authenticated users (the app reads the matrix and the bank
-- details on ordinary pages). Writes are admin-only.
--
-- The sequential-number triggers (generate_sale_number,
-- generate_property_form_number) are SECURITY DEFINER, so they keep advancing
-- their counters regardless of who is signed in.

DROP POLICY IF EXISTS "Authenticated can write settings" ON public.app_settings;

-- Everyone signed in may read settings
DROP POLICY IF EXISTS "Authenticated can read settings" ON public.app_settings;
CREATE POLICY "Authenticated can read settings"
  ON public.app_settings FOR SELECT TO authenticated USING (true);

-- Only admins may change them
DROP POLICY IF EXISTS "Admins can insert settings" ON public.app_settings;
CREATE POLICY "Admins can insert settings"
  ON public.app_settings FOR INSERT TO authenticated
  WITH CHECK (public.user_has_role('admin') OR public.user_has_role('super_admin'));

DROP POLICY IF EXISTS "Admins can update settings" ON public.app_settings;
CREATE POLICY "Admins can update settings"
  ON public.app_settings FOR UPDATE TO authenticated
  USING (public.user_has_role('admin') OR public.user_has_role('super_admin'))
  WITH CHECK (public.user_has_role('admin') OR public.user_has_role('super_admin'));

DROP POLICY IF EXISTS "Admins can delete settings" ON public.app_settings;
CREATE POLICY "Admins can delete settings"
  ON public.app_settings FOR DELETE TO authenticated
  USING (public.user_has_role('admin') OR public.user_has_role('super_admin'));

-- Superseded by the three policies above
DROP POLICY IF EXISTS "Super Admin full access to app_settings" ON public.app_settings;

-- Table privileges still have to allow what the policies permit
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;

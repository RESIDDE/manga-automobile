-- ════════════════════════════════════════════════════════════════════════════
-- Direct Sales Agent (role key: 'dsa')
--
-- A special role with a fixed, narrow view of the business:
--   ✓ available cars, on the stand and outside
--   ✓ one price per car: the office price (owner's price + 10% for outside
--     cars; the company's selling price for stand cars) — the `price` column
--   ✗ no cost / owner's price, no margin
--   ✗ no owner, source company or representative names or phone numbers
--   ✗ no other business data at all
--
-- Enforced here, not just hidden on screen:
--   1. Every business table gets RESTRICTIVE policies that refuse a DSA.
--      Restrictive policies are AND-ed with the existing ones, so nothing
--      changes for anyone else.
--   2. DSAs read cars only through get_dsa_vehicles(), which returns the safe
--      columns and nothing more.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_dsa()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role::text = 'dsa');
$$;
GRANT EXECUTE ON FUNCTION public.is_dsa() TO authenticated;

-- ─── 1. Block DSAs from every business table ────────────────────────────────
-- Left open (the app needs them for sign-in, names in chat, and collaboration;
-- each already has its own per-user rules): profiles, user_roles, app_settings,
-- chat_*, page_tags, notifications. audit_logs stays writable so their
-- sign-ins are recorded, but not readable.
DO $$
DECLARE
  t RECORD;
  open_tables TEXT[] := ARRAY[
    'profiles', 'user_roles', 'app_settings',
    'chat_threads', 'chat_members', 'chat_messages',
    'page_tags', 'notifications', 'password_fingerprints'
  ];
BEGIN
  FOR t IN
    SELECT c.relname, c.relrowsecurity
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT (c.relname = ANY (open_tables))
  LOOP
    IF NOT t.relrowsecurity THEN
      -- Without row security no policy applies, so switching it on here would
      -- lock everyone else out. Flag it instead.
      RAISE WARNING 'Table public.% has row level security OFF — a DSA could read it', t.relname;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY IF EXISTS "dsa_no_select" ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY "dsa_no_select" ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (NOT public.is_dsa())', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS "dsa_no_update" ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY "dsa_no_update" ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated USING (NOT public.is_dsa())', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS "dsa_no_delete" ON public.%I', t.relname);
    EXECUTE format('CREATE POLICY "dsa_no_delete" ON public.%I AS RESTRICTIVE FOR DELETE TO authenticated USING (NOT public.is_dsa())', t.relname);

    IF t.relname <> 'audit_logs' THEN
      EXECUTE format('DROP POLICY IF EXISTS "dsa_no_insert" ON public.%I', t.relname);
      EXECUTE format('CREATE POLICY "dsa_no_insert" ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (NOT public.is_dsa())', t.relname);
    END IF;
  END LOOP;
END $$;

-- profiles stays readable so chat can show colleagues' names. It holds staff
-- details only — no customer, owner or source contact lives there.

-- ─── 2. The DSA's window onto the cars ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_dsa_vehicles()
RETURNS TABLE (
  id           UUID,
  make         TEXT,
  model        TEXT,
  trim_level   TEXT,
  year         INTEGER,
  color        TEXT,
  mileage      NUMERIC,
  fuel_type    TEXT,
  transmission TEXT,
  condition    TEXT,
  description  TEXT,
  location     TEXT,      -- 'stand' | 'outside'
  price        NUMERIC,   -- the office price
  image_url    TEXT,
  images       TEXT[],
  updated_at   TIMESTAMPTZ
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_dsa() OR public.is_app_admin()) THEN
    RAISE EXCEPTION 'Only Direct Sales Agents can use this list';
  END IF;

  RETURN QUERY
  SELECT
    v.id, v.make::text, v.model::text, v.trim::text, v.year::integer, v.color::text,
    v.mileage::numeric, v.fuel_type::text, v.transmission::text, v.condition::text,
    -- Free text can hold an owner's number: phone-like runs are blanked out
    regexp_replace(coalesce(v.description, ''), '\+?\d[\d\s().-]{6,}\d', '[hidden]', 'g'),
    CASE WHEN v.inventory_type = 'external' THEN 'outside' ELSE 'stand' END,
    v.price::numeric,
    v.image_url::text,
    coalesce(
      (SELECT array_agg(vi.image_url ORDER BY vi.created_at) FROM public.vehicle_images vi WHERE vi.vehicle_id = v.id),
      '{}'::text[]
    ),
    v.updated_at
  FROM public.vehicles v
  WHERE lower(coalesce(v.status, '')) = 'available'
    AND coalesce(v.inventory_type, 'main') IN ('main', 'external')
  ORDER BY v.updated_at DESC NULLS LAST;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_dsa_vehicles() TO authenticated;

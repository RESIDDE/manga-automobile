-- Access control (permissions in app_settings), sale payments, and the extra
-- columns the Vehicles and Sales modules need.
--
-- Note: public.app_settings already exists here with `value TEXT`, so the
-- permissions and role_labels documents are stored as JSON *text* and parsed in
-- the client. Converting the column to JSONB is left out on purpose: existing
-- rows (e.g. next_sale_number) would have to be valid JSON for the cast, and
-- that cannot be verified from here.

-- ─── app_settings: realtime + the seeded documents ──────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT UNIQUE NOT NULL,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can read settings" ON public.app_settings;
CREATE POLICY "Authenticated can read settings"
  ON public.app_settings FOR SELECT TO authenticated USING (true);

-- Writes are admin-only: this table holds the permission matrix, so letting any
-- signed-in user write it would let them grant themselves every right.
-- (The admin-only write policies are created further down, once
-- public.user_has_role exists.)

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;

-- Seeded only when absent, so an existing matrix is never overwritten.
INSERT INTO public.app_settings (key, value)
VALUES (
  'permissions',
  '{"sales":{"view":["dashboard","vehicles","customers","sales","meetings","property-intake","sales-agreement","performance-quotes"],"create":["vehicles","customers","sales","property-intake","sales-agreement","performance-quotes"],"edit":["vehicles","customers","sales","property-intake","sales-agreement","performance-quotes"],"delete":[]},"mechanic":{"view":["dashboard","vehicles"],"create":[],"edit":["vehicles"],"delete":[]}}'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_settings (key, value)
VALUES ('role_labels', '{}')
ON CONFLICT (key) DO NOTHING;

-- ─── has_role(): server-side role check for RLS ─────────────────────────────
-- public.user_roles.role is the app_role ENUM, and the existing policies call
-- has_role('admin') with an unquoted literal. Adding a has_role(TEXT) overload
-- would make every one of those calls ambiguous ("function is not unique"), so
-- the single app_role version is redefined instead, comparing as text so it
-- keeps working whichever type the column ends up being.
CREATE OR REPLACE FUNCTION public.has_role(checking_role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role::text = checking_role::text
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(app_role) TO authenticated;

-- A distinctly named text helper for roles that are not in the enum (the custom
-- roles created in Settings). Named differently on purpose: an overload of
-- has_role would break the existing policy calls.
CREATE OR REPLACE FUNCTION public.user_has_role(check_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
      AND role::text = check_role
  );
$$;

GRANT EXECUTE ON FUNCTION public.user_has_role(TEXT) TO authenticated;

-- ─── Custom roles need a text column, not a fixed enum ──────────────────────
-- Settings can create a role of any name, but user_roles.role is an enum, so
-- assigning someone a custom role fails with "invalid input value for enum
-- app_role". The column is widened to text; has_role above already compares as
-- text, and the policies call that function, so nothing else has to change.
-- The app_role type itself is left in place.
-- Postgres refuses to alter a column that a policy expression reads directly,
-- so this one is dropped first and recreated against the new text column below.
DROP POLICY IF EXISTS "Super Admin full access to app_settings" ON public.app_settings;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_roles'
      AND column_name = 'role'
      AND udt_name = 'app_role'
  ) THEN
    ALTER TABLE public.user_roles ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.user_roles ALTER COLUMN role TYPE TEXT USING role::text;
    ALTER TABLE public.user_roles ALTER COLUMN role SET DEFAULT 'mechanic';
  END IF;
END $$;

-- Recreated through the function, so no policy reads the column type directly
-- again and a future change to it cannot be blocked by this policy.
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

-- Guard against a typo creating a role nobody can sign in as
ALTER TABLE public.user_roles
  DROP CONSTRAINT IF EXISTS user_roles_role_not_blank;
ALTER TABLE public.user_roles
  ADD CONSTRAINT user_roles_role_not_blank CHECK (length(trim(role)) > 0);

-- ─── Sale payments (instalments against a sale) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.sale_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id        UUID REFERENCES public.sales(id) ON DELETE CASCADE,
  amount         NUMERIC NOT NULL,
  payment_date   TIMESTAMPTZ DEFAULT now(),
  payment_method TEXT DEFAULT 'cash',
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sale_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access to sale payments" ON public.sale_payments;
CREATE POLICY "Authenticated full access to sale payments"
  ON public.sale_payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_payments TO authenticated;

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON public.sale_payments (sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_date ON public.sale_payments (payment_date DESC);

-- ─── Sales: registered-vehicle agreement ────────────────────────────────────
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS is_registered     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS agreement_details JSONB,
  ADD COLUMN IF NOT EXISTS receipt_url       TEXT;

-- ─── Vehicles: stock vs workshop, source and acceptance ─────────────────────
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS inventory_type        TEXT NOT NULL DEFAULT 'main',
  ADD COLUMN IF NOT EXISTS source_company_phone  TEXT,
  ADD COLUMN IF NOT EXISTS source_rep_name       TEXT,
  ADD COLUMN IF NOT EXISTS source_rep_phone      TEXT,
  ADD COLUMN IF NOT EXISTS source_rep_signature  TEXT,
  ADD COLUMN IF NOT EXISTS accepted_by_name      TEXT,
  ADD COLUMN IF NOT EXISTS accepted_by_phone     TEXT,
  ADD COLUMN IF NOT EXISTS accepted_date         DATE,
  ADD COLUMN IF NOT EXISTS accepted_signature    TEXT;

CREATE INDEX IF NOT EXISTS idx_vehicles_inventory_type ON public.vehicles (inventory_type);
CREATE INDEX IF NOT EXISTS idx_vehicles_status         ON public.vehicles (status);
CREATE INDEX IF NOT EXISTS idx_vehicles_source_company ON public.vehicles (source_company);

-- ─── Realtime ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sale_payments;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

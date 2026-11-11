-- ════════════════════════════════════════════════════════════════════════
-- Pending migrations for Manga Automobiles, in order.
-- Safe to run more than once: every statement is guarded.
--   1) 20261107120000  documents: sales agreements + proforma invoices
--   2) 20261108090000  access control, sale payments, vehicle/sale columns
--   3) 20261108100000  restrict app_settings writes to admins
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- Document pages: Sales Agreement & Change of Ownership, and Proforma Invoice.
-- Also adds the owner's-representative name to the existing Authority to Sell form.

-- ─── Authority to Sell: owner's representative ──────────────────────────────
ALTER TABLE public.authority_to_sell
  ADD COLUMN IF NOT EXISTS owner_rep_name TEXT;

-- ─── Sales Agreement & Change of Ownership ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_agreements (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at               TIMESTAMPTZ DEFAULT now(),
  agreement_date           DATE DEFAULT CURRENT_DATE,

  -- seller
  seller_name              TEXT NOT NULL,
  seller_address           TEXT,
  seller_phone             TEXT,
  seller_id_type           TEXT,

  -- buyer
  buyer_name               TEXT NOT NULL,
  buyer_address            TEXT,
  buyer_phone              TEXT,
  buyer_id_type            TEXT,

  -- vehicle
  vehicle_make             TEXT NOT NULL,
  vehicle_year_model       TEXT,
  vehicle_color            TEXT,
  vehicle_engine_number    TEXT,
  vehicle_chassis          TEXT,
  vehicle_plate_number     TEXT,

  -- transaction
  sale_price               TEXT,
  payment_method           TEXT,
  note                     TEXT,

  -- signatures (PNG data URLs) and witnesses
  seller_signature         TEXT,
  buyer_signature          TEXT,
  seller_witness_name      TEXT,
  seller_witness_signature TEXT,
  buyer_witness_name       TEXT,
  buyer_witness_signature  TEXT,
  rep_name                 TEXT,
  rep_signature            TEXT,
  rep_signature_date       DATE DEFAULT CURRENT_DATE,

  created_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.sales_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access to sales agreements" ON public.sales_agreements;
CREATE POLICY "Authenticated full access to sales agreements"
  ON public.sales_agreements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Public preview links read the document without signing in
DROP POLICY IF EXISTS "Anon can read sales agreements" ON public.sales_agreements;
CREATE POLICY "Anon can read sales agreements"
  ON public.sales_agreements FOR SELECT TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_agreements TO authenticated;
GRANT SELECT ON public.sales_agreements TO anon;

CREATE INDEX IF NOT EXISTS idx_sa_seller_name  ON public.sales_agreements (seller_name);
CREATE INDEX IF NOT EXISTS idx_sa_buyer_name   ON public.sales_agreements (buyer_name);
CREATE INDEX IF NOT EXISTS idx_sa_vehicle_make ON public.sales_agreements (vehicle_make);
CREATE INDEX IF NOT EXISTS idx_sa_date         ON public.sales_agreements (agreement_date DESC);
CREATE INDEX IF NOT EXISTS idx_sa_created_at   ON public.sales_agreements (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sa_chassis      ON public.sales_agreements (vehicle_chassis);

-- ─── Proforma Invoice ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.performance_quotes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id    UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name  TEXT,                       -- typed-in customer, when not on file
  customer_phone TEXT,
  customer_email TEXT,
  customer_address TEXT,
  total_amount   NUMERIC NOT NULL DEFAULT 0, -- subtotal + VAT, denormalised
  quote_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  status         TEXT NOT NULL DEFAULT 'Draft',
  notes          TEXT,
  quote_url      TEXT,
  bank_name      TEXT,
  account_number TEXT,
  account_name   TEXT,
  vat_percentage NUMERIC DEFAULT 0,
  vat_amount     NUMERIC DEFAULT 0,
  created_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.performance_quote_items (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id            UUID NOT NULL REFERENCES public.performance_quotes(id) ON DELETE CASCADE,
  vehicle_id          UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  vehicle_description TEXT,
  vin                 TEXT,            -- chassis number for a typed-in vehicle
  base_price          NUMERIC NOT NULL DEFAULT 0,
  has_duty            BOOLEAN NOT NULL DEFAULT false,
  duty_price          NUMERIC DEFAULT 0,
  quantity            INTEGER NOT NULL DEFAULT 1,
  condition           TEXT,
  transmission        TEXT,
  cylinders           TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.performance_quotes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_quote_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access to quotes" ON public.performance_quotes;
CREATE POLICY "Authenticated full access to quotes"
  ON public.performance_quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated full access to quote items" ON public.performance_quote_items;
CREATE POLICY "Authenticated full access to quote items"
  ON public.performance_quote_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_quotes      TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.performance_quote_items TO authenticated;

CREATE INDEX IF NOT EXISTS idx_pq_customer   ON public.performance_quotes (customer_id);
CREATE INDEX IF NOT EXISTS idx_pq_date       ON public.performance_quotes (quote_date DESC);
CREATE INDEX IF NOT EXISTS idx_pq_created_at ON public.performance_quotes (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pqi_quote     ON public.performance_quote_items (quote_id);

-- keep updated_at current
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_performance_quotes_updated_at ON public.performance_quotes;
CREATE TRIGGER trg_performance_quotes_updated_at
  BEFORE UPDATE ON public.performance_quotes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── Realtime ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_agreements;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.performance_quotes;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.performance_quote_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

COMMIT;

BEGIN;

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
  '{"sales":{"view":["dashboard","vehicles","customers","sales","meetings","property-intake","authority-to-sell","performance-quotes"],"create":["vehicles","customers","sales","property-intake","authority-to-sell","performance-quotes"],"edit":["vehicles","customers","sales","property-intake","authority-to-sell","performance-quotes"],"delete":[]},"mechanic":{"view":["dashboard","vehicles"],"create":[],"edit":["vehicles"],"delete":[]}}'
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

COMMIT;

BEGIN;

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

COMMIT;


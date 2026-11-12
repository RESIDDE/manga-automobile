-- ════════════════════════════════════════════════════════════════════════
-- Pending migrations for Manga Automobiles, in order.
-- Safe to run more than once: every statement is guarded.
--   1) 20261107120000  documents: sales agreements + proforma invoices
--   2) 20261108090000  access control, sale payments, vehicle/sale columns
--   3) 20261108100000  restrict app_settings writes to admins
--   4) 20261110120000  outside cars: vehicle_movements table
--   5) 20261110120100  grant the Outside Cars page to existing roles
--   6) 20261110130000  salary schedule
--   7) 20261110130100  seed the October 2026 salary run
--   8) 20261112090000  vehicle display / consignment agreements
--   9) 20261112100000  sales agreement: the pre-printed book's own blanks
--  10) 20261112110000  serial numbers (001, 002, …) on every document
--  11) 20261112120000  retire the Authority to Sell page key
--  12) 20261112130000  monthly expense sheet (groups + numbered entries)
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

-- ══════════════════════════════════════════════════════════════════════
-- 4) 20261110120000_outside_cars_and_vehicle_movements.sql
-- Outside cars: the vehicle_movements log behind stand sign-in / sign-out
-- ══════════════════════════════════════════════════════════════════════

-- Cars snapped outside the stand, and the stand's sign-in / sign-out log.
--
-- Outside cars reuse public.vehicles with inventory_type = 'external'. For those
-- rows the two price columns carry a second meaning:
--   cost_price → the owner's ACTUAL price
--   price      → the OFFICE price we quote (actual + 10%)
-- The office price lives in `price` on purpose: the sale picker, the proforma
-- invoice and the sold-price derivation all read that column, so a brokered car
-- sells and quotes at the right figure with no special-casing. It also makes
-- revenue − cost come out as the commission earned.

-- ─── Document the three-way inventory split ─────────────────────────────────
-- No CHECK constraint on purpose: it would abort this migration if any existing
-- row held something else, and would reject any value a later feature adds. The
-- client already treats an unknown or missing value as stand stock.
COMMENT ON COLUMN public.vehicles.inventory_type IS
  'Where the car is and whose it is: main = on our stand, service = workshop only, external = snapped outside the stand (brokered; price is the office price, cost_price the owner''s actual price).';

-- ─── The stand's movement log ───────────────────────────────────────────────
-- One append-only row per event, with a direction — not an out/in column pair.
-- A car can be signed back in by a different person, days later, and can go out
-- again before anyone closes the previous trip; paired columns lose all of that.
CREATE TABLE IF NOT EXISTS public.vehicle_movements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id       UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  direction        TEXT NOT NULL CHECK (direction IN ('out','in')),
  moved_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  person_name      TEXT NOT NULL,
  person_phone     TEXT,
  reason           TEXT,
  destination      TEXT,
  expected_return  TIMESTAMPTZ,
  notes            TEXT,
  recorded_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Denormalised on purpose, exactly as audit_logs embeds _user_name: the log
  -- must still read correctly when a profile is gone or a join is blocked.
  recorded_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_movements ENABLE ROW LEVEL SECURITY;

-- Authenticated-only, matching sale_payments. Note anon is granted nothing here:
-- vehicles is readable by anon for the signing pages, but this table names staff.
DROP POLICY IF EXISTS "Authenticated full access to vehicle movements" ON public.vehicle_movements;
CREATE POLICY "Authenticated full access to vehicle movements"
  ON public.vehicle_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_movements TO authenticated;

-- Serves both "latest movement per vehicle" and the ON DELETE CASCADE
CREATE INDEX IF NOT EXISTS idx_vehicle_movements_latest
  ON public.vehicle_movements (vehicle_id, moved_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_movements_moved_at
  ON public.vehicle_movements (moved_at DESC);

-- ─── Realtime ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_movements;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ══════════════════════════════════════════════════════════════════════
-- 5) 20261110120100_grant_outside_vehicles_page.sql
-- Grant the Outside Cars page to roles that already exist
-- ══════════════════════════════════════════════════════════════════════

-- Grant the new Outside Cars page to the roles that already have Vehicles.
--
-- 20261108090000 seeded app_settings['permissions'] with ON CONFLICT DO NOTHING,
-- so an existing deployment's matrix predates this page and would hide it from
-- every non-admin. `admin` needs nothing — it derives its rights from the page
-- list in code.
--
-- The rule is a mirror: for each action a role already holds on 'vehicles', it
-- gets the same on 'outside-vehicles'. That can never widen anyone's access
-- beyond their existing stock-page rights.
--
-- Re-runnable: a role that already has the key is skipped. A matrix that is not
-- valid JSON is left alone with a notice, and an admin can tick the box in
-- Settings instead.
DO $$
DECLARE
  doc  JSONB;
  r    TEXT;
  a    TEXT;
  arr  JSONB;
  acts TEXT[] := ARRAY['view','create','edit','delete'];
BEGIN
  BEGIN
    SELECT value::jsonb INTO doc FROM public.app_settings WHERE key = 'permissions';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'app_settings.permissions is not valid JSON — grant Outside Cars from Settings instead';
    RETURN;
  END;

  IF doc IS NULL OR jsonb_typeof(doc) <> 'object' THEN
    RETURN;
  END IF;

  FOR r IN SELECT jsonb_object_keys(doc) LOOP
    FOREACH a IN ARRAY acts LOOP
      arr := COALESCE(doc -> r -> a, '[]'::jsonb);
      IF jsonb_typeof(arr) = 'array'
         AND arr ? 'vehicles'
         AND NOT (arr ? 'outside-vehicles') THEN
        doc := jsonb_set(doc, ARRAY[r, a], arr || '["outside-vehicles"]'::jsonb, true);
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.app_settings
     SET value = doc::text, updated_at = now()
   WHERE key = 'permissions';
END $$;


-- ══════════════════════════════════════════════════════════════════════
-- 6) 20261110130000_salary_schedule.sql
-- Salary schedule
-- ══════════════════════════════════════════════════════════════════════

-- The monthly salary schedule: the paper sheet the office already fills in.
--
-- Two tables, because the sheet has two different lifetimes in it:
--
--   public.staff        the roster — a person, their designation and the
--                       account the money goes to. Changes rarely.
--   public.salary_lines one row per person per month. Changes every month.
--
-- A salary line SNAPSHOTS the name, designation, bank and account number it was
-- paid against, rather than reading them through staff_id at display time. A
-- schedule is a financial record: when somebody changes bank in March, the
-- January sheet must still show the account January's money actually went to.
-- staff_id is kept alongside, nullable, only to link a line back to the roster
-- (and ON DELETE SET NULL, so removing a leaver never destroys paid history).
--
-- ─── What is stored and what is computed ───────────────────────────────────
-- Stored per line:  actual_salary, loan_amount, opening_balance, deduction
-- Computed in code (src/lib/salary.ts), never stored:
--     receiving      = actual_salary − deduction
--     loan balance   = opening_balance − deduction      (the sheet's last column)
--     grand total    = Σ receiving
--
-- Derived figures are deliberately absent from the table. A stored total is a
-- total that can disagree with its own parts after an edit; the office's whole
-- reason for this page is that the arithmetic is right every time.
--
-- `opening_balance` is what the person still owed when the month began, so the
-- closing balance falls straight out of it. It reconciles with the paper sheet:
-- there, a staff member on a ₦2,100,000 loan with ₦1,900,000 outstanding and a
-- ₦200,000 deduction shows a ₦1,700,000 balance — opening − deduction, while
-- loan_amount stays at the original ₦2,100,000 throughout.

-- ─── Roster ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name      TEXT NOT NULL,
  designation    TEXT,
  phone          TEXT,
  account_number TEXT,
  bank_name      TEXT,
  -- The usual monthly figure. A month's line may still differ from it (a part
  -- month, an acting allowance), which is why the line carries its own amount.
  base_salary    NUMERIC NOT NULL DEFAULT 0,
  active         BOOLEAN NOT NULL DEFAULT true,
  notes          TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_active ON public.staff (active, full_name);

-- ─── One month's sheet ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.salary_lines (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Always the first day of the month. A DATE rather than a 'YYYY-MM' string so
  -- the months sort and filter as dates in SQL.
  period          DATE NOT NULL,
  staff_id        UUID REFERENCES public.staff(id) ON DELETE SET NULL,

  -- Snapshot of who was paid and where (see the note above)
  staff_name      TEXT NOT NULL,
  designation     TEXT,
  account_number  TEXT,
  bank_name       TEXT,

  -- The figures. NUMERIC, never float: these are money.
  actual_salary   NUMERIC NOT NULL DEFAULT 0,
  loan_amount     NUMERIC NOT NULL DEFAULT 0,
  opening_balance NUMERIC NOT NULL DEFAULT 0,
  deduction       NUMERIC NOT NULL DEFAULT 0,

  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The S/N order of the sheet, and the lookup every read does
CREATE INDEX IF NOT EXISTS idx_salary_lines_period
  ON public.salary_lines (period DESC, sort_order, staff_name);

-- One line per person per month. Partial, because a line typed in by hand for
-- somebody not on the roster has a NULL staff_id, and NULLs do not collide.
CREATE UNIQUE INDEX IF NOT EXISTS idx_salary_lines_one_per_staff_per_month
  ON public.salary_lines (period, staff_id)
  WHERE staff_id IS NOT NULL;

-- ─── Keep updated_at honest ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_touch ON public.staff;
CREATE TRIGGER trg_staff_touch BEFORE UPDATE ON public.staff
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_salary_lines_touch ON public.salary_lines;
CREATE TRIGGER trg_salary_lines_touch BEFORE UPDATE ON public.salary_lines
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── Access ─────────────────────────────────────────────────────────────────
-- Authenticated-only, and nothing at all for anon: unlike vehicles, these rows
-- name people and carry their bank accounts, so no public signing page may
-- reach them.
--
-- Beyond that, access follows this app's existing model — the permission matrix
-- in app_settings decides who sees the page, and 'salary' is granted to nobody
-- but admin by default (see src/lib/permissions.ts), so an admin can hand
-- payroll to an HR account without a migration. The trade-off is the usual one
-- for that model: the matrix shapes the UI, not the API, so any signed-in
-- account could read this table directly. If payroll should be sealed off from
-- other staff entirely, replace the policy below with one guarded by
-- public.user_has_role('admin') OR public.user_has_role('super_admin') — and
-- then only admins can be granted the page.
ALTER TABLE public.staff        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.salary_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access to staff" ON public.staff;
CREATE POLICY "Authenticated full access to staff"
  ON public.staff FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated full access to salary lines" ON public.salary_lines;
CREATE POLICY "Authenticated full access to salary lines"
  ON public.salary_lines FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff        TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.salary_lines TO authenticated;

-- ─── Realtime ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.salary_lines;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


-- ══════════════════════════════════════════════════════════════════════
-- 7) 20261110130100_seed_october_2026_salary.sql
-- Seed the October 2026 salary run
-- ══════════════════════════════════════════════════════════════════════

-- The October 2026 salary schedule, as filled in on paper.
--
-- This seeds the roster (public.staff) and that month's sheet
-- (public.salary_lines) with the fourteen staff from the signed sheet, so the
-- new page opens on real data rather than an empty month and November can be
-- started with "Copy Oct 2026".
--
-- Names, designations, account numbers and banks are transcribed exactly as
-- written, spellings included ("CHRISSTIANA", "ALHASSSAN", "CORDINATOR"): this
-- is a financial record of what was paid, not a place to correct typing. Fix
-- them on the page if they are wrong — the roster is editable.
--
-- ─── The one figure not on the paper ───────────────────────────────────────
-- The sheet shows LOAN AMOUNT and LOAN BALANCE but not the opening balance the
-- balance is derived from. Both are recoverable, because the sheet's balance is
-- opening − deduction:
--
--   FAVOUR NWAFOR NKEM   balance    50,000 + deduction   50,000 → opening   100,000
--   NATHAN FAVOUR CHIOMA balance 1,700,000 + deduction  200,000 → opening 1,900,000
--
-- Note that neither opening balance equals the original loan: both had been
-- repaid for some months before this sheet. That history is not in this file,
-- and does not need to be — October closes at the figures on the paper.
--
-- Idempotent: it does nothing at all if October 2026 already has rows, so
-- re-running it can never double the payroll.

DO $$
DECLARE
  period_date DATE := DATE '2026-10-01';
  rec         RECORD;
  staff_uuid  UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM public.salary_lines WHERE period = period_date) THEN
    RAISE NOTICE 'October 2026 already has a salary schedule — nothing seeded';
    RETURN;
  END IF;

  FOR rec IN
    SELECT * FROM (VALUES
      -- sn, name, designation, salary, loan, opening balance, deduction, account, bank
      ( 1, 'SAMUEL CHRISSTIANA UDOFIA', 'Office Secretary',   200000,       0,       0,      0, '0126080446',  'GTBank'),
      ( 2, 'FAVOUR NWAFOR NKEM',        'Vehicle Records',    200000,  150000,  100000,  50000, '0025674545',  'Jaiz Bank'),
      ( 3, 'SUMAIYYA BINTU YUSUF',      'Property Inventory', 150000,       0,       0,      0, '3202066799',  'First Bank'),
      ( 4, 'ABUBAKAR ALIYU SADIQ',      'HR',                 300000,       0,       0,      0, '60327700998', 'Keystone Bank'),
      ( 5, 'NATHAN FAVOUR CHIOMA',      'Content Creator',    250000, 2100000, 1900000, 200000, '0640901403',  'GTBank'),
      ( 6, 'CHRISTOPHER UGONNA OGUIKE', 'Videographer',       300000,       0,       0,      0, '1526169745',  'Access Bank'),
      ( 7, 'ABDULMALIK MUSA',           'Car Wash',            50000,       0,       0,      0, '8132338779',  'OPay'),
      ( 8, 'ALHASSSAN MOHAMMED',        'Car Wash',            50000,       0,       0,      0, '9060848823',  'OPay'),
      ( 9, 'LUMI ISHAKU',               'Car Wash',            50000,       0,       0,      0, '7059807769',  'OPay'),
      (10, 'ANAS IBRAHIM',              'Car Wash',            50000,       0,       0,      0, '8100726362',  'OPay'),
      (11, 'ADAMU MOHAMMED',            'Car Wash',            50000,       0,       0,      0, '7082016439',  'OPay'),
      (12, 'ABDULLAHI JIBRIL ADAM',     'Cordinator',          50000,       0,       0,      0, '8143289331',  'OPay'),
      (13, 'IBRAHIM YUSUF',             'Security',           300000,       0,       0,      0, '1822284023',  'OPay'),
      (14, 'AISHA Bagudu Umar',         'Cleaner',             20000,       0,       0,      0, '9020082600',  'OPay')
    ) AS t(sn, full_name, designation, salary, loan, opening, deduction, account_number, bank_name)
    ORDER BY sn
  LOOP
    -- Reuse a roster entry if somebody has already added this person by hand,
    -- so the seed never creates a second copy of a member of staff.
    SELECT id INTO staff_uuid
      FROM public.staff
     WHERE lower(full_name) = lower(rec.full_name)
     LIMIT 1;

    IF staff_uuid IS NULL THEN
      INSERT INTO public.staff (full_name, designation, account_number, bank_name, base_salary)
      VALUES (rec.full_name, rec.designation, rec.account_number, rec.bank_name, rec.salary)
      RETURNING id INTO staff_uuid;
    END IF;

    INSERT INTO public.salary_lines (
      period, staff_id, staff_name, designation, account_number, bank_name,
      actual_salary, loan_amount, opening_balance, deduction, sort_order
    ) VALUES (
      period_date, staff_uuid, rec.full_name, rec.designation, rec.account_number, rec.bank_name,
      rec.salary, rec.loan, rec.opening, rec.deduction, rec.sn - 1
    );
  END LOOP;

  -- Fail loudly rather than leave a sheet that does not match the paper. The
  -- grand total is Σ(salary − deduction) = 2,020,000 − 250,000.
  PERFORM 1
     FROM (SELECT SUM(actual_salary - deduction) AS total
             FROM public.salary_lines WHERE period = period_date) s
    WHERE s.total = 1770000;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seeded October 2026 does not total 1,770,000 — rolling back';
  END IF;

  RAISE NOTICE 'Seeded 14 staff for October 2026, grand total 1,770,000';
END $$;


-- ══════════════════════════════════════════════════════════════════════
-- 8) 20261112090000_consignment_agreements.sql
-- Vehicle display / consignment agreements
-- ══════════════════════════════════════════════════════════════════════

-- Vehicle Display / Consignment Agreement.
--
-- The paper form an owner signs when they leave their car on the stand for
-- Manga Automobile to display and sell on their behalf. Every blank on that
-- form is a column here, including the figures in the terms (the commission,
-- the withdrawal window and its charge), because those get negotiated per
-- owner even though the printed form shows house defaults.

CREATE TABLE IF NOT EXISTS public.consignment_agreements (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  agreement_date        DATE DEFAULT CURRENT_DATE,

  -- The company side. The office address and phone are blanks on the form, so
  -- they are stored per agreement rather than read from the letterhead.
  company_rep           TEXT DEFAULT 'Muhammad Manga (CEO)',
  company_address       TEXT,
  company_phone         TEXT,

  -- The owner
  owner_name            TEXT NOT NULL,
  owner_address         TEXT,
  owner_phone           TEXT,
  owner_id_number       TEXT,                 -- NIN / ID No

  -- The vehicle
  vehicle_make_model    TEXT NOT NULL,
  vehicle_year          TEXT,
  vehicle_color         TEXT,
  vehicle_chassis       TEXT,
  agreed_price          NUMERIC DEFAULT 0,    -- owner's agreed selling price

  -- Clause 2: what the company deducts after the sale
  commission_amount     NUMERIC DEFAULT 0,
  commission_note       TEXT,

  -- Clause 4: withdrawal before sale
  withdrawal_days       INTEGER DEFAULT 3,
  withdrawal_charge     NUMERIC DEFAULT 100000,

  notes                 TEXT,

  -- Signatures (PNG data URLs)
  company_signature     TEXT,
  company_sign_date     DATE,
  owner_signature       TEXT,
  owner_sign_name       TEXT,
  owner_sign_date       DATE,
  witness_signature     TEXT,
  witness_name          TEXT,

  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.consignment_agreements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access to consignment agreements" ON public.consignment_agreements;
CREATE POLICY "Authenticated full access to consignment agreements"
  ON public.consignment_agreements FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Matches the other document tables: a public preview link can read the form
DROP POLICY IF EXISTS "Anon can read consignment agreements" ON public.consignment_agreements;
CREATE POLICY "Anon can read consignment agreements"
  ON public.consignment_agreements FOR SELECT TO anon USING (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.consignment_agreements TO authenticated;
GRANT SELECT ON public.consignment_agreements TO anon;

CREATE INDEX IF NOT EXISTS idx_consignment_owner_name  ON public.consignment_agreements (owner_name);
CREATE INDEX IF NOT EXISTS idx_consignment_vehicle     ON public.consignment_agreements (vehicle_make_model);
CREATE INDEX IF NOT EXISTS idx_consignment_chassis     ON public.consignment_agreements (vehicle_chassis);
CREATE INDEX IF NOT EXISTS idx_consignment_date        ON public.consignment_agreements (agreement_date DESC);
CREATE INDEX IF NOT EXISTS idx_consignment_created_at  ON public.consignment_agreements (created_at DESC);

DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.consignment_agreements;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

-- ══════════════════════════════════════════════════════════════════════
-- 9) 20261112100000_sales_agreement_paper_form.sql
-- Vehicle Sales Agreement: the blanks on the pre-printed book
-- ══════════════════════════════════════════════════════════════════════

-- The Vehicle Sales Agreement, re-cut to match the printed book.
--
-- The page used to render a document of our own design. The office actually
-- issues the pre-printed MANGA AUTOMOBILES book ("VEHICLE SALES AGREEMENT",
-- serial 1003 and up), and the printed output has to match it line for line.
-- These are the blanks on that paper that the table had nowhere to put.

ALTER TABLE public.sales_agreements
  -- the serial pre-printed at the top right of each leaf in the book
  ADD COLUMN IF NOT EXISTS document_no          TEXT,
  -- "This is to certify that I, Alh./Mall/Mr./Mrs. ____"
  ADD COLUMN IF NOT EXISTS seller_title         TEXT,
  ADD COLUMN IF NOT EXISTS buyer_title          TEXT,
  -- "...had fully paid the total amount with effect from today's date ____"
  ADD COLUMN IF NOT EXISTS effective_date       DATE,
  -- "Please change the ownership of the vehicle to new owners name and address:"
  ADD COLUMN IF NOT EXISTS new_owner_details    TEXT,
  -- the paper carries a Date under each of the four signatures, not one shared
  -- agreement date
  ADD COLUMN IF NOT EXISTS seller_sign_date     DATE,
  ADD COLUMN IF NOT EXISTS buyer_sign_date      DATE,
  ADD COLUMN IF NOT EXISTS seller_witness_date  DATE,
  ADD COLUMN IF NOT EXISTS buyer_witness_date   DATE;

-- Looking a document up by the serial written on the customer's copy is the
-- most common thing anyone will do with this number.
CREATE INDEX IF NOT EXISTS idx_sa_document_no ON public.sales_agreements (document_no);

-- ══════════════════════════════════════════════════════════════════════
-- 10) 20261112110000_document_numbers.sql
-- A serial on every printable document, and a record you can look one up in
-- ══════════════════════════════════════════════════════════════════════

-- Every printable document gets its own serial: 001, 002, 003 …
--
-- The office already works this way on paper — each book of forms has its own
-- run of numbers — and sales receipts already do it in the app
-- (generate_sale_number, 20260423220000). This extends the same idea to the
-- rest of the printable documents so each one can be quoted, filed and looked
-- up by number.
--
-- Each document type counts on its own, exactly like a separate book, so an
-- authority to sell and a proforma invoice can both be 004. The type is
-- obvious from the document in hand.
--
-- The counters live in app_settings beside next_sale_number, and the helper is
-- SECURITY DEFINER for the same reason that one is: writes to app_settings are
-- admin-only (20261108100000), but a sales rep issuing a document must still be
-- able to advance the counter.

-- ─── The counter ────────────────────────────────────────────────────────────
-- Claims one number and advances the counter in a single statement. The UPDATE
-- takes a row lock, so two people saving at the same moment get 004 and 005,
-- never 004 twice.
CREATE OR REPLACE FUNCTION public.next_document_number(counter_key TEXT, width INT DEFAULT 3)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claimed INT;
BEGIN
  INSERT INTO public.app_settings (key, value)
  VALUES (counter_key, '1')
  ON CONFLICT (key) DO NOTHING;

  UPDATE public.app_settings
     SET value = (COALESCE(NULLIF(trim(value), '')::INT, 1) + 1)::TEXT,
         updated_at = now()
   WHERE key = counter_key
  RETURNING (value::INT - 1) INTO claimed;

  -- LPAD only pads; once the run passes 999 the number simply grows to 1000.
  RETURN LPAD(claimed::TEXT, width, '0');
END;
$$;

REVOKE ALL ON FUNCTION public.next_document_number(TEXT, INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.next_document_number(TEXT, INT) TO authenticated;

-- ─── One trigger function for every document table ──────────────────────────
-- The counter key is passed as a trigger argument, so each table counts in its
-- own run. A number already on the row is left alone: the Vehicle Sales
-- Agreement carries the serial pre-printed in the physical book, and when the
-- clerk types 1003 that is the number, not ours.
CREATE OR REPLACE FUNCTION public.set_document_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.document_no IS NULL OR trim(NEW.document_no) = '' THEN
    NEW.document_no := public.next_document_number(TG_ARGV[0], 3);
  END IF;
  RETURN NEW;
END;
$$;

-- ─── The columns ────────────────────────────────────────────────────────────
ALTER TABLE public.authority_to_sell       ADD COLUMN IF NOT EXISTS document_no TEXT;
ALTER TABLE public.performance_quotes      ADD COLUMN IF NOT EXISTS document_no TEXT;
ALTER TABLE public.consignment_agreements  ADD COLUMN IF NOT EXISTS document_no TEXT;
-- sales_agreements.document_no comes from 20261112100000 (the book's serial).

CREATE INDEX IF NOT EXISTS idx_ats_document_no  ON public.authority_to_sell (document_no);
CREATE INDEX IF NOT EXISTS idx_pq_document_no   ON public.performance_quotes (document_no);
CREATE INDEX IF NOT EXISTS idx_cons_document_no ON public.consignment_agreements (document_no);

-- ─── Backfill, oldest first ─────────────────────────────────────────────────
-- Documents issued before this migration get numbers in the order they were
-- created, so the record reads as one continuous run rather than starting at
-- 001 beside a pile of blanks. Runs once: a second run finds nothing NULL.
DO $$
DECLARE
  tbl  TEXT;
  ckey TEXT;
  used INT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'authority_to_sell', 'performance_quotes', 'consignment_agreements', 'sales_agreements'
  ] LOOP
    ckey := 'next_' || tbl || '_number';

    EXECUTE format($f$
      WITH numbered AS (
        SELECT id, row_number() OVER (ORDER BY created_at, id) AS n
          FROM public.%I
         WHERE document_no IS NULL OR trim(document_no) = ''
      )
      UPDATE public.%I t
         SET document_no = LPAD(numbered.n::TEXT, 3, '0')
        FROM numbered
       WHERE t.id = numbered.id
    $f$, tbl, tbl);

    GET DIAGNOSTICS used = ROW_COUNT;

    -- Start the live counter after whatever the backfill consumed
    INSERT INTO public.app_settings (key, value)
    VALUES (ckey, (used + 1)::TEXT)
    ON CONFLICT (key) DO UPDATE
      SET value = GREATEST(app_settings.value::INT, used + 1)::TEXT
      WHERE app_settings.value ~ '^[0-9]+$';

    RAISE NOTICE 'numbered % existing rows in %', used, tbl;
  END LOOP;
END $$;

-- ─── The triggers ───────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS tr_ats_document_no ON public.authority_to_sell;
CREATE TRIGGER tr_ats_document_no
  BEFORE INSERT ON public.authority_to_sell
  FOR EACH ROW EXECUTE FUNCTION public.set_document_number('next_authority_to_sell_number');

DROP TRIGGER IF EXISTS tr_pq_document_no ON public.performance_quotes;
CREATE TRIGGER tr_pq_document_no
  BEFORE INSERT ON public.performance_quotes
  FOR EACH ROW EXECUTE FUNCTION public.set_document_number('next_performance_quotes_number');

DROP TRIGGER IF EXISTS tr_cons_document_no ON public.consignment_agreements;
CREATE TRIGGER tr_cons_document_no
  BEFORE INSERT ON public.consignment_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_document_number('next_consignment_agreements_number');

DROP TRIGGER IF EXISTS tr_sa_document_no ON public.sales_agreements;
CREATE TRIGGER tr_sa_document_no
  BEFORE INSERT ON public.sales_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_document_number('next_sales_agreements_number');

-- ══════════════════════════════════════════════════════════════════════
-- 11) 20261112120000_retire_authority_to_sell_page.sql
-- The Sales Agreement takes over the retired page's permission
-- ══════════════════════════════════════════════════════════════════════

-- The Authority to Sell page is gone; the Sales Agreement takes its permission.
--
-- Both documents lived behind one page key, 'authority-to-sell'. With the page
-- removed the key is renamed to 'sales-agreement' in code, and the client drops
-- page keys it does not recognise — so without this, every non-admin role would
-- quietly lose the Sales Agreement along with the page that was deleted.
--
-- Each of the four action lists is rewritten in place: wherever a role held
-- 'authority-to-sell' it now holds 'sales-agreement'. Nobody gains or loses
-- anything; the same right simply has a new name.
--
-- Re-runnable: a matrix with no 'authority-to-sell' left is untouched, and one
-- that is not valid JSON is left alone with a notice rather than being lost.

DO $$
DECLARE
  doc  JSONB;
  r    TEXT;
  a    TEXT;
  arr  JSONB;
  acts TEXT[] := ARRAY['view','create','edit','delete'];
BEGIN
  BEGIN
    SELECT value::jsonb INTO doc FROM public.app_settings WHERE key = 'permissions';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'app_settings.permissions is not valid JSON — set the Sales Agreement rights in Settings instead';
    RETURN;
  END;

  IF doc IS NULL OR jsonb_typeof(doc) <> 'object' THEN
    RETURN;
  END IF;

  FOR r IN SELECT jsonb_object_keys(doc) LOOP
    FOREACH a IN ARRAY acts LOOP
      arr := COALESCE(doc -> r -> a, '[]'::jsonb);
      IF jsonb_typeof(arr) = 'array' AND arr ? 'authority-to-sell' THEN
        -- drop the retired key, then add the new one if it is not there yet
        SELECT COALESCE(jsonb_agg(v), '[]'::jsonb)
          INTO arr
          FROM jsonb_array_elements(arr) AS v
         WHERE v <> '"authority-to-sell"'::jsonb;

        IF NOT (arr ? 'sales-agreement') THEN
          arr := arr || '["sales-agreement"]'::jsonb;
        END IF;

        doc := jsonb_set(doc, ARRAY[r, a], arr, true);
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.app_settings
     SET value = doc::text, updated_at = now()
   WHERE key = 'permissions';
END $$;

-- The table itself is deliberately left in place. Agreements already signed are
-- a record of who authorised what, and dropping it would destroy them. Nothing
-- reads it any more; drop it by hand once the office is certain it is not
-- wanted:
--     DROP TABLE public.authority_to_sell;

-- ══════════════════════════════════════════════════════════════════════
-- 12) 20261112130000_expenses.sql
-- The monthly expense sheet: groups and the numbered entries inside them
-- ══════════════════════════════════════════════════════════════════════

-- The monthly expense sheet.
--
-- Two tables, because the sheet has two different things on it:
--
--   public.expense_groups  one thing money was spent on in a given month —
--                          "Fuel", "Office supplies", a particular repair.
--   public.expense_items   the numbered entries that make the group up:
--                          expense 1, 2, 3 … as many as the office needs.
--
-- ─── What is stored and what is computed ────────────────────────────────────
-- Stored per entry: description, amount, date, who it was paid to, how.
-- Computed in code (src/lib/expenses.ts), never stored:
--     group total    = Σ its entries' amounts
--     month total    = Σ every group's total
--     entry numbers  = position within the group
--
-- No totals column anywhere, on purpose. A stored total is one that can
-- disagree with its own parts the moment somebody edits an entry, and the whole
-- point of this page is that the arithmetic is right every time. The entry
-- number is positional for the same reason: deleting entry 2 renumbers the rest
-- rather than leaving a hole in the sheet.

-- ─── A group within one month ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Always the first day of the month, so months sort and filter as dates in
  -- SQL rather than as 'YYYY-MM' strings.
  period      DATE NOT NULL,
  name        TEXT NOT NULL,
  notes       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_groups_period
  ON public.expense_groups (period DESC, sort_order, name);

-- ─── The numbered entries inside it ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       UUID NOT NULL REFERENCES public.expense_groups(id) ON DELETE CASCADE,
  description    TEXT,
  amount         NUMERIC NOT NULL DEFAULT 0,
  -- The day the money actually went out, which need not be the day it was typed
  spent_on       DATE,
  paid_to        TEXT,
  payment_method TEXT,
  reference      TEXT,              -- receipt or transfer reference
  notes          TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Serves both "this group's entries in order" and the ON DELETE CASCADE
CREATE INDEX IF NOT EXISTS idx_expense_items_group
  ON public.expense_items (group_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_expense_items_spent_on
  ON public.expense_items (spent_on DESC);

-- ─── Keep updated_at honest ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_expense_groups_touch ON public.expense_groups;
CREATE TRIGGER trg_expense_groups_touch BEFORE UPDATE ON public.expense_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_expense_items_touch ON public.expense_items;
CREATE TRIGGER trg_expense_items_touch BEFORE UPDATE ON public.expense_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── Access ─────────────────────────────────────────────────────────────────
-- Authenticated only, and nothing at all for anon: this is the company's
-- spending. Who can open the page is decided by the permission matrix, and
-- 'expenses' is granted to nobody but admin by default (src/lib/permissions.ts)
-- — the same call made for payroll. An admin hands it to whoever keeps the
-- books by ticking the box in Settings.
ALTER TABLE public.expense_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access to expense groups" ON public.expense_groups;
CREATE POLICY "Authenticated full access to expense groups"
  ON public.expense_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated full access to expense items" ON public.expense_items;
CREATE POLICY "Authenticated full access to expense items"
  ON public.expense_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_items  TO authenticated;

-- ─── Realtime ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_groups;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;


COMMIT;

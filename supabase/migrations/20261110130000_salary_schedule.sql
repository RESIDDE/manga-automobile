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

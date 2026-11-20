-- ════════════════════════════════════════════════════════════════════════════
-- Staff Loan Application — the paper form, plus its link to the salary sheet
--
--   A. Staff information        B. Loan request
--   C. Declaration and consent  D. Management decision     + document checklist
--
-- Confidential: rows are sealed by the permission matrix (page key 'loans').
-- Admin always; other roles only when ticked in Settings → Permissions —
-- View to read, Add to file a new application, Edit to change one (and record
-- the management decision), Delete to remove one. Direct Sales Agents never.
--
-- Salary link: an APPROVED loan for a staff member on the roster writes its
-- figures onto that person's salary lines automatically, month by month:
--
--   month k of the loan (k = 0 at the first deduction month)
--     loan_amount     = approved amount
--     opening_balance = approved − k × monthly deduction   (never below 0)
--     deduction       = the smaller of the monthly deduction and what is left
--
-- so ₦2,100,000 at ₦200,000 a month is ten months of ₦200,000 then ₦100,000.
-- It happens in the database, so it holds however a line is made: added by
-- hand, copied forward from last month, or already on the sheet when the loan
-- is approved. Changing or declining a loan re-works every affected line.
-- ════════════════════════════════════════════════════════════════════════════

-- ─── Permission check by action, from the matrix the app uses ───────────────
CREATE OR REPLACE FUNCTION public.can_on_page(page TEXT, act TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  my_role TEXT;
  matrix  JSONB;
BEGIN
  IF public.is_app_admin() THEN RETURN TRUE; END IF;
  SELECT role::text INTO my_role FROM public.user_roles WHERE user_id = auth.uid();
  IF my_role IS NULL OR my_role = 'dsa' THEN RETURN FALSE; END IF;
  BEGIN
    SELECT value::text::jsonb INTO matrix FROM public.app_settings WHERE key = 'permissions';
  EXCEPTION WHEN others THEN
    RETURN FALSE;
  END;
  IF matrix IS NULL OR jsonb_typeof(matrix -> my_role -> act) <> 'array' THEN RETURN FALSE; END IF;
  RETURN (matrix -> my_role -> act) ? page;
END;
$$;
GRANT EXECUTE ON FUNCTION public.can_on_page(TEXT, TEXT) TO authenticated;

-- ─── The applications ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.staff_loans (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_no           TEXT,

  -- A. Staff information. staff_id links to the roster (needed for the salary
  -- link); the rest is a snapshot of what was written on the form.
  staff_id              UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  full_name             TEXT NOT NULL,
  staff_file_no         TEXT,
  job_title             TEXT,
  department            TEXT,
  date_of_employment    DATE,
  phone                 TEXT,
  residential_address   TEXT,
  next_of_kin           TEXT,

  -- B. Loan request
  amount_requested      NUMERIC NOT NULL DEFAULT 0,
  purpose               TEXT,
  preferred_months      INTEGER,
  proposed_deduction    NUMERIC,
  requested_disbursement_date DATE,

  -- C. Declaration and consent
  applicant_name        TEXT,
  applicant_signature   TEXT,
  applicant_sign_date   DATE,
  reviewer_name         TEXT,
  reviewer_signature    TEXT,
  reviewer_date         DATE,

  -- D. Management decision
  decision              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (decision IN ('pending', 'approved', 'approved_with_changes', 'declined')),
  approved_amount       NUMERIC,
  repayment_months      INTEGER CHECK (repayment_months IS NULL OR repayment_months > 0),
  monthly_deduction     NUMERIC CHECK (monthly_deduction IS NULL OR monthly_deduction >= 0),
  first_deduction_month DATE,          -- always the 1st of the month
  conditions            TEXT,
  manager_name          TEXT,
  manager_signature     TEXT,
  decision_date         DATE,

  -- Document checklist
  chk_staff_id          BOOLEAN NOT NULL DEFAULT false,
  chk_payslip           BOOLEAN NOT NULL DEFAULT false,
  chk_supporting        BOOLEAN NOT NULL DEFAULT false,

  created_by            UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_loans_staff   ON public.staff_loans (staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_loans_created ON public.staff_loans (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_staff_loans_no      ON public.staff_loans (document_no);

-- Its own run of form numbers: 001, 002, …
DROP TRIGGER IF EXISTS tr_staff_loans_document_no ON public.staff_loans;
CREATE TRIGGER tr_staff_loans_document_no BEFORE INSERT ON public.staff_loans
  FOR EACH ROW EXECUTE FUNCTION public.set_document_number('next_staff_loan_number');

-- First deduction month is always stored as the 1st
CREATE OR REPLACE FUNCTION public.staff_loans_normalise()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.first_deduction_month IS NOT NULL THEN
    NEW.first_deduction_month := date_trunc('month', NEW.first_deduction_month)::date;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tr_staff_loans_normalise ON public.staff_loans;
CREATE TRIGGER tr_staff_loans_normalise BEFORE INSERT OR UPDATE ON public.staff_loans
  FOR EACH ROW EXECUTE FUNCTION public.staff_loans_normalise();

ALTER TABLE public.staff_loans ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.staff_loans FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_loans TO authenticated;

DROP POLICY IF EXISTS "Loans: view"   ON public.staff_loans;
DROP POLICY IF EXISTS "Loans: add"    ON public.staff_loans;
DROP POLICY IF EXISTS "Loans: edit"   ON public.staff_loans;
DROP POLICY IF EXISTS "Loans: delete" ON public.staff_loans;
CREATE POLICY "Loans: view"   ON public.staff_loans FOR SELECT TO authenticated USING (public.can_on_page('loans', 'view'));
CREATE POLICY "Loans: add"    ON public.staff_loans FOR INSERT TO authenticated WITH CHECK (public.can_on_page('loans', 'create'));
CREATE POLICY "Loans: edit"   ON public.staff_loans FOR UPDATE TO authenticated
  USING (public.can_on_page('loans', 'edit')) WITH CHECK (public.can_on_page('loans', 'edit'));
CREATE POLICY "Loans: delete" ON public.staff_loans FOR DELETE TO authenticated USING (public.can_on_page('loans', 'delete'));

-- ─── Salary link ────────────────────────────────────────────────────────────
-- Marks salary figures that came from an approved loan, so they can be
-- re-worked (or cleared) when the loan changes, and shown as such on the sheet.
ALTER TABLE public.salary_lines ADD COLUMN IF NOT EXISTS loan_auto BOOLEAN NOT NULL DEFAULT false;

/** The loan figures for one person in one month, summed over their approved loans. */
CREATE OR REPLACE FUNCTION public.staff_loan_figures(p_staff UUID, p_period DATE)
RETURNS TABLE (loan_amount NUMERIC, opening_balance NUMERIC, deduction NUMERIC, loans INTEGER)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH active AS (
    SELECT
      l.approved_amount AS amount,
      l.monthly_deduction AS monthly,
      greatest(l.approved_amount
        - ((extract(year FROM p_period)::int - extract(year FROM l.first_deduction_month)::int) * 12
           + (extract(month FROM p_period)::int - extract(month FROM l.first_deduction_month)::int))
          * l.monthly_deduction, 0) AS opening,
      ((extract(year FROM p_period)::int - extract(year FROM l.first_deduction_month)::int) * 12
        + (extract(month FROM p_period)::int - extract(month FROM l.first_deduction_month)::int)) AS k,
      coalesce(l.repayment_months, ceil(l.approved_amount / nullif(l.monthly_deduction, 0))::int) AS months
    FROM public.staff_loans l
    WHERE l.staff_id = p_staff
      AND l.decision IN ('approved', 'approved_with_changes')
      AND coalesce(l.approved_amount, 0) > 0
      AND coalesce(l.monthly_deduction, 0) > 0
      AND l.first_deduction_month IS NOT NULL
  )
  SELECT
    coalesce(sum(amount), 0),
    coalesce(sum(opening), 0),
    coalesce(sum(least(monthly, opening)), 0),
    count(*)::int
  FROM active
  WHERE k >= 0 AND k < months AND opening > 0;
$$;

-- Fills a salary line from its person's approved loans when the line is made,
-- or when it is moved to another person or month.
CREATE OR REPLACE FUNCTION public.salary_line_apply_loans()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE f RECORD;
BEGIN
  IF NEW.staff_id IS NULL OR NEW.period IS NULL THEN
    IF NEW.loan_auto THEN
      NEW.loan_amount := 0; NEW.opening_balance := 0; NEW.deduction := 0; NEW.loan_auto := false;
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO f FROM public.staff_loan_figures(NEW.staff_id, date_trunc('month', NEW.period)::date);
  IF f.loans > 0 THEN
    NEW.loan_amount := f.loan_amount;
    NEW.opening_balance := f.opening_balance;
    NEW.deduction := f.deduction;
    NEW.loan_auto := true;
  ELSIF NEW.loan_auto THEN
    -- The loan that set these figures no longer covers this month
    NEW.loan_amount := 0; NEW.opening_balance := 0; NEW.deduction := 0; NEW.loan_auto := false;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS tr_salary_line_apply_loans ON public.salary_lines;
CREATE TRIGGER tr_salary_line_apply_loans
  BEFORE INSERT OR UPDATE OF staff_id, period ON public.salary_lines
  FOR EACH ROW EXECUTE FUNCTION public.salary_line_apply_loans();

-- Re-works every salary line of the people a loan change touches
CREATE OR REPLACE FUNCTION public.staff_loans_sync_salary()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- "SET staff_id = staff_id" fires the line trigger above without changing anything else
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.staff_id IS NOT NULL THEN
    UPDATE public.salary_lines SET staff_id = staff_id WHERE staff_id = OLD.staff_id;
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.staff_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.staff_id IS DISTINCT FROM OLD.staff_id) THEN
    UPDATE public.salary_lines SET staff_id = staff_id WHERE staff_id = NEW.staff_id;
  END IF;
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS tr_staff_loans_sync_salary ON public.staff_loans;
CREATE TRIGGER tr_staff_loans_sync_salary
  AFTER INSERT OR UPDATE OR DELETE ON public.staff_loans
  FOR EACH ROW EXECUTE FUNCTION public.staff_loans_sync_salary();

-- Realtime so the salary sheet refreshes when a loan is approved
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_loans;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Archived copies stay as confidential as the originals ──────────────────
-- Printing a loan form (or a salary sheet) files a Company Copy in the
-- Document Archive. Someone allowed into the archive is not necessarily
-- allowed to see loans or payroll, so those copies also need that page.
DROP POLICY IF EXISTS "Archive readers" ON public.document_archive;
CREATE POLICY "Archive readers" ON public.document_archive
  FOR SELECT TO authenticated
  USING (
    public.can_view_page('archive')
    AND (doc_type <> 'Staff Loan Application' OR public.can_on_page('loans', 'view'))
    AND (doc_type NOT ILIKE 'salary%' OR public.can_on_page('salary', 'view'))
  );

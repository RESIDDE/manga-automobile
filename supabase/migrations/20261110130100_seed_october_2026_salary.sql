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

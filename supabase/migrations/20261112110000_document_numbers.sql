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

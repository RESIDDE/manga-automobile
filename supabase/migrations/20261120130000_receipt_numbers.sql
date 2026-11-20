-- ════════════════════════════════════════════════════════════════════════════
-- Receipt numbers: one running sequence, 001, 002, 003 …
--
-- The box on the sales receipt used to show a code made from the record's id
-- and date ("RCT-2011-00S1"), which was not a sequence anyone could follow.
-- Now every receipt — the receipt for a sale, and the receipt for each
-- instalment — gets the next number the first time it is opened, printed or
-- downloaded, and keeps it for good. Reprints, the Document Archive copy and
-- the receipt records list all show that same number.
--
-- Sale and instalment receipts share one run (counter 'next_receipt_number'),
-- so the number alone identifies a receipt. Numbers are handed out under a row
-- lock, so two people printing at once never get the same one.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sales         ADD COLUMN IF NOT EXISTS receipt_no TEXT;
ALTER TABLE public.sale_payments ADD COLUMN IF NOT EXISTS receipt_no TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS sales_receipt_no_unique
  ON public.sales (receipt_no) WHERE receipt_no IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS sale_payments_receipt_no_unique
  ON public.sale_payments (receipt_no) WHERE receipt_no IS NOT NULL;

/**
 * The receipt number for a sale (p_payment NULL) or for one of its instalments.
 * Returns the number already issued, or issues the next one.
 */
CREATE OR REPLACE FUNCTION public.issue_receipt_number(p_sale UUID, p_payment UUID DEFAULT NULL)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current TEXT;
BEGIN
  IF auth.uid() IS NULL OR public.is_dsa() THEN
    RAISE EXCEPTION 'Not allowed to issue receipts';
  END IF;

  IF p_payment IS NOT NULL THEN
    SELECT receipt_no INTO current FROM public.sale_payments
     WHERE id = p_payment AND sale_id = p_sale
     FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found'; END IF;
    IF current IS NULL THEN
      current := public.next_document_number('next_receipt_number', 3);
      UPDATE public.sale_payments SET receipt_no = current WHERE id = p_payment;
    END IF;
  ELSE
    SELECT receipt_no INTO current FROM public.sales WHERE id = p_sale FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Sale not found'; END IF;
    IF current IS NULL THEN
      current := public.next_document_number('next_receipt_number', 3);
      UPDATE public.sales SET receipt_no = current WHERE id = p_sale;
    END IF;
  END IF;

  RETURN current;
END;
$$;
REVOKE ALL ON FUNCTION public.issue_receipt_number(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.issue_receipt_number(UUID, UUID) TO authenticated;

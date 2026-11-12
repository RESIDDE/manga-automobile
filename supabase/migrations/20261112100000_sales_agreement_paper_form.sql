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

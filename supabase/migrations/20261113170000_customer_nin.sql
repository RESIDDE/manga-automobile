-- ════════════════════════════════════════════════════════════════════════════
-- National Identification Number (NIN) — optional, wherever a person's details
-- are entered by hand.
--
--   customers.nin                    the customer record
--   performance_quotes.customer_nin  a proforma for a customer typed in by hand
--   sales_agreements.seller_nin      the seller on a sales agreement
--   sales_agreements.buyer_nin       the buyer on a sales agreement
--   property_intakes.nin             the client on a property intake form
--
-- (The consignment agreement already records the owner's NIN / ID number.)
-- All nullable: NIN is never required.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.customers          ADD COLUMN IF NOT EXISTS nin TEXT;
ALTER TABLE public.performance_quotes ADD COLUMN IF NOT EXISTS customer_nin TEXT;
ALTER TABLE public.sales_agreements   ADD COLUMN IF NOT EXISTS seller_nin TEXT;
ALTER TABLE public.sales_agreements   ADD COLUMN IF NOT EXISTS buyer_nin TEXT;
ALTER TABLE public.property_intakes   ADD COLUMN IF NOT EXISTS nin TEXT;

-- Finding a customer by NIN
CREATE INDEX IF NOT EXISTS idx_customers_nin ON public.customers (nin) WHERE nin IS NOT NULL;

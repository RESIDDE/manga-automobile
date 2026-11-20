-- ════════════════════════════════════════════════════════════════════════════
-- Proforma invoice: the colour of each car on the quote
--
-- Filled from the vehicle record when a stock car is picked, typed in for a
-- vehicle entered by hand. Optional; quotes saved before keep it blank.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.performance_quote_items
  ADD COLUMN IF NOT EXISTS color TEXT;

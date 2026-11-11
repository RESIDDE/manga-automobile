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

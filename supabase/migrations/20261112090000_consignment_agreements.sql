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

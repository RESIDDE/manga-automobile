-- Run this in your Supabase SQL Editor
-- Drop old table if it exists (no data yet)
DROP TABLE IF EXISTS public.authority_to_sell;

-- Create table matching official Bee Tee ATS document
CREATE TABLE public.authority_to_sell (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),

    -- Agreement meta
    agreement_date DATE DEFAULT CURRENT_DATE,

    -- Owner details
    customer_name TEXT NOT NULL,
    customer_address TEXT,
    customer_phone TEXT,
    customer_id_type TEXT,

    -- Vehicle details
    vehicle_make TEXT NOT NULL,
    vehicle_year_model TEXT,
    vehicle_color TEXT,
    vehicle_engine_number TEXT,
    vehicle_chassis TEXT,

    -- Authority terms
    valid_until DATE,
    note TEXT,

    -- Signature (Base64)
    signature TEXT,

    -- Audit
    created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.authority_to_sell ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users full access
CREATE POLICY "Authenticated users can manage ATS"
ON public.authority_to_sell FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Indexes for fast search
CREATE INDEX idx_ats_customer_name ON public.authority_to_sell (customer_name);
CREATE INDEX idx_ats_vehicle_make  ON public.authority_to_sell (vehicle_make);
CREATE INDEX idx_ats_date          ON public.authority_to_sell (agreement_date);

-- Add representative fields to authority_to_sell table
ALTER TABLE public.authority_to_sell 
ADD COLUMN IF NOT EXISTS rep_name TEXT,
ADD COLUMN IF NOT EXISTS rep_signature TEXT,
ADD COLUMN IF NOT EXISTS rep_signature_date DATE;

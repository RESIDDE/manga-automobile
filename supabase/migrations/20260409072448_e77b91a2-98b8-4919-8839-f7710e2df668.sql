ALTER TABLE public.repairs
  ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signature_data text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS signature_data text;
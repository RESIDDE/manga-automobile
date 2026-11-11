-- Add trim column to vehicles to store sub-model or variant information (e.g., LX 600)
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS trim TEXT;

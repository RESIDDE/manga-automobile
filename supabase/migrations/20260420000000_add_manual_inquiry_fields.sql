-- Add manual entry fields to inquiries table
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS manual_customer_name TEXT;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS manual_customer_phone TEXT;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS manual_customer_email TEXT;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS manual_vehicle_make TEXT;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS manual_vehicle_model TEXT;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS manual_vehicle_year TEXT;

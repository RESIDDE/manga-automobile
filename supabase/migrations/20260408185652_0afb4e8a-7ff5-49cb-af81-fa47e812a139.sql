
-- Add missing columns to vehicles table
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS date_arrived date,
  ADD COLUMN IF NOT EXISTS date_stored date,
  ADD COLUMN IF NOT EXISTS num_keys integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_company text,
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'Used';

-- Add unique constraint on VIN
ALTER TABLE public.vehicles
  ADD CONSTRAINT vehicles_vin_unique UNIQUE (vin);

-- Create vehicle_images table
CREATE TABLE public.vehicle_images (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vehicle images"
  ON public.vehicle_images FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Authenticated users can insert vehicle images"
  ON public.vehicle_images FOR INSERT
  TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can delete vehicle images"
  ON public.vehicle_images FOR DELETE
  TO authenticated USING (true);

-- Create storage bucket for vehicle images
INSERT INTO storage.buckets (id, name, public)
  VALUES ('vehicle-images', 'vehicle-images', true);

-- Storage RLS policies
CREATE POLICY "Authenticated users can upload vehicle images"
  ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'vehicle-images');

CREATE POLICY "Anyone can view vehicle images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vehicle-images');

CREATE POLICY "Authenticated users can update vehicle images"
  ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'vehicle-images');

CREATE POLICY "Authenticated users can delete vehicle images"
  ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'vehicle-images');

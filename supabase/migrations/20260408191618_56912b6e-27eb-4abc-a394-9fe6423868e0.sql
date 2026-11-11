
-- Drop existing policies and recreate for anon + authenticated

-- VEHICLES
DROP POLICY IF EXISTS "Authenticated users can delete vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can view vehicles" ON public.vehicles;

CREATE POLICY "Anyone can select vehicles" ON public.vehicles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert vehicles" ON public.vehicles FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update vehicles" ON public.vehicles FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Anyone can delete vehicles" ON public.vehicles FOR DELETE TO anon, authenticated USING (true);

-- VEHICLE_IMAGES
DROP POLICY IF EXISTS "Authenticated users can delete vehicle images" ON public.vehicle_images;
DROP POLICY IF EXISTS "Authenticated users can insert vehicle images" ON public.vehicle_images;
DROP POLICY IF EXISTS "Authenticated users can view vehicle images" ON public.vehicle_images;

CREATE POLICY "Anyone can select vehicle_images" ON public.vehicle_images FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert vehicle_images" ON public.vehicle_images FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can delete vehicle_images" ON public.vehicle_images FOR DELETE TO anon, authenticated USING (true);

-- CUSTOMERS
DROP POLICY IF EXISTS "Authenticated users can delete customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can view customers" ON public.customers;

CREATE POLICY "Anyone can select customers" ON public.customers FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert customers" ON public.customers FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update customers" ON public.customers FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Anyone can delete customers" ON public.customers FOR DELETE TO anon, authenticated USING (true);

-- SALES
DROP POLICY IF EXISTS "Authenticated users can delete sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can insert sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can update sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can view sales" ON public.sales;

CREATE POLICY "Anyone can select sales" ON public.sales FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert sales" ON public.sales FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update sales" ON public.sales FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Anyone can delete sales" ON public.sales FOR DELETE TO anon, authenticated USING (true);

-- INQUIRIES
DROP POLICY IF EXISTS "Authenticated users can delete inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Authenticated users can insert inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Authenticated users can update inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Authenticated users can view inquiries" ON public.inquiries;

CREATE POLICY "Anyone can select inquiries" ON public.inquiries FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert inquiries" ON public.inquiries FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update inquiries" ON public.inquiries FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Anyone can delete inquiries" ON public.inquiries FOR DELETE TO anon, authenticated USING (true);

-- STORAGE: allow anon uploads to vehicle-images bucket
DROP POLICY IF EXISTS "Authenticated users can upload vehicle images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update vehicle images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete vehicle images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view vehicle images" ON storage.objects;

CREATE POLICY "Anyone can view vehicle images" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'vehicle-images');
CREATE POLICY "Anyone can upload vehicle images" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'vehicle-images');
CREATE POLICY "Anyone can update vehicle images" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'vehicle-images');
CREATE POLICY "Anyone can delete vehicle images" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'vehicle-images');

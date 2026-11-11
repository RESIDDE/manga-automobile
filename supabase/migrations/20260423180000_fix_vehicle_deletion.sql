-- Fix foreign key constraints for vehicle deletion

-- 1. Sales table: Set vehicle_id to NULL when vehicle is deleted
-- Note: We use SET NULL here to preserve historical sales data if a vehicle is removed
ALTER TABLE public.sales 
DROP CONSTRAINT IF EXISTS sales_vehicle_id_fkey,
ADD CONSTRAINT sales_vehicle_id_fkey 
FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE SET NULL;

-- 2. Sale Vehicles table: Delete junction record when vehicle is deleted
ALTER TABLE public.sale_vehicles 
DROP CONSTRAINT IF EXISTS sale_vehicles_vehicle_id_fkey,
ADD CONSTRAINT sale_vehicles_vehicle_id_fkey 
FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;

-- 3. Inquiries table: Delete inquiry when vehicle is deleted
ALTER TABLE public.inquiries 
DROP CONSTRAINT IF EXISTS inquiries_vehicle_id_fkey,
ADD CONSTRAINT inquiries_vehicle_id_fkey 
FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;

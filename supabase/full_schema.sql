-- AMU Global Motors — full database schema
-- Generated 2026-10-30 from supabase/migrations — covers every page in the app
-- (vehicles, customers, sales, inquiries, inspections, repairs, invoices,
--  authority to sell, meetings/public booking, property intake, settings/roles).
--
-- Safe to re-run: every policy, trigger, index and constraint is dropped first
-- or guarded with IF NOT EXISTS, so running it on an existing database brings
-- it up to date without dropping any data.
--
-- Paste into the Supabase SQL Editor and run.


-- ============================================================
-- 20240101000000_core_tables.sql
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE IF NOT EXISTS public.customers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    address TEXT,
    notes TEXT,
    signature_data TEXT,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.vehicles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER NOT NULL,
    condition TEXT NOT NULL,
    status TEXT NOT NULL,
    price NUMERIC NOT NULL,
    cost_price NUMERIC,
    mileage NUMERIC,
    color TEXT,
    fuel_type TEXT,
    transmission TEXT,
    vin TEXT,
    description TEXT,
    image_url TEXT,
    source_company TEXT,
    num_keys INTEGER NOT NULL DEFAULT 0,
    date_arrived DATE,
    date_stored DATE,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sales (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    vehicle_id UUID REFERENCES public.vehicles(id),
    customer_id UUID REFERENCES public.customers(id),
    salesperson_id UUID,
    sale_price NUMERIC NOT NULL,
    sale_date TIMESTAMP WITH TIME ZONE NOT NULL,
    payment_status TEXT,
    payment_type TEXT,
    notes TEXT,
    buyer_signature TEXT,
    buyer_signature_date TIMESTAMP WITH TIME ZONE,
    rep_name TEXT,
    rep_signature TEXT,
    rep_signature_date TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sale_vehicles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sale_id UUID REFERENCES public.sales(id),
    vehicle_id UUID REFERENCES public.vehicles(id),
    price NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.inquiries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    vehicle_id UUID REFERENCES public.vehicles(id),
    customer_id UUID REFERENCES public.customers(id),
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    details JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Apply simple policies
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.customers;
CREATE POLICY "Enable all access for authenticated users" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.vehicles;
CREATE POLICY "Enable all access for authenticated users" ON public.vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.sales;
CREATE POLICY "Enable all access for authenticated users" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.sale_vehicles;
CREATE POLICY "Enable all access for authenticated users" ON public.sale_vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.inquiries;
CREATE POLICY "Enable all access for authenticated users" ON public.inquiries FOR ALL TO authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.audit_logs;
CREATE POLICY "Enable all access for authenticated users" ON public.audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================
-- 20260408185652_0afb4e8a-7ff5-49cb-af81-fa47e812a139.sql
-- ============================================================

-- Add missing columns to vehicles table
ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS date_arrived date,
  ADD COLUMN IF NOT EXISTS date_stored date,
  ADD COLUMN IF NOT EXISTS num_keys integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_company text,
  ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT 'Used';

-- Add unique constraint on VIN
ALTER TABLE public.vehicles
  DROP CONSTRAINT IF EXISTS vehicles_vin_unique,
  ADD CONSTRAINT vehicles_vin_unique UNIQUE (vin);

-- Create vehicle_images table
CREATE TABLE IF NOT EXISTS public.vehicle_images (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view vehicle images" ON public.vehicle_images;
CREATE POLICY "Authenticated users can view vehicle images"
  ON public.vehicle_images FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can insert vehicle images" ON public.vehicle_images;
CREATE POLICY "Authenticated users can insert vehicle images"
  ON public.vehicle_images FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can delete vehicle images" ON public.vehicle_images;
CREATE POLICY "Authenticated users can delete vehicle images"
  ON public.vehicle_images FOR DELETE
  TO authenticated USING (true);

-- Create storage bucket for vehicle images
INSERT INTO storage.buckets (id, name, public)
  VALUES ('vehicle-images', 'vehicle-images', true)
  ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies
DROP POLICY IF EXISTS "Authenticated users can upload vehicle images" ON storage.objects;
CREATE POLICY "Authenticated users can upload vehicle images"
  ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'vehicle-images');

DROP POLICY IF EXISTS "Anyone can view vehicle images" ON storage.objects;
CREATE POLICY "Anyone can view vehicle images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vehicle-images');

DROP POLICY IF EXISTS "Authenticated users can update vehicle images" ON storage.objects;
CREATE POLICY "Authenticated users can update vehicle images"
  ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'vehicle-images');

DROP POLICY IF EXISTS "Authenticated users can delete vehicle images" ON storage.objects;
CREATE POLICY "Authenticated users can delete vehicle images"
  ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'vehicle-images');


-- ============================================================
-- 20260408190000_additional_functions.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';


-- ============================================================
-- 20260408191618_56912b6e-27eb-4abc-a394-9fe6423868e0.sql
-- ============================================================

-- Drop existing policies and recreate for anon + authenticated

-- VEHICLES
DROP POLICY IF EXISTS "Authenticated users can delete vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Authenticated users can view vehicles" ON public.vehicles;

DROP POLICY IF EXISTS "Anyone can select vehicles" ON public.vehicles;
CREATE POLICY "Anyone can select vehicles" ON public.vehicles FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can insert vehicles" ON public.vehicles;
CREATE POLICY "Anyone can insert vehicles" ON public.vehicles FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update vehicles" ON public.vehicles;
CREATE POLICY "Anyone can update vehicles" ON public.vehicles FOR UPDATE TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can delete vehicles" ON public.vehicles;
CREATE POLICY "Anyone can delete vehicles" ON public.vehicles FOR DELETE TO anon, authenticated USING (true);

-- VEHICLE_IMAGES
DROP POLICY IF EXISTS "Authenticated users can delete vehicle images" ON public.vehicle_images;
DROP POLICY IF EXISTS "Authenticated users can insert vehicle images" ON public.vehicle_images;
DROP POLICY IF EXISTS "Authenticated users can view vehicle images" ON public.vehicle_images;

DROP POLICY IF EXISTS "Anyone can select vehicle_images" ON public.vehicle_images;
CREATE POLICY "Anyone can select vehicle_images" ON public.vehicle_images FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can insert vehicle_images" ON public.vehicle_images;
CREATE POLICY "Anyone can insert vehicle_images" ON public.vehicle_images FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete vehicle_images" ON public.vehicle_images;
CREATE POLICY "Anyone can delete vehicle_images" ON public.vehicle_images FOR DELETE TO anon, authenticated USING (true);

-- CUSTOMERS
DROP POLICY IF EXISTS "Authenticated users can delete customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can view customers" ON public.customers;

DROP POLICY IF EXISTS "Anyone can select customers" ON public.customers;
CREATE POLICY "Anyone can select customers" ON public.customers FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can insert customers" ON public.customers;
CREATE POLICY "Anyone can insert customers" ON public.customers FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update customers" ON public.customers;
CREATE POLICY "Anyone can update customers" ON public.customers FOR UPDATE TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can delete customers" ON public.customers;
CREATE POLICY "Anyone can delete customers" ON public.customers FOR DELETE TO anon, authenticated USING (true);

-- SALES
DROP POLICY IF EXISTS "Authenticated users can delete sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can insert sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can update sales" ON public.sales;
DROP POLICY IF EXISTS "Authenticated users can view sales" ON public.sales;

DROP POLICY IF EXISTS "Anyone can select sales" ON public.sales;
CREATE POLICY "Anyone can select sales" ON public.sales FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can insert sales" ON public.sales;
CREATE POLICY "Anyone can insert sales" ON public.sales FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update sales" ON public.sales;
CREATE POLICY "Anyone can update sales" ON public.sales FOR UPDATE TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can delete sales" ON public.sales;
CREATE POLICY "Anyone can delete sales" ON public.sales FOR DELETE TO anon, authenticated USING (true);

-- INQUIRIES
DROP POLICY IF EXISTS "Authenticated users can delete inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Authenticated users can insert inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Authenticated users can update inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Authenticated users can view inquiries" ON public.inquiries;

DROP POLICY IF EXISTS "Anyone can select inquiries" ON public.inquiries;
CREATE POLICY "Anyone can select inquiries" ON public.inquiries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can insert inquiries" ON public.inquiries;
CREATE POLICY "Anyone can insert inquiries" ON public.inquiries FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update inquiries" ON public.inquiries;
CREATE POLICY "Anyone can update inquiries" ON public.inquiries FOR UPDATE TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can delete inquiries" ON public.inquiries;
CREATE POLICY "Anyone can delete inquiries" ON public.inquiries FOR DELETE TO anon, authenticated USING (true);

-- STORAGE: allow anon uploads to vehicle-images bucket
DROP POLICY IF EXISTS "Authenticated users can upload vehicle images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update vehicle images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete vehicle images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view vehicle images" ON storage.objects;

CREATE POLICY "Anyone can view vehicle images" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'vehicle-images');
DROP POLICY IF EXISTS "Anyone can upload vehicle images" ON storage.objects;
CREATE POLICY "Anyone can upload vehicle images" ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'vehicle-images');
DROP POLICY IF EXISTS "Anyone can update vehicle images" ON storage.objects;
CREATE POLICY "Anyone can update vehicle images" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'vehicle-images');
DROP POLICY IF EXISTS "Anyone can delete vehicle images" ON storage.objects;
CREATE POLICY "Anyone can delete vehicle images" ON storage.objects FOR DELETE TO anon, authenticated USING (bucket_id = 'vehicle-images');


-- ============================================================
-- 20260408195003_d072764a-dfe3-485d-8be5-eda56eee16b5.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  inspector_name TEXT NOT NULL,
  condition_at_pickup TEXT NOT NULL,
  pickup_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  signature_data TEXT,
  returned_in_good_condition BOOLEAN NOT NULL DEFAULT false,
  return_condition_notes TEXT,
  return_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can select inspections" ON public.inspections;
CREATE POLICY "Anyone can select inspections" ON public.inspections FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can insert inspections" ON public.inspections;
CREATE POLICY "Anyone can insert inspections" ON public.inspections FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update inspections" ON public.inspections;
CREATE POLICY "Anyone can update inspections" ON public.inspections FOR UPDATE TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can delete inspections" ON public.inspections;
CREATE POLICY "Anyone can delete inspections" ON public.inspections FOR DELETE TO anon, authenticated USING (true);

DROP TRIGGER IF EXISTS update_inspections_updated_at ON public.inspections;
CREATE TRIGGER update_inspections_updated_at
  BEFORE UPDATE ON public.inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 20260409065058_b892fded-7168-47d9-a598-507c0f4df6df.sql
-- ============================================================

CREATE TABLE IF NOT EXISTS public.repairs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  model_year INTEGER,
  unit TEXT,
  condition TEXT,
  company TEXT,
  replacement_parts TEXT,
  damaged_parts TEXT,
  to_be_resprayed BOOLEAN NOT NULL DEFAULT false,
  repair_cost NUMERIC DEFAULT 0,
  payment_status TEXT DEFAULT 'deposit',
  payment_type TEXT DEFAULT 'cash',
  brought_in_by TEXT,
  handed_to TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can select repairs" ON public.repairs;
CREATE POLICY "Anyone can select repairs" ON public.repairs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can insert repairs" ON public.repairs;
CREATE POLICY "Anyone can insert repairs" ON public.repairs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update repairs" ON public.repairs;
CREATE POLICY "Anyone can update repairs" ON public.repairs FOR UPDATE TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can delete repairs" ON public.repairs;
CREATE POLICY "Anyone can delete repairs" ON public.repairs FOR DELETE TO anon, authenticated USING (true);

DROP TRIGGER IF EXISTS update_repairs_updated_at ON public.repairs;
CREATE TRIGGER update_repairs_updated_at
  BEFORE UPDATE ON public.repairs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 20260409072448_e77b91a2-98b8-4919-8839-f7710e2df668.sql
-- ============================================================
ALTER TABLE public.repairs
  ADD COLUMN IF NOT EXISTS deposit_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS signature_data text;

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS signature_data text;

-- ============================================================
-- 20260410045930_6e4126cf-86ad-49db-b45d-63f84c9d8622.sql
-- ============================================================

-- Add missing columns to repairs for invoice linking
ALTER TABLE public.repairs ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.repairs ADD COLUMN IF NOT EXISTS manual_make text;
ALTER TABLE public.repairs ADD COLUMN IF NOT EXISTS manual_model text;
ALTER TABLE public.repairs ADD COLUMN IF NOT EXISTS manual_year text;

-- Create invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number text NOT NULL,
  customer_id uuid NOT NULL REFERENCES public.customers(id),
  sale_id uuid REFERENCES public.sales(id),
  invoice_type text NOT NULL DEFAULT 'sale',
  status text NOT NULL DEFAULT 'draft',
  subtotal numeric NOT NULL DEFAULT 0,
  tax numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  notes text,
  due_date date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can select invoices" ON public.invoices;
CREATE POLICY "Anyone can select invoices" ON public.invoices FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can insert invoices" ON public.invoices;
CREATE POLICY "Anyone can insert invoices" ON public.invoices FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can update invoices" ON public.invoices;
CREATE POLICY "Anyone can update invoices" ON public.invoices FOR UPDATE TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can delete invoices" ON public.invoices;
CREATE POLICY "Anyone can delete invoices" ON public.invoices FOR DELETE TO anon, authenticated USING (true);

DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create invoice_repairs junction table
CREATE TABLE IF NOT EXISTS public.invoice_repairs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  repair_id uuid NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(invoice_id, repair_id)
);

ALTER TABLE public.invoice_repairs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can select invoice_repairs" ON public.invoice_repairs;
CREATE POLICY "Anyone can select invoice_repairs" ON public.invoice_repairs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "Anyone can insert invoice_repairs" ON public.invoice_repairs;
CREATE POLICY "Anyone can insert invoice_repairs" ON public.invoice_repairs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Anyone can delete invoice_repairs" ON public.invoice_repairs;
CREATE POLICY "Anyone can delete invoice_repairs" ON public.invoice_repairs FOR DELETE TO anon, authenticated USING (true);


-- ============================================================
-- 20260412000000_auth_roles_rls.sql
-- ============================================================
-- 1. Create app_role enum
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('admin', 'sales', 'mechanic', 'super_admin');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create user_roles table
CREATE TABLE IF NOT EXISTS public.user_roles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  role app_role not null default 'mechanic'
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;


-- 3. Create has_role() function
CREATE OR REPLACE FUNCTION public.has_role(checking_role app_role)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid()
    AND role = checking_role
  );
$$;

DROP POLICY IF EXISTS "Users can view their own role" ON public.user_roles;
CREATE POLICY "Users can view their own role" ON public.user_roles
FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view and edit all roles" ON public.user_roles;
CREATE POLICY "Admins can view and edit all roles" ON public.user_roles
FOR ALL TO authenticated USING (public.has_role('admin'));

-- 4. Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  display_name text,
  avatar_url text,
  phone text
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public profiles are viewable by authenticated" ON public.profiles;
CREATE POLICY "Public profiles are viewable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- 5. Trigger for new users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  first_user boolean;
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, display_name, phone)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone');

  -- Insert role (temporarily make everyone admin as requested)
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin');

  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();


-- 6. Tighten RLS on all tables
-- VEHICLES
DROP POLICY IF EXISTS "Anyone can select vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Anyone can insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Anyone can update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Anyone can delete vehicles" ON public.vehicles;

DROP POLICY IF EXISTS "Authenticated can select vehicles" ON public.vehicles;
CREATE POLICY "Authenticated can select vehicles" ON public.vehicles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can insert vehicles" ON public.vehicles;
CREATE POLICY "Authenticated can insert vehicles" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can update vehicles" ON public.vehicles;
CREATE POLICY "Authenticated can update vehicles" ON public.vehicles FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can delete vehicles" ON public.vehicles;
CREATE POLICY "Authenticated can delete vehicles" ON public.vehicles FOR DELETE TO authenticated USING (true);

-- CUSTOMERS
DROP POLICY IF EXISTS "Anyone can select customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can update customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can delete customers" ON public.customers;

DROP POLICY IF EXISTS "Authenticated can select customers" ON public.customers;
CREATE POLICY "Authenticated can select customers" ON public.customers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can insert customers" ON public.customers;
CREATE POLICY "Authenticated can insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can update customers" ON public.customers;
CREATE POLICY "Authenticated can update customers" ON public.customers FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can delete customers" ON public.customers;
CREATE POLICY "Authenticated can delete customers" ON public.customers FOR DELETE TO authenticated USING (true);

-- SALES
DROP POLICY IF EXISTS "Anyone can select sales" ON public.sales;
DROP POLICY IF EXISTS "Anyone can insert sales" ON public.sales;
DROP POLICY IF EXISTS "Anyone can update sales" ON public.sales;
DROP POLICY IF EXISTS "Anyone can delete sales" ON public.sales;

DROP POLICY IF EXISTS "Authenticated can select sales" ON public.sales;
CREATE POLICY "Authenticated can select sales" ON public.sales FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can insert sales" ON public.sales;
CREATE POLICY "Authenticated can insert sales" ON public.sales FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can update sales" ON public.sales;
CREATE POLICY "Authenticated can update sales" ON public.sales FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can delete sales" ON public.sales;
CREATE POLICY "Authenticated can delete sales" ON public.sales FOR DELETE TO authenticated USING (true);

-- INQUIRIES
DROP POLICY IF EXISTS "Anyone can select inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Anyone can insert inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Anyone can update inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Anyone can delete inquiries" ON public.inquiries;

DROP POLICY IF EXISTS "Authenticated can select inquiries" ON public.inquiries;
CREATE POLICY "Authenticated can select inquiries" ON public.inquiries FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can insert inquiries" ON public.inquiries;
CREATE POLICY "Authenticated can insert inquiries" ON public.inquiries FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can update inquiries" ON public.inquiries;
CREATE POLICY "Authenticated can update inquiries" ON public.inquiries FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can delete inquiries" ON public.inquiries;
CREATE POLICY "Authenticated can delete inquiries" ON public.inquiries FOR DELETE TO authenticated USING (true);

-- REPAIRS
DROP POLICY IF EXISTS "Anyone can select repairs" ON public.repairs;
DROP POLICY IF EXISTS "Anyone can insert repairs" ON public.repairs;
DROP POLICY IF EXISTS "Anyone can update repairs" ON public.repairs;
DROP POLICY IF EXISTS "Anyone can delete repairs" ON public.repairs;

DROP POLICY IF EXISTS "Authenticated can select repairs" ON public.repairs;
CREATE POLICY "Authenticated can select repairs" ON public.repairs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can insert repairs" ON public.repairs;
CREATE POLICY "Authenticated can insert repairs" ON public.repairs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can update repairs" ON public.repairs;
CREATE POLICY "Authenticated can update repairs" ON public.repairs FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can delete repairs" ON public.repairs;
CREATE POLICY "Authenticated can delete repairs" ON public.repairs FOR DELETE TO authenticated USING (true);

-- INVOICES
DROP POLICY IF EXISTS "Anyone can select invoices" ON public.invoices;
DROP POLICY IF EXISTS "Anyone can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Anyone can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Anyone can delete invoices" ON public.invoices;

DROP POLICY IF EXISTS "Authenticated can select invoices" ON public.invoices;
CREATE POLICY "Authenticated can select invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can insert invoices" ON public.invoices;
CREATE POLICY "Authenticated can insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can update invoices" ON public.invoices;
CREATE POLICY "Authenticated can update invoices" ON public.invoices FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can delete invoices" ON public.invoices;
CREATE POLICY "Authenticated can delete invoices" ON public.invoices FOR DELETE TO authenticated USING (true);

-- INVOICE_REPAIRS
DROP POLICY IF EXISTS "Anyone can select invoice_repairs" ON public.invoice_repairs;
DROP POLICY IF EXISTS "Anyone can insert invoice_repairs" ON public.invoice_repairs;
DROP POLICY IF EXISTS "Anyone can update invoice_repairs" ON public.invoice_repairs;
DROP POLICY IF EXISTS "Anyone can delete invoice_repairs" ON public.invoice_repairs;

DROP POLICY IF EXISTS "Authenticated can select invoice_repairs" ON public.invoice_repairs;
CREATE POLICY "Authenticated can select invoice_repairs" ON public.invoice_repairs FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can insert invoice_repairs" ON public.invoice_repairs;
CREATE POLICY "Authenticated can insert invoice_repairs" ON public.invoice_repairs FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can update invoice_repairs" ON public.invoice_repairs;
CREATE POLICY "Authenticated can update invoice_repairs" ON public.invoice_repairs FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can delete invoice_repairs" ON public.invoice_repairs;
CREATE POLICY "Authenticated can delete invoice_repairs" ON public.invoice_repairs FOR DELETE TO authenticated USING (true);

-- INSPECTIONS
DROP POLICY IF EXISTS "Anyone can select inspections" ON public.inspections;
DROP POLICY IF EXISTS "Anyone can insert inspections" ON public.inspections;
DROP POLICY IF EXISTS "Anyone can update inspections" ON public.inspections;
DROP POLICY IF EXISTS "Anyone can delete inspections" ON public.inspections;

DROP POLICY IF EXISTS "Authenticated can select inspections" ON public.inspections;
CREATE POLICY "Authenticated can select inspections" ON public.inspections FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can insert inspections" ON public.inspections;
CREATE POLICY "Authenticated can insert inspections" ON public.inspections FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "Authenticated can update inspections" ON public.inspections;
CREATE POLICY "Authenticated can update inspections" ON public.inspections FOR UPDATE TO authenticated USING (true);
DROP POLICY IF EXISTS "Authenticated can delete inspections" ON public.inspections;
CREATE POLICY "Authenticated can delete inspections" ON public.inspections FOR DELETE TO authenticated USING (true);

-- 7. Public Lookup Function for Customer Portal
CREATE OR REPLACE FUNCTION public.get_customer_portal_data(lookup_phone text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  cust_record record;
  repairs_data json;
  invoices_data json;
BEGIN
  -- 1. Find customer by phone
  SELECT id, name, phone INTO cust_record FROM public.customers WHERE phone = lookup_phone LIMIT 1;
  
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- 2. Get repairs
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', r.id,
      'condition', r.condition,
      'unit', r.unit,
      'repair_cost', r.repair_cost,
      'payment_status', r.payment_status,
      'created_at', r.created_at,
      'vehicle', json_build_object('make', v.make, 'model', v.model, 'year', v.year),
      'manual_make', r.manual_make,
      'manual_model', r.manual_model
    )
  ), '[]'::json) INTO repairs_data
  FROM public.repairs r
  LEFT JOIN public.vehicles v ON v.id = r.vehicle_id
  WHERE r.customer_id = cust_record.id;

  -- 3. Get invoices
  SELECT COALESCE(json_agg(
    json_build_object(
      'id', i.id,
      'invoice_number', i.invoice_number,
      -- keys the Customer Portal reads, mapped onto the real invoices columns
      'total_amount', i.total,
      'amount_paid', NULL,
      'status', i.status,
      'created_at', i.created_at,
      'type', i.invoice_type
    )
  ), '[]'::json) INTO invoices_data
  FROM public.invoices i
  WHERE i.customer_id = cust_record.id;

  RETURN json_build_object(
    'customer', json_build_object('id', cust_record.id, 'name', cust_record.name, 'phone', cust_record.phone),
    'repairs', repairs_data,
    'invoices', invoices_data
  );
END;
$$;


-- ============================================================
-- 20260416103100_add_job_card_fields.sql
-- ============================================================
-- Overhaul Repairs table for Job Card requirements
ALTER TABLE public.repairs 
ADD COLUMN IF NOT EXISTS job_card_no TEXT,
ADD COLUMN IF NOT EXISTS expected_delivery_date DATE,
ADD COLUMN IF NOT EXISTS service_supervisor TEXT,
ADD COLUMN IF NOT EXISTS technician_assigned TEXT,
ADD COLUMN IF NOT EXISTS registration_no TEXT,
ADD COLUMN IF NOT EXISTS vin_chassis TEXT,
ADD COLUMN IF NOT EXISTS mileage TEXT,
ADD COLUMN IF NOT EXISTS fuel_level TEXT,
ADD COLUMN IF NOT EXISTS condition_check JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS inspection_notes TEXT,
ADD COLUMN IF NOT EXISTS customer_complaint TEXT,
ADD COLUMN IF NOT EXISTS painting_bodywork JSONB DEFAULT '{"items": [], "details": ""}'::jsonb,
ADD COLUMN IF NOT EXISTS mechanical_service JSONB DEFAULT '{"items": [], "details": ""}'::jsonb,
ADD COLUMN IF NOT EXISTS parts_to_replace TEXT,
ADD COLUMN IF NOT EXISTS parts_total NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS labour_total NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS other_charges NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS vat NUMERIC DEFAULT 0,
ADD COLUMN IF NOT EXISTS date_out DATE,
ADD COLUMN IF NOT EXISTS checked_by TEXT;

-- Update RLS if needed (re-applying standard project policies)
ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.repairs;
CREATE POLICY "Enable all access for authenticated users" ON public.repairs 
FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- ============================================================
-- 20260416103150_authority_to_sell_setup.sql
-- ============================================================
-- Run this in your Supabase SQL Editor
-- NOTE: the original migration dropped this table first ("no data yet").
-- That DROP is removed here so re-running the script never destroys existing
-- Authority to Sell records. On a fresh project CREATE TABLE below does the work.

-- Create table matching official Bee Tee ATS document
CREATE TABLE IF NOT EXISTS public.authority_to_sell (
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
DROP POLICY IF EXISTS "Authenticated users can manage ATS" ON public.authority_to_sell;
CREATE POLICY "Authenticated users can manage ATS"
ON public.authority_to_sell FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

-- Indexes for fast search
CREATE INDEX IF NOT EXISTS idx_ats_customer_name ON public.authority_to_sell (customer_name);
CREATE INDEX IF NOT EXISTS idx_ats_vehicle_make  ON public.authority_to_sell (vehicle_make);
CREATE INDEX IF NOT EXISTS idx_ats_date          ON public.authority_to_sell (agreement_date);


-- ============================================================
-- 20260416103200_ats_rep_fields.sql
-- ============================================================
-- Add representative fields to authority_to_sell table
ALTER TABLE public.authority_to_sell 
ADD COLUMN IF NOT EXISTS rep_name TEXT,
ADD COLUMN IF NOT EXISTS rep_signature TEXT,
ADD COLUMN IF NOT EXISTS rep_signature_date DATE;


-- ============================================================
-- 20260416103401_fix_trigger.sql
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  first_user boolean;
BEGIN
  -- Insert profile using id instead of user_id to match the table schema
  INSERT INTO public.profiles (id, display_name, phone)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone');

  -- Insert role (temporarily make everyone admin as requested)
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin');

  RETURN new;
END;
$$;


-- ============================================================
-- 20260416103501_add_super_admin_enum.sql
-- ============================================================
-- Run ALTER TYPE in a separate standalone transaction
-- (already included in the CREATE TYPE above; ALTER TYPE ADD VALUE cannot be
-- used in the same transaction that references the new value)
-- ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';


-- ============================================================
-- 20260416103502_assign_super_admin.sql
-- ============================================================
DO $$
DECLARE
  target_user_id uuid;
BEGIN
  -- We use ILIKE just in case of casing issues
  -- <<< CHANGE the address below to your own login email
  SELECT id INTO target_user_id
  FROM auth.users
  WHERE email ILIKE 'samcuzzy39@gmail.com'
  LIMIT 1;
  IF target_user_id IS NOT NULL THEN
    UPDATE public.user_roles SET role = 'super_admin' WHERE user_id = target_user_id;
  END IF;
END $$;


-- ============================================================
-- 20260419130000_public_signature_rls.sql
-- ============================================================
-- 1. Allow public (anonymous) users to select specific records for signing previews
-- This is needed for SignSale.tsx to show what the customer is signing
DROP POLICY IF EXISTS "Allow public select for signing on sales" ON public.sales;
CREATE POLICY "Allow public select for signing on sales" ON public.sales
FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Allow public select for signing on sale_vehicles" ON public.sale_vehicles;
CREATE POLICY "Allow public select for signing on sale_vehicles" ON public.sale_vehicles
FOR SELECT TO anon USING (true);

-- Customers select is needed to show the buyer name on the sale signing page
DROP POLICY IF EXISTS "Allow public select for signing on customers" ON public.customers;
CREATE POLICY "Allow public select for signing on customers" ON public.customers
FOR SELECT TO anon USING (true);

-- Vehicles select is needed for the preview in SignSale
DROP POLICY IF EXISTS "Allow public select for signing on vehicles" ON public.vehicles;
CREATE POLICY "Allow public select for signing on vehicles" ON public.vehicles
FOR SELECT TO anon USING (true);

-- Inspections select for preview
DROP POLICY IF EXISTS "Allow public select for signing on inspections" ON public.inspections;
CREATE POLICY "Allow public select for signing on inspections" ON public.inspections
FOR SELECT TO anon USING (true);

-- Repairs select for preview
DROP POLICY IF EXISTS "Allow public select for signing on repairs" ON public.repairs;
CREATE POLICY "Allow public select for signing on repairs" ON public.repairs
FOR SELECT TO anon USING (true);


-- 2. Allow public (anonymous) users to update ONLY the signature-related fields
-- Restricted by ID (since they need the link)

-- Repairs signature
DROP POLICY IF EXISTS "Allow public signature update on repairs" ON public.repairs;
CREATE POLICY "Allow public signature update on repairs" ON public.repairs
FOR UPDATE TO anon 
USING (true) 
WITH CHECK (true);

-- Customers signature
DROP POLICY IF EXISTS "Allow public signature update on customers" ON public.customers;
CREATE POLICY "Allow public signature update on customers" ON public.customers
FOR UPDATE TO anon 
USING (true) 
WITH CHECK (true);

-- Inspections signature
DROP POLICY IF EXISTS "Allow public signature update on inspections" ON public.inspections;
CREATE POLICY "Allow public signature update on inspections" ON public.inspections
FOR UPDATE TO anon 
USING (true) 
WITH CHECK (true);

-- Sales (Buyer) signature
DROP POLICY IF EXISTS "Allow public signature update on sales" ON public.sales;
CREATE POLICY "Allow public signature update on sales" ON public.sales
FOR UPDATE TO anon 
USING (true) 
WITH CHECK (true);


-- ============================================================
-- 20260420000000_add_manual_inquiry_fields.sql
-- ============================================================
-- Add manual entry fields to inquiries table
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS manual_customer_name TEXT;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS manual_customer_phone TEXT;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS manual_customer_email TEXT;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS manual_vehicle_make TEXT;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS manual_vehicle_model TEXT;
ALTER TABLE public.inquiries ADD COLUMN IF NOT EXISTS manual_vehicle_year TEXT;


-- ============================================================
-- 20260421000000_meeting_booking.sql
-- ============================================================
-- Create meetings table
CREATE TABLE IF NOT EXISTS public.meetings (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    full_name TEXT NOT NULL,
    contact_info TEXT NOT NULL,
    intent TEXT NOT NULL,
    proposal_url TEXT,
    booking_date TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected', 'Completed')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;

-- Policies for meetings
DROP POLICY IF EXISTS "Enable insert for everyone" ON public.meetings;
CREATE POLICY "Enable insert for everyone" ON public.meetings FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.meetings;
CREATE POLICY "Enable all access for authenticated users" ON public.meetings FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage bucket for proposals
INSERT INTO storage.buckets (id, name, public) 
VALUES ('proposals', 'proposals', false)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for proposals
DROP POLICY IF EXISTS "Public Upload" ON storage.objects;
CREATE POLICY "Public Upload"
ON storage.objects FOR INSERT
TO public
WITH CHECK (bucket_id = 'proposals');

DROP POLICY IF EXISTS "Authenticated Read" ON storage.objects;
CREATE POLICY "Authenticated Read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'proposals');

DROP POLICY IF EXISTS "Authenticated Manage" ON storage.objects;
CREATE POLICY "Authenticated Manage"
ON storage.objects FOR ALL
TO authenticated
USING (bucket_id = 'proposals')
WITH CHECK (bucket_id = 'proposals');


-- ============================================================
-- 20260421060300_fix_customer_deletion.sql
-- ============================================================
-- Fix foreign key constraints for customer deletion

-- 1. Sales table: Set customer_id to NULL when customer is deleted
ALTER TABLE public.sales 
DROP CONSTRAINT IF EXISTS sales_customer_id_fkey,
ADD CONSTRAINT sales_customer_id_fkey 
FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- 2. Inquiries table: Delete inquiry when customer is deleted
ALTER TABLE public.inquiries 
DROP CONSTRAINT IF EXISTS inquiries_customer_id_fkey,
ADD CONSTRAINT inquiries_customer_id_fkey 
FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE;

-- 3. Repairs table: Set customer_id to NULL when customer is deleted
ALTER TABLE public.repairs 
DROP CONSTRAINT IF EXISTS repairs_customer_id_fkey,
ADD CONSTRAINT repairs_customer_id_fkey 
FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;

-- 4. Invoices table: Set customer_id to NULL and make column nullable
ALTER TABLE public.invoices ALTER COLUMN customer_id DROP NOT NULL;
ALTER TABLE public.invoices 
DROP CONSTRAINT IF EXISTS invoices_customer_id_fkey,
ADD CONSTRAINT invoices_customer_id_fkey 
FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL;


-- ============================================================
-- 20260423180000_fix_vehicle_deletion.sql
-- ============================================================
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


-- ============================================================
-- 20260423213000_add_vehicle_trim.sql
-- ============================================================
-- Add trim column to vehicles to store sub-model or variant information (e.g., LX 600)
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS trim TEXT;


-- ============================================================
-- 20260423220000_sequential_sale_numbers.sql
-- ============================================================
-- 1. Add sale_number column to sales
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sale_number TEXT;

-- 2. Create app_settings table
CREATE TABLE IF NOT EXISTS public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Initialize next_sale_number
INSERT INTO public.app_settings (key, value) 
VALUES ('next_sale_number', '1') 
ON CONFLICT (key) DO NOTHING;

-- 4. Create function to generate and increment sale number
CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS TRIGGER AS $$
DECLARE
    current_num INT;
    formatted_num TEXT;
BEGIN
    -- Only generate if sale_number is null
    IF NEW.sale_number IS NULL THEN
        -- Get current value and lock row for update
        SELECT value::INT INTO current_num 
        FROM public.app_settings 
        WHERE key = 'next_sale_number' 
        FOR UPDATE;
        
        -- If not found, default to 1
        IF current_num IS NULL THEN
            current_num := 1;
            INSERT INTO public.app_settings (key, value) VALUES ('next_sale_number', '2');
        ELSE
            -- Increment value in settings
            UPDATE public.app_settings 
            SET value = (current_num + 1)::TEXT, updated_at = now() 
            WHERE key = 'next_sale_number';
        END IF;

        -- Format number with leading zeros (e.g., 001)
        formatted_num := LPAD(current_num::TEXT, 3, '0');
        NEW.sale_number := formatted_num;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger
DROP TRIGGER IF EXISTS tr_generate_sale_number ON public.sales;
CREATE TRIGGER tr_generate_sale_number
BEFORE INSERT ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.generate_sale_number();

-- 6. Enable RLS on app_settings (if not already enabled)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
DROP POLICY IF EXISTS "Super Admin full access to app_settings" ON public.app_settings;
CREATE POLICY "Super Admin full access to app_settings" ON public.app_settings
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role = 'super_admin'
    )
);

DROP POLICY IF EXISTS "Authenticated users can read app_settings" ON public.app_settings;
CREATE POLICY "Authenticated users can read app_settings" ON public.app_settings
FOR SELECT
TO authenticated
USING (true);


-- ============================================================
-- 20260425185000_fix_audit_logs_fk.sql
-- ============================================================
-- Add foreign key constraint to audit_logs.user_id to enable joins with profiles
ALTER TABLE public.audit_logs 
  DROP CONSTRAINT IF EXISTS fk_audit_logs_user_id,
  ADD CONSTRAINT fk_audit_logs_user_id 
  FOREIGN KEY (user_id) 
  REFERENCES public.profiles(id) 
  ON DELETE SET NULL;


-- ============================================================
-- 20260425192000_fix_super_admin_rls.sql
-- ============================================================
-- Update user_roles policy to allow super_admin
DROP POLICY IF EXISTS "Admins can view and edit all roles" ON public.user_roles;

DROP POLICY IF EXISTS "Admins and Super Admins can view and edit all roles" ON public.user_roles;
CREATE POLICY "Admins and Super Admins can view and edit all roles" ON public.user_roles
FOR ALL TO authenticated 
USING (
  public.has_role('admin') OR public.has_role('super_admin')
)
WITH CHECK (
  public.has_role('admin') OR public.has_role('super_admin')
);

-- Update profiles policy to allow super_admin and admin to manage all profiles
-- (Select is already allowed for all authenticated users)
DROP POLICY IF EXISTS "Admins and Super Admins can manage all profiles" ON public.profiles;

CREATE POLICY "Admins and Super Admins can manage all profiles" ON public.profiles
FOR ALL TO authenticated
USING (
  public.has_role('admin') OR public.has_role('super_admin')
)
WITH CHECK (
  public.has_role('admin') OR public.has_role('super_admin')
);


-- ============================================================
-- 20260426120000_fix_sale_deletion.sql
-- ============================================================
-- Fix foreign key constraints for sales deletion
-- This allows deleting a sale record by automatically cleaning up linked records in sale_vehicles
-- and setting the sale_id to NULL in invoices (to preserve the invoice history).

-- 1. Sale Vehicles table: Delete junction records when sale is deleted
ALTER TABLE public.sale_vehicles 
DROP CONSTRAINT IF EXISTS sale_vehicles_sale_id_fkey,
ADD CONSTRAINT sale_vehicles_sale_id_fkey 
FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE CASCADE;

-- 2. Invoices table: Set sale_id to NULL when sale is deleted
-- (We keep the invoice record but detach it from the deleted sale)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'invoices') THEN
        ALTER TABLE public.invoices 
        DROP CONSTRAINT IF EXISTS invoices_sale_id_fkey,
        ADD CONSTRAINT invoices_sale_id_fkey 
        FOREIGN KEY (sale_id) REFERENCES public.sales(id) ON DELETE SET NULL;
    END IF;
END $$;


-- ============================================================
-- 20260426122400_update_sale_number_padding.sql
-- ============================================================
-- Update sale number formatting to 5 digits
CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS TRIGGER AS $$
DECLARE
    current_num INT;
    formatted_num TEXT;
BEGIN
    -- Only generate if sale_number is null
    IF NEW.sale_number IS NULL THEN
        -- Get current value and lock row for update
        SELECT value::INT INTO current_num 
        FROM public.app_settings 
        WHERE key = 'next_sale_number' 
        FOR UPDATE;
        
        -- If not found, default to 1
        IF current_num IS NULL THEN
            current_num := 1;
            INSERT INTO public.app_settings (key, value) VALUES ('next_sale_number', '2');
        ELSE
            -- Increment value in settings
            UPDATE public.app_settings 
            SET value = (current_num + 1)::TEXT, updated_at = now() 
            WHERE key = 'next_sale_number';
        END IF;

        -- Format number with 5 leading zeros (e.g., 00001) to match user image
        formatted_num := LPAD(current_num::TEXT, 5, '0');
        NEW.sale_number := formatted_num;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================
-- 20261023120000_property_intake.sql
-- ============================================================
-- Property Intake & Inspection Form — mirrors the paper form (Form No. 0005 series)

CREATE TABLE IF NOT EXISTS public.property_intakes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),

    -- Form meta
    form_number TEXT,
    form_date DATE DEFAULT CURRENT_DATE,

    -- 1-3. Information
    full_name TEXT NOT NULL,
    phone_number TEXT,
    residential_address TEXT,

    -- 4-12. Property information
    property_type TEXT,                              -- land | house | shop | office | other
    property_type_other TEXT,
    property_location TEXT,
    ownership_documents TEXT[] DEFAULT '{}',         -- c_of_o | r_of_o | deed | allocation | survey | other
    ownership_document_other TEXT,
    property_specifications TEXT,
    property_size TEXT,
    plot_number TEXT,
    price NUMERIC,
    owner_relationship TEXT,                         -- owner | family_rep | agent | attorney | other
    owner_relationship_other TEXT,
    advert_placement TEXT[] DEFAULT '{}',            -- handling | online | video | website

    -- Company use
    inspected TEXT,                                  -- yes | no
    inspection_date DATE,
    inspection_time TEXT,
    officer_assigned TEXT,
    payment_status TEXT,                             -- paid | pending
    amount_paid NUMERIC,
    receipt_number TEXT,
    condition_remarks TEXT,

    -- Official use only
    decision TEXT,                                   -- approved | declined
    decline_reason TEXT,
    manager_comments TEXT,
    approved_by_name TEXT,
    approved_by_signature TEXT,
    approved_date DATE,
    agreement TEXT,
    sign_one TEXT,
    sign_two TEXT,

    -- Audit
    created_by UUID REFERENCES auth.users(id)
);

-- Sequential form numbers (0001, 0002, …) to match the paper booklet
INSERT INTO public.app_settings (key, value)
VALUES ('next_property_form_number', '1')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.generate_property_form_number()
RETURNS TRIGGER AS $$
DECLARE
    current_num INT;
BEGIN
    IF NEW.form_number IS NULL THEN
        SELECT value::INT INTO current_num
        FROM public.app_settings
        WHERE key = 'next_property_form_number'
        FOR UPDATE;

        IF current_num IS NULL THEN
            current_num := 1;
            INSERT INTO public.app_settings (key, value) VALUES ('next_property_form_number', '2');
        ELSE
            UPDATE public.app_settings
            SET value = (current_num + 1)::TEXT, updated_at = now()
            WHERE key = 'next_property_form_number';
        END IF;

        NEW.form_number := LPAD(current_num::TEXT, 4, '0');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_generate_property_form_number ON public.property_intakes;
CREATE TRIGGER tr_generate_property_form_number
BEFORE INSERT ON public.property_intakes
FOR EACH ROW
EXECUTE FUNCTION public.generate_property_form_number();

-- RLS — same model as authority_to_sell
ALTER TABLE public.property_intakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage property intakes" ON public.property_intakes;
CREATE POLICY "Authenticated users can manage property intakes"
ON public.property_intakes FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_property_intakes_name   ON public.property_intakes (full_name);
CREATE INDEX IF NOT EXISTS idx_property_intakes_date   ON public.property_intakes (form_date);
CREATE INDEX IF NOT EXISTS idx_property_intakes_number ON public.property_intakes (form_number);



-- ============================================================
-- 20261030120000_fix_counter_security.sql
-- ============================================================
-- Sequential number generators must run as the function owner.
--
-- Both triggers UPDATE public.app_settings to advance a counter, but the only
-- write policy on that table is "Super Admin full access to app_settings".
-- Running as the invoking user, the UPDATE silently matches zero rows for any
-- admin/sales/mechanic user — no error is raised — so the counter never
-- advances and every sale is stamped № 00001 (and every property form 0001).
--
-- SECURITY DEFINER makes them run as the owner, bypassing RLS on app_settings
-- while leaving the tables themselves protected. search_path is pinned so the
-- elevated function can't be redirected to another schema.

CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_num INT;
BEGIN
    IF NEW.sale_number IS NULL THEN
        SELECT value::INT INTO current_num
        FROM public.app_settings
        WHERE key = 'next_sale_number'
        FOR UPDATE;

        IF current_num IS NULL THEN
            current_num := 1;
            INSERT INTO public.app_settings (key, value) VALUES ('next_sale_number', '2')
            ON CONFLICT (key) DO UPDATE SET value = '2', updated_at = now();
        ELSE
            UPDATE public.app_settings
            SET value = (current_num + 1)::TEXT, updated_at = now()
            WHERE key = 'next_sale_number';
        END IF;

        NEW.sale_number := LPAD(current_num::TEXT, 5, '0');
    END IF;

    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_property_form_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_num INT;
BEGIN
    IF NEW.form_number IS NULL THEN
        SELECT value::INT INTO current_num
        FROM public.app_settings
        WHERE key = 'next_property_form_number'
        FOR UPDATE;

        IF current_num IS NULL THEN
            current_num := 1;
            INSERT INTO public.app_settings (key, value) VALUES ('next_property_form_number', '2')
            ON CONFLICT (key) DO UPDATE SET value = '2', updated_at = now();
        ELSE
            UPDATE public.app_settings
            SET value = (current_num + 1)::TEXT, updated_at = now()
            WHERE key = 'next_property_form_number';
        END IF;

        NEW.form_number := LPAD(current_num::TEXT, 4, '0');
    END IF;

    RETURN NEW;
END;
$$;

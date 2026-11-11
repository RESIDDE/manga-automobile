-- 1. Create app_role enum
DO $$ BEGIN
    CREATE TYPE public.app_role AS ENUM ('admin', 'sales', 'mechanic');
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

CREATE POLICY "Users can view their own role" ON public.user_roles
FOR SELECT TO authenticated USING (auth.uid() = user_id);

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

CREATE POLICY "Authenticated can select vehicles" ON public.vehicles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert vehicles" ON public.vehicles FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update vehicles" ON public.vehicles FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete vehicles" ON public.vehicles FOR DELETE TO authenticated USING (true);

-- CUSTOMERS
DROP POLICY IF EXISTS "Anyone can select customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can update customers" ON public.customers;
DROP POLICY IF EXISTS "Anyone can delete customers" ON public.customers;

CREATE POLICY "Authenticated can select customers" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert customers" ON public.customers FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update customers" ON public.customers FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete customers" ON public.customers FOR DELETE TO authenticated USING (true);

-- SALES
DROP POLICY IF EXISTS "Anyone can select sales" ON public.sales;
DROP POLICY IF EXISTS "Anyone can insert sales" ON public.sales;
DROP POLICY IF EXISTS "Anyone can update sales" ON public.sales;
DROP POLICY IF EXISTS "Anyone can delete sales" ON public.sales;

CREATE POLICY "Authenticated can select sales" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert sales" ON public.sales FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update sales" ON public.sales FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete sales" ON public.sales FOR DELETE TO authenticated USING (true);

-- INQUIRIES
DROP POLICY IF EXISTS "Anyone can select inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Anyone can insert inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Anyone can update inquiries" ON public.inquiries;
DROP POLICY IF EXISTS "Anyone can delete inquiries" ON public.inquiries;

CREATE POLICY "Authenticated can select inquiries" ON public.inquiries FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert inquiries" ON public.inquiries FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update inquiries" ON public.inquiries FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete inquiries" ON public.inquiries FOR DELETE TO authenticated USING (true);

-- REPAIRS
DROP POLICY IF EXISTS "Anyone can select repairs" ON public.repairs;
DROP POLICY IF EXISTS "Anyone can insert repairs" ON public.repairs;
DROP POLICY IF EXISTS "Anyone can update repairs" ON public.repairs;
DROP POLICY IF EXISTS "Anyone can delete repairs" ON public.repairs;

CREATE POLICY "Authenticated can select repairs" ON public.repairs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert repairs" ON public.repairs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update repairs" ON public.repairs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete repairs" ON public.repairs FOR DELETE TO authenticated USING (true);

-- INVOICES
DROP POLICY IF EXISTS "Anyone can select invoices" ON public.invoices;
DROP POLICY IF EXISTS "Anyone can insert invoices" ON public.invoices;
DROP POLICY IF EXISTS "Anyone can update invoices" ON public.invoices;
DROP POLICY IF EXISTS "Anyone can delete invoices" ON public.invoices;

CREATE POLICY "Authenticated can select invoices" ON public.invoices FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert invoices" ON public.invoices FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update invoices" ON public.invoices FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete invoices" ON public.invoices FOR DELETE TO authenticated USING (true);

-- INVOICE_REPAIRS
DROP POLICY IF EXISTS "Anyone can select invoice_repairs" ON public.invoice_repairs;
DROP POLICY IF EXISTS "Anyone can insert invoice_repairs" ON public.invoice_repairs;
DROP POLICY IF EXISTS "Anyone can update invoice_repairs" ON public.invoice_repairs;
DROP POLICY IF EXISTS "Anyone can delete invoice_repairs" ON public.invoice_repairs;

CREATE POLICY "Authenticated can select invoice_repairs" ON public.invoice_repairs FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert invoice_repairs" ON public.invoice_repairs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update invoice_repairs" ON public.invoice_repairs FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated can delete invoice_repairs" ON public.invoice_repairs FOR DELETE TO authenticated USING (true);

-- INSPECTIONS
DROP POLICY IF EXISTS "Anyone can select inspections" ON public.inspections;
DROP POLICY IF EXISTS "Anyone can insert inspections" ON public.inspections;
DROP POLICY IF EXISTS "Anyone can update inspections" ON public.inspections;
DROP POLICY IF EXISTS "Anyone can delete inspections" ON public.inspections;

CREATE POLICY "Authenticated can select inspections" ON public.inspections FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert inspections" ON public.inspections FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update inspections" ON public.inspections FOR UPDATE TO authenticated USING (true);
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
      'total_amount', i.total_amount,
      'amount_paid', i.amount_paid,
      'status', i.status,
      'created_at', i.created_at,
      'type', i.type
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

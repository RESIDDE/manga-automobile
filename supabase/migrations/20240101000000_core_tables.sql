CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TABLE public.customers (
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

CREATE TABLE public.vehicles (
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

CREATE TABLE public.sales (
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

CREATE TABLE public.sale_vehicles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    sale_id UUID REFERENCES public.sales(id),
    vehicle_id UUID REFERENCES public.vehicles(id),
    price NUMERIC,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.inquiries (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    vehicle_id UUID REFERENCES public.vehicles(id),
    customer_id UUID REFERENCES public.customers(id),
    message TEXT NOT NULL,
    status TEXT NOT NULL,
    created_by TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE public.audit_logs (
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
CREATE POLICY "Enable all access for authenticated users" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.sales FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.sale_vehicles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.inquiries FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access for authenticated users" ON public.audit_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);


-- Add missing columns to repairs for invoice linking
ALTER TABLE public.repairs ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES public.customers(id);
ALTER TABLE public.repairs ADD COLUMN IF NOT EXISTS manual_make text;
ALTER TABLE public.repairs ADD COLUMN IF NOT EXISTS manual_model text;
ALTER TABLE public.repairs ADD COLUMN IF NOT EXISTS manual_year text;

-- Create invoices table
CREATE TABLE public.invoices (
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

CREATE POLICY "Anyone can select invoices" ON public.invoices FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert invoices" ON public.invoices FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update invoices" ON public.invoices FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Anyone can delete invoices" ON public.invoices FOR DELETE TO anon, authenticated USING (true);

CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Create invoice_repairs junction table
CREATE TABLE public.invoice_repairs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  repair_id uuid NOT NULL REFERENCES public.repairs(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(invoice_id, repair_id)
);

ALTER TABLE public.invoice_repairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select invoice_repairs" ON public.invoice_repairs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert invoice_repairs" ON public.invoice_repairs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can delete invoice_repairs" ON public.invoice_repairs FOR DELETE TO anon, authenticated USING (true);

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

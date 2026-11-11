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

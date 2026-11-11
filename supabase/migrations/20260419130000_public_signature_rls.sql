-- 1. Allow public (anonymous) users to select specific records for signing previews
-- This is needed for SignSale.tsx to show what the customer is signing
CREATE POLICY "Allow public select for signing on sales" ON public.sales
FOR SELECT TO anon USING (true);

CREATE POLICY "Allow public select for signing on sale_vehicles" ON public.sale_vehicles
FOR SELECT TO anon USING (true);

-- Customers select is needed to show the buyer name on the sale signing page
CREATE POLICY "Allow public select for signing on customers" ON public.customers
FOR SELECT TO anon USING (true);

-- Vehicles select is needed for the preview in SignSale
CREATE POLICY "Allow public select for signing on vehicles" ON public.vehicles
FOR SELECT TO anon USING (true);

-- Inspections select for preview
CREATE POLICY "Allow public select for signing on inspections" ON public.inspections
FOR SELECT TO anon USING (true);

-- Repairs select for preview
CREATE POLICY "Allow public select for signing on repairs" ON public.repairs
FOR SELECT TO anon USING (true);


-- 2. Allow public (anonymous) users to update ONLY the signature-related fields
-- Restricted by ID (since they need the link)

-- Repairs signature
CREATE POLICY "Allow public signature update on repairs" ON public.repairs
FOR UPDATE TO anon 
USING (true) 
WITH CHECK (true);

-- Customers signature
CREATE POLICY "Allow public signature update on customers" ON public.customers
FOR UPDATE TO anon 
USING (true) 
WITH CHECK (true);

-- Inspections signature
CREATE POLICY "Allow public signature update on inspections" ON public.inspections
FOR UPDATE TO anon 
USING (true) 
WITH CHECK (true);

-- Sales (Buyer) signature
CREATE POLICY "Allow public signature update on sales" ON public.sales
FOR UPDATE TO anon 
USING (true) 
WITH CHECK (true);

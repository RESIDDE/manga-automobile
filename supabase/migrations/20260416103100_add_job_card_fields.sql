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

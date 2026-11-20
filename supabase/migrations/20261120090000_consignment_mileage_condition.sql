-- ════════════════════════════════════════════════════════════════════════════
-- Consignment agreement: the car's mileage and its condition
--
--   vehicle_mileage    as read off the odometer, e.g. "85,000 km"
--   vehicle_condition  'foreign_used' | 'nigerian_used' | 'brand_new'
--
-- Both optional. Agreements saved before this keep both blank.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.consignment_agreements
  ADD COLUMN IF NOT EXISTS vehicle_mileage   TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_condition TEXT;

ALTER TABLE public.consignment_agreements
  DROP CONSTRAINT IF EXISTS consignment_vehicle_condition_check;
ALTER TABLE public.consignment_agreements
  ADD CONSTRAINT consignment_vehicle_condition_check
  CHECK (vehicle_condition IS NULL OR vehicle_condition IN ('foreign_used', 'nigerian_used', 'brand_new'));

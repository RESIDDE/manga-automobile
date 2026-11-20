-- ════════════════════════════════════════════════════════════════════════════
-- Sales agreement: plate number and registration number as separate fields
--
-- The form's "Plate number" box (vehicle_plate_number) used to print on the
-- "Registration No" line. The plate number now prints on its own "Plate No"
-- line, and the registration number from the vehicle papers gets its own
-- column. Both optional; existing agreements keep their plate numbers.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.sales_agreements
  ADD COLUMN IF NOT EXISTS vehicle_registration_no TEXT;

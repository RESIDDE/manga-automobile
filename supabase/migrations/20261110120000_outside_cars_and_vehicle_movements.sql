-- Cars snapped outside the stand, and the stand's sign-in / sign-out log.
--
-- Outside cars reuse public.vehicles with inventory_type = 'external'. For those
-- rows the two price columns carry a second meaning:
--   cost_price → the owner's ACTUAL price
--   price      → the OFFICE price we quote (actual + 10%)
-- The office price lives in `price` on purpose: the sale picker, the proforma
-- invoice and the sold-price derivation all read that column, so a brokered car
-- sells and quotes at the right figure with no special-casing. It also makes
-- revenue − cost come out as the commission earned.

-- ─── Document the three-way inventory split ─────────────────────────────────
-- No CHECK constraint on purpose: it would abort this migration if any existing
-- row held something else, and would reject any value a later feature adds. The
-- client already treats an unknown or missing value as stand stock.
COMMENT ON COLUMN public.vehicles.inventory_type IS
  'Where the car is and whose it is: main = on our stand, service = workshop only, external = snapped outside the stand (brokered; price is the office price, cost_price the owner''s actual price).';

-- ─── The stand's movement log ───────────────────────────────────────────────
-- One append-only row per event, with a direction — not an out/in column pair.
-- A car can be signed back in by a different person, days later, and can go out
-- again before anyone closes the previous trip; paired columns lose all of that.
CREATE TABLE IF NOT EXISTS public.vehicle_movements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id       UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  direction        TEXT NOT NULL CHECK (direction IN ('out','in')),
  moved_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  person_name      TEXT NOT NULL,
  person_phone     TEXT,
  reason           TEXT,
  destination      TEXT,
  expected_return  TIMESTAMPTZ,
  notes            TEXT,
  recorded_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Denormalised on purpose, exactly as audit_logs embeds _user_name: the log
  -- must still read correctly when a profile is gone or a join is blocked.
  recorded_by_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_movements ENABLE ROW LEVEL SECURITY;

-- Authenticated-only, matching sale_payments. Note anon is granted nothing here:
-- vehicles is readable by anon for the signing pages, but this table names staff.
DROP POLICY IF EXISTS "Authenticated full access to vehicle movements" ON public.vehicle_movements;
CREATE POLICY "Authenticated full access to vehicle movements"
  ON public.vehicle_movements FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vehicle_movements TO authenticated;

-- Serves both "latest movement per vehicle" and the ON DELETE CASCADE
CREATE INDEX IF NOT EXISTS idx_vehicle_movements_latest
  ON public.vehicle_movements (vehicle_id, moved_at DESC);
CREATE INDEX IF NOT EXISTS idx_vehicle_movements_moved_at
  ON public.vehicle_movements (moved_at DESC);

-- ─── Realtime ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_movements;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

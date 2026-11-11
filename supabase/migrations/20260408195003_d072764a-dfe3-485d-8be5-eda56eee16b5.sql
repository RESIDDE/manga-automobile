
CREATE TABLE public.inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  inspector_name TEXT NOT NULL,
  condition_at_pickup TEXT NOT NULL,
  pickup_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  signature_data TEXT,
  returned_in_good_condition BOOLEAN NOT NULL DEFAULT false,
  return_condition_notes TEXT,
  return_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.inspections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select inspections" ON public.inspections FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert inspections" ON public.inspections FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update inspections" ON public.inspections FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Anyone can delete inspections" ON public.inspections FOR DELETE TO anon, authenticated USING (true);

CREATE TRIGGER update_inspections_updated_at
  BEFORE UPDATE ON public.inspections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

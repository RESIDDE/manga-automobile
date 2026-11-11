
CREATE TABLE public.repairs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID REFERENCES public.vehicles(id) ON DELETE SET NULL,
  model_year INTEGER,
  unit TEXT,
  condition TEXT,
  company TEXT,
  replacement_parts TEXT,
  damaged_parts TEXT,
  to_be_resprayed BOOLEAN NOT NULL DEFAULT false,
  repair_cost NUMERIC DEFAULT 0,
  payment_status TEXT DEFAULT 'deposit',
  payment_type TEXT DEFAULT 'cash',
  brought_in_by TEXT,
  handed_to TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can select repairs" ON public.repairs FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Anyone can insert repairs" ON public.repairs FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can update repairs" ON public.repairs FOR UPDATE TO anon, authenticated USING (true);
CREATE POLICY "Anyone can delete repairs" ON public.repairs FOR DELETE TO anon, authenticated USING (true);

CREATE TRIGGER update_repairs_updated_at
  BEFORE UPDATE ON public.repairs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

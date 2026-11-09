-- Property Intake & Inspection Form — mirrors the paper form (Form No. 0005 series)

CREATE TABLE IF NOT EXISTS public.property_intakes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMPTZ DEFAULT now(),

    -- Form meta
    form_number TEXT,
    form_date DATE DEFAULT CURRENT_DATE,

    -- 1-3. Information
    full_name TEXT NOT NULL,
    phone_number TEXT,
    residential_address TEXT,

    -- 4-12. Property information
    property_type TEXT,                              -- land | house | shop | office | other
    property_type_other TEXT,
    property_location TEXT,
    ownership_documents TEXT[] DEFAULT '{}',         -- c_of_o | r_of_o | deed | allocation | survey | other
    ownership_document_other TEXT,
    property_specifications TEXT,
    property_size TEXT,
    plot_number TEXT,
    price NUMERIC,
    owner_relationship TEXT,                         -- owner | family_rep | agent | attorney | other
    owner_relationship_other TEXT,
    advert_placement TEXT[] DEFAULT '{}',            -- handling | online | video | website

    -- Company use
    inspected TEXT,                                  -- yes | no
    inspection_date DATE,
    inspection_time TEXT,
    officer_assigned TEXT,
    payment_status TEXT,                             -- paid | pending
    amount_paid NUMERIC,
    receipt_number TEXT,
    condition_remarks TEXT,

    -- Official use only
    decision TEXT,                                   -- approved | declined
    decline_reason TEXT,
    manager_comments TEXT,
    approved_by_name TEXT,
    approved_by_signature TEXT,
    approved_date DATE,
    agreement TEXT,
    sign_one TEXT,
    sign_two TEXT,

    -- Audit
    created_by UUID REFERENCES auth.users(id)
);

-- Sequential form numbers (0001, 0002, …) to match the paper booklet
INSERT INTO public.app_settings (key, value)
VALUES ('next_property_form_number', '1')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.generate_property_form_number()
RETURNS TRIGGER AS $$
DECLARE
    current_num INT;
BEGIN
    IF NEW.form_number IS NULL THEN
        SELECT value::INT INTO current_num
        FROM public.app_settings
        WHERE key = 'next_property_form_number'
        FOR UPDATE;

        IF current_num IS NULL THEN
            current_num := 1;
            INSERT INTO public.app_settings (key, value) VALUES ('next_property_form_number', '2');
        ELSE
            UPDATE public.app_settings
            SET value = (current_num + 1)::TEXT, updated_at = now()
            WHERE key = 'next_property_form_number';
        END IF;

        NEW.form_number := LPAD(current_num::TEXT, 4, '0');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_generate_property_form_number ON public.property_intakes;
CREATE TRIGGER tr_generate_property_form_number
BEFORE INSERT ON public.property_intakes
FOR EACH ROW
EXECUTE FUNCTION public.generate_property_form_number();

-- RLS — same model as authority_to_sell
ALTER TABLE public.property_intakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can manage property intakes" ON public.property_intakes;
CREATE POLICY "Authenticated users can manage property intakes"
ON public.property_intakes FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_property_intakes_name   ON public.property_intakes (full_name);
CREATE INDEX IF NOT EXISTS idx_property_intakes_date   ON public.property_intakes (form_date);
CREATE INDEX IF NOT EXISTS idx_property_intakes_number ON public.property_intakes (form_number);

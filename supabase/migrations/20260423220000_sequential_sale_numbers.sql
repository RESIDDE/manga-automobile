-- 1. Add sale_number column to sales
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sale_number TEXT;

-- 2. Create app_settings table
CREATE TABLE IF NOT EXISTS public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value TEXT,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Initialize next_sale_number
INSERT INTO public.app_settings (key, value) 
VALUES ('next_sale_number', '1') 
ON CONFLICT (key) DO NOTHING;

-- 4. Create function to generate and increment sale number
CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS TRIGGER AS $$
DECLARE
    current_num INT;
    formatted_num TEXT;
BEGIN
    -- Only generate if sale_number is null
    IF NEW.sale_number IS NULL THEN
        -- Get current value and lock row for update
        SELECT value::INT INTO current_num 
        FROM public.app_settings 
        WHERE key = 'next_sale_number' 
        FOR UPDATE;
        
        -- If not found, default to 1
        IF current_num IS NULL THEN
            current_num := 1;
            INSERT INTO public.app_settings (key, value) VALUES ('next_sale_number', '2');
        ELSE
            -- Increment value in settings
            UPDATE public.app_settings 
            SET value = (current_num + 1)::TEXT, updated_at = now() 
            WHERE key = 'next_sale_number';
        END IF;

        -- Format number with leading zeros (e.g., 001)
        formatted_num := LPAD(current_num::TEXT, 3, '0');
        NEW.sale_number := formatted_num;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger
DROP TRIGGER IF EXISTS tr_generate_sale_number ON public.sales;
CREATE TRIGGER tr_generate_sale_number
BEFORE INSERT ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.generate_sale_number();

-- 6. Enable RLS on app_settings (if not already enabled)
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
DROP POLICY IF EXISTS "Super Admin full access to app_settings" ON public.app_settings;
CREATE POLICY "Super Admin full access to app_settings" ON public.app_settings
FOR ALL
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role = 'super_admin'
    )
);

DROP POLICY IF EXISTS "Authenticated users can read app_settings" ON public.app_settings;
CREATE POLICY "Authenticated users can read app_settings" ON public.app_settings
FOR SELECT
TO authenticated
USING (true);

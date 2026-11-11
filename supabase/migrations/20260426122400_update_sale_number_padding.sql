-- Update sale number formatting to 5 digits
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

        -- Format number with 5 leading zeros (e.g., 00001) to match user image
        formatted_num := LPAD(current_num::TEXT, 5, '0');
        NEW.sale_number := formatted_num;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

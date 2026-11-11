CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  first_user boolean;
BEGIN
  -- Insert profile using id instead of user_id to match the table schema
  INSERT INTO public.profiles (id, display_name, phone)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone');

  -- Insert role (temporarily make everyone admin as requested)
  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'admin');

  RETURN new;
END;
$$;

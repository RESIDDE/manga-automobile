DO $$
DECLARE
  target_user_id uuid;
BEGIN
  -- We use ILIKE just in case of casing issues
  SELECT id INTO target_user_id FROM auth.users WHERE email ILIKE 'samcuzzy39@gmail.com' LIMIT 1;
  IF target_user_id IS NOT NULL THEN
    UPDATE public.user_roles SET role = 'super_admin' WHERE user_id = target_user_id;
  END IF;
END $$;

-- Grant the new Outside Cars page to the roles that already have Vehicles.
--
-- 20261108090000 seeded app_settings['permissions'] with ON CONFLICT DO NOTHING,
-- so an existing deployment's matrix predates this page and would hide it from
-- every non-admin. `admin` needs nothing — it derives its rights from the page
-- list in code.
--
-- The rule is a mirror: for each action a role already holds on 'vehicles', it
-- gets the same on 'outside-vehicles'. That can never widen anyone's access
-- beyond their existing stock-page rights.
--
-- Re-runnable: a role that already has the key is skipped. A matrix that is not
-- valid JSON is left alone with a notice, and an admin can tick the box in
-- Settings instead.
DO $$
DECLARE
  doc  JSONB;
  r    TEXT;
  a    TEXT;
  arr  JSONB;
  acts TEXT[] := ARRAY['view','create','edit','delete'];
BEGIN
  BEGIN
    SELECT value::jsonb INTO doc FROM public.app_settings WHERE key = 'permissions';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'app_settings.permissions is not valid JSON — grant Outside Cars from Settings instead';
    RETURN;
  END;

  IF doc IS NULL OR jsonb_typeof(doc) <> 'object' THEN
    RETURN;
  END IF;

  FOR r IN SELECT jsonb_object_keys(doc) LOOP
    FOREACH a IN ARRAY acts LOOP
      arr := COALESCE(doc -> r -> a, '[]'::jsonb);
      IF jsonb_typeof(arr) = 'array'
         AND arr ? 'vehicles'
         AND NOT (arr ? 'outside-vehicles') THEN
        doc := jsonb_set(doc, ARRAY[r, a], arr || '["outside-vehicles"]'::jsonb, true);
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.app_settings
     SET value = doc::text, updated_at = now()
   WHERE key = 'permissions';
END $$;

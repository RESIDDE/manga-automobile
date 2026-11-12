-- The Authority to Sell page is gone; the Sales Agreement takes its permission.
--
-- Both documents lived behind one page key, 'authority-to-sell'. With the page
-- removed the key is renamed to 'sales-agreement' in code, and the client drops
-- page keys it does not recognise — so without this, every non-admin role would
-- quietly lose the Sales Agreement along with the page that was deleted.
--
-- Each of the four action lists is rewritten in place: wherever a role held
-- 'authority-to-sell' it now holds 'sales-agreement'. Nobody gains or loses
-- anything; the same right simply has a new name.
--
-- Re-runnable: a matrix with no 'authority-to-sell' left is untouched, and one
-- that is not valid JSON is left alone with a notice rather than being lost.

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
    RAISE NOTICE 'app_settings.permissions is not valid JSON — set the Sales Agreement rights in Settings instead';
    RETURN;
  END;

  IF doc IS NULL OR jsonb_typeof(doc) <> 'object' THEN
    RETURN;
  END IF;

  FOR r IN SELECT jsonb_object_keys(doc) LOOP
    FOREACH a IN ARRAY acts LOOP
      arr := COALESCE(doc -> r -> a, '[]'::jsonb);
      IF jsonb_typeof(arr) = 'array' AND arr ? 'authority-to-sell' THEN
        -- drop the retired key, then add the new one if it is not there yet
        SELECT COALESCE(jsonb_agg(v), '[]'::jsonb)
          INTO arr
          FROM jsonb_array_elements(arr) AS v
         WHERE v <> '"authority-to-sell"'::jsonb;

        IF NOT (arr ? 'sales-agreement') THEN
          arr := arr || '["sales-agreement"]'::jsonb;
        END IF;

        doc := jsonb_set(doc, ARRAY[r, a], arr, true);
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.app_settings
     SET value = doc::text, updated_at = now()
   WHERE key = 'permissions';
END $$;

-- The table itself is deliberately left in place. Agreements already signed are
-- a record of who authorised what, and dropping it would destroy them. Nothing
-- reads it any more; drop it by hand once the office is certain it is not
-- wanted:
--     DROP TABLE public.authority_to_sell;

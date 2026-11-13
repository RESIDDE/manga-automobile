-- ════════════════════════════════════════════════════════════════════════════
-- Per-role access to Messages and Tags
--
-- Stored in app_settings under 'feature_access' as {"<role>": ["messages","tags"]}.
-- A role with no entry gets BOTH — chat and tags are on for everyone until an
-- admin switches them off for a role in Settings → Permissions. Admin always
-- has both. (Only admins can write app_settings.)
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.has_feature(feature TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  my_role TEXT;
  cfg JSONB;
BEGIN
  IF public.is_app_admin() THEN RETURN TRUE; END IF;
  SELECT role::text INTO my_role FROM public.user_roles WHERE user_id = auth.uid();
  IF my_role IS NULL THEN RETURN FALSE; END IF;

  BEGIN
    SELECT value::text::jsonb INTO cfg FROM public.app_settings WHERE key = 'feature_access';
  EXCEPTION WHEN others THEN
    cfg := NULL;  -- unreadable setting: fall back to the default (allowed)
  END;

  IF cfg IS NULL OR jsonb_typeof(cfg) <> 'object' OR NOT cfg ? my_role THEN RETURN TRUE; END IF;
  RETURN (cfg -> my_role) ? feature;
END;
$$;
GRANT EXECUTE ON FUNCTION public.has_feature(TEXT) TO authenticated;

INSERT INTO public.app_settings (key, value) VALUES ('feature_access', '{}')
ON CONFLICT (key) DO NOTHING;

-- ─── Chat ───────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Members read messages" ON public.chat_messages;
CREATE POLICY "Members read messages" ON public.chat_messages
  FOR SELECT TO authenticated
  USING (public.has_feature('messages') AND public.is_chat_member(thread_id));

DROP POLICY IF EXISTS "Members send messages" ON public.chat_messages;
CREATE POLICY "Members send messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.has_feature('messages') AND public.is_chat_member(thread_id));

DROP POLICY IF EXISTS "Chat members read attachments" ON storage.objects;
CREATE POLICY "Chat members read attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments' AND public.has_feature('messages')
         AND public.is_chat_member(public.chat_folder_thread(name)));

DROP POLICY IF EXISTS "Chat members upload attachments" ON storage.objects;
CREATE POLICY "Chat members upload attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments' AND public.has_feature('messages')
              AND public.is_chat_member(public.chat_folder_thread(name)));

-- ─── Tags ───────────────────────────────────────────────────────────────────
-- Sending needs the Tags permission. Receiving does not: someone without it
-- can still be told what to do, they just can't tag others.
DROP POLICY IF EXISTS "Create own tags" ON public.page_tags;
CREATE POLICY "Create own tags" ON public.page_tags
  FOR INSERT TO authenticated
  WITH CHECK (from_user = auth.uid() AND public.has_feature('tags'));

-- Realtime so a change in Settings reaches every open screen
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.app_settings;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

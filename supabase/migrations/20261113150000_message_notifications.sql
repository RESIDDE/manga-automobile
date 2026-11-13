-- ════════════════════════════════════════════════════════════════════════════
-- Notify people of every message, not only @mentions
--
-- Direct and group chats: each other member gets a "message" notification.
-- One unread notification per conversation is kept (it is replaced by the
-- latest message), so a busy chat doesn't flood the bell.
-- Team room: only @mentions notify, otherwise everyone is pinged constantly.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.on_chat_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sender_name TEXT;
  th public.chat_threads;
  summary TEXT;
  thread_link TEXT := '/messages?thread=' || NEW.thread_id;
BEGIN
  UPDATE public.chat_threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id
  RETURNING * INTO th;
  SELECT coalesce(display_name, username, 'A colleague') INTO sender_name
    FROM public.profiles WHERE id = NEW.sender_id;
  sender_name := coalesce(sender_name, 'A colleague');

  summary := CASE
    WHEN length(trim(coalesce(NEW.body, ''))) > 0 THEN left(NEW.body, 200)
    WHEN NEW.attachment_type = 'image' THEN '📷 Photo'
    WHEN NEW.attachment_type = 'audio' THEN '🎤 Voice note'
    ELSE '📎 ' || coalesce(NEW.attachment_name, 'File')
  END;

  -- @mentions (any kind of conversation)
  INSERT INTO public.notifications (user_id, actor_id, kind, title, body, link, ref_id)
  SELECT DISTINCT m, NEW.sender_id, 'mention',
         sender_name || ' mentioned you' ||
           CASE WHEN th.kind = 'direct' THEN '' ELSE ' in ' || coalesce(th.title, 'a group') END,
         summary, thread_link, NEW.id
  FROM unnest(NEW.mentions) AS m
  WHERE m <> NEW.sender_id
    AND (th.kind = 'team' OR EXISTS (
      SELECT 1 FROM public.chat_members cm WHERE cm.thread_id = NEW.thread_id AND cm.user_id = m));

  -- Every other member of a direct or group chat (mentioned people already have one)
  IF th.kind IN ('direct', 'group') THEN
    DELETE FROM public.notifications n
    USING public.chat_members cm
    WHERE cm.thread_id = NEW.thread_id
      AND n.user_id = cm.user_id
      AND n.kind = 'message' AND n.read_at IS NULL AND n.link = thread_link;

    INSERT INTO public.notifications (user_id, actor_id, kind, title, body, link, ref_id)
    SELECT cm.user_id, NEW.sender_id, 'message',
           CASE WHEN th.kind = 'direct' THEN 'New message from ' || sender_name
                ELSE sender_name || ' in ' || coalesce(th.title, 'a group') END,
           summary, thread_link, NEW.id
    FROM public.chat_members cm
    WHERE cm.thread_id = NEW.thread_id
      AND cm.user_id <> NEW.sender_id
      AND NOT (cm.user_id = ANY (NEW.mentions));
  END IF;

  RETURN NEW;
END;
$$;

-- Opening a conversation clears its message notifications
CREATE OR REPLACE FUNCTION public.mark_chat_read(t UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_chat_member(t) THEN RAISE EXCEPTION 'Not a member'; END IF;
  INSERT INTO public.chat_members (thread_id, user_id, last_read_at) VALUES (t, auth.uid(), now())
  ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = now();
  UPDATE public.notifications SET read_at = now()
  WHERE user_id = auth.uid() AND read_at IS NULL
    AND kind IN ('message', 'mention') AND link = '/messages?thread=' || t;
END;
$$;

-- Make sure live updates are switched on for every chat table (safe to re-run)
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_messages', 'chat_threads', 'chat_members', 'page_tags', 'notifications'] LOOP
    BEGIN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

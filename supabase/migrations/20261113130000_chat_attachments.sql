-- ════════════════════════════════════════════════════════════════════════════
-- Chat attachments: images, voice notes and files
--
-- Files live in a PRIVATE bucket, one folder per conversation:
--   chat-attachments/<thread_id>/<random>-<file name>
-- Only members of that conversation (everyone, for the team room) can upload
-- to or read from its folder. There are no public links: the app fetches each
-- file with a short-lived signed URL and shows images inside the chat.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS attachment_path TEXT,
  ADD COLUMN IF NOT EXISTS attachment_type TEXT CHECK (attachment_type IN ('image', 'audio', 'file')),
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size BIGINT,
  ADD COLUMN IF NOT EXISTS attachment_duration NUMERIC;  -- seconds, voice notes

-- A message may now be just an attachment, with no text
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_body_check;
ALTER TABLE public.chat_messages ALTER COLUMN body SET DEFAULT '';
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_has_content;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_has_content
  CHECK (length(trim(body)) > 0 OR attachment_path IS NOT NULL);

-- An attachment must sit in its own conversation's folder
ALTER TABLE public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_attachment_in_thread;
ALTER TABLE public.chat_messages ADD CONSTRAINT chat_messages_attachment_in_thread
  CHECK (attachment_path IS NULL OR split_part(attachment_path, '/', 1) = thread_id::text);

-- ─── Private bucket (25 MB per file) ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-attachments', 'chat-attachments', false, 26214400)
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit;

-- Folder name → conversation id, or NULL if it isn't one
CREATE OR REPLACE FUNCTION public.chat_folder_thread(object_name TEXT)
RETURNS UUID LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  RETURN split_part(object_name, '/', 1)::uuid;
EXCEPTION WHEN others THEN
  RETURN NULL;
END;
$$;

DROP POLICY IF EXISTS "Chat members read attachments" ON storage.objects;
CREATE POLICY "Chat members read attachments" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'chat-attachments' AND public.is_chat_member(public.chat_folder_thread(name)));

DROP POLICY IF EXISTS "Chat members upload attachments" ON storage.objects;
CREATE POLICY "Chat members upload attachments" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'chat-attachments' AND public.is_chat_member(public.chat_folder_thread(name)));

DROP POLICY IF EXISTS "Uploader deletes attachment" ON storage.objects;
CREATE POLICY "Uploader deletes attachment" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'chat-attachments' AND owner = auth.uid());

-- Mention notifications for attachment-only messages need a readable body
CREATE OR REPLACE FUNCTION public.on_chat_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sender_name TEXT;
  th public.chat_threads;
  summary TEXT;
BEGIN
  UPDATE public.chat_threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id
  RETURNING * INTO th;
  SELECT coalesce(display_name, username, 'A colleague') INTO sender_name
    FROM public.profiles WHERE id = NEW.sender_id;

  summary := CASE
    WHEN length(trim(NEW.body)) > 0 THEN left(NEW.body, 200)
    WHEN NEW.attachment_type = 'image' THEN '📷 Photo'
    WHEN NEW.attachment_type = 'audio' THEN '🎤 Voice note'
    ELSE '📎 ' || coalesce(NEW.attachment_name, 'File')
  END;

  INSERT INTO public.notifications (user_id, actor_id, kind, title, body, link, ref_id)
  SELECT DISTINCT m, NEW.sender_id, 'mention',
         coalesce(sender_name, 'A colleague') || ' mentioned you' ||
           CASE WHEN th.kind = 'direct' THEN '' ELSE ' in ' || coalesce(th.title, 'a group') END,
         summary,
         '/messages?thread=' || NEW.thread_id,
         NEW.id
  FROM unnest(NEW.mentions) AS m
  WHERE m <> NEW.sender_id
    AND (th.kind = 'team' OR EXISTS (
      SELECT 1 FROM public.chat_members cm WHERE cm.thread_id = NEW.thread_id AND cm.user_id = m));
  RETURN NEW;
END;
$$;

-- ════════════════════════════════════════════════════════════════════════════
-- Staff logins, team chat, private page tags and notifications
--
--  1. Staff accounts: admin creates them with a name, a username and a password.
--     No email is needed — the login screen turns the username into a fixed
--     internal address (<username>@staff.manga.local).
--  2. One password per person: every password admin sets is fingerprinted, and
--     the same password can never be given to a second account.
--  3. Chat: direct conversations, group conversations and a team room.
--  4. Page tags: a private note pinned to a page for ONE colleague. Only the
--     sender and the person tagged can read it — nobody else, admin included.
--  5. Notifications for tags and @mentions.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role::text IN ('admin', 'super_admin')
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_app_admin() TO authenticated;

-- ─── 1. Staff usernames ─────────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username     TEXT,
  ADD COLUMN IF NOT EXISTS account_type TEXT NOT NULL DEFAULT 'admin';

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
  ON public.profiles (lower(username)) WHERE username IS NOT NULL;

-- Admin writes the new staff member's profile row
DROP POLICY IF EXISTS "Admins manage profiles" ON public.profiles;
CREATE POLICY "Admins manage profiles" ON public.profiles
  FOR ALL TO authenticated USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

-- ─── 2. One password, one person ────────────────────────────────────────────
-- Only a peppered SHA-256 fingerprint is kept, never the password, and the table
-- is unreadable from the API: it is touched only through the functions below.
CREATE TABLE IF NOT EXISTS public.password_fingerprints (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  fingerprint TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.password_fingerprints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.password_fingerprints FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public._password_fingerprint(pw TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public, extensions AS $$
  SELECT encode(extensions.digest('manga-staff-pw::' || pw, 'sha256'), 'hex');
$$;
REVOKE ALL ON FUNCTION public._password_fingerprint(TEXT) FROM PUBLIC, anon, authenticated;

/** True when no account already uses this password. Admin only. */
CREATE OR REPLACE FUNCTION public.staff_password_available(pw TEXT, exclude_user UUID DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Only an admin can manage staff passwords'; END IF;
  RETURN NOT EXISTS (
    SELECT 1 FROM public.password_fingerprints
    WHERE fingerprint = public._password_fingerprint(pw)
      AND (exclude_user IS NULL OR user_id <> exclude_user)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.staff_password_available(TEXT, UUID) TO authenticated;

/** Records the password admin gave this account; fails if someone else has it. */
CREATE OR REPLACE FUNCTION public.register_staff_password(target UUID, pw TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF NOT public.is_app_admin() THEN RAISE EXCEPTION 'Only an admin can manage staff passwords'; END IF;
  INSERT INTO public.password_fingerprints (user_id, fingerprint)
  VALUES (target, public._password_fingerprint(pw))
  ON CONFLICT (user_id) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, created_at = now();
EXCEPTION WHEN unique_violation THEN
  RAISE EXCEPTION 'That password is already used by another staff member';
END;
$$;
GRANT EXECUTE ON FUNCTION public.register_staff_password(UUID, TEXT) TO authenticated;

-- Staff are created by admin only: the trigger no longer hands out admin.
-- Accounts created from Settings get their role set right after; anything else
-- starts with the least-privileged role.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, phone, username, account_type)
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'display_name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'username',
    CASE WHEN new.raw_user_meta_data->>'username' IS NOT NULL THEN 'staff' ELSE 'admin' END
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (new.id, 'mechanic')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN new;
END;
$$;

-- ─── 5. Notifications (declared first: chat and tags write into it) ─────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  kind       TEXT NOT NULL,           -- 'tag' | 'mention' | 'message'
  title      TEXT NOT NULL,
  body       TEXT,
  link       TEXT,
  ref_id     UUID,
  read_at    TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON public.notifications (user_id, created_at DESC);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Own notifications" ON public.notifications;
CREATE POLICY "Own notifications" ON public.notifications
  FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "Mark own notifications" ON public.notifications;
CREATE POLICY "Mark own notifications" ON public.notifications
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Delete own notifications" ON public.notifications;
CREATE POLICY "Delete own notifications" ON public.notifications
  FOR DELETE TO authenticated USING (user_id = auth.uid());
GRANT SELECT, UPDATE, DELETE ON public.notifications TO authenticated;

-- ─── 3. Chat ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.chat_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind        TEXT NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct', 'group', 'team')),
  title       TEXT,
  direct_key  TEXT UNIQUE,            -- "<smaller uuid>:<larger uuid>" for 1-to-1 chats
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_members (
  thread_id    UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  joined_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_members_user ON public.chat_members (user_id);

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id  UUID NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  sender_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  body       TEXT NOT NULL CHECK (length(trim(body)) > 0),
  mentions   UUID[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_thread ON public.chat_messages (thread_id, created_at);

ALTER TABLE public.chat_threads  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- The team room: everybody is in it
INSERT INTO public.chat_threads (kind, title, direct_key)
VALUES ('team', 'Team room', 'team')
ON CONFLICT (direct_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_chat_member(t UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.chat_members WHERE thread_id = t AND user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.chat_threads WHERE id = t AND kind = 'team');
$$;
GRANT EXECUTE ON FUNCTION public.is_chat_member(UUID) TO authenticated;

DROP POLICY IF EXISTS "Members read threads" ON public.chat_threads;
CREATE POLICY "Members read threads" ON public.chat_threads
  FOR SELECT TO authenticated USING (public.is_chat_member(id));

DROP POLICY IF EXISTS "Members read membership" ON public.chat_members;
CREATE POLICY "Members read membership" ON public.chat_members
  FOR SELECT TO authenticated USING (public.is_chat_member(thread_id));
DROP POLICY IF EXISTS "Update own read marker" ON public.chat_members;
CREATE POLICY "Update own read marker" ON public.chat_members
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Members read messages" ON public.chat_messages;
CREATE POLICY "Members read messages" ON public.chat_messages
  FOR SELECT TO authenticated USING (public.is_chat_member(thread_id));
DROP POLICY IF EXISTS "Members send messages" ON public.chat_messages;
CREATE POLICY "Members send messages" ON public.chat_messages
  FOR INSERT TO authenticated
  WITH CHECK (sender_id = auth.uid() AND public.is_chat_member(thread_id));
DROP POLICY IF EXISTS "Delete own messages" ON public.chat_messages;
CREATE POLICY "Delete own messages" ON public.chat_messages
  FOR DELETE TO authenticated USING (sender_id = auth.uid());

GRANT SELECT ON public.chat_threads TO authenticated;
GRANT SELECT, UPDATE ON public.chat_members TO authenticated;
GRANT SELECT, INSERT, DELETE ON public.chat_messages TO authenticated;

/** Opens (or finds) the 1-to-1 conversation with another staff member. */
CREATE OR REPLACE FUNCTION public.open_direct_chat(other UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me UUID := auth.uid();
  k  TEXT;
  t  UUID;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF other = me THEN RAISE EXCEPTION 'You cannot message yourself'; END IF;
  k := LEAST(me::text, other::text) || ':' || GREATEST(me::text, other::text);

  INSERT INTO public.chat_threads (kind, direct_key, created_by)
  VALUES ('direct', k, me)
  ON CONFLICT (direct_key) DO NOTHING;
  SELECT id INTO t FROM public.chat_threads WHERE direct_key = k;

  INSERT INTO public.chat_members (thread_id, user_id) VALUES (t, me), (t, other)
  ON CONFLICT DO NOTHING;
  RETURN t;
END;
$$;
GRANT EXECUTE ON FUNCTION public.open_direct_chat(UUID) TO authenticated;

/** Creates a named group with the given members (the creator is always added). */
CREATE OR REPLACE FUNCTION public.create_group_chat(group_title TEXT, member_ids UUID[])
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  me UUID := auth.uid();
  t  UUID;
BEGIN
  IF me IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF coalesce(trim(group_title), '') = '' THEN RAISE EXCEPTION 'Give the group a name'; END IF;
  INSERT INTO public.chat_threads (kind, title, created_by) VALUES ('group', trim(group_title), me)
  RETURNING id INTO t;
  INSERT INTO public.chat_members (thread_id, user_id)
  SELECT t, u FROM unnest(array_append(member_ids, me)) AS u
  ON CONFLICT DO NOTHING;
  RETURN t;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_group_chat(TEXT, UUID[]) TO authenticated;

/** Marks a thread read for me; joins the team room on first visit. */
CREATE OR REPLACE FUNCTION public.mark_chat_read(t UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_chat_member(t) THEN RAISE EXCEPTION 'Not a member'; END IF;
  INSERT INTO public.chat_members (thread_id, user_id, last_read_at) VALUES (t, auth.uid(), now())
  ON CONFLICT (thread_id, user_id) DO UPDATE SET last_read_at = now();
END;
$$;
GRANT EXECUTE ON FUNCTION public.mark_chat_read(UUID) TO authenticated;

-- New message: bump the thread and notify @mentioned people
CREATE OR REPLACE FUNCTION public.on_chat_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sender_name TEXT;
  th public.chat_threads;
BEGIN
  UPDATE public.chat_threads SET last_message_at = NEW.created_at WHERE id = NEW.thread_id
  RETURNING * INTO th;
  SELECT coalesce(display_name, username, 'A colleague') INTO sender_name
    FROM public.profiles WHERE id = NEW.sender_id;

  INSERT INTO public.notifications (user_id, actor_id, kind, title, body, link, ref_id)
  SELECT DISTINCT m, NEW.sender_id, 'mention',
         coalesce(sender_name, 'A colleague') || ' mentioned you' ||
           CASE WHEN th.kind = 'direct' THEN '' ELSE ' in ' || coalesce(th.title, 'a group') END,
         left(NEW.body, 200),
         '/messages?thread=' || NEW.thread_id,
         NEW.id
  FROM unnest(NEW.mentions) AS m
  WHERE m <> NEW.sender_id
    AND (th.kind = 'team' OR EXISTS (
      SELECT 1 FROM public.chat_members cm WHERE cm.thread_id = NEW.thread_id AND cm.user_id = m));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_chat_message ON public.chat_messages;
CREATE TRIGGER trg_chat_message AFTER INSERT ON public.chat_messages
  FOR EACH ROW EXECUTE FUNCTION public.on_chat_message();

-- ─── 4. Private page tags ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.page_tags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_path   TEXT NOT NULL,          -- e.g. /vehicles/9f1c… (the exact document)
  page_title  TEXT,
  from_user   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  to_user     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note        TEXT NOT NULL CHECK (length(trim(note)) > 0),
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (from_user <> to_user)
);
CREATE INDEX IF NOT EXISTS idx_page_tags_to   ON public.page_tags (to_user, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_tags_from ON public.page_tags (from_user, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_tags_path ON public.page_tags (page_path);
ALTER TABLE public.page_tags ENABLE ROW LEVEL SECURITY;

-- Only the two people in the tag can ever see it. There is deliberately no
-- admin bypass: a private instruction stays private.
DROP POLICY IF EXISTS "Tag parties read" ON public.page_tags;
CREATE POLICY "Tag parties read" ON public.page_tags
  FOR SELECT TO authenticated USING (auth.uid() IN (from_user, to_user));
DROP POLICY IF EXISTS "Create own tags" ON public.page_tags;
CREATE POLICY "Create own tags" ON public.page_tags
  FOR INSERT TO authenticated WITH CHECK (from_user = auth.uid());
DROP POLICY IF EXISTS "Tag parties update" ON public.page_tags;
CREATE POLICY "Tag parties update" ON public.page_tags
  FOR UPDATE TO authenticated USING (auth.uid() IN (from_user, to_user))
  WITH CHECK (auth.uid() IN (from_user, to_user));
DROP POLICY IF EXISTS "Sender deletes tag" ON public.page_tags;
CREATE POLICY "Sender deletes tag" ON public.page_tags
  FOR DELETE TO authenticated USING (from_user = auth.uid());
GRANT SELECT, INSERT, UPDATE, DELETE ON public.page_tags TO authenticated;

CREATE OR REPLACE FUNCTION public.on_page_tag()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sender_name TEXT;
BEGIN
  SELECT coalesce(display_name, username, 'A colleague') INTO sender_name
    FROM public.profiles WHERE id = NEW.from_user;
  INSERT INTO public.notifications (user_id, actor_id, kind, title, body, link, ref_id)
  VALUES (NEW.to_user, NEW.from_user, 'tag',
          coalesce(sender_name, 'A colleague') || ' tagged you on ' || coalesce(NEW.page_title, NEW.page_path),
          left(NEW.note, 200),
          NEW.page_path || CASE WHEN position('?' IN NEW.page_path) > 0 THEN '&' ELSE '?' END || 'tag=' || NEW.id,
          NEW.id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_page_tag ON public.page_tags;
CREATE TRIGGER trg_page_tag AFTER INSERT ON public.page_tags
  FOR EACH ROW EXECUTE FUNCTION public.on_page_tag();

-- Deleting a tag removes its notification too
CREATE OR REPLACE FUNCTION public.on_page_tag_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.notifications WHERE kind = 'tag' AND ref_id = OLD.id;
  RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS trg_page_tag_delete ON public.page_tags;
CREATE TRIGGER trg_page_tag_delete AFTER DELETE ON public.page_tags
  FOR EACH ROW EXECUTE FUNCTION public.on_page_tag_delete();

-- ─── Realtime ───────────────────────────────────────────────────────────────
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

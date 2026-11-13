-- ════════════════════════════════════════════════════════════════════════════
-- Document Archive — the company's permanent record of every printed document
--
-- Each time a document is printed or downloaded anywhere in the app, an exact
-- copy is filed here with searchable details (type, number, date, customer,
-- NIN, vehicle) and a snapshot of the customer and vehicle records.
--
-- Permanent: rows can be added, never edited or deleted — not by staff, not by
-- admin, not through the API. Triggers refuse UPDATE, DELETE and TRUNCATE, and
-- there are no update/delete policies or grants.
--
-- Who can read it: admin always; any other role that has "Document Archive"
-- ticked (View) in Settings → Permissions. Direct Sales Agents never.
-- ════════════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;

-- "Can this user view this page?" — the same matrix the app uses, read in SQL
CREATE OR REPLACE FUNCTION public.can_view_page(page TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  my_role TEXT;
  matrix JSONB;
BEGIN
  IF public.is_app_admin() THEN RETURN TRUE; END IF;
  SELECT role::text INTO my_role FROM public.user_roles WHERE user_id = auth.uid();
  IF my_role IS NULL OR my_role = 'dsa' THEN RETURN FALSE; END IF;
  BEGIN
    SELECT value::text::jsonb INTO matrix FROM public.app_settings WHERE key = 'permissions';
  EXCEPTION WHEN others THEN
    RETURN FALSE;
  END;
  IF matrix IS NULL OR jsonb_typeof(matrix -> my_role -> 'view') <> 'array' THEN RETURN FALSE; END IF;
  RETURN (matrix -> my_role -> 'view') ? page;
END;
$$;
GRANT EXECUTE ON FUNCTION public.can_view_page(TEXT) TO authenticated;

CREATE TABLE IF NOT EXISTS public.document_archive (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_type        TEXT NOT NULL,           -- "Receipt", "Sales Agreement", …
  title           TEXT NOT NULL,
  doc_number      TEXT,
  doc_date        DATE,
  person_name     TEXT,                    -- the customer / buyer / owner / client
  person_phone    TEXT,
  person_nin      TEXT,
  vehicle_summary TEXT,
  entity_id       TEXT,                    -- id of the source record, when there is one
  html_kind       TEXT NOT NULL DEFAULT 'sheet' CHECK (html_kind IN ('sheet', 'page')),
  html            TEXT NOT NULL,           -- the document exactly as printed
  details         JSONB,                   -- customer + vehicle snapshot
  search_text     TEXT NOT NULL DEFAULT '',
  content_hash    TEXT NOT NULL UNIQUE,    -- an identical reprint is filed once
  action          TEXT,                    -- 'print' | 'pdf' | 'png' | 'jpeg'
  created_by      UUID DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_archive_created   ON public.document_archive (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_archive_doc_date  ON public.document_archive (doc_date DESC);
CREATE INDEX IF NOT EXISTS idx_archive_type      ON public.document_archive (doc_type);
CREATE INDEX IF NOT EXISTS idx_archive_person    ON public.document_archive (lower(person_name));
CREATE INDEX IF NOT EXISTS idx_archive_search    ON public.document_archive
  USING gin (search_text extensions.gin_trgm_ops);

-- Stamp who filed it, from their profile, whatever the client sends
CREATE OR REPLACE FUNCTION public.document_archive_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.created_by := auth.uid();
  NEW.created_at := now();
  SELECT coalesce(display_name, username) INTO NEW.created_by_name FROM public.profiles WHERE id = auth.uid();
  NEW.search_text := lower(concat_ws(' ',
    NEW.doc_type, NEW.title, NEW.doc_number, NEW.person_name, NEW.person_phone,
    NEW.person_nin, NEW.vehicle_summary, NEW.created_by_name, NEW.search_text));
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_document_archive_stamp ON public.document_archive;
CREATE TRIGGER trg_document_archive_stamp BEFORE INSERT ON public.document_archive
  FOR EACH ROW EXECUTE FUNCTION public.document_archive_stamp();

-- Permanent record: no edits, no deletions, no truncation — for anyone
CREATE OR REPLACE FUNCTION public.document_archive_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'The document archive is a permanent record: documents cannot be edited or deleted';
END;
$$;
DROP TRIGGER IF EXISTS trg_document_archive_no_change ON public.document_archive;
CREATE TRIGGER trg_document_archive_no_change BEFORE UPDATE OR DELETE ON public.document_archive
  FOR EACH ROW EXECUTE FUNCTION public.document_archive_immutable();
DROP TRIGGER IF EXISTS trg_document_archive_no_truncate ON public.document_archive;
CREATE TRIGGER trg_document_archive_no_truncate BEFORE TRUNCATE ON public.document_archive
  FOR EACH STATEMENT EXECUTE FUNCTION public.document_archive_immutable();

ALTER TABLE public.document_archive ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_archive FROM anon, authenticated;
GRANT SELECT, INSERT ON public.document_archive TO authenticated;

DROP POLICY IF EXISTS "Archive readers" ON public.document_archive;
CREATE POLICY "Archive readers" ON public.document_archive
  FOR SELECT TO authenticated USING (public.can_view_page('archive'));

-- Anyone who prints a document files it (DSAs cannot print documents)
DROP POLICY IF EXISTS "Staff file documents" ON public.document_archive;
CREATE POLICY "Staff file documents" ON public.document_archive
  FOR INSERT TO authenticated WITH CHECK (NOT public.is_dsa());

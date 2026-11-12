-- The monthly expense sheet.
--
-- Two tables, because the sheet has two different things on it:
--
--   public.expense_groups  one thing money was spent on in a given month —
--                          "Fuel", "Office supplies", a particular repair.
--   public.expense_items   the numbered entries that make the group up:
--                          expense 1, 2, 3 … as many as the office needs.
--
-- ─── What is stored and what is computed ────────────────────────────────────
-- Stored per entry: description, amount, date, who it was paid to, how.
-- Computed in code (src/lib/expenses.ts), never stored:
--     group total    = Σ its entries' amounts
--     month total    = Σ every group's total
--     entry numbers  = position within the group
--
-- No totals column anywhere, on purpose. A stored total is one that can
-- disagree with its own parts the moment somebody edits an entry, and the whole
-- point of this page is that the arithmetic is right every time. The entry
-- number is positional for the same reason: deleting entry 2 renumbers the rest
-- rather than leaving a hole in the sheet.

-- ─── A group within one month ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Always the first day of the month, so months sort and filter as dates in
  -- SQL rather than as 'YYYY-MM' strings.
  period      DATE NOT NULL,
  name        TEXT NOT NULL,
  notes       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_expense_groups_period
  ON public.expense_groups (period DESC, sort_order, name);

-- ─── The numbered entries inside it ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.expense_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id       UUID NOT NULL REFERENCES public.expense_groups(id) ON DELETE CASCADE,
  description    TEXT,
  amount         NUMERIC NOT NULL DEFAULT 0,
  -- The day the money actually went out, which need not be the day it was typed
  spent_on       DATE,
  paid_to        TEXT,
  payment_method TEXT,
  reference      TEXT,              -- receipt or transfer reference
  notes          TEXT,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Serves both "this group's entries in order" and the ON DELETE CASCADE
CREATE INDEX IF NOT EXISTS idx_expense_items_group
  ON public.expense_items (group_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_expense_items_spent_on
  ON public.expense_items (spent_on DESC);

-- ─── Keep updated_at honest ─────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_expense_groups_touch ON public.expense_groups;
CREATE TRIGGER trg_expense_groups_touch BEFORE UPDATE ON public.expense_groups
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_expense_items_touch ON public.expense_items;
CREATE TRIGGER trg_expense_items_touch BEFORE UPDATE ON public.expense_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ─── Access ─────────────────────────────────────────────────────────────────
-- Authenticated only, and nothing at all for anon: this is the company's
-- spending. Who can open the page is decided by the permission matrix, and
-- 'expenses' is granted to nobody but admin by default (src/lib/permissions.ts)
-- — the same call made for payroll. An admin hands it to whoever keeps the
-- books by ticking the box in Settings.
ALTER TABLE public.expense_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_items  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access to expense groups" ON public.expense_groups;
CREATE POLICY "Authenticated full access to expense groups"
  ON public.expense_groups FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated full access to expense items" ON public.expense_items;
CREATE POLICY "Authenticated full access to expense items"
  ON public.expense_items FOR ALL TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_items  TO authenticated;

-- ─── Realtime ───────────────────────────────────────────────────────────────
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_groups;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.expense_items;
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

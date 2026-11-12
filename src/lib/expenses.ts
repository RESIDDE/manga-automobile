/**
 * The arithmetic of the monthly expense sheet.
 *
 * Expenses are recorded in **groups**: a group is one thing money was spent on
 * — "Fuel", "Office supplies", a particular repair — and inside it sit the
 * numbered entries that make it up (expense 1, 2, 3 …). The office adds as many
 * entries to a group as it needs.
 *
 * Nothing here touches the network or React, so the month's maths is testable
 * on its own. The rule the rest of the app follows applies here too: a total is
 * never stored, only ever summed from the entries that make it. A stored total
 * is one that can disagree with its own parts after an edit.
 */

/** One numbered line inside a group, as stored. */
export type ExpenseItem = {
  id?: string;
  group_id?: string | null;
  description?: string | null;
  amount?: number | string | null;
  spent_on?: string | null;
  paid_to?: string | null;
  payment_method?: string | null;
  reference?: string | null;
  notes?: string | null;
  sort_order?: number | null;
};

/** A group of entries within one month. */
export type ExpenseGroup = {
  id?: string;
  period?: string | null;
  name: string;
  notes?: string | null;
  sort_order?: number | null;
  expense_items?: ExpenseItem[] | null;
};

export type MonthTotals = {
  groups: number;
  entries: number;
  total: number;
  /** The group that cost the most, for the stat tile. Null on an empty month. */
  largest: { name: string; total: number } | null;
};

/**
 * Money out of a form field or a NUMERIC column, as a number.
 *
 * Commas survive from `CurrencyInput`, and Supabase hands NUMERIC back as a
 * string on some clients — both have to parse, and anything unreadable has to
 * come back 0 rather than NaN, or one bad cell turns the month's total into
 * "NaN" and the sheet is useless.
 */
export const expenseAmount = (value: number | string | null | undefined): number => {
  const n = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : Number(value);
  return Number.isFinite(n) ? n : 0;
};

// ─── Within a group ─────────────────────────────────────────────────────────

/** What a group cost: the sum of its entries. */
export function groupTotal(group: ExpenseGroup): number {
  return (group.expense_items ?? []).reduce((sum, i) => sum + expenseAmount(i.amount), 0);
}

/** How many entries a group holds. */
export const groupCount = (group: ExpenseGroup): number => (group.expense_items ?? []).length;

/**
 * A group's entries in the order they were typed, each tagged with the number
 * the sheet shows it under — expense 1, 2, 3.
 *
 * Numbering is positional, not stored: deleting entry 2 renumbers the rest
 * rather than leaving a gap, which is what anybody reading the sheet expects.
 */
export function numberedItems(group: ExpenseGroup): (ExpenseItem & { no: number })[] {
  return [...(group.expense_items ?? [])]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((item, index) => ({ ...item, no: index + 1 }));
}

// ─── Across the month ───────────────────────────────────────────────────────

/** Groups in sheet order. */
export function sortedGroups(groups: ExpenseGroup[]): ExpenseGroup[] {
  return [...groups].sort(
    (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.name.localeCompare(b.name)
  );
}

/**
 * Every figure the month's header shows, in one pass — so the stat tiles, the
 * total bar and any export read the same numbers and cannot disagree.
 */
export function monthTotals(groups: ExpenseGroup[]): MonthTotals {
  const totals: MonthTotals = { groups: groups.length, entries: 0, total: 0, largest: null };

  for (const group of groups) {
    const total = groupTotal(group);
    totals.entries += groupCount(group);
    totals.total += total;
    if (!totals.largest || total > totals.largest.total) {
      totals.largest = { name: group.name, total };
    }
  }

  // A month of nothing but zero-amount entries has no meaningful "largest"
  if (totals.largest && totals.largest.total <= 0) totals.largest = null;

  return totals;
}

/** Each group's share of the month, for the breakdown bars. 0 on an empty month. */
export function groupShare(group: ExpenseGroup, groups: ExpenseGroup[]): number {
  const { total } = monthTotals(groups);
  if (total <= 0) return 0;
  return (groupTotal(group) / total) * 100;
}

// ─── Searching ──────────────────────────────────────────────────────────────

/** True when a group, or any entry in it, matches the typed text. */
export function groupMatches(group: ExpenseGroup, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (group.name.toLowerCase().includes(q)) return true;
  if ((group.notes || "").toLowerCase().includes(q)) return true;

  return (group.expense_items ?? []).some((item) =>
    [item.description, item.paid_to, item.payment_method, item.reference, item.notes]
      .some((field) => (field || "").toLowerCase().includes(q))
  );
}

// ─── Carrying a month forward ───────────────────────────────────────────────

/**
 * Last month's groups as the skeleton for this one.
 *
 * The office spends on the same handful of things every month — fuel, rent,
 * electricity — so the group names carry across. **The amounts do not.** An
 * expense is something that actually happened; copying last month's figures
 * forward would invent spending nobody made, which is exactly the kind of
 * error a ledger must not make easy.
 *
 * Each copied group comes back with one blank entry, ready to type into.
 */
export function carryGroupsForward(groups: ExpenseGroup[]): ExpenseGroup[] {
  return sortedGroups(groups).map((group, index) => ({
    name: group.name,
    notes: group.notes ?? null,
    sort_order: index,
    expense_items: [{ description: "", amount: 0, sort_order: 0 }],
  }));
}

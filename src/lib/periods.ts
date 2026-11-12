/**
 * Months, as the office's monthly sheets use them.
 *
 * A period is held as 'YYYY-MM' in the UI and the first day of that month in
 * the database. Both are built from the parts, never from `toISOString()`,
 * which converts to UTC and can land the 1st of a month on the last day of the
 * previous one for anybody east of Greenwich.
 *
 * Shared by the salary schedule and the expense sheet, which both run a month
 * at a time and must agree on what a month is.
 */

const pad = (n: number) => String(n).padStart(2, "0");

/** 'YYYY-MM' for a date — today by default. */
export function periodKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

/** 'YYYY-MM' → the DATE the database stores: the first of that month. */
export const periodToDate = (key: string): string => `${key}-01`;

/** A stored DATE (or timestamp) → 'YYYY-MM'. */
export const dateToPeriod = (value: string): string => value.slice(0, 7);

/** 'YYYY-MM' → 'OCTOBER 2026', the heading the paper sheet carries. */
export function periodLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return `${date.toLocaleString("en-US", { month: "long" }).toUpperCase()} ${year}`;
}

/** 'YYYY-MM' → 'Oct 2026', for a dropdown where shouting would be rude. */
export function periodShortLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return `${date.toLocaleString("en-US", { month: "short" })} ${year}`;
}

/** The month before this one, December rolling back to the previous year. */
export function previousPeriod(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return month <= 1 ? `${year - 1}-12` : `${year}-${pad(month - 1)}`;
}

/** The month after this one. */
export function nextPeriod(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return month >= 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
}

/**
 * The most recent month before `target` that already has a sheet.
 *
 * Starting a new month copies from this rather than from `previousPeriod`,
 * because a month can be skipped — a sheet typed up late, or an office that
 * missed December. Keying strictly on "last month" would offer nothing at all
 * in that case and send somebody back to typing fourteen rows by hand.
 *
 * Null when nothing precedes it, which is the genuinely first month.
 */
export function latestPeriodBefore(target: string, known: string[]): string | null {
  const earlier = known.filter((k) => k < target).sort();
  return earlier.length ? earlier[earlier.length - 1] : null;
}

/**
 * The months to offer in the picker: this month first, then back through the
 * year, plus any month that already has a sheet — including one typed ahead of
 * time, which would otherwise be impossible to reopen.
 */
export function periodOptions(existing: string[] = [], months = 18): string[] {
  const keys = new Set(existing);
  const now = new Date();
  for (let i = 0; i < months; i++) {
    keys.add(periodKey(new Date(now.getFullYear(), now.getMonth() - i, 1)));
  }
  return [...keys].sort().reverse();
}

import { format, subMonths } from "date-fns";

export const ALL_TIME = "all";
export const ALL_WEEKS = "all";

/** "All Time" plus the last 12 months, newest first. Values are `yyyy-MM`. */
export function monthOptions(): { value: string; label: string }[] {
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = subMonths(new Date(), i);
    return { value: format(d, "yyyy-MM"), label: format(d, "MMMM yyyy") };
  });
  return [{ value: ALL_TIME, label: "All Time" }, ...months];
}

export const WEEK_OPTIONS = [
  { value: ALL_WEEKS, label: "All Weeks" },
  { value: "1", label: "Week 1" },
  { value: "2", label: "Week 2" },
  { value: "3", label: "Week 3" },
  { value: "4", label: "Week 4" },
  { value: "5", label: "Week 5" },
];

/** Week of the month, 1-indexed, by calendar day (1–7 → week 1, 8–14 → week 2, …). */
export function weekOfMonth(date: Date): number {
  return Math.min(5, Math.floor((date.getDate() - 1) / 7) + 1);
}

/**
 * True when a record's date passes the month + week filters. The week filter only
 * applies within the chosen month, matching how staff read the paper files.
 */
export function matchesPeriod(
  dateValue: string | null | undefined,
  month: string,
  week: string
): boolean {
  if (month === ALL_TIME && week === ALL_WEEKS) return true;
  if (!dateValue) return false;

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return false;

  if (month !== ALL_TIME && format(date, "yyyy-MM") !== month) return false;
  if (week !== ALL_WEEKS && String(weekOfMonth(date)) !== week) return false;
  return true;
}

/** `en-GB` long form, e.g. "6 November 2026" — the form the documents print. */
export function longDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/** Short `en-GB` form, e.g. "06/11/2026". */
export function shortDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB");
}

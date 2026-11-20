// ─── Staff loans: the arithmetic ────────────────────────────────────────────
// Pure functions, shared by the form, the printed document and the tests. The
// salary sheet is filled by the database (20261120120000_staff_loans.sql) using
// exactly the same rule as repaymentSchedule() below.

export type LoanDecision = "pending" | "approved" | "approved_with_changes" | "declined";

export const DECISIONS: { value: Exclude<LoanDecision, "pending">; label: string }[] = [
  { value: "approved", label: "Approved" },
  { value: "approved_with_changes", label: "Approved with changes" },
  { value: "declined", label: "Declined" },
];

export const decisionLabel = (d?: string | null): string =>
  DECISIONS.find((x) => x.value === d)?.label ?? "Awaiting decision";

export const isApproved = (d?: string | null) => d === "approved" || d === "approved_with_changes";

const num = (v: unknown): number => {
  const n = typeof v === "string" ? parseFloat(v.replace(/,/g, "")) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Months needed to repay `amount` at `monthly` a month (the last month takes the remainder). */
export function monthsToRepay(amount: unknown, monthly: unknown): number {
  const a = num(amount), m = num(monthly);
  if (a <= 0 || m <= 0) return 0;
  return Math.ceil(a / m);
}

export type ScheduleRow = { month: string; opening: number; deduction: number; closing: number };

/** "2026-09" + k months → "2026-12" */
export function addMonths(period: string, k: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Month-by-month repayment, as the salary sheet will show it: each month's
 * opening balance, deduction (never more than is left) and closing balance.
 * Stops at `months` or when the balance reaches zero, whichever comes first.
 */
export function repaymentSchedule(
  amount: unknown, monthly: unknown, firstMonth: string | null | undefined, months?: number | null,
): ScheduleRow[] {
  const a = num(amount), m = num(monthly);
  if (a <= 0 || m <= 0 || !firstMonth || !/^\d{4}-\d{2}/.test(firstMonth)) return [];
  const count = months && months > 0 ? months : monthsToRepay(a, m);
  const rows: ScheduleRow[] = [];
  let opening = a;
  for (let k = 0; k < count && opening > 0; k++) {
    const deduction = Math.min(m, opening);
    rows.push({ month: addMonths(firstMonth.slice(0, 7), k), opening, deduction, closing: opening - deduction });
    opening -= deduction;
  }
  return rows;
}

/** True when the agreed months are too few to clear the loan at that deduction. */
export function scheduleShortfall(amount: unknown, monthly: unknown, months?: number | null): number {
  const a = num(amount), m = num(monthly);
  if (!months || months <= 0 || a <= 0 || m <= 0) return 0;
  return Math.max(0, a - m * months);
}

/** "2 years, 3 months" since the date of employment. */
export function lengthOfService(employed?: string | null, asOf: Date = new Date()): string {
  if (!employed) return "";
  const start = new Date(employed);
  if (Number.isNaN(start.getTime()) || start > asOf) return "";
  let months = (asOf.getFullYear() - start.getFullYear()) * 12 + (asOf.getMonth() - start.getMonth());
  if (asOf.getDate() < start.getDate()) months -= 1;
  if (months < 1) return "Less than a month";
  const y = Math.floor(months / 12), mo = months % 12;
  return [y && `${y} year${y === 1 ? "" : "s"}`, mo && `${mo} month${mo === 1 ? "" : "s"}`].filter(Boolean).join(", ");
}

/** "2026-11" → "November 2026" */
export function monthLabel(period?: string | null): string {
  if (!period || !/^\d{4}-\d{2}/.test(period)) return "";
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

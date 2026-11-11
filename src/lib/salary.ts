/**
 * The arithmetic of the monthly salary schedule.
 *
 * Every figure the sheet shows but nobody types lives here, and nothing here
 * touches the network or React — so the office's maths is testable on its own.
 *
 * The sheet, column by column:
 *
 *   ACTUAL SALARY        typed    what the person earns this month
 *   LOAN AMOUNT          typed    the original loan, unchanged as it is repaid
 *   DEDUCTION            typed    the repayment taken out of this month's pay
 *   RECEIVING AMOUNT     derived  actual salary − deduction
 *   LOAN BALANCE         derived  opening balance − deduction
 *   GRAND TOTAL          derived  Σ receiving amount
 *
 * `opening_balance` is what was still owed when the month began. It is what
 * makes the balance column a formula rather than a number somebody remembers:
 * a ₦2,100,000 loan standing at ₦1,900,000 with a ₦200,000 deduction closes the
 * month at ₦1,700,000, while the loan amount stays ₦2,100,000 throughout.
 */

/** A row of the sheet, as stored. Only the typed figures — the rest is derived. */
export type SalaryLine = {
  id?: string;
  period?: string;
  staff_id?: string | null;
  staff_name: string;
  designation?: string | null;
  account_number?: string | null;
  bank_name?: string | null;
  actual_salary?: number | string | null;
  loan_amount?: number | string | null;
  opening_balance?: number | string | null;
  deduction?: number | string | null;
  notes?: string | null;
  sort_order?: number | null;
};

export type ScheduleTotals = {
  staff: number;
  salary: number;
  loans: number;
  deductions: number;
  /** The grand total of the sheet: what actually leaves the account. */
  receiving: number;
  /** What the staff still owe once this month's deductions are taken. */
  loanBalance: number;
};

/**
 * Money out of a form field or a NUMERIC column, as a number.
 *
 * Commas survive from `CurrencyInput`, and Supabase hands NUMERIC back as a
 * string on some clients — both have to parse, and anything unreadable has to
 * come back 0 rather than NaN, or one bad cell turns the grand total into
 * "NaN" and the sheet is useless.
 */
const num = (value: number | string | null | undefined): number => {
  const n = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : Number(value);
  return Number.isFinite(n) ? n : 0;
};

// ─── Per line ───────────────────────────────────────────────────────────────

/** What the person is actually paid: salary less this month's deduction. */
export function receivingAmount(line: SalaryLine): number {
  return num(line.actual_salary) - num(line.deduction);
}

/**
 * What is still owed after this month: opening balance less the deduction.
 *
 * Floored at zero. A deduction larger than the balance clears the loan and
 * stops there — it never turns into the company owing the staff member money.
 */
export function closingBalance(line: SalaryLine): number {
  return Math.max(num(line.opening_balance) - num(line.deduction), 0);
}

/**
 * True when the deduction is bigger than the pay, so the row would hand
 * somebody a negative wage. Always a typing slip; the page flags the cell
 * instead of quietly paying a negative figure into the total.
 */
export function isOverDeducted(line: SalaryLine): boolean {
  return receivingAmount(line) < 0;
}

/**
 * True when the deduction exceeds what is actually still owed. Also a slip —
 * the balance floors at zero, so the extra would be taken for nothing.
 */
export function isOverRepaid(line: SalaryLine): boolean {
  return num(line.deduction) > num(line.opening_balance);
}

/** Every row problem the page should warn about, so callers ask once. */
export function lineWarnings(line: SalaryLine): string[] {
  const out: string[] = [];
  if (isOverDeducted(line)) out.push("Deduction is more than the salary");
  if (isOverRepaid(line)) out.push("Deduction is more than the loan balance");
  return out;
}

// ─── Across the sheet ───────────────────────────────────────────────────────

/**
 * Sum every money column at once.
 *
 * One pass, one object: the stat tiles, the table's total row and the printed
 * footer all read the same numbers, so they can never disagree with each other.
 */
export function scheduleTotals(lines: SalaryLine[]): ScheduleTotals {
  const totals: ScheduleTotals = {
    staff: lines.length,
    salary: 0,
    loans: 0,
    deductions: 0,
    receiving: 0,
    loanBalance: 0,
  };

  for (const line of lines) {
    totals.salary += num(line.actual_salary);
    totals.loans += num(line.loan_amount);
    totals.deductions += num(line.deduction);
    totals.receiving += receivingAmount(line);
    totals.loanBalance += closingBalance(line);
  }

  return totals;
}

/** The grand total of the sheet on its own, for callers that want only it. */
export const grandTotal = (lines: SalaryLine[]): number => scheduleTotals(lines).receiving;

// ─── Carrying a month forward ───────────────────────────────────────────────

/**
 * Last month's sheet as the starting point for this one.
 *
 * What carries: the person, their designation, bank details and salary, the
 * original loan, and the repayment they are already on.
 * What moves: the loan balance rolls forward — last month's closing balance
 * becomes this month's opening balance.
 * What is capped: the repeated deduction never exceeds what is left owing, so
 * the final instalment of a loan collects the remainder and no more.
 *
 * Rows for people who have finished repaying simply come across with zeros in
 * the loan columns.
 */
export function carryForward(lines: SalaryLine[]): SalaryLine[] {
  return lines.map((line, index) => {
    const opening = closingBalance(line);
    return {
      staff_id: line.staff_id ?? null,
      staff_name: line.staff_name,
      designation: line.designation ?? null,
      account_number: line.account_number ?? null,
      bank_name: line.bank_name ?? null,
      actual_salary: num(line.actual_salary),
      loan_amount: opening > 0 ? num(line.loan_amount) : 0,
      opening_balance: opening,
      deduction: Math.min(num(line.deduction), opening),
      notes: null,
      sort_order: line.sort_order ?? index,
    };
  });
}

// ─── Months ─────────────────────────────────────────────────────────────────
// A period is held as 'YYYY-MM' in the UI and the first day of that month in
// the database. Both are built from the parts, never from `toISOString()`,
// which converts to UTC and can land the 1st of a month on the last day of the
// previous one for anybody east of Greenwich.

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

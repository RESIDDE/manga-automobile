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
// Lifted into src/lib/periods.ts when the expense sheet needed the same
// calendar. Re-exported here so everything that already reads months off this
// module keeps working.

export {
  periodKey, periodToDate, dateToPeriod, periodLabel, periodShortLabel,
  previousPeriod, nextPeriod, latestPeriodBefore, periodOptions,
} from "./periods";

import { Fragment, useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen, CalendarClock, ChevronDown, ClipboardEdit, Gavel, Link2, Lock, Printer, Wallet,
} from "lucide-react";
import { formatNaira } from "@/lib/numberToWords";
import { monthLabel, repaymentSchedule } from "@/lib/loans";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "manga_loan_guide_open";

/** The worked example: the figures on the paper form the office already uses. */
const EXAMPLE = { amount: 2100000, monthly: 200000, months: 11, first: "2026-11" };

const STEPS = [
  {
    icon: ClipboardEdit,
    title: "Fill in the application",
    body: (
      <>
        Click <b>New application</b> and fill in <b>A. Staff information</b>, <b>B. Loan request</b> and{" "}
        <b>C. Declaration</b>. Choose the person from the <b>salary roster</b> at the top of section A: this is
        what connects the loan to their salary. The applicant signs on the screen.
      </>
    ),
  },
  {
    icon: Gavel,
    title: "Management decides",
    body: (
      <>
        A manager completes <b>D. Management decision</b>: <i>Approved</i>, <i>Approved with changes</i> or{" "}
        <i>Declined</i>, then the approved amount, the monthly deduction and the <b>first deduction month</b>.
        "Use the requested figures" copies the request across to adjust. Until a decision is saved, the
        application stays <i>Awaiting decision</i> and nothing touches the salary.
      </>
    ),
  },
  {
    icon: Wallet,
    title: "Deductions go on the salary automatically",
    body: (
      <>
        As soon as an approved loan is saved, the person's <b>Salary Schedule</b> lines fill in by themselves
        for every month of the loan: the loan amount, what is still owed at the start of the month, and that
        month's deduction. It works for months already on the sheet and for months added later. Those lines
        carry a <b>Staff loan</b> tag.
      </>
    ),
  },
  {
    icon: CalendarClock,
    title: "Changes follow through",
    body: (
      <>
        Edit the loan (amount, deduction, months or first month) and the salary lines are re-worked to match.
        Decline or delete it and its deductions come off the salary. The last month only ever takes what is
        left, so nobody is over-deducted.
      </>
    ),
  },
  {
    icon: Printer,
    title: "Print and keep the record",
    body: (
      <>
        <b>Save &amp; preview</b> numbers the form (001, 002…) and shows it on the company letterhead, ready to
        print or download as PDF, PNG or JPEG. With <b>Add to archive</b> on, a Company Copy is filed in the{" "}
        <b>Document Archive</b>.
      </>
    ),
  },
];

/**
 * "How staff loans work": a short walkthrough at the top of the Staff Loans
 * page, with a worked example of how a loan comes off the salary.
 */
export function LoanGuide() {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) !== "closed";
    } catch {
      return true;
    }
  });

  const toggle = () => {
    setOpen((was) => {
      try { localStorage.setItem(STORAGE_KEY, was ? "closed" : "open"); } catch { /* not remembered */ }
      return !was;
    });
  };

  const rows = repaymentSchedule(EXAMPLE.amount, EXAMPLE.monthly, EXAMPLE.first, EXAMPLE.months);
  const shown = [...rows.slice(0, 3), ...rows.slice(-2)];

  return (
    <section className="rounded-3xl border border-indigo-500/20 bg-indigo-500/[0.04] overflow-hidden">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="p-2 rounded-xl bg-indigo-500/10 shrink-0"><BookOpen className="h-4 w-4 text-indigo-500" /></span>
          <span>
            <span className="block font-bold">How staff loans work</span>
            <span className="block text-xs text-muted-foreground">From application to salary deduction, in five steps</span>
          </span>
        </span>
        <ChevronDown className={cn("h-5 w-5 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5">
          <ol className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="rounded-2xl border bg-card p-4 space-y-2">
                  <p className="flex items-center gap-2 font-semibold text-sm">
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-indigo-500 text-white text-xs font-bold">{i + 1}</span>
                    <Icon className="h-4 w-4 text-indigo-500 shrink-0" />
                    {step.title}
                  </p>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{step.body}</p>
                </li>
              );
            })}

            {/* Worked example */}
            <li className="rounded-2xl border bg-card p-4 space-y-2 md:col-span-2 xl:col-span-1">
              <p className="font-semibold text-sm">Example</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {formatNaira(EXAMPLE.amount)} approved at {formatNaira(EXAMPLE.monthly)} a month, starting{" "}
                {monthLabel(EXAMPLE.first)}. It takes {rows.length} months: ten of {formatNaira(EXAMPLE.monthly)},
                then the last {formatNaira(rows[rows.length - 1]?.deduction ?? 0)}.
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground text-left">
                    <th className="py-1 font-medium">Month</th>
                    <th className="py-1 font-medium text-right">Owing</th>
                    <th className="py-1 font-medium text-right">Deducted</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r, i) => (
                    <Fragment key={r.month}>
                      {i === 3 && rows.length > 5 && (
                        <tr className="border-t border-white/5">
                          <td colSpan={3} className="py-1 text-center text-muted-foreground">
                            … {rows.length - 5} more months of {formatNaira(EXAMPLE.monthly)} …
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-white/5">
                        <td className="py-1">{monthLabel(r.month)}</td>
                        <td className="py-1 text-right tabular-nums">{formatNaira(r.opening)}</td>
                        <td className="py-1 text-right tabular-nums font-semibold">{formatNaira(r.deduction)}</td>
                      </tr>
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </li>
          </ol>

          <div className="grid gap-2 sm:grid-cols-2 text-[12px]">
            <p className="flex items-start gap-2 rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400 px-3 py-2">
              <Link2 className="h-4 w-4 shrink-0 mt-px" />
              <span>A loan that is <b>not linked</b> to someone on the salary roster is saved and printed, but never deducted. Link it in section A.</span>
            </p>
            <p className="flex items-start gap-2 rounded-xl bg-foreground/5 text-muted-foreground px-3 py-2">
              <Lock className="h-4 w-4 shrink-0 mt-px" />
              <span>
                Confidential: only admin and roles given <b>Staff Loans</b> in Settings → Permissions can see loans.
                Recording the decision needs <b>Edit</b>. See the deductions on the{" "}
                <Link to="/salary-schedule" className="underline hover:text-foreground">Salary Schedule</Link>.
              </span>
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

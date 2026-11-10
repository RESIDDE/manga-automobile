import { describe, it, expect } from "vitest";
import {
  carryForward, closingBalance, dateToPeriod, grandTotal, isOverDeducted,
  isOverRepaid, lineWarnings, nextPeriod, periodKey, periodLabel, periodOptions,
  periodShortLabel, periodToDate, previousPeriod, receivingAmount,
  scheduleTotals, type SalaryLine,
} from "@/lib/salary";

/** The October 2026 sheet the office filled in by hand, as typed. */
const OCTOBER: SalaryLine[] = [
  { staff_name: "SAMUEL CHRISSTIANA UDOFIA", designation: "Office Secretary", actual_salary: 200_000 },
  { staff_name: "FAVOUR NWAFOR NKEM", designation: "Vehicle Records", actual_salary: 200_000, loan_amount: 150_000, opening_balance: 100_000, deduction: 50_000 },
  { staff_name: "SUMAIYYA BINTU YUSUF", designation: "Property Inventory", actual_salary: 150_000 },
  { staff_name: "ABUBAKAR ALIYU SADIQ", designation: "HR", actual_salary: 300_000 },
  { staff_name: "NATHAN FAVOUR CHIOMA", designation: "Content Creator", actual_salary: 250_000, loan_amount: 2_100_000, opening_balance: 1_900_000, deduction: 200_000 },
  { staff_name: "CHRISTOPHER UGONNA OGUIKE", designation: "Videographer", actual_salary: 300_000 },
  { staff_name: "ABDULMALIK MUSA", designation: "Car Wash", actual_salary: 50_000 },
  { staff_name: "ALHASSSAN MOHAMMED", designation: "Car Wash", actual_salary: 50_000 },
  { staff_name: "LUMI ISHAKU", designation: "Car Wash", actual_salary: 50_000 },
  { staff_name: "ANAS IBRAHIM", designation: "Car Wash", actual_salary: 50_000 },
  { staff_name: "ADAMU MOHAMMED", designation: "Car Wash", actual_salary: 50_000 },
  { staff_name: "ABDULLAHI JIBRIL ADAM", designation: "Cordinator", actual_salary: 50_000 },
  { staff_name: "IBRAHIM YUSUF", designation: "Security", actual_salary: 300_000 },
  { staff_name: "AISHA Bagudu Umar", designation: "Cleaner", actual_salary: 20_000 },
];

describe("receivingAmount", () => {
  it("is the salary less this month's deduction", () => {
    expect(receivingAmount({ staff_name: "A", actual_salary: 250_000, deduction: 200_000 })).toBe(50_000);
  });

  it("is the whole salary when there is no deduction", () => {
    expect(receivingAmount({ staff_name: "A", actual_salary: 200_000 })).toBe(200_000);
  });

  it("reads the comma-formatted strings the currency inputs produce", () => {
    expect(receivingAmount({ staff_name: "A", actual_salary: "250,000", deduction: "200,000" })).toBe(50_000);
  });

  it("is 0, not NaN, for a blank row", () => {
    expect(receivingAmount({ staff_name: "" })).toBe(0);
    expect(receivingAmount({ staff_name: "A", actual_salary: "abc" })).toBe(0);
  });
});

describe("closingBalance", () => {
  it("rolls the opening balance down by the deduction", () => {
    // The paper sheet: ₦1,900,000 owed, ₦200,000 taken, ₦1,700,000 left.
    expect(closingBalance({ staff_name: "A", opening_balance: 1_900_000, deduction: 200_000 })).toBe(1_700_000);
    expect(closingBalance({ staff_name: "B", opening_balance: 100_000, deduction: 50_000 })).toBe(50_000);
  });

  it("floors at zero, so an over-payment never owes money back", () => {
    expect(closingBalance({ staff_name: "A", opening_balance: 30_000, deduction: 50_000 })).toBe(0);
  });

  it("is zero for staff with no loan", () => {
    expect(closingBalance({ staff_name: "A", actual_salary: 200_000 })).toBe(0);
  });
});

describe("warnings", () => {
  it("flags a deduction bigger than the pay", () => {
    expect(isOverDeducted({ staff_name: "A", actual_salary: 50_000, deduction: 80_000 })).toBe(true);
    expect(isOverDeducted({ staff_name: "A", actual_salary: 50_000, deduction: 50_000 })).toBe(false);
  });

  it("flags a deduction bigger than what is still owed", () => {
    expect(isOverRepaid({ staff_name: "A", opening_balance: 40_000, deduction: 50_000 })).toBe(true);
    expect(isOverRepaid({ staff_name: "A", opening_balance: 40_000, deduction: 40_000 })).toBe(false);
  });

  it("says nothing about a correct row", () => {
    expect(lineWarnings(OCTOBER[4])).toEqual([]);
  });

  it("can report both problems at once", () => {
    expect(lineWarnings({ staff_name: "A", actual_salary: 20_000, opening_balance: 0, deduction: 50_000 }))
      .toEqual(["Deduction is more than the salary", "Deduction is more than the loan balance"]);
  });
});

describe("scheduleTotals", () => {
  it("sums the office's October sheet to the figure they wrote at the bottom", () => {
    const totals = scheduleTotals(OCTOBER);
    expect(totals.staff).toBe(14);
    // Gross pay before any deduction — the 2,120,000 on the paper
    expect(totals.salary).toBe(2_020_000);
    expect(totals.deductions).toBe(250_000);
    // The GRAND TOTAL cell: what actually leaves the account
    expect(totals.receiving).toBe(1_770_000);
    expect(totals.loans).toBe(2_250_000);
    expect(totals.loanBalance).toBe(1_750_000);
  });

  it("holds the identity the sheet depends on: receiving = salary − deductions", () => {
    const { salary, deductions, receiving } = scheduleTotals(OCTOBER);
    expect(receiving).toBe(salary - deductions);
  });

  it("totals an empty month to zeros rather than NaN", () => {
    expect(scheduleTotals([])).toEqual({
      staff: 0, salary: 0, loans: 0, deductions: 0, receiving: 0, loanBalance: 0,
    });
  });

  it("grandTotal is the receiving column on its own", () => {
    expect(grandTotal(OCTOBER)).toBe(1_770_000);
  });
});

describe("carryForward", () => {
  const november = carryForward(OCTOBER);

  it("brings everyone across with their details and salary", () => {
    expect(november).toHaveLength(14);
    expect(november[0]).toMatchObject({
      staff_name: "SAMUEL CHRISSTIANA UDOFIA", designation: "Office Secretary", actual_salary: 200_000,
    });
  });

  it("rolls last month's closing balance into this month's opening balance", () => {
    expect(november[4]).toMatchObject({
      loan_amount: 2_100_000,   // the original loan does not change as it is repaid
      opening_balance: 1_700_000,
      deduction: 200_000,       // the repayment they are already on
    });
    expect(closingBalance(november[4])).toBe(1_500_000);
  });

  it("caps the last instalment at what is left, instead of over-collecting", () => {
    // ₦120,000 owed, repaying ₦50,000 a month: 70,000 → 20,000, where a
    // repeated 50,000 would overshoot.
    const [second] = carryForward([
      { staff_name: "A", actual_salary: 200_000, loan_amount: 150_000, opening_balance: 120_000, deduction: 50_000 },
    ]);
    expect(second).toMatchObject({ opening_balance: 70_000, deduction: 50_000 });

    const [third] = carryForward([second]);
    expect(third.opening_balance).toBe(20_000);
    expect(third.deduction).toBe(20_000);
    expect(closingBalance(third)).toBe(0);
  });

  it("clears the loan columns once a loan is fully repaid", () => {
    const [done] = carryForward([
      { staff_name: "A", actual_salary: 200_000, loan_amount: 150_000, opening_balance: 50_000, deduction: 50_000 },
    ]);
    expect(done).toMatchObject({ loan_amount: 0, opening_balance: 0, deduction: 0 });
    expect(receivingAmount(done)).toBe(200_000);
  });

  it("drops last month's row ids and notes, so nothing is overwritten", () => {
    const [row] = carryForward([{ id: "abc", staff_name: "A", actual_salary: 1, notes: "paid late" }]);
    expect(row.id).toBeUndefined();
    expect(row.notes).toBeNull();
  });

  it("keeps the S/N order of the sheet", () => {
    expect(carryForward([{ staff_name: "A" }, { staff_name: "B" }]).map((l) => l.sort_order)).toEqual([0, 1]);
  });
});

describe("periods", () => {
  it("keys a month as YYYY-MM", () => {
    expect(periodKey(new Date(2026, 9, 15))).toBe("2026-10");
    expect(periodKey(new Date(2026, 0, 1))).toBe("2026-01");
  });

  it("converts to and from the date the database stores", () => {
    expect(periodToDate("2026-10")).toBe("2026-10-01");
    expect(dateToPeriod("2026-10-01")).toBe("2026-10");
    expect(dateToPeriod("2026-10-01T00:00:00+00:00")).toBe("2026-10");
  });

  it("does not drift a month backwards in a positive timezone", () => {
    // toISOString() on a local midnight 1st would give the previous month in
    // Lagos (UTC+1). The parts-based build cannot.
    expect(periodKey(new Date(2026, 10, 1, 0, 0, 0))).toBe("2026-11");
  });

  it("labels a month the way the paper sheet does", () => {
    expect(periodLabel("2026-10")).toBe("OCTOBER 2026");
    expect(periodShortLabel("2026-10")).toBe("Oct 2026");
  });

  it("steps months, rolling over the year boundary", () => {
    expect(previousPeriod("2026-10")).toBe("2026-09");
    expect(previousPeriod("2026-01")).toBe("2025-12");
    expect(nextPeriod("2026-10")).toBe("2026-11");
    expect(nextPeriod("2026-12")).toBe("2027-01");
  });

  it("offers recent months, newest first, with no duplicates", () => {
    const options = periodOptions([], 6);
    expect(options).toHaveLength(6);
    expect(options[0]).toBe(periodKey());
    expect([...options].sort().reverse()).toEqual(options);
  });

  it("keeps a month that already has a sheet, even a future one", () => {
    const options = periodOptions(["2019-03", "2099-01"], 6);
    expect(options).toContain("2019-03");
    expect(options[0]).toBe("2099-01");
  });
});

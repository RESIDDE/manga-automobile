import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  addMonths, lengthOfService, monthsToRepay, repaymentSchedule, scheduleShortfall,
} from "@/lib/loans";
import { StaffLoanDocument } from "@/pages/StaffLoans";
import { numberToWords } from "@/lib/numberToWords";

describe("staff loan arithmetic", () => {
  it("repays ₦2,100,000 at ₦200,000 in 11 months, the last taking the remainder", () => {
    expect(monthsToRepay(2100000, 200000)).toBe(11);
    const rows = repaymentSchedule(2100000, 200000, "2026-09", 11);
    expect(rows).toHaveLength(11);
    expect(rows[0]).toEqual({ month: "2026-09", opening: 2100000, deduction: 200000, closing: 1900000 });
    expect(rows[10]).toEqual({ month: "2027-07", opening: 100000, deduction: 100000, closing: 0 });
  });

  it("stops at the agreed months and reports what would still be owed", () => {
    expect(repaymentSchedule(1000000, 200000, "2026-11", 3)).toHaveLength(3);
    expect(scheduleShortfall(1000000, 200000, 3)).toBe(400000);
    expect(scheduleShortfall(1000000, 200000, 5)).toBe(0);
  });

  it("rolls months across the year end", () => {
    expect(addMonths("2026-11", 2)).toBe("2027-01");
  });

  it("gives length of service in years and months", () => {
    expect(lengthOfService("2024-08-15", new Date("2026-11-20"))).toBe("2 years, 3 months");
    expect(lengthOfService("2026-11-01", new Date("2026-11-20"))).toBe("Less than a month");
  });
});

describe("printed staff loan application", () => {
  const data: any = {
    documentNo: "004", staffId: "s1", fullName: "Ada Obi", staffFileNo: "MA-017", jobTitle: "Content Creator",
    department: "Content", dateOfEmployment: "2026-09-01", phone: "09030000000", residentialAddress: "Kubwa, Abuja",
    nextOfKin: "Ngozi Obi 08030000000", amountRequested: "2100000", purpose: "Business", preferredMonths: "11",
    proposedDeduction: "200000", requestedDisbursementDate: "", applicantName: "", applicantSignature: "",
    applicantSignDate: "2026-10-20", reviewerName: "", reviewerSignature: "", reviewerDate: "",
    decision: "approved", approvedAmount: "2100000", repaymentMonths: "11", monthlyDeduction: "200000",
    firstDeductionMonth: "2026-11", conditions: "", managerName: "Muhammad Manga", managerSignature: "",
    decisionDate: "2026-10-22", chkStaffId: true, chkPayslip: false, chkSupporting: false,
  };

  it("has sections A to D in order, with the declaration and checklist", () => {
    const { container } = render(<StaffLoanDocument data={data} />);
    const text = container.textContent ?? "";
    const order = ["A. Staff Information", "B. Loan Request", "C. Applicant's Declaration and Consent", "D. Management Decision", "Document Checklist"]
      .map((h) => text.indexOf(h));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(text).toContain("Staff Loan Application Form");
    expect(text).toContain("Confidential – For staff and management use only");
    expect(text).toMatch(/I declare that the information supplied in this form is true and complete/);
  });

  it("prints the figures, the amount in words and the first deduction month", () => {
    render(<StaffLoanDocument data={data} />);
    expect(screen.getAllByText(/2,100,000/).length).toBeGreaterThan(0);
    expect(screen.getByText(numberToWords(2100000))).toBeInTheDocument(); // section B, amount in words
    expect(screen.getByText("November 2026")).toBeInTheDocument();
    expect(screen.getAllByText("11 months").length).toBe(2);
  });
});

import { fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoanGuide } from "@/components/LoanGuide";

describe("loan walkthrough", () => {
  it("explains the five steps with a worked example, and folds away", () => {
    localStorage.removeItem("manga_loan_guide_open");
    render(<MemoryRouter><LoanGuide /></MemoryRouter>);
    for (const step of ["Fill in the application", "Management decides", "Deductions go on the salary automatically",
      "Changes follow through", "Print and keep the record"]) {
      expect(screen.getByText(step)).toBeInTheDocument();
    }
    expect(screen.getByText(/It takes 11 months/)).toBeInTheDocument();
    expect(screen.getAllByText("₦100,000").length).toBeGreaterThan(0); // the final, smaller month

    fireEvent.click(screen.getByRole("button", { name: /how staff loans work/i }));
    expect(screen.queryByText("Management decides")).toBeNull();
    expect(localStorage.getItem("manga_loan_guide_open")).toBe("closed");
  });
});

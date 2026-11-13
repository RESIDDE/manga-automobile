import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExpenseSheetDocument } from "@/components/ExpenseSheetDocument";
import { COMPANY } from "@/components/PrintHeader";

describe("ExpenseSheetDocument", () => {
  it("prints letterhead, watermark, groups and the month total", () => {
    const groups: any[] = [
      { id: "g1", name: "Fuel", sort_order: 0, expense_items: [
        { id: "a", description: "Generator diesel", amount: 20000, sort_order: 0 },
        { id: "b", description: "Car fuel", amount: 5000, sort_order: 1 },
      ] },
    ];
    const { container } = render(<ExpenseSheetDocument period="2026-11" groups={groups} preparedBy="Ada Obi" />);
    expect(screen.getByText("Expense Statement")).toBeInTheDocument();
    expect(screen.getByText(COMPANY.addressLines[0])).toBeInTheDocument();
    expect(container.querySelectorAll("img").length).toBeGreaterThanOrEqual(2); // logo + watermark
    expect(screen.getByText("Generator diesel")).toBeInTheDocument();
    expect(screen.getAllByText(/25,000/).length).toBeGreaterThan(0);
  });
});

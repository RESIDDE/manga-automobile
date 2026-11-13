import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SalesReportDocument, paginate, type SalesReportRow } from "@/components/SalesReportDocument";

const row = (i: number): SalesReportRow => ({
  id: `s${i}`, saleNo: `#${i}`, date: "2026-11-01", vehicle: `Car ${i}`, customer: `Buyer ${i}`,
  price: 1000, paid: 600, balance: 400,
});

describe("SalesReportDocument", () => {
  it("splits long lists into A4 pages, a shorter first page for the letterhead", () => {
    expect(paginate(Array.from({ length: 10 }, (_, i) => i))).toHaveLength(1);
    const pages = paginate(Array.from({ length: 60 }, (_, i) => i));
    expect(pages[0]).toHaveLength(16);
    expect(pages.flat()).toHaveLength(60);
    expect(pages.length).toBe(3);
  });

  it("renders one sheet per page with the scope, rows and totals", () => {
    const rows = Array.from({ length: 20 }, (_, i) => row(i + 1));
    const { container } = render(<SalesReportDocument title="Sales Report" scope="November 2026 · Outstanding" rows={rows} />);
    expect(container.querySelectorAll(".print-document-page")).toHaveLength(2);
    expect(screen.getAllByText("November 2026 · Outstanding")).toHaveLength(2); // title + continued heading
    expect(screen.getByText("Car 20")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getAllByText(/20,000/).length).toBeGreaterThan(0); // total value
  });
});

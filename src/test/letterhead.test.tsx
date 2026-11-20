import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { COMPANY, ModernLetterhead, PrintHeader, getPrintHeaderHTML } from "@/components/PrintHeader";

describe("company letterhead", () => {
  it("prints the RC number under the phone number", () => {
    const { container } = render(<PrintHeader />);
    expect(COMPANY.rc).toBe("9604190");
    const text = container.textContent ?? "";
    expect(screen.getByText("RC. 9604190")).toBeInTheDocument();
    expect(text.indexOf(`Tel: ${COMPANY.tel}`)).toBeLessThan(text.indexOf("RC. 9604190"));
  });

  it("carries the RC number on the other letterhead styles too", () => {
    render(<ModernLetterhead docTitle="Proforma Invoice" />);
    expect(screen.getByText("RC. 9604190")).toBeInTheDocument();
    expect(getPrintHeaderHTML()).toContain("RC. 9604190");
  });

  it("uses the larger logo", () => {
    const { container } = render(<PrintHeader />);
    expect(container.querySelector("img")?.className).toContain("h-[78px]");
  });
});

import { SaleReceiptDocument } from "@/components/SaleReceiptDocument";

describe("sale receipt", () => {
  const sale: any = { id: "s1", sale_date: "2026-11-20", sale_price: 5000000, sale_number: 7, payment_method: "Transfer" };
  const items = [{ id: "i1", description: "2018 Toyota Camry", vin: "4T1B11HK5JU123456", color: "Black", keys: 2, amount: 5000000 }];

  it("labels the chassis number and shows the customer's NIN", () => {
    render(<SaleReceiptDocument sale={sale} customer={{ name: "Ada Obi", nin: "12345678901" }} items={items} />);
    expect(screen.getByText(/Chassis No: 4T1B11HK5JU123456/)).toBeInTheDocument();
    expect(screen.getByText("12345678901")).toBeInTheDocument();
  });

  it("keeps a NIN line to write on when none is on file", () => {
    render(<SaleReceiptDocument sale={sale} customer={{ name: "Ada Obi" }} items={items} />);
    expect(screen.getByText("NIN:")).toBeInTheDocument();
  });
});

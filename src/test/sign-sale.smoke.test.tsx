import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const SALE = {
  id: "aaaa1111-0000-0000-0000-000000000000",
  sale_price: 5_000_000,
  sale_date: "2026-11-06",
  payment_type: "transfer",
  payment_status: "deposit",
  rep_name: "Ibrahim Musa",
  buyer_signature: null as string | null,
  buyer_signature_date: null as string | null,
  is_registered: false,
  customer: { name: "Zainab Bello", phone: "08010000000", email: "z@example.com", address: "Abuja" },
  sale_vehicles: [
    {
      price: 5_000_000,
      vehicle: { make: "Lexus", model: "RX 350", year: 2015, trim: "F-Sport", vin: "JN1AZ4EH4FM", color: "Silver" },
    },
  ],
  sale_payments: [
    { id: "bbbb2222-0000", amount: 2_000_000, payment_date: "2026-11-06T10:00:00Z", payment_method: "cash" },
  ],
};

const updates: any[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const builder: any = {
        select: () => builder,
        update: (values: any) => { updates.push(values); return builder; },
        eq: () => builder,
        in: () => Promise.resolve({ data: [], error: null }),
        single: () => Promise.resolve({
          data: table === "sales" ? SALE : null,
          error: null,
        }),
        then: (resolve: any) => resolve({ data: null, error: null }),
      };
      return builder;
    },
  },
}));

import SignSale from "@/pages/SignSale";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,SIG") as any;
});

beforeEach(() => {
  updates.length = 0;
  SALE.buyer_signature = null;
  SALE.buyer_signature_date = null;
});

function renderSignPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/sign/sale/aaaa1111-0000-0000-0000-000000000000"]}>
        <Routes>
          <Route path="/sign/sale/:id" element={<SignSale />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Sale signing link", () => {
  it("shows the real receipt document, not a summary card", async () => {
    renderSignPage();

    expect(await screen.findByText("Please review and sign")).toBeInTheDocument();
    // The document component's own heading and structure
    expect(screen.getByText("Sales Receipt")).toBeInTheDocument();
    expect(screen.getByText("Billed to")).toBeInTheDocument();
    expect(screen.getByText("Amount in words")).toBeInTheDocument();
    expect(screen.getAllByText("Balance due").length).toBeGreaterThan(0);

    // Line item carries the vehicle with its VIN, trim and colour
    expect(screen.getByText("2015 Lexus RX 350")).toBeInTheDocument();
    expect(screen.getByText(/JN1AZ4EH4FM · F-Sport · Silver/)).toBeInTheDocument();

    // It is the A4 sheet, so it matches what gets printed
    expect(document.querySelector(".print-document-page")).toBeTruthy();
  });

  it("quotes the same receipt number the office will print", async () => {
    renderSignPage();
    // RCT-DDMM-NNNN, from the shared helper — a re-print matches this slip
    expect(await screen.findByText(/RCT-0611-AAAA/)).toBeInTheDocument();
  });

  it("shows the derived figures, not the stored status", async () => {
    renderSignPage();
    // ₦5,000,000 with a ₦2,000,000 instalment → ₦3,000,000 outstanding. The
    // figures appear on the document and again on the summary tiles.
    await screen.findByText("Please review and sign");
    expect(screen.getAllByText("₦2,000,000").length).toBeGreaterThan(0);
    expect(screen.getAllByText("₦3,000,000").length).toBeGreaterThan(0);
  });

  it("offers the signature pad and the refund policy", async () => {
    renderSignPage();
    expect(await screen.findByText(/Sign here — buyer/i)).toBeInTheDocument();
    expect(screen.getByText(/no refund of money is made after payment/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign & accept this document/i })).toBeDisabled();
  });

  it("tells a customer when the document has already been signed", async () => {
    SALE.buyer_signature = "data:image/png;base64,OLD";
    SALE.buyer_signature_date = "2026-11-07";
    renderSignPage();

    expect(await screen.findByText("This document is already signed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign again/i })).toBeInTheDocument();
  });
});

describe("document watermark", () => {
  it("sits inside the A4 sheet, so exported files carry it too", async () => {
    renderSignPage();
    await screen.findByText("Please review and sign");

    const sheet = document.querySelector(".print-document-page") as HTMLElement;
    expect(sheet).toBeTruthy();

    // The watermark must be a descendant of the captured sheet. It used to be
    // position:fixed against the viewport, which html2canvas could not place,
    // so downloaded PNG/JPEG/PDF copies came out without it.
    const mark = sheet.querySelector('[aria-hidden="true"] img') as HTMLImageElement;
    expect(mark).toBeTruthy();
    expect(mark.parentElement?.className).toContain("absolute");
    expect(mark.parentElement?.className).not.toContain("fixed");
    expect(mark.style.opacity).toBe("0.07");
    expect(mark.style.transform).toContain("rotate");
  });
});

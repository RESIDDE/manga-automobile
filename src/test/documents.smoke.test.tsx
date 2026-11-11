import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// The document pages only read on mount; every query resolves to an empty list.
vi.mock("@/integrations/supabase/client", () => {
  const empty = { data: [], error: null };
  const builder: any = {
    select: () => builder,
    order: async () => empty,
    eq: async () => empty,
    not: async () => empty,
    then: (resolve: any) => resolve(empty),
  };
  return { supabase: { from: () => builder } };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, role: "super_admin", isLoading: false }),
}));

import AuthorityToSell from "@/pages/AuthorityToSell";
import SalesAgreement from "@/pages/SalesAgreement";
import ProformaInvoice from "@/pages/ProformaInvoice";
import { numberToWords, formatNaira } from "@/lib/numberToWords";
import { matchesPeriod, weekOfMonth } from "@/lib/historyFilters";

beforeAll(() => {
  // jsdom has no canvas backend; SignaturePad only needs these to not throw
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => null
  ) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => localStorage.clear());

function renderPage(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Authority to Sell", () => {
  it("opens on the create tab with the owner and vehicle sections", () => {
    renderPage(<AuthorityToSell />);
    expect(screen.getByText("Owner's Information")).toBeInTheDocument();
    expect(screen.getByText("Vehicle Information")).toBeInTheDocument();
    expect(screen.getByText("Authority Terms")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save & Preview Document/i })).toBeDisabled();
  });

  it("caps the chassis field at the shared VIN length and upper-cases it", () => {
    renderPage(<AuthorityToSell />);
    const vin = document.querySelector("input.font-mono.uppercase") as HTMLInputElement;
    fireEvent.change(vin, { target: { value: "ab cd1234567890" } });
    expect(vin.value).toBe("ABCD1234567");
    expect(vin.value.length).toBe(11);
  });
});

describe("Sales Agreement", () => {
  it("renders both parties, the vehicle and the five signature pads", () => {
    renderPage(<SalesAgreement />);
    expect(screen.getByText("Seller's Information")).toBeInTheDocument();
    expect(screen.getByText("Buyer's Information")).toBeInTheDocument();
    expect(screen.getByText("Vehicle Details")).toBeInTheDocument();
    expect(screen.getByText("Sale Details")).toBeInTheDocument();
    expect(screen.getByText("Seller's witness")).toBeInTheDocument();
    expect(screen.getByText("Buyer's witness")).toBeInTheDocument();
    expect(screen.getByText("Company representative")).toBeInTheDocument();
  });

  it("spells the sale price out in words as it is typed", () => {
    renderPage(<SalesAgreement />);
    const price = screen.getByPlaceholderText("0") as HTMLInputElement;
    fireEvent.change(price, { target: { value: "5000000" } });
    expect(price.value).toBe("5,000,000");
    expect(screen.getByText("Five Million Naira Only")).toBeInTheDocument();
  });
});

describe("Proforma Invoice", () => {
  it("shows the stat cards and an empty state before any quote exists", async () => {
    renderPage(<ProformaInvoice />);
    expect(screen.getByText("Quotes in range")).toBeInTheDocument();
    expect(screen.getByText("Total quote value")).toBeInTheDocument();
    expect(await screen.findByText("No proforma invoices yet")).toBeInTheDocument();
  });

  it("opens the editor dialog from New Quote", () => {
    renderPage(<ProformaInvoice />);
    fireEvent.click(screen.getByRole("button", { name: /New Quote/i }));
    expect(screen.getByText("Create Proforma Invoice")).toBeInTheDocument();
    expect(screen.getByText("Vehicles")).toBeInTheDocument();
    expect(screen.getByText(/VAT & Payment Details/i)).toBeInTheDocument();
    // Nothing to save until a vehicle is on the quote
    expect(screen.getByRole("button", { name: /^Save Invoice$/i })).toBeDisabled();
  });
});

describe("document helpers", () => {
  it("spells amounts the way the documents print them", () => {
    expect(numberToWords(0)).toBe("Zero Naira Only");
    expect(numberToWords(1500)).toBe("One Thousand Five Hundred Naira Only");
    expect(numberToWords(5_000_000)).toBe("Five Million Naira Only");
    expect(numberToWords("2,450,000")).toBe("Two Million Four Hundred and Fifty Thousand Naira Only");
    expect(numberToWords(1500.5)).toContain("Fifty Kobo");
    expect(formatNaira(5_000_000)).toBe("₦5,000,000");
  });

  it("filters history by month and by week within that month", () => {
    expect(weekOfMonth(new Date("2026-11-01"))).toBe(1);
    expect(weekOfMonth(new Date("2026-11-08"))).toBe(2);
    expect(weekOfMonth(new Date("2026-11-30"))).toBe(5);

    expect(matchesPeriod("2026-11-08", "all", "all")).toBe(true);
    expect(matchesPeriod("2026-11-08", "2026-11", "2")).toBe(true);
    expect(matchesPeriod("2026-11-08", "2026-11", "3")).toBe(false);
    expect(matchesPeriod("2026-10-08", "2026-11", "all")).toBe(false);
    expect(matchesPeriod(null, "2026-11", "all")).toBe(false);
  });
});

describe("draft persistence", () => {
  it("brings a part-filled form back after an accidental close", () => {
    const { unmount } = renderPage(<AuthorityToSell />);
    fireEvent.change(screen.getByPlaceholderText("As written on the ID"), {
      target: { value: "Ibrahim Musa" },
    });
    fireEvent.change(screen.getByPlaceholderText("Toyota"), { target: { value: "Lexus" } });

    // Simulate the tab being closed and the page opened again
    unmount();
    renderPage(<AuthorityToSell />);

    expect((screen.getByPlaceholderText("As written on the ID") as HTMLInputElement).value)
      .toBe("Ibrahim Musa");
    expect((screen.getByPlaceholderText("Toyota") as HTMLInputElement).value).toBe("Lexus");
    expect(screen.getByRole("button", { name: /Save & Preview Document/i })).toBeEnabled();
  });

  it("Clear Form drops the draft so the next document starts blank", () => {
    const { unmount } = renderPage(<AuthorityToSell />);
    fireEvent.change(screen.getByPlaceholderText("As written on the ID"), {
      target: { value: "Ibrahim Musa" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^Clear Form$/i }));
    unmount();

    renderPage(<AuthorityToSell />);
    expect((screen.getByPlaceholderText("As written on the ID") as HTMLInputElement).value).toBe("");
  });

  it("keeps the proforma editor filled when Preview is opened mid-entry", async () => {
    renderPage(<ProformaInvoice />);
    fireEvent.click(screen.getByRole("button", { name: /New Quote/i }));

    // Type a customer and a vehicle so the quote can be previewed
    fireEvent.click(screen.getByRole("button", { name: /Type a new customer/i }));
    fireEvent.change(screen.getByPlaceholderText("Customer name *"), {
      target: { value: "Zainab Bello" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Enter a vehicle manually/i }));
    fireEvent.change(screen.getByPlaceholderText("Make *"), { target: { value: "Lexus" } });
    fireEvent.change(screen.getByPlaceholderText("Model *"), { target: { value: "RX 350" } });
    fireEvent.click(screen.getByRole("button", { name: /^Add vehicle$/i }));

    fireEvent.click(screen.getByRole("button", { name: /^Preview$/i }));
    const back = await screen.findByRole("button", { name: /Back to Form/i });

    fireEvent.click(back);
    // The editor is open again with the work intact
    expect(await screen.findByText("Create Proforma Invoice")).toBeInTheDocument();
    expect((screen.getByPlaceholderText("Customer name *") as HTMLInputElement).value)
      .toBe("Zainab Bello");
    expect(screen.getByText(/Lexus RX 350/)).toBeInTheDocument();
  });

  it("quotes the full 17-character VIN on the proforma", () => {
    renderPage(<ProformaInvoice />);
    fireEvent.click(screen.getByRole("button", { name: /New Quote/i }));
    fireEvent.click(screen.getByRole("button", { name: /Enter a vehicle manually/i }));
    const vin = screen.getByPlaceholderText(/Chassis \(VIN\)/) as HTMLInputElement;
    fireEvent.change(vin, { target: { value: "jn1az4eh4fm5500001234" } });
    expect(vin.value).toBe("JN1AZ4EH4FM550000");
    expect(vin.value.length).toBe(17);
  });
});

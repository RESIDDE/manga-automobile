import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const CUSTOMERS = [
  { id: "c1", name: "Zainab Bello", phone: "08010000000", email: "z@example.com", address: "Abuja" },
];

const VEHICLES = [
  { id: "v1", make: "Lexus", model: "RX 350", year: 2015, color: "Silver", trim: "F-Sport",
    vin: "JN1AZ4EH4FM", status: "Available", inventory_type: "main", cost_price: 4_000_000,
    price: 5_000_000, source_company: "Bright Motors" },
  // Already sold: must not be offered on a new sale
  { id: "v2", make: "Toyota", model: "Camry", year: 2014, vin: "SOLDVIN0001",
    status: "Sold", inventory_type: "main", cost_price: 2_000_000, price: 3_000_000 },
  // Workshop-only: never offered for sale
  { id: "v3", make: "Honda", model: "Accord", year: 2012, vin: "SERVICEVIN1",
    status: "Available", inventory_type: "service", cost_price: 1_000_000, price: 2_000_000 },
];

const SALES = [
  {
    id: "aaaa1111-0000-0000-0000-000000000000",
    customer_id: "c1",
    vehicle_id: "v2",
    sale_price: 3_000_000,
    sale_date: "2026-11-06",
    created_at: "2026-11-06T10:00:00Z",
    payment_type: "transfer",
    payment_status: "deposit",
    notes: "",
    is_registered: false,
    sale_vehicles: [{ vehicle_id: "v2", price: 3_000_000 }],
    sale_payments: [
      { id: "bbbb2222-0000", amount: 1_000_000, payment_date: "2026-11-06T10:00:00Z", payment_method: "cash" },
    ],
  },
];

/**
 * Set this to simulate a database that is a migration behind: any select that
 * names one of these is rejected the way PostgREST rejects it.
 */
const missingSchema = { current: [] as string[] };

vi.mock("@/integrations/supabase/client", () => {
  const dataFor = (table: string) => {
    if (table === "sales") return SALES;
    if (table === "vehicles") return VEHICLES;
    if (table === "customers") return CUSTOMERS;
    return [];
  };
  return {
    supabase: {
      from: (table: string) => {
        let selection = "";
        const result = () => {
          const missing = missingSchema.current.find((name) => selection.includes(name));
          if (missing) {
            // A missing embedded table and a missing column fail differently
            const isTable = missing.includes("_payments") || missing.includes("_vehicles");
            return {
              data: null,
              error: isTable
                ? {
                    code: "PGRST200",
                    message: `Could not find a relationship between '${table}' and '${missing}'`,
                  }
                : {
                    code: "42703",
                    message: `column ${table}.${missing} does not exist`,
                  },
            };
          }
          // A sale read without the embed comes back without instalments
          if (table === "sales" && !selection.includes("sale_payments")) {
            return {
              data: SALES.map(({ sale_payments, ...rest }) => rest),
              error: null,
            };
          }
          return { data: dataFor(table), error: null };
        };
        const builder: any = {
          select: (cols = "") => { selection += ` ${cols}`; return builder; },
          eq: () => builder,
          in: () => Promise.resolve(result()),
          not: () => Promise.resolve(result()),
          or: () => Promise.resolve(result()),
          order: () => Promise.resolve(result()),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
          then: (resolve: any) => resolve(result()),
        };
        return builder;
      },
      channel: () => ({ on() { return this; }, subscribe: () => ({}) }),
      removeChannel: () => {},
    },
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, role: "super_admin", isLoading: false }),
}));

import Sales from "@/pages/Sales";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;
});

beforeEach(() => { localStorage.clear(); missingSchema.current = []; });

function renderSales() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Sales /></MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Sales page", () => {
  it("shows the analytics strip, the filter bar and the receipt ledger", async () => {
    renderSales();
    expect(await screen.findByText("Sales Analytics")).toBeInTheDocument();
    expect(screen.getByText("Receipt Records")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Search by vehicle, VIN or customer/i)).toBeInTheDocument();
    expect(screen.getByText("All payments")).toBeInTheDocument();
  });

  it("derives the balance from the instalments, not the stored status", async () => {
    renderSales();
    // ₦3,000,000 sale with one ₦1,000,000 payment → ₦1,000,000 paid, ₦2,000,000 due.
    // The card sets the figures in their own elements, so match the line as a whole.
    const card = await screen.findByText("Part paid");
    const line = card.closest(".bento-card")!;
    expect(line.textContent).toContain("₦1,000,000");
    expect(line.textContent).toContain("₦2,000,000");
    expect(line.textContent).toContain("due");
  });

  it("lists one receipt per sale and one per payment", async () => {
    renderSales();
    fireEvent.click(await screen.findByText("Receipt Records"));
    // RCT-DDMM-NNNN, from the record's date and the first four digits of its uuid
    expect(await screen.findByText("RCT-0611-AAAA")).toBeInTheDocument();
    expect(screen.getByText("RCT-0611-BBBB")).toBeInTheDocument();
  });

  it("offers only unsold stock on a new sale", async () => {
    renderSales();
    fireEvent.click(await screen.findByRole("button", { name: /Record Sale/i }));

    const picker = await screen.findByPlaceholderText(/Search by make, model, or year/i);
    const panel = picker.closest("div")!.parentElement!;
    expect(within(panel).getByText(/Lexus RX 350/)).toBeInTheDocument();
    // v2 is Sold and v3 is workshop-only
    expect(within(panel).queryByText(/Camry/)).toBeNull();
    expect(within(panel).queryByText(/Accord/)).toBeNull();
  });

  it("reveals the agreement fields only when Registered vehicle is ticked", async () => {
    renderSales();
    fireEvent.click(await screen.findByRole("button", { name: /Record Sale/i }));

    expect(screen.queryByPlaceholderText("Seller name")).toBeNull();
    fireEvent.click(await screen.findByText("Registered vehicle"));

    expect(await screen.findByPlaceholderText("Seller name")).toBeInTheDocument();
    expect(screen.getByText("1st witness")).toBeInTheDocument();
    expect(screen.getByText("2nd witness")).toBeInTheDocument();
    expect(screen.getByText("Vehicle received in good condition")).toBeInTheDocument();
  });

  it("opens the receipt preview, rendering the shared document component", async () => {
    renderSales();
    const buttons = await screen.findAllByRole("button", { name: /^Receipt$/i });
    fireEvent.click(buttons[buttons.length - 1]);

    // The sheet is rendered twice (page + print portal), so scope to the page
    expect((await screen.findAllByText("Sales Receipt")).length).toBeGreaterThan(0);
    const sheet = within(document.querySelector(".screen-only") as HTMLElement);
    expect(sheet.getByText("Sales Receipt")).toBeInTheDocument();
    expect(sheet.getByText("Balance due")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Back to Sales/i })).toBeInTheDocument();
  });
});

describe("Sales page with a pending migration", () => {
  it("still lists sales when sale_payments does not exist yet", async () => {
    // The exact situation that made a just-recorded sale vanish: PostgREST
    // rejects the whole statement over the missing embed.
    missingSchema.current = ["sale_payments"];
    renderSales();

    expect(await screen.findByText("Zainab Bello")).toBeInTheDocument();
    expect(screen.queryByText(/No sales recorded/i)).toBeNull();
  });

  it("falls back to the stored status for the balance when instalments are unavailable", async () => {
    missingSchema.current = ["sale_payments"];
    renderSales();
    // No instalments readable, and the sale is flagged deposit → full balance due
    const card = (await screen.findByText("Part paid")).closest(".bento-card")!;
    expect(card.textContent).toContain("₦3,000,000");
    expect(card.textContent).toContain("due");
  });

  it("still offers vehicles when inventory_type does not exist yet", async () => {
    missingSchema.current = ["inventory_type"];
    renderSales();
    fireEvent.click(await screen.findByRole("button", { name: /Record Sale/i }));

    const picker = await screen.findByPlaceholderText(/Search by make, model, or year/i);
    const panel = picker.closest("div")!.parentElement!;
    expect(within(panel).getByText(/Lexus RX 350/)).toBeInTheDocument();
  });
});

describe("Sales page against a database several migrations behind", () => {
  it("still lists sales when the agreement columns do not exist", async () => {
    // The reported bug: the narrowed select named is_registered, so every
    // attempt was rejected and the page read "No sales recorded".
    missingSchema.current = ["is_registered", "agreement_details", "sale_payments"];
    renderSales();

    expect(await screen.findByText("Zainab Bello")).toBeInTheDocument();
    expect(screen.queryByText(/No sales recorded/i)).toBeNull();
  });

  it("still lists sales when sale_number is missing too", async () => {
    missingSchema.current = ["sale_number", "is_registered", "agreement_details", "sale_payments"];
    renderSales();
    expect(await screen.findByText("Zainab Bello")).toBeInTheDocument();
  });

  it("falls all the way back to select(*) when every new column is absent", async () => {
    missingSchema.current = [
      "sale_number", "is_registered", "agreement_details", "sale_payments",
      "buyer_signature_date", "rep_signature_date",
    ];
    renderSales();
    expect(await screen.findByText("Zainab Bello")).toBeInTheDocument();
  });
});

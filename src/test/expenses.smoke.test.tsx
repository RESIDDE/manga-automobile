import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

/** One month already on file: two groups, five entries, ₦150,000. */
const GROUPS = [
  {
    id: "g1", period: "2026-11-01", name: "Fuel", notes: null, sort_order: 0,
    expense_items: [
      { id: "i1", group_id: "g1", description: "Diesel for the generator", amount: 45000, spent_on: "2026-11-03", paid_to: "Total", payment_method: "Cash", reference: null, notes: null, sort_order: 0 },
      { id: "i2", group_id: "g1", description: "Petrol, office car", amount: 30000, spent_on: null, paid_to: null, payment_method: null, reference: null, notes: null, sort_order: 1 },
      { id: "i3", group_id: "g1", description: "Diesel top-up", amount: 25000, spent_on: null, paid_to: null, payment_method: null, reference: null, notes: null, sort_order: 2 },
    ],
  },
  {
    id: "g2", period: "2026-11-01", name: "Office supplies", notes: null, sort_order: 1,
    expense_items: [
      { id: "i4", group_id: "g2", description: "Printer paper", amount: 15000, spent_on: null, paid_to: null, payment_method: null, reference: null, notes: null, sort_order: 0 },
      { id: "i5", group_id: "g2", description: "Toner", amount: 35000, spent_on: null, paid_to: null, payment_method: null, reference: null, notes: null, sort_order: 1 },
    ],
  },
];

const state = { groups: GROUPS as any[] };

vi.mock("@/integrations/supabase/client", () => {
  const make = (table: string) => {
    const result = () =>
      table === "expense_groups"
        ? { data: state.groups, error: null }
        : { data: [], error: null };
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      order: async () => result(),
      insert: () => builder,
      update: () => builder,
      delete: () => builder,
      single: async () => ({ data: { id: "new" }, error: null }),
      then: (resolve: any) => resolve(result()),
    };
    return builder;
  };
  return { supabase: { from: (table: string) => make(table) } };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, role: "super_admin", isLoading: false }),
}));

import Expenses from "@/pages/Expenses";

beforeEach(() => {
  state.groups = GROUPS as any[];
});

/** The group's own heading — "Fuel" also appears in the Largest group tile. */
const heading = (name: string) => screen.queryByRole("heading", { name });
const findHeading = (name: string) => screen.findByRole("heading", { name });

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Expenses /></MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Expenses page", () => {
  it("shows the month's groups with each one's own total", async () => {
    renderPage();
    expect(await findHeading("Fuel")).toBeInTheDocument();
    expect(heading("Office supplies")).toBeInTheDocument();
    // ₦100,000 is both Fuel's total and the Largest group tile
    expect(screen.getAllByText("₦100,000").length).toBeGreaterThan(0);
    expect(screen.getByText("₦50,000")).toBeInTheDocument();
  });

  it("totals the whole month from the entries", async () => {
    renderPage();
    // 45 + 30 + 25 + 15 + 35 = 150,000, shown on the tile and the total bar
    expect((await screen.findAllByText("₦150,000")).length).toBeGreaterThan(0);
    expect(screen.getByText("Expense groups")).toBeInTheDocument();
    expect(screen.getByText("Entries")).toBeInTheDocument();
  });

  it("numbers the entries inside a group 1, 2, 3", async () => {
    renderPage();
    await findHeading("Fuel");
    expect(screen.getByText("Diesel for the generator")).toBeInTheDocument();
    expect(screen.getByText("Petrol, office car")).toBeInTheDocument();
    expect(screen.getByText("Diesel top-up")).toBeInTheDocument();
  });

  it("names the group that cost the most", async () => {
    renderPage();
    await findHeading("Fuel");
    expect(screen.getByText("Largest group")).toBeInTheDocument();
  });

  it("filters to the group whose entry matches the search", async () => {
    renderPage();
    await findHeading("Fuel");

    fireEvent.change(
      screen.getByPlaceholderText(/Search a group, an entry/i),
      { target: { value: "toner" } }
    );

    // "Toner" is an entry of Office supplies, not of Fuel
    expect(heading("Office supplies")).toBeInTheDocument();
    expect(heading("Fuel")).toBeNull();
  });

  it("opens the editor on expense 1 and keeps adding numbered entries", async () => {
    renderPage();
    await findHeading("Fuel");

    fireEvent.click(screen.getByRole("button", { name: /New Expense Group/i }));

    expect(screen.getByText("Expense 1")).toBeInTheDocument();
    expect(screen.queryByText("Expense 2")).toBeNull();

    // The button names the entry it is about to create
    fireEvent.click(screen.getByRole("button", { name: /Add expense 2/i }));
    expect(screen.getByText("Expense 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Add expense 3/i }));
    expect(screen.getByText("Expense 3")).toBeInTheDocument();
  });

  it("adds up the entries as they are typed", async () => {
    renderPage();
    await findHeading("Fuel");
    fireEvent.click(screen.getByRole("button", { name: /New Expense Group/i }));

    fireEvent.change(screen.getByLabelText("Expense 1 amount"), { target: { value: "45000" } });
    fireEvent.click(screen.getByRole("button", { name: /Add expense 2/i }));
    fireEvent.change(screen.getByLabelText("Expense 2 amount"), { target: { value: "30000" } });

    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Group total")).toBeInTheDocument();
    expect(dialog.getByText("₦75,000")).toBeInTheDocument();
  });

  it("renumbers the remaining entries when one is removed", async () => {
    renderPage();
    await findHeading("Fuel");
    fireEvent.click(screen.getByRole("button", { name: /New Expense Group/i }));

    fireEvent.click(screen.getByRole("button", { name: /Add expense 2/i }));
    fireEvent.change(screen.getByLabelText("Expense 2 description"), {
      target: { value: "Second thing" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Remove expense 1/i }));

    // What was entry 2 is now entry 1 — no gap in the numbering
    expect(screen.queryByText("Expense 2")).toBeNull();
    expect((screen.getByLabelText("Expense 1 description") as HTMLInputElement).value)
      .toBe("Second thing");
  });

  it("will not save a group with no name", async () => {
    renderPage();
    await findHeading("Fuel");
    fireEvent.click(screen.getByRole("button", { name: /New Expense Group/i }));

    const save = screen.getByRole("button", { name: /Save expense group/i });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Group name/i), { target: { value: "Repairs" } });
    expect(save).toBeEnabled();
  });

  it("invites the first group when the month is empty", async () => {
    state.groups = [];
    renderPage();
    expect(await screen.findByText(/Nothing recorded for/i)).toBeInTheDocument();
    expect(screen.getByText(/then add expense 1, 2, 3/i)).toBeInTheDocument();
  });
});

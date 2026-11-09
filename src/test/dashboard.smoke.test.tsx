import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000).toISOString();

const DATA: Record<string, unknown[]> = {
  vehicles: [
    { id: "v1", make: "Toyota", model: "Camry", year: 2021, price: 18000000, cost_price: 14000000, status: "In Stock", created_at: daysAgo(3) },
    { id: "v2", make: "Lexus", model: "RX 350", year: 2022, price: 32000000, cost_price: 26000000, status: "sold", created_at: daysAgo(40) },
    { id: "v3", make: "Honda", model: "Accord", year: 2020, price: 12000000, cost_price: 9500000, status: "In Stock", created_at: daysAgo(12) },
  ],
  sales: [
    { id: "s1", vehicle_id: "v2", sale_price: 32000000, sale_date: daysAgo(2), created_at: daysAgo(2), payment_status: "pending", vehicles: { make: "Lexus", model: "RX 350", cost_price: 26000000 } },
    { id: "s2", vehicle_id: null, sale_price: 15000000, sale_date: daysAgo(45), created_at: daysAgo(45), payment_status: "paid", vehicles: { make: "Kia", model: "Rio", cost_price: 11000000 } },
  ],
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => ({
      select: async () => ({ data: DATA[table] ?? [], error: null }),
    }),
  },
}));

import Dashboard from "@/pages/Dashboard";

function renderDashboard(seed = DATA) {
  Object.assign(DATA, seed);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Dashboard", () => {
  it("renders the bento with dealership labels, not the finance defaults", async () => {
    renderDashboard();

    expect(await screen.findByText("Business value")).toBeInTheDocument();
    expect(screen.getByText("Where value sits")).toBeInTheDocument();
    expect(screen.getByText("Cash flow")).toBeInTheDocument();
    expect(screen.getByText("Owed by make")).toBeInTheDocument();
    expect(screen.getByText("This week")).toBeInTheDocument();
    expect(screen.getByText("Awaiting payment")).toBeInTheDocument();

    // the finance-demo wording must not survive into the dealership app
    expect(screen.queryByText("Net worth")).toBeNull();
    expect(screen.queryByText("Portfolio return")).toBeNull();
    expect(screen.queryByText("Crypto")).toBeNull();
    expect(screen.queryByText("Free cash")).toBeNull();
  });

  it("drops the third-party credit badge and the currency switcher", async () => {
    renderDashboard();
    await screen.findByText("Business value");

    expect(screen.queryByLabelText("Made by vasnev.art")).toBeNull();
    // only one currency is configured, so its segmented control is hidden
    const ccy = document.querySelector("#ccy") as HTMLElement | null;
    expect(ccy?.style.display).toBe("none");
  });

  it("shows an empty state when there is nothing to chart", async () => {
    renderDashboard({ vehicles: [], sales: [] });
    expect(await screen.findByText("No data yet")).toBeInTheDocument();
  });
});

import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { PermissionsMap } from "@/lib/permissions";

const SALES = [{
  id: "aaaa1111-0000-0000-0000-000000000000",
  customer_id: "c1", vehicle_id: "v1",
  sale_price: 3_000_000, sale_date: "2026-11-06", created_at: "2026-11-06T10:00:00Z",
  payment_type: "cash", payment_status: "paid_in_full", notes: "", rep_name: "Rep",
  sale_vehicles: [{ vehicle_id: "v1", price: 3_000_000 }], sale_payments: [],
}];
const CUSTOMERS = [{ id: "c1", name: "Zainab Bello", phone: "08031234567" }];
const VEHICLES = [{ id: "v1", make: "Lexus", model: "RX 350", year: 2015, status: "Sold", inventory_type: "main" }];

/** The matrix the mocked app_settings row returns. Set per test. */
const matrix = { current: {} as PermissionsMap };
/** The signed-in role. Set per test. */
const currentRole = { value: "sales" as string };

vi.mock("@/integrations/supabase/client", () => {
  const dataFor = (table: string, selection: string) => {
    if (table === "sales") return SALES;
    if (table === "customers") return CUSTOMERS;
    if (table === "vehicles") return VEHICLES;
    if (table === "app_settings") {
      return [{ key: "permissions", value: JSON.stringify(matrix.current) }];
    }
    return [];
  };
  return {
    supabase: {
      from: (table: string) => {
        let selection = "";
        const result = () => ({ data: dataFor(table, selection), error: null });
        const single = () => ({
          data: table === "app_settings"
            ? { value: JSON.stringify(matrix.current) }
            : null,
          error: null,
        });
        const builder: any = {
          select: (cols = "") => { selection += ` ${cols}`; return builder; },
          eq: () => builder,
          in: () => Promise.resolve(result()),
          or: () => Promise.resolve(result()),
          not: () => Promise.resolve(result()),
          order: () => Promise.resolve(result()),
          maybeSingle: () => Promise.resolve(single()),
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
  useAuth: () => ({ user: { id: "u1" }, role: currentRole.value, isLoading: false }),
}));

import Sales from "@/pages/Sales";

beforeAll(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => null) as any;
});

beforeEach(() => localStorage.clear());

function renderSales() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><Sales /></MemoryRouter>
    </QueryClientProvider>
  );
}

const grant = (over: Partial<Record<"view" | "create" | "edit" | "delete", string[]>>) => {
  matrix.current = {
    sales: {
      view: (over.view ?? ["sales"]) as any,
      create: (over.create ?? []) as any,
      edit: (over.edit ?? []) as any,
      delete: (over.delete ?? []) as any,
    },
  };
};

/**
 * Edit and Delete live in the sale card's overflow menu, so a test has to open
 * it before it can see — or fail to see — them.
 *
 * Opened by keyboard rather than by pointer: jsdom has no PointerEvent, so a
 * synthesised pointerdown carries no `button` and Radix ignores it. Enter on a
 * focused trigger is a real way a user opens this menu anyway.
 */
async function rowMenu() {
  const trigger = await screen.findByRole("button", { name: /More actions/i });
  fireEvent.keyDown(trigger, { key: "Enter" });
  return within(await screen.findByRole("menu"));
}

describe("access control gates the Sales page", () => {
  beforeEach(() => { currentRole.value = "sales"; });

  it("view only: the record is visible, but nothing can be changed", async () => {
    grant({ view: ["sales"] });
    renderSales();

    expect(await screen.findByText("Zainab Bello")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Record Sale/i })).toBeNull();

    const menu = await rowMenu();
    expect(menu.queryByRole("menuitem", { name: /Edit sale/i })).toBeNull();
    expect(menu.queryByRole("menuitem", { name: /Delete sale/i })).toBeNull();
  });

  it("add: the Record Sale button appears, edit and delete stay hidden", async () => {
    grant({ view: ["sales"], create: ["sales"] });
    renderSales();

    expect(await screen.findAllByRole("button", { name: /Record Sale/i })).not.toHaveLength(0);

    const menu = await rowMenu();
    expect(menu.queryByRole("menuitem", { name: /Edit sale/i })).toBeNull();
    expect(menu.queryByRole("menuitem", { name: /Delete sale/i })).toBeNull();
  });

  it("edit: the edit action appears but delete does not — delete is never implied", async () => {
    grant({ view: ["sales"], edit: ["sales"] });
    renderSales();

    const menu = await rowMenu();
    expect(menu.getByRole("menuitem", { name: /Edit sale/i })).toBeInTheDocument();
    expect(menu.queryByRole("menuitem", { name: /Delete sale/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Record Sale/i })).toBeNull();
  });

  it("delete: granted on its own, the delete action appears", async () => {
    grant({ view: ["sales"], delete: ["sales"] });
    renderSales();

    const menu = await rowMenu();
    expect(menu.getByRole("menuitem", { name: /Delete sale/i })).toBeInTheDocument();
    expect(menu.queryByRole("menuitem", { name: /Edit sale/i })).toBeNull();
  });

  it("all four: every action is available", async () => {
    grant({ view: ["sales"], create: ["sales"], edit: ["sales"], delete: ["sales"] });
    renderSales();

    expect(await screen.findAllByRole("button", { name: /Record Sale/i })).not.toHaveLength(0);

    const menu = await rowMenu();
    expect(menu.getByRole("menuitem", { name: /Edit sale/i })).toBeInTheDocument();
    expect(menu.getByRole("menuitem", { name: /Delete sale/i })).toBeInTheDocument();
  });

  it("admin keeps every action even when the matrix grants nothing", async () => {
    currentRole.value = "admin";
    matrix.current = { admin: { view: [], create: [], edit: [], delete: [] } } as PermissionsMap;
    renderSales();

    const menu = await rowMenu();
    expect(menu.getByRole("menuitem", { name: /Edit sale/i })).toBeInTheDocument();
    expect(menu.getByRole("menuitem", { name: /Delete sale/i })).toBeInTheDocument();
  });
});

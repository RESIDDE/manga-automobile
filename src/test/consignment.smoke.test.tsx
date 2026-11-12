import { describe, it, expect, vi, beforeAll, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

// Every read resolves to an empty list: the page is exercised from a clean slate.
vi.mock("@/integrations/supabase/client", () => {
  const empty = { data: [], error: null };
  const builder: any = {
    select: () => builder,
    order: async () => empty,
    eq: () => builder,
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: any) => resolve(empty),
  };
  return { supabase: { from: () => builder } };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, role: "super_admin", isLoading: false }),
}));

import ConsignmentAgreement from "@/pages/ConsignmentAgreement";
import { VIN_FULL_LENGTH } from "@/lib/constants";

beforeAll(() => {
  // jsdom has no canvas backend; the three signature pads only need it to not throw
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => null
  ) as typeof HTMLCanvasElement.prototype.getContext;
});

beforeEach(() => localStorage.clear());

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ConsignmentAgreement />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("Vehicle Display / Consignment Agreement", () => {
  it("opens on the create tab with every section of the paper form", () => {
    renderPage();
    expect(screen.getByText("Manga Automobile")).toBeInTheDocument();
    expect(screen.getByText("The Car Owner")).toBeInTheDocument();
    expect(screen.getByText("Vehicle Details")).toBeInTheDocument();
    expect(screen.getByText("Terms")).toBeInTheDocument();
    expect(screen.getByText("Signatures")).toBeInTheDocument();
  });

  it("carries the house terms as defaults — 3 days and ₦100,000", () => {
    renderPage();
    const days = screen.getByLabelText(/Free display days/i) as HTMLInputElement;
    expect(days.value).toBe("3");
    const charge = screen.getByLabelText(/Withdrawal \/ display charge/i) as HTMLInputElement;
    expect(charge.value).toBe("100,000");
  });

  it("names Muhammad Manga as the company representative out of the box", () => {
    renderPage();
    const rep = screen.getByLabelText(/Represented by/i) as HTMLInputElement;
    expect(rep.value).toBe("Muhammad Manga (CEO)");
  });

  it("will not save until the owner and the vehicle are named", () => {
    renderPage();
    const save = screen.getByRole("button", { name: /Save & Preview Agreement/i });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("As written on the ID"), {
      target: { value: "Aliyu Bello" },
    });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("Toyota Camry"), {
      target: { value: "Toyota Corolla" },
    });
    expect(save).toBeEnabled();
  });

  it("spells the agreed selling price out in words as it is typed", () => {
    renderPage();
    const price = screen.getByLabelText(/agreed selling price/i) as HTMLInputElement;
    fireEvent.change(price, { target: { value: "8500000" } });
    expect(price.value).toBe("8,500,000");
    expect(
      screen.getByText("Eight Million Five Hundred Thousand Naira Only")
    ).toBeInTheDocument();
  });

  // The owner signs this and keeps a copy, so it carries the whole 17-character
  // chassis number, not the 11 the stock records are kept on.
  it("takes the full 17-character chassis number, upper-cased", () => {
    renderPage();
    const chassis = document.querySelector("input.font-mono.uppercase") as HTMLInputElement;

    fireEvent.change(chassis, { target: { value: "jt nbe46k7330 12345" } });
    expect(chassis.value).toBe("JTNBE46K733012345");
    expect(chassis).toHaveAttribute("maxLength", String(VIN_FULL_LENGTH));

    fireEvent.change(chassis, { target: { value: "4T1BF1FK5CU123456789" } });
    expect(chassis.value).toBe("4T1BF1FK5CU123456");
    expect(chassis.value.length).toBe(VIN_FULL_LENGTH);
  });

  it("shows an empty history until an agreement is saved", async () => {
    renderPage();
    // Radix activates a tab on mouse-down, not on click
    fireEvent.mouseDown(screen.getByRole("tab", { name: /History/i }));
    expect(
      await screen.findByText("No consignment agreements yet")
    ).toBeInTheDocument();
  });
});

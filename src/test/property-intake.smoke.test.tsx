import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: () => ({ order: async () => ({ data: [], error: null }) }),
    }),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "u1" }, role: "super_admin", isLoading: false }),
}));

import PropertyIntake from "@/pages/PropertyIntake";

beforeAll(() => {
  // jsdom has no canvas backend; SignaturePad only needs these to not throw
  HTMLCanvasElement.prototype.getContext = vi.fn(
    () => null
  ) as typeof HTMLCanvasElement.prototype.getContext;
});

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PropertyIntake />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe("PropertyIntake page", () => {
  it("renders every step of the paper form without crashing", () => {
    renderPage();
    expect(screen.getAllByText(/Property Intake/i).length).toBeGreaterThan(0);

    // Letterhead carries the Manga Automobiles artwork, not the old AMU branding
    const marks = screen.getAllByAltText("MANGA AUTOMOBILES");
    expect(marks.length).toBeGreaterThan(0);
    // logo-letterhead.png is the print copy, inlined into the bundle so a
    // document can never print without its letterhead (vite.config.ts)
    expect(marks[0].getAttribute("src")).toMatch(/logo-letterhead|^data:image/);
    expect(screen.queryByText(/A\.M\.U GLOBAL MOTORS/i)).toBeNull();

    // Step 1
    expect(screen.getByText("1. Full Name")).toBeInTheDocument();
    expect(screen.getByText("2. Phone Number")).toBeInTheDocument();
    expect(screen.getByText("3. Residential Address")).toBeInTheDocument();

    // Step 2
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    expect(screen.getByText("4. Property Type")).toBeInTheDocument();
    expect(screen.getByText("6. Ownership Documents Sighted")).toBeInTheDocument();
    expect(screen.getByText("11. Relationship with Property Owner")).toBeInTheDocument();
    expect(screen.getByText("12. Advert Placement")).toBeInTheDocument();

    // Step 3
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    expect(screen.getByText("1. Property / Land Inspected?")).toBeInTheDocument();
    expect(screen.getByText("3. Payment Status")).toBeInTheDocument();
    expect(screen.getByText("4. Condition / Remarks")).toBeInTheDocument();

    // Step 4
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    expect(screen.getByText("1. Property Accepted by Company?")).toBeInTheDocument();
    expect(screen.getByText("4. Approved By (C.E.O / Manager)")).toBeInTheDocument();
    expect(screen.getByText("Agreement")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save & View Form/i })).toBeInTheDocument();
  });

  it("ticks ownership document checkboxes and reveals the Other field", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    fireEvent.click(document.getElementById("doc-other")!);
    expect(screen.getByPlaceholderText("Specify other document")).toBeInTheDocument();

    fireEvent.click(document.getElementById("ptype-other")!);
    expect(screen.getByPlaceholderText("Specify other property type")).toBeInTheDocument();
  });
});

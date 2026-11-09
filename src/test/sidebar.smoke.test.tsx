import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { SidebarProvider } from "@/components/ui/sidebar";

const CUSTOMERS = [{ id: "c1", name: "Esther Howard" }, { id: "c2", name: "Jacob Jones" }];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { signOut: vi.fn(async () => ({ error: null })) },
    from: () => ({
      select: () => ({
        order: () => ({ limit: async () => ({ data: CUSTOMERS, error: null }) }),
      }),
    }),
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "ada@mangaautomobiles.com" },
    profile: { full_name: "Ada Obi" },
    role: "super_admin",
    isLoading: false,
  }),
}));

import { AppSidebar } from "@/components/AppSidebar";
import { AppLayout } from "@/components/AppLayout";

function renderSidebar(route = "/dashboard") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[route]}>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => vi.clearAllMocks());

describe("AppSidebar", () => {
  it("shows the Manga Automobiles lockup in the header", () => {
    renderSidebar();
    const marks = screen.getAllByAltText("Manga Automobiles");
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].getAttribute("src")).toMatch(/logo-(dark|tile)/);
  });

  it("renders the sections and nav items a super admin can reach", async () => {
    renderSidebar();
    // Nav appears once the permission matrix has loaded, so nothing a role
    // cannot open is ever flashed first.
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.getByText("Main")).toBeInTheDocument();
    expect(screen.getByText("Vehicles")).toBeInTheDocument();
    expect(screen.getByText("Property")).toBeInTheDocument();
    // search affordance with its shortcut
    expect(screen.getByText("Search")).toBeInTheDocument();
    expect(screen.getByText("⌘")).toBeInTheDocument();
    expect(screen.getByText("S")).toBeInTheDocument();
  });

  it("expands a group to reveal its tree children", async () => {
    renderSidebar();
    expect(screen.queryByText("Add Vehicle")).toBeNull();

    fireEvent.click(await screen.findByLabelText("Expand Vehicles"));
    expect(screen.getByText("All Vehicles")).toBeInTheDocument();
    expect(screen.getByText("Add Vehicle")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Collapse Vehicles"));
    expect(screen.queryByText("Add Vehicle")).toBeNull();
  });

  it("opens the group that owns the current route", async () => {
    renderSidebar("/vehicles/new");
    expect(await screen.findByText("All Vehicles")).toBeInTheDocument();
    expect(screen.getByText("Add Vehicle")).toBeInTheDocument();
  });

  it("shows the user card with name and role", async () => {
    renderSidebar();
    expect(await screen.findByText("Ada Obi")).toBeInTheDocument();
    expect(screen.getByText("super admin")).toBeInTheDocument();
  });

  it("lists recent customers with initial chips", async () => {
    renderSidebar();
    expect(await screen.findByText("Esther Howard")).toBeInTheDocument();
    expect(screen.getByText("EH")).toBeInTheDocument();
  });

  it("opens the command palette from the search button", async () => {
    renderSidebar();
    fireEvent.click(screen.getByText("Search"));
    expect(await screen.findByPlaceholderText("Search pages and actions...")).toBeInTheDocument();
  });

  it("opens the command palette with the keyboard shortcut", async () => {
    renderSidebar();
    fireEvent.keyDown(window, { key: "s", metaKey: true });
    expect(await screen.findByPlaceholderText("Search pages and actions...")).toBeInTheDocument();
  });
});

describe("AppLayout", () => {
  it("renders the Manga Automobiles logo in the mobile header", () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/dashboard"]}>
          <AppLayout>
            <div>Test Page Content</div>
          </AppLayout>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const marks = screen.getAllByAltText("Manga Automobiles");
    expect(marks.length).toBeGreaterThanOrEqual(2);
    const mobileLogo = marks.find((img) => img.getAttribute("src")?.includes("logo-tile"));
    expect(mobileLogo).toBeDefined();
    expect(screen.getByText("Test Page Content")).toBeInTheDocument();
  });
});


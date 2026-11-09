import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes, Navigate } from "react-router-dom";
import {
  firstAccessiblePath, type PermissionsMap,
} from "@/lib/permissions";

const matrix = { current: {} as PermissionsMap };
const currentRole = { value: "sales" as string | null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      // Chains like the real client: filters return the builder, terminals resolve
      const builder: any = {
        select: () => builder,
        eq: () => builder,
        order: () => builder,
        in: () => builder,
        limit: () => Promise.resolve({ data: [], error: null }),
        maybeSingle: () => Promise.resolve({
          data: { value: JSON.stringify(matrix.current) }, error: null,
        }),
        then: (resolve: any) => resolve({ data: [], error: null }),
      };
      return builder;
    },
    channel: () => ({ on() { return this; }, subscribe: () => ({}) }),
    removeChannel: () => {},
    auth: { signOut: vi.fn() },
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u1", email: "sales@example.com" },
    profile: { display_name: "Sales User" },
    role: currentRole.value,
    isLoading: false,
  }),
  AuthProvider: ({ children }: any) => children,
}));

import { RoleGuard } from "@/components/RoleGuard";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

beforeEach(() => {
  currentRole.value = "sales";
  matrix.current = {};
});

/** The app's routes, trimmed to what these tests need. */
function App({ start }: { start: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[start]}>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<RoleGuard page="dashboard"><p>Dashboard page</p></RoleGuard>} />
          <Route path="/sales" element={<RoleGuard page="sales"><p>Sales page</p></RoleGuard>} />
          <Route path="/customers" element={<RoleGuard page="customers"><p>Customers page</p></RoleGuard>} />
          <Route path="/no-access" element={<p>Nothing assigned to you yet</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

/** Mirrors App.tsx's landing route. */
function Landing() {
  const home = firstAccessiblePath(currentRole.value, matrix.current);
  return <Navigate to={home ?? "/no-access"} replace />;
}

describe("a restricted user never meets an access-denied wall", () => {
  it("lands on their own first page instead of the dashboard they cannot open", async () => {
    // Granted sales only — the old build sent them to /dashboard and then to
    // an "Access Denied" screen the moment they signed in.
    matrix.current = { sales: { view: ["sales"], create: [], edit: [], delete: [] } };
    render(<App start="/" />);

    expect(await screen.findByText("Sales page")).toBeInTheDocument();
    expect(screen.queryByText(/Access Denied/i)).toBeNull();
  });

  it("typing the URL of a page they lack drops them on a page they have", async () => {
    matrix.current = { sales: { view: ["sales", "customers"], create: [], edit: [], delete: [] } };
    render(<App start="/dashboard" />);

    // Customers comes before Sales in sidebar order, so that is their home
    expect(await screen.findByText("Customers page")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard page")).toBeNull();
    expect(screen.queryByText(/Access Denied/i)).toBeNull();
  });

  it("still opens a page they do have", async () => {
    matrix.current = { sales: { view: ["sales", "customers"], create: [], edit: [], delete: [] } };
    render(<App start="/customers" />);

    expect(await screen.findByText("Customers page")).toBeInTheDocument();
  });

  it("only someone with nothing at all sees a message, and it is not a refusal", async () => {
    matrix.current = { sales: { view: [], create: [], edit: [], delete: [] } };
    render(<App start="/" />);

    expect(await screen.findByText(/Nothing assigned to you yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/Access Denied/i)).toBeNull();
  });
});

describe("the sidebar shows only what the role can open", () => {
  const renderSidebar = () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={["/sales"]}>
          <SidebarProvider><AppSidebar /></SidebarProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it("leaves out the pages they were not given", async () => {
    matrix.current = { sales: { view: ["sales", "customers"], create: [], edit: [], delete: [] } };
    renderSidebar();

    // Nothing is listed until the real matrix arrives — showing the defaults
    // first would flash pages this role cannot open.
    expect(screen.queryByText("Dashboard")).toBeNull();
    expect(await screen.findByText("Sales")).toBeInTheDocument();
    expect(screen.getByText("Customers")).toBeInTheDocument();
    expect(screen.queryByText("Dashboard")).toBeNull();
    expect(screen.queryByText("Vehicles")).toBeNull();
    expect(screen.queryByText("Property")).toBeNull();
  });

  it("keeps a group whose child they can open, even without the parent page", async () => {
    // Documents is keyed on authority-to-sell; this role has only the proforma
    // invoice, and used to lose the whole group along with it.
    matrix.current = {
      sales: { view: ["sales", "performance-quotes"], create: [], edit: [], delete: [] },
    };
    renderSidebar();

    expect(await screen.findByText("Documents")).toBeInTheDocument();
  });
});

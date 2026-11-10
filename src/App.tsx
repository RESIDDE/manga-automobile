import { Suspense, lazy } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppLayout } from "@/components/AppLayout";
import { PrintFitSync } from "@/components/PrintFitSync";
import { RoleGuard, AdminGuard } from "@/components/RoleGuard";
import { AuthGuard, GuestGuard } from "@/components/AuthGuard";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { usePermissions, PermissionsRealtimeSync } from "@/hooks/usePermissions";
import { firstAccessiblePath } from "@/lib/permissions";
// Eager: the first screens after sign-in, so there is no spinner on arrival.
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import Unauthorized from "./pages/Unauthorized";

/**
 * Everything else is split per route. The app used to ship as one 2.2 MB bundle,
 * which had to download and parse before anything rendered; now a page (and the
 * chart, PDF and canvas libraries it uses) arrives when it is first opened.
 */
const VehiclesList = lazy(() => import("./pages/VehiclesList"));
const OutsideVehicles = lazy(() => import("./pages/OutsideVehicles"));
const VehicleForm = lazy(() => import("./pages/VehicleForm"));
const VehicleDetail = lazy(() => import("./pages/VehicleDetail"));
const SourceCompany = lazy(() => import("./pages/SourceCompany"));
const Customers = lazy(() => import("./pages/Customers"));
const Sales = lazy(() => import("./pages/Sales"));
const AuthorityToSell = lazy(() => import("./pages/AuthorityToSell"));
const SalesAgreement = lazy(() => import("./pages/SalesAgreement"));
const ProformaInvoice = lazy(() => import("./pages/ProformaInvoice"));
const Meetings = lazy(() => import("./pages/Meetings"));
const PropertyIntake = lazy(() => import("./pages/PropertyIntake"));
const SalarySchedule = lazy(() => import("./pages/SalarySchedule"));
const Settings = lazy(() => import("./pages/Settings"));
const PublicBooking = lazy(() => import("./pages/PublicBooking"));
const SignCustomer = lazy(() => import("./pages/SignCustomer"));
const SignSale = lazy(() => import("./pages/SignSale"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/**
 * Where "/" goes. It used to be a hard redirect to /dashboard, so anyone whose
 * role lacks the dashboard was bounced straight to an access-denied screen the
 * moment they signed in. Now it lands on the first page the role can open.
 */
function Landing() {
  const { user, role, isLoading } = useAuth();
  const { permissions, isLoading: permsLoading } = usePermissions();

  if (isLoading) return <RouteFallback />;
  // Signed out: "/" is the way in, so send them to the login page. A signed-out
  // visitor never gets a role, so waiting for one here would spin forever.
  if (!user) return <Navigate to="/auth" replace />;

  if (!role || permsLoading) return <RouteFallback />;
  return <Navigate to={firstAccessiblePath(role, permissions) ?? "/no-access"} replace />;
}

/** Shown while a route's chunk downloads — a beat, not a blank screen. */
function RouteFallback() {
  return (
    <div className="h-[60vh] flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      {/* Root → land directly on dashboard */}
      <Route path="/" element={<Landing />} />

      {/* Login / registration */}
      <Route path="/auth" element={<GuestGuard><Auth /></GuestGuard>} />

      {/* Public pages */}
      <Route path="/book"                element={<PublicBooking />} />
      <Route path="/sign/customer/:id"   element={<SignCustomer />} />
      <Route path="/sign/sale/:id"       element={<SignSale />} />

      {/* Main app pages inside AppLayout */}
      <Route path="/*" element={
        <AuthGuard>
        <AppLayout>
          <Routes>
            <Route path="/dashboard"         element={<RoleGuard page="dashboard"><Index /></RoleGuard>} />
            <Route path="/vehicles"          element={<RoleGuard page="vehicles"><VehiclesList /></RoleGuard>} />
            <Route path="/vehicles/new"      element={<RoleGuard page="vehicles"><VehicleForm /></RoleGuard>} />
            <Route path="/vehicles/:id"      element={<RoleGuard page="vehicles"><VehicleDetail /></RoleGuard>} />
            <Route path="/vehicles/:id/edit" element={<RoleGuard page="vehicles"><VehicleForm /></RoleGuard>} />
            <Route path="/source-company/:name" element={<RoleGuard page="vehicles"><SourceCompany /></RoleGuard>} />
            <Route path="/outside-vehicles"  element={<RoleGuard page="outside-vehicles"><OutsideVehicles /></RoleGuard>} />
            <Route path="/customers"         element={<RoleGuard page="customers"><Customers /></RoleGuard>} />
            <Route path="/sales"             element={<RoleGuard page="sales"><Sales /></RoleGuard>} />
            <Route path="/authority-to-sell" element={<RoleGuard page="authority-to-sell"><AuthorityToSell /></RoleGuard>} />
            <Route path="/sales-agreement"   element={<RoleGuard page="authority-to-sell"><SalesAgreement /></RoleGuard>} />
            <Route path="/performance-quotes" element={<RoleGuard page="performance-quotes"><ProformaInvoice /></RoleGuard>} />
            <Route path="/meetings"          element={<RoleGuard page="meetings"><Meetings /></RoleGuard>} />
            <Route path="/property-intake"   element={<RoleGuard page="property-intake"><PropertyIntake /></RoleGuard>} />
            <Route path="/salary-schedule"   element={<RoleGuard page="salary"><SalarySchedule /></RoleGuard>} />
            <Route path="/settings"          element={<AdminGuard><Settings /></AdminGuard>} />
            <Route path="/no-access"         element={<Unauthorized />} />
            <Route path="/unauthorized"      element={<Unauthorized />} />
            <Route path="*"                  element={<NotFound />} />
          </Routes>
        </AppLayout>
        </AuthGuard>
      } />
    </Routes>
    </Suspense>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PrintFitSync />
      <BrowserRouter>
        <AuthProvider>
          <PermissionsRealtimeSync />
          <AppRoutes />
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

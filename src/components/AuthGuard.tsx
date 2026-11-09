import { Navigate, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

function Resolving() {
  return (
    <div className="h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

/**
 * Wraps the signed-in app. Sends visitors without a session to /auth,
 * remembering where they were headed so login can return them there.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <Resolving />;
  if (!user) return <Navigate to="/auth" replace state={{ from: location }} />;

  return <>{children}</>;
}

/**
 * Wraps the login page. Bounces users who already have a session back into
 * the app, which is how Auth.tsx navigates after a successful sign-in.
 */
export function GuestGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <Resolving />;
  if (user) {
    // "/" picks the first page this role can open; a hardcoded /dashboard
    // bounced restricted users into an access-denied screen on sign-in.
    const target = (location.state as { from?: Location })?.from?.pathname ?? "/";
    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}

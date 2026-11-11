import { useAuth } from "@/hooks/useAuth";
import { usePermissions } from "@/hooks/usePermissions";
import { firstAccessiblePath } from "@/lib/permissions";
import { Navigate, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { KeyRound } from "lucide-react";

/**
 * Only reached when a signed-in person has been given no pages at all — every
 * other case now lands on a page they can open instead.
 *
 * Deliberately not an "Access Denied" wall: a restricted account should feel
 * like a smaller app, not a refusal. If they do have pages (someone typed this
 * URL, or access was granted a moment ago), send them straight into the app.
 */
export default function Unauthorized() {
  const { role, isLoading } = useAuth();
  const { permissions, isLoading: permsLoading } = usePermissions();

  if (isLoading || permsLoading) return null;

  const home = firstAccessiblePath(role, permissions);
  if (home) return <Navigate to={home} replace />;

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center text-center px-4 animate-fade-up">
      <div className="inline-flex p-5 rounded-3xl bg-foreground/5 border border-white/10 mb-6">
        <KeyRound className="w-10 h-10 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-bold text-foreground tracking-tight mb-2">
        Nothing assigned to you yet
      </h1>
      <p className="text-muted-foreground max-w-sm mb-8 text-sm">
        Your account is active, but no sections have been enabled for it. Ask an administrator
        to grant you access — pages appear here as soon as they do.
      </p>
      <Button asChild variant="outline" className="rounded-xl">
        <Link to="/">Check again</Link>
      </Button>
    </div>
  );
}

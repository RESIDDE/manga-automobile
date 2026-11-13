import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { usePermissions, useFeature } from "@/hooks/usePermissions";
import { canAccess, firstAccessiblePath, isDsa, isUnrestricted, type FeatureKey, type PageKey } from "@/lib/permissions";

function Resolving() {
  return (
    <div className="h-[60vh] flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
    </div>
  );
}

/**
 * Wraps a protected route. Waits for auth *and* the permission matrix before
 * deciding, so a restricted page never flashes into view and a slow matrix read
 * is not mistaken for a denial.
 */
export function RoleGuard({ page, children }: { page: PageKey; children: React.ReactNode }) {
  const { role, isLoading: authLoading } = useAuth();
  const { permissions, isLoading: permsLoading } = usePermissions();

  if (authLoading || !role || permsLoading) return <Resolving />;

  if (!canAccess(role, page, permissions)) {
    // Quietly land on the first page this role can open. A page they were never
    // given should simply not be part of their app — not a refusal they have to
    // click past. Only someone with nothing at all sees a message.
    const fallback = firstAccessiblePath(role, permissions);
    return <Navigate to={fallback ?? "/no-access"} replace />;
  }

  return <>{children}</>;
}

/**
 * Settings and anything else that is admin-only.
 *
 * One exception: when the system has no admin at all, any signed-in user is let
 * through so they can claim admin on a fresh install. Once an admin exists the
 * door closes, and admin is granted by an existing admin from then on.
 */
export function AdminGuard({ children }: { children: React.ReactNode }) {
  const { role, isLoading } = useAuth();
  const { permissions } = usePermissions();

  const { data: adminCount, isLoading: countLoading } = useQuery({
    queryKey: ["user_roles", "admin_count"],
    staleTime: 60_000,
    queryFn: async () => {
      const { count, error } = await (supabase as any)
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .in("role", ["admin", "super_admin"]);
      // A failed count must not hand out admin: treat it as "an admin exists"
      if (error) return 1;
      return count ?? 0;
    },
  });

  if (isLoading || !role || countLoading) return <Resolving />;
  if (isUnrestricted(role)) return <>{children}</>;
  if ((adminCount ?? 1) === 0) return <>{children}</>;

  // Settings is not theirs: put them back in their own app
  const fallback = firstAccessiblePath(role, permissions);
  return <Navigate to={fallback ?? "/no-access"} replace />;
}

/** Messages (and any other per-role feature): off for this role → back to their app. */
export function FeatureGuard({ feature, children }: { feature: FeatureKey; children: React.ReactNode }) {
  const { role } = useAuth();
  const { permissions } = usePermissions();
  const { allowed, isLoading } = useFeature(feature);
  if (isLoading) return <Resolving />;
  if (!allowed) return <Navigate to={firstAccessiblePath(role, permissions) ?? "/no-access"} replace />;
  return <>{children}</>;
}

/** The Direct Sales Agent's page. Admin may open it too, to see what agents see. */
export function DsaGuard({ children }: { children: React.ReactNode }) {
  const { role, isLoading } = useAuth();
  const { permissions } = usePermissions();
  if (isLoading || !role) return <Resolving />;
  if (isDsa(role) || isUnrestricted(role)) return <>{children}</>;
  return <Navigate to={firstAccessiblePath(role, permissions) ?? "/no-access"} replace />;
}

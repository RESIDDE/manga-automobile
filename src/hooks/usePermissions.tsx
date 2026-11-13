import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PERMISSIONS, DELETED_ROLES_KEY, PROTECTED_ROLES, deletedRoles,
  normalizePermissions, normalizeFeatureAccess, hasFeature,
  type FeatureAccess, type FeatureKey, type PermissionsMap,
} from "@/lib/permissions";
import { useAuth } from "@/hooks/useAuth";

const PERMISSIONS_KEY = ["app_settings", "permissions"] as const;
const ROLE_LABELS_KEY = ["app_settings", "role_labels"] as const;
const FEATURES_KEY = ["app_settings", "feature_access"] as const;

/**
 * `app_settings.value` is a TEXT column here, so the documents are stored as
 * JSON strings. Older rows may already hold a JSON object (jsonb) — accept both.
 */
function parseSetting(value: unknown): unknown {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch { return null; }
  }
  return null;
}

async function readSetting(key: string): Promise<unknown> {
  const { data, error } = await (supabase as any)
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) throw error;
  return parseSetting(data?.value);
}

/**
 * The live permission matrix. A missing row or a failed read falls back to the
 * hard-coded defaults rather than locking everyone out, and legacy shapes are
 * migrated on read (see `normalizePermissions`).
 */
export function usePermissions() {
  const queryClient = useQueryClient();

  const { data: permissions = DEFAULT_PERMISSIONS, isLoading } = useQuery({
    queryKey: PERMISSIONS_KEY,
    // PermissionsRealtimeSync invalidates this the moment an admin saves, so a
    // refetch on every page navigation would be a wasted round trip.
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      try {
        return normalizePermissions(await readSetting("permissions"));
      } catch {
        // A read failure must not lock the app down
        return DEFAULT_PERMISSIONS;
      }
    },
  });

  const { data: roleLabels = {} } = useQuery({
    queryKey: ROLE_LABELS_KEY,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      try {
        const raw = await readSetting("role_labels");
        return (raw && typeof raw === "object" ? raw : {}) as Record<string, string>;
      } catch {
        return {} as Record<string, string>;
      }
    },
  });

  const { data: featureAccess = {}, isLoading: featuresLoading } = useQuery({
    queryKey: FEATURES_KEY,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    queryFn: async () => {
      try {
        return normalizeFeatureAccess(await readSetting("feature_access"));
      } catch {
        // Unreadable: everyone keeps chat and tags (the default)
        return {} as FeatureAccess;
      }
    },
  });

  const saveFeaturesMutation = useMutation({
    mutationFn: async (access: FeatureAccess) => {
      const { error } = await (supabase as any)
        .from("app_settings")
        .upsert(
          { key: "feature_access", value: JSON.stringify(access), updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEATURES_KEY }),
  });

  /**
   * Writes the matrix, keeping the list of deleted roles. A role that is back
   * in the map (re-created under the same name) comes off that list.
   */
  const writeMatrix = async (map: PermissionsMap, extraDeleted: string[] = []) => {
    const stored = await readSetting("permissions").catch(() => null);
    const deleted = [...new Set([...deletedRoles(stored), ...extraDeleted])]
      .filter((r) => !map[r] && !PROTECTED_ROLES.includes(r));
    const value = { ...map, ...(deleted.length ? { [DELETED_ROLES_KEY]: deleted } : {}) };
    const { error } = await (supabase as any)
      .from("app_settings")
      .upsert(
        { key: "permissions", value: JSON.stringify(value), updated_at: new Date().toISOString() },
        { onConflict: "key" }
      );
    if (error) throw error;
  };

  const saveMutation = useMutation({
    mutationFn: (map: PermissionsMap) => writeMatrix(map),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY }),
  });

  /** Removes a role from the matrix for good. Move its members off it first. */
  const deleteRoleMutation = useMutation({
    mutationFn: async ({ role, current }: { role: string; current: PermissionsMap }) => {
      if (PROTECTED_ROLES.includes(role)) throw new Error("Admin roles cannot be deleted");
      const { [role]: _gone, ...rest } = current;
      await writeMatrix(rest as PermissionsMap, [role]);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY }),
  });

  const saveLabelsMutation = useMutation({
    mutationFn: async (labels: Record<string, string>) => {
      const { error } = await (supabase as any)
        .from("app_settings")
        .upsert(
          { key: "role_labels", value: JSON.stringify(labels), updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ROLE_LABELS_KEY }),
  });

  return {
    permissions: permissions as PermissionsMap,
    roleLabels: roleLabels as Record<string, string>,
    isLoading,
    savePermissions: saveMutation.mutateAsync,
    isSaving: saveMutation.isPending,
    saveRoleLabels: saveLabelsMutation.mutateAsync,
    deleteRole: deleteRoleMutation.mutateAsync,
    featureAccess: featureAccess as FeatureAccess,
    featuresLoading,
    saveFeatureAccess: saveFeaturesMutation.mutateAsync,
  };
}

/**
 * Side-effect only. Opens ONE realtime channel on app_settings and invalidates
 * the permission queries when the matrix changes, so an admin ticking a box
 * updates every signed-in device within a second.
 *
 * Mount this once at app root — never inside `usePermissions`, or every
 * component that reads permissions would open its own socket.
 */
export function PermissionsRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("app_settings_permissions")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings", filter: "key=eq.permissions" },
        () => queryClient.invalidateQueries({ queryKey: PERMISSIONS_KEY })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings", filter: "key=eq.role_labels" },
        () => queryClient.invalidateQueries({ queryKey: ROLE_LABELS_KEY })
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "app_settings", filter: "key=eq.feature_access" },
        () => queryClient.invalidateQueries({ queryKey: FEATURES_KEY })
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return null;
}

/** Whether the signed-in user's role has Messages / Tags. Loading reads as "not yet". */
export function useFeature(feature: FeatureKey): { allowed: boolean; isLoading: boolean } {
  const { role, isLoading: authLoading } = useAuth();
  const { featureAccess, featuresLoading } = usePermissions();
  const isLoading = authLoading || featuresLoading;
  return { allowed: !isLoading && hasFeature(role, feature, featureAccess), isLoading };
}

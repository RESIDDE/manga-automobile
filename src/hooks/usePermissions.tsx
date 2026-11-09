import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  DEFAULT_PERMISSIONS, normalizePermissions, type PermissionsMap,
} from "@/lib/permissions";

const PERMISSIONS_KEY = ["app_settings", "permissions"] as const;
const ROLE_LABELS_KEY = ["app_settings", "role_labels"] as const;

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

  const saveMutation = useMutation({
    mutationFn: async (map: PermissionsMap) => {
      const { error } = await (supabase as any)
        .from("app_settings")
        .upsert(
          { key: "permissions", value: JSON.stringify(map), updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );
      if (error) throw error;
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
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  return null;
}

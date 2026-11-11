import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Shield, ShieldAlert, ShieldCheck, User, Users, Settings2,
  ToggleLeft, Eye, Pencil, PlusCircle, RotateCcw, Crown, Lock, Activity,
  UserPlus, ArrowRightLeft, AlertTriangle, CheckCircle2, Trash2,
} from "lucide-react";
import {
  ALL_PAGES, DEFAULT_PERMISSIONS, PERMISSION_ACTIONS, allRoleKeys,
  emptyRolePermissions, isUnrestricted, roleLabel,
  type AppRole, type PageKey, type PermissionAction, type PermissionsMap,
} from "@/lib/permissions";
import { usePermissions } from "@/hooks/usePermissions";
import { CustomPagination } from "@/components/CustomPagination";
import { logAction, describeLog } from "@/lib/logger";

type Tab = "team" | "permissions" | "audit" | "system";

const ROLE_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  super_admin: { label: "Super Admin", color: "text-amber-400",   icon: <Crown className="w-3.5 h-3.5" /> },
  admin:       { label: "Admin",       color: "text-emerald-500", icon: <ShieldCheck className="w-3.5 h-3.5" /> },
  sales:       { label: "Sales",       color: "text-blue-400",    icon: <User className="w-3.5 h-3.5" /> },
  mechanic:    { label: "Mechanic",    color: "text-violet-400",  icon: <Settings2 className="w-3.5 h-3.5" /> },
};

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-500/10 text-emerald-500",
  UPDATE: "bg-blue-500/10 text-blue-500",
  DELETE: "bg-rose-500/10 text-rose-500",
  LOGIN:  "bg-amber-500/10 text-amber-500",
  SIGNUP: "bg-amber-500/10 text-amber-500",
  INVITE: "bg-violet-500/10 text-violet-500",
  ROLE_CHANGE: "bg-sky-500/10 text-sky-500",
  EXPORT: "bg-indigo-500/10 text-indigo-500",
};

// A secondary, isolated Supabase client for creating new users.
// This prevents the signUp call from overwriting the super-admin's own session.
const anonClient = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default function Settings() {
  const { role, user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("team");
  const {
    permissions: livePermissions, roleLabels, savePermissions, saveRoleLabels, isSaving,
  } = usePermissions();
  // Edits land in local state so several boxes can be ticked before saving
  const [localPermissions, setLocalPermissions] = useState<PermissionsMap | null>(null);
  const [permDirty, setPermDirty] = useState(false);
  const [newRoleKey, setNewRoleKey] = useState("");
  const [teamPage, setTeamPage] = useState(0);
  const [teamPageSize, setTeamPageSize] = useState(10);
  const [logPage, setLogPage] = useState(0);
  const [logPageSize, setLogPageSize] = useState(20);
  const [renameRole, setRenameRole] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const permissions = localPermissions ?? livePermissions;

  // ── Invite User State ──────────────────────────────────────────────────────
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: "", displayName: "", password: "", role: "mechanic" });
  const [inviting, setInviting] = useState(false);

  // ── Transfer Super Admin State ─────────────────────────────────────────────
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState("");
  const [transferDowngradeTo, setTransferDowngradeTo] = useState("admin");
  const [transferring, setTransferring] = useState(false);

  // ── Claim admin (bootstrap on a fresh install) ─────────────────────────────
  const claimSuperAdmin = async () => {
    if (!user) return toast.error("Not logged in");
    const { error } = await (supabase as any)
      .from("user_roles")
      .upsert({ user_id: user.id, role: "super_admin" }, { onConflict: "user_id" });
    if (error) {
      toast.error("Failed: " + error.message);
      return;
    }
    await logAction("ROLE_CHANGE", "user_roles", user.id, { claimed: "super_admin" });
    toast.success("Admin access claimed — reloading...");
    setTimeout(() => window.location.reload(), 900);
  };

  if (!isUnrestricted(role)) {
    // Bootstrap: the very first account claims admin here. AdminGuard only lets a
    // non-admin reach this page while the system has no admin at all.
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center gap-4 animate-fade-up">
        <div className="p-4 rounded-2xl bg-amber-500/10">
          <Crown className="w-10 h-10 text-amber-400" />
        </div>
        <h2 className="text-xl font-bold">Claim Admin Access</h2>
        <p className="text-muted-foreground max-w-sm text-sm">
          No administrator has been set up yet. Claim it for this account to manage team
          members, roles and access. Afterwards, only an admin can grant admin.
        </p>
        <Button
          onClick={claimSuperAdmin}
          className="bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/25 font-bold gap-2 rounded-xl"
        >
          <Crown className="w-4 h-4" /> Claim Admin Access
        </Button>
      </div>
    );
  }

  // ── Team Query ─────────────────────────────────────────────────────────────
  const { data: usersData = [], isLoading } = useQuery({
    queryKey: ["users-roles"],
    queryFn: async () => {
      const [{ data: roles, error: rolesError }, { data: profiles, error: profilesError }] = await Promise.all([
        (supabase as any).from("user_roles").select("*"),
        (supabase as any).from("profiles").select("*"),
      ]);
      if (rolesError) throw rolesError;
      if (profilesError) throw profilesError;
      
      // Map over profiles to ensure everyone is shown
      return profiles.map((p: any) => {
        const roleEntry = roles.find((r: any) => r.user_id === p.id);
        return {
          id: roleEntry?.id || `temp-${p.id}`,
          user_id: p.id,
          role: roleEntry?.role || "mechanic",
          profile: p,
        };
      });
    },
  });

  // ── Audit Logs Query ───────────────────────────────────────────────────────
  const { data: logs = [], isLoading: isLoadingLogs } = useQuery({
    queryKey: ["audit_logs"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("audit_logs")
        .select("*, profiles:user_id(display_name)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
    enabled: isUnrestricted(role) && tab === "audit",
  });
  
  // ── App Settings Query ─────────────────────────────────────────────────────
  const { data: appSettings = [], isLoading: isLoadingSettings } = useQuery({
    queryKey: ["app_settings"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("app_settings")
        .select("*");
      if (error) throw error;
      return data;
    },
    enabled: role === "super_admin",
  });

  const updateSetting = useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const { error } = await (supabase as any)
        .from("app_settings")
        .upsert({ key, value }, { onConflict: "key" });
      if (error) throw error;
      await logAction("UPDATE", "app_settings", key, { new_value: value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app_settings"] });
      toast.success("Settings updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Update Role Mutation ───────────────────────────────────────────────────
  const updateRole = useMutation({
    mutationFn: async ({ userId, newRole, targetName }: { userId: string; newRole: string; targetName?: string }) => {
      const { error } = await (supabase as any)
        .from("user_roles").upsert({ user_id: userId, role: newRole }, { onConflict: "user_id" });
      if (error) throw error;
      await logAction("ROLE_CHANGE", "user_roles", userId, { new_role: newRole, target_name: targetName });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-roles"] });
      toast.success("Role updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // ── Delete User Mutation ────────────────────────────────────────────────────
  const deleteUser = useMutation({
    mutationFn: async ({ userId, name }: { userId: string; name?: string }) => {
      if (!window.confirm(`Are you sure you want to remove ${name || 'this user'}? This action cannot be undone.`)) {
        throw new Error("Cancelled");
      }
      
      // Delete from user_roles and profiles
      // The user likely has a trigger or function to handle auth deletion if they mentioned "doing the sql"
      const { error: roleErr } = await (supabase as any).from("user_roles").delete().eq("user_id", userId);
      const { error: profileErr } = await (supabase as any).from("profiles").delete().eq("id", userId);
      
      if (roleErr) throw roleErr;
      if (profileErr) throw profileErr;
      
      await logAction("DELETE", "users", userId, { deleted_name: name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["users-roles"] });
      toast.success("User removed successfully");
    },
    onError: (e: any) => {
      if (e.message !== "Cancelled") toast.error(e.message);
    },
  });

  // ── Invite New User ────────────────────────────────────────────────────────
  const handleInvite = async () => {
    if (!inviteForm.email || !inviteForm.password || !inviteForm.displayName) {
      toast.error("Please fill in all fields");
      return;
    }
    if (inviteForm.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    setInviting(true);
    try {
      // Use the isolated client so super admin's session is untouched
      const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({
        email: inviteForm.email,
        password: inviteForm.password,
        options: { data: { display_name: inviteForm.displayName } },
      });
      if (signUpError) throw signUpError;

      const newUserId = signUpData.user?.id;
      if (!newUserId) throw new Error("User creation failed — no ID returned.");

      // Create profile
      await (supabase as any).from("profiles").upsert({
        id: newUserId,
        display_name: inviteForm.displayName,
      }, { onConflict: "id" });

      // Assign role
      await (supabase as any).from("user_roles").upsert({
        user_id: newUserId,
        role: inviteForm.role,
      }, { onConflict: "user_id" });

      await logAction("INVITE", "users", newUserId, {
        invited_email: inviteForm.email,
        assigned_role: inviteForm.role,
        invited_name: inviteForm.displayName,
      });

      queryClient.invalidateQueries({ queryKey: ["users-roles"] });
      toast.success(`✅ Account created for ${inviteForm.displayName}! They can now log in with the credentials you set.`);
      setInviteOpen(false);
      setInviteForm({ email: "", displayName: "", password: "", role: "mechanic" });
    } catch (err: any) {
      toast.error(err.message || "Failed to create user");
    } finally {
      setInviting(false);
    }
  };

  // ── Transfer Super Admin ───────────────────────────────────────────────────
  const handleTransfer = async () => {
    if (!transferTarget) return toast.error("Please select a user to transfer to");
    if (!user) return;
    setTransferring(true);
    try {
      const targetUser = usersData.find((u: any) => u.user_id === transferTarget);
      const myEntry = usersData.find((u: any) => u.user_id === user.id);

      if (!targetUser || !myEntry) throw new Error("Could not find user records");

      // Elevate target to super_admin
      await (supabase as any).from("user_roles").update({ role: "super_admin" }).eq("id", targetUser.id);
      // Downgrade self
      await (supabase as any).from("user_roles").update({ role: transferDowngradeTo }).eq("id", myEntry.id);

      await logAction("ROLE_CHANGE", "user_roles", targetUser.id, {
        action: "super_admin_transfer",
        transferred_to: targetUser.profile?.display_name,
        previous_admin_downgraded_to: transferDowngradeTo,
      });

      toast.success(`Super Admin transferred to ${targetUser.profile?.display_name || "user"}. Reloading...`);
      setTransferOpen(false);
      setTimeout(() => window.location.reload(), 1200);
    } catch (err: any) {
      toast.error(err.message || "Transfer failed");
    } finally {
      setTransferring(false);
    }
  };

  // ── Permissions helpers ────────────────────────────────────────────────────
  const togglePerm = (r: string, page: PageKey, action: PermissionAction) => {
    setLocalPermissions((prev) => {
      const base = prev ?? livePermissions;
      const rolePerms = base[r] ?? emptyRolePermissions();
      const list = rolePerms[action] ?? [];
      const next = list.includes(page)
        ? list.filter((p) => p !== page)
        : [...list, page];
      return { ...base, [r]: { ...rolePerms, [action]: next } };
    });
    setPermDirty(true);
  };

  const savePerms = async () => {
    if (!localPermissions) return;
    try {
      await savePermissions(localPermissions);
      await logAction("PERMISSION_CHANGE", "app_settings", "permissions", {
        roles: Object.keys(localPermissions),
      });
      setLocalPermissions(null);
      setPermDirty(false);
      toast.success("Permissions saved — every signed-in device updates now");
    } catch (e: any) {
      toast.error(e?.message || "Failed to save permissions");
    }
  };

  const discardPerms = () => {
    setLocalPermissions(null);
    setPermDirty(false);
  };

  const resetPerms = async () => {
    try {
      await savePermissions(DEFAULT_PERMISSIONS);
      await logAction("PERMISSION_CHANGE", "app_settings", "permissions", { reset: true });
      setLocalPermissions(null);
      setPermDirty(false);
      toast.success("Permissions reset to defaults");
    } catch (e: any) {
      toast.error(e?.message || "Failed to reset permissions");
    }
  };

  const addCustomRole = async () => {
    const key = newRoleKey.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
    if (!key) { toast.error("Give the role a name"); return; }
    if (permissions[key]) { toast.error("That role already exists"); return; }
    const next = { ...permissions, [key]: emptyRolePermissions() };
    try {
      await savePermissions(next);
      await logAction("PERMISSION_CHANGE", "app_settings", "permissions", { created_role: key });
      setLocalPermissions(null);
      setPermDirty(false);
      setNewRoleKey("");
      toast.success(`Role "${key}" created with no access — tick what it may do`);
    } catch (e: any) {
      toast.error(e?.message || "Failed to create the role");
    }
  };

  const saveRoleName = async () => {
    if (!renameRole) return;
    const label = renameValue.trim();
    try {
      // Labels are cosmetic; the role key stored on users never changes
      await saveRoleLabels({ ...roleLabels, [renameRole]: label || renameRole });
      await logAction("PERMISSION_CHANGE", "app_settings", "role_labels", {
        role: renameRole, label,
      });
      setRenameRole(null);
      setRenameValue("");
      toast.success("Role renamed");
    } catch (e: any) {
      toast.error(e?.message || "Failed to rename the role");
    }
  };

  const teamPageCount = Math.max(1, Math.ceil(usersData.length / teamPageSize));
  const safeTeamPage = Math.min(teamPage, teamPageCount - 1);
  const pagedUsers = usersData.slice(safeTeamPage * teamPageSize, (safeTeamPage + 1) * teamPageSize);

  const logPageCount = Math.max(1, Math.ceil(logs.length / logPageSize));
  const safeLogPage = Math.min(logPage, logPageCount - 1);
  const pagedLogs = logs.slice(safeLogPage * logPageSize, (safeLogPage + 1) * logPageSize);

  const matrixRoles = allRoleKeys(permissions);
  /** Roles that can be assigned to a person. Super admin is claimed or transferred. */
  const assignableRoles = matrixRoles.filter((r) => r !== "super_admin");

  const RoleOptions = ({ includeSuperAdmin = false }: { includeSuperAdmin?: boolean }) => (
    <>
      {includeSuperAdmin && (
        <SelectItem value="super_admin" className="rounded-lg font-bold text-amber-400">
          ⭐ Super Admin
        </SelectItem>
      )}
      {assignableRoles.map((r) => (
        <SelectItem key={r} value={r} className={`rounded-lg ${ROLE_CONFIG[r]?.color ?? ""}`}>
          {roleLabel(r, roleLabels)}
        </SelectItem>
      ))}
    </>
  );
  const otherUsers = usersData.filter((u: any) => u.user_id !== user?.id);

  return (
    <div className="space-y-8 animate-fade-up max-w-5xl mx-auto pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1 opacity-80">
            <Crown className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium uppercase tracking-wider text-amber-400">Super Admin</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-heading font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-foreground via-foreground to-foreground/70 tracking-tight">
            Admin Controls
          </h1>
          <p className="text-base text-muted-foreground mt-2 max-w-xl">
            Manage your team's roles, configure page access, invite users, and monitor system activity.
          </p>
        </div>

        <div className="flex flex-col gap-2 shrink-0">
          {/* Transfer Super Admin */}
          <Button
            variant="outline"
            className="border-amber-500/30 text-amber-400 hover:bg-amber-500/10 gap-2 rounded-xl"
            onClick={() => { setTransferTarget(""); setTransferOpen(true); }}
          >
            <ArrowRightLeft className="w-4 h-4" /> Transfer Role
          </Button>
          {/* First-time claim fallback */}
          <Button
            className="bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/25 font-bold gap-2 rounded-xl"
            onClick={claimSuperAdmin}
          >
            <Crown className="w-4 h-4" /> Claim Super Admin
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex p-1.5 bg-foreground/5 rounded-2xl gap-1 max-w-md overflow-x-auto">
        {([["team", "Team", <Users className="w-4 h-4 shrink-0" />], ["permissions", "Permissions", <Shield className="w-4 h-4 shrink-0" />], ["audit", "Audit Logs", <Activity className="w-4 h-4 shrink-0" />], ["system", "System", <Settings2 className="w-4 h-4 shrink-0" />]] as const).map(([key, label, icon]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold transition-all ${
              tab === key ? "bg-amber-500 text-white shadow-lg shadow-amber-500/30" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── TEAM TAB ── */}
      {tab === "team" && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/5 rounded-full blur-[80px] pointer-events-none" />
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-amber-400" /> Team Directory
            </h2>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20 rounded-xl gap-2"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus className="w-4 h-4" /> Invite User
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-20 bg-white/5 rounded-2xl animate-pulse" />)}</div>
          ) : usersData.length === 0 ? (
            <div className="text-center p-8 border border-white/5 bg-white/5 rounded-2xl">
              <p className="text-muted-foreground">No users found yet. Invite users using the button above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {pagedUsers.map((u: any) => {
                const profile = u.profile;
                const isSelf = u.user_id === user?.id;
                const rc = ROLE_CONFIG[u.role] ?? {
                  ...ROLE_CONFIG.mechanic,
                  label: roleLabel(u.role, roleLabels),
                };
                return (
                  <div key={u.id} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border transition-all ${isSelf ? "bg-amber-500/5 border-amber-500/20" : "bg-background/40 border-white/5 hover:border-white/10"}`}>
                    <div className="flex items-center gap-4">
                      <div className={`h-12 w-12 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${isSelf ? "bg-amber-500 text-white" : "bg-foreground/10 text-foreground"}`}>
                        {profile?.display_name?.charAt(0)?.toUpperCase() || "?"}
                      </div>
                      <div>
                        <h3 className="font-bold flex items-center gap-2 flex-wrap">
                          {profile?.display_name || "Unknown User"}
                          {isSelf && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 tracking-wider uppercase">You</span>}
                          <span className={`text-[10px] px-2 py-0.5 rounded-full bg-white/5 flex items-center gap-1 ${rc.color}`}>
                            {rc.icon}{rc.label}
                          </span>
                        </h3>
                        <p className="text-sm text-muted-foreground">{profile?.phone || "No phone on record"}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Select
                        value={u.role}
                        onValueChange={(val) => {
                          if (isSelf && val !== "super_admin") {
                            if (!window.confirm("⚠️ Warning: Removing your own Super Admin role will lock you out of this page. Proceed?")) return;
                          }
                          updateRole.mutate({ userId: u.user_id, newRole: val, targetName: profile?.display_name });
                        }}
                        disabled={updateRole.isPending}
                      >
                        <SelectTrigger className="w-[160px] rounded-xl bg-background/50 border-white/10 h-10 font-semibold">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="glass-panel font-medium rounded-xl">
                          <RoleOptions includeSuperAdmin />
                        </SelectContent>
                      </Select>

                      {!isSelf && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-xl h-10 w-10 text-rose-500 hover:bg-rose-500/10 hover:text-rose-600"
                          onClick={() => deleteUser.mutate({ userId: u.user_id, name: profile?.display_name })}
                          disabled={deleteUser.isPending}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}

              <CustomPagination
                page={safeTeamPage}
                pageCount={teamPageCount}
                pageSize={teamPageSize}
                total={usersData.length}
                onPageChange={setTeamPage}
                onPageSizeChange={(size) => { setTeamPageSize(size); setTeamPage(0); }}
              />
            </div>
          )}
        </div>
      )}

      {/* ── PERMISSIONS TAB ── */}
      {tab === "permissions" && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-violet-500/5 rounded-full blur-[80px] pointer-events-none" />

          <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Shield className="h-5 w-5 text-violet-400" /> Access Matrix
            </h2>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" className="rounded-xl gap-1.5 text-muted-foreground" onClick={resetPerms}>
                <RotateCcw className="w-3.5 h-3.5" /> Reset to defaults
              </Button>
              {permDirty && (
                <Button variant="outline" size="sm" className="rounded-xl border-white/10" onClick={discardPerms}>
                  Discard
                </Button>
              )}
              <Button
                size="sm"
                disabled={!permDirty || isSaving}
                className="rounded-xl bg-amber-500 hover:bg-amber-600 text-white gap-1.5"
                onClick={savePerms}
              >
                {isSaving ? "Saving..." : `Save Changes${permDirty ? " *" : ""}`}
              </Button>
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-6">
            Tick what each role may do on each page: <span className="font-semibold text-foreground">View</span>,{" "}
            <span className="font-semibold text-foreground">Add</span>,{" "}
            <span className="font-semibold text-foreground">Edit</span>,{" "}
            <span className="font-semibold text-foreground">Delete</span>. Delete is deliberate — it is never
            implied by Edit. <span className="text-amber-400 font-semibold">Admin</span> always has full access and
            cannot be locked out.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px]">
              <thead>
                <tr>
                  <th className="text-left pb-2 text-sm font-semibold text-muted-foreground pr-6 w-40 align-bottom">Page</th>
                  {matrixRoles.map((r) => {
                    const rc = ROLE_CONFIG[r];
                    const locked = isUnrestricted(r);
                    return (
                      <th key={r} className="pb-2 px-3 text-center align-bottom">
                        <button
                          type="button"
                          onClick={() => { setRenameRole(r); setRenameValue(roleLabel(r, roleLabels)); }}
                          className={`inline-flex items-center gap-1 text-sm font-bold ${rc?.color ?? "text-foreground"} hover:underline`}
                          title="Rename this role"
                        >
                          {rc?.icon ?? <User className="w-3.5 h-3.5" />}
                          {roleLabel(r, roleLabels)}
                          {locked && <Lock className="w-3 h-3 opacity-60" />}
                        </button>
                        <div className="flex justify-center gap-1 mt-2">
                          {PERMISSION_ACTIONS.map((a) => (
                            <span key={a} className="w-7 text-[9px] uppercase tracking-wide text-muted-foreground">
                              {a === "create" ? "Add" : a === "delete" ? "Del" : a === "view" ? "View" : "Edit"}
                            </span>
                          ))}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {ALL_PAGES.map((page) => (
                  <tr key={page.key} className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
                    <td className="py-3 pr-6 text-sm font-medium text-foreground">{page.label}</td>
                    {matrixRoles.map((r) => {
                      const locked = isUnrestricted(r);
                      const rolePerms = permissions[r] ?? emptyRolePermissions();
                      const hasView = locked || (rolePerms.view ?? []).includes(page.key);
                      return (
                        <td key={r} className="py-3 px-3">
                          <div className="flex justify-center gap-1">
                            {PERMISSION_ACTIONS.map((action) => {
                              const on = locked || (rolePerms[action] ?? []).includes(page.key);
                              // Without View the rest of the row is moot; the stored
                              // lists stay independent either way
                              const moot = !hasView && action !== "view" && on;
                              const tone = !on
                                ? "bg-foreground/5 text-muted-foreground/30 hover:bg-foreground/10"
                                : action === "delete"
                                ? "bg-rose-500/20 text-rose-500 hover:bg-rose-500/30"
                                : action === "view"
                                ? "bg-blue-500/20 text-blue-500 hover:bg-blue-500/30"
                                : "bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/30";
                              return (
                                <button
                                  key={action}
                                  type="button"
                                  disabled={locked}
                                  aria-label={`${action} ${page.label} for ${roleLabel(r, roleLabels)}`}
                                  aria-pressed={on}
                                  title={locked ? "Admin always has full access" : `${action} ${page.label}`}
                                  onClick={() => togglePerm(r, page.key, action)}
                                  className={`w-7 h-7 rounded-lg text-[10px] font-bold transition-all ${tone} ${locked ? "cursor-not-allowed opacity-70" : ""} ${moot ? "opacity-40" : ""}`}
                                >
                                  {on ? "✓" : ""}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 pt-5 border-t border-white/5 flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Create a custom role</Label>
              <Input
                value={newRoleKey}
                onChange={(e) => setNewRoleKey(e.target.value)}
                placeholder="e.g. accountant"
                className="h-10 w-56 rounded-xl bg-background/50 border-white/10"
              />
            </div>
            <Button size="sm" variant="outline" onClick={addCustomRole}
              className="h-10 rounded-xl border-white/10 gap-1.5">
              <PlusCircle className="w-4 h-4" /> Add role
            </Button>
            <p className="text-xs text-muted-foreground flex-1 min-w-[200px]">
              A new role starts with no access and appears here and in the role selects.
              {permDirty && <span className="ml-2 text-amber-400 font-semibold">⚠ Unsaved changes</span>}
            </p>
          </div>
        </div>
      )}

      {/* Rename a role — the label is cosmetic, the stored key never changes */}
      <Dialog open={!!renameRole} onOpenChange={(open) => !open && setRenameRole(null)}>
        <DialogContent className="rounded-3xl glass-panel border-white/10">
          <DialogHeader>
            <DialogTitle>Rename role</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Display name for <span className="font-mono">{renameRole}</span>
            </Label>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="h-11 rounded-xl bg-background/50 border-white/10"
            />
            <p className="text-[11px] text-muted-foreground">
              Only the label changes. The role key stored on each user stays the same.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameRole(null)} className="rounded-xl border-white/10">
              Cancel
            </Button>
            <Button onClick={saveRoleName} className="rounded-xl bg-violet-500 hover:bg-violet-600 text-white">
              Save name
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AUDIT TAB ── */}
      {tab === "audit" && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-sky-500/5 rounded-full blur-[80px] pointer-events-none" />
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            <Activity className="h-5 w-5 text-sky-400" /> System Audit Logs
          </h2>
          <p className="text-sm text-muted-foreground mb-6">
            Full activity trail for all users — showing latest 200 events, most recent first.
          </p>

          {isLoadingLogs ? (
            <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-white/5 rounded-xl animate-pulse" />)}</div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center gap-3">
              <Activity className="w-10 h-10 text-muted-foreground/20" />
              <p className="text-muted-foreground">No activity recorded yet.</p>
              <p className="text-xs text-muted-foreground/60">Make sure the <code className="bg-white/5 px-1 py-0.5 rounded">audit_logs</code> table exists in Supabase.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pagedLogs.map((log: any) => {
                const userName = log.profiles?.display_name || log.details?._user_name || null;
                const actionColor = ACTION_COLORS[log.action] || "bg-foreground/10 text-foreground";
                const description = describeLog(log);
                return (
                  <div key={log.id} className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 rounded-2xl bg-background/40 border border-white/5 hover:border-white/10 transition-all">
                    {/* Avatar / initial */}
                    <div className="shrink-0 h-9 w-9 rounded-full bg-foreground/10 flex items-center justify-center font-bold text-sm">
                      {userName ? userName.charAt(0).toUpperCase() : "?"}
                    </div>

                    {/* Main content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-0.5">
                        <span className="font-semibold text-sm">{userName || <span className="italic text-muted-foreground/50">System</span>}</span>
                        <span className={`inline-flex px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${actionColor}`}>
                          {log.action}
                        </span>
                        {log.entity_type && (
                          <span className="text-[10px] text-muted-foreground bg-foreground/5 px-2 py-0.5 rounded-md font-mono uppercase">
                            {log.entity_type}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate">{description}</p>
                    </div>

                    {/* Timestamp */}
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono text-muted-foreground/60">
                        {new Date(log.created_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}
                      </p>
                      <p className="text-xs font-mono text-muted-foreground/40">
                        {new Date(log.created_at).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    </div>
                  </div>
                );
              })}

              <CustomPagination
                page={safeLogPage}
                pageCount={logPageCount}
                pageSize={logPageSize}
                total={logs.length}
                onPageChange={setLogPage}
                onPageSizeChange={(size) => { setLogPageSize(size); setLogPage(0); }}
                sizes={[20, 50, 100]}
              />
            </div>
          )}
        </div>
      )}

      {/* ── SYSTEM TAB ── */}
      {tab === "system" && (
        <div className="glass-panel p-6 sm:p-8 rounded-3xl border border-white/5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[80px] pointer-events-none" />
          <h2 className="text-xl font-bold mb-2 flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-emerald-500" /> System Configuration
          </h2>
          <p className="text-sm text-muted-foreground mb-8">
            Manage global application behaviors and sequential numbering.
          </p>

          <div className="grid gap-8 max-w-2xl">
            {/* Sale Numbering */}
            <div className="space-y-4 p-6 rounded-2xl bg-white/5 border border-white/5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <h3 className="font-bold text-foreground">Sale Numbering</h3>
                  <p className="text-xs text-muted-foreground">Customize the sequence for new sales. Numbers are automatically padded (e.g., 001, 002).</p>
                </div>
                <div className="bg-emerald-500/10 text-emerald-500 p-2 rounded-xl">
                  <ShieldCheck className="w-5 h-5" />
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="nextSaleNumber" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Next Sale Number</Label>
                  <div className="flex gap-2">
                    <Input 
                      id="nextSaleNumber"
                      type="number"
                      className="rounded-xl h-11 bg-background/50 border-white/10 w-32 font-mono text-lg"
                      value={appSettings.find((s: any) => s.key === 'next_sale_number')?.value || ''}
                      onChange={(e) => updateSetting.mutate({ key: 'next_sale_number', value: e.target.value })}
                    />
                    <div className="flex flex-col justify-center">
                      <p className="text-sm font-medium text-emerald-500">Current Sequence</p>
                      <p className="text-xs text-muted-foreground">Next sale will be: <span className="font-mono bg-white/10 px-1 rounded">#{String(appSettings.find((s: any) => s.key === 'next_sale_number')?.value || '1').padStart(3, '0')}</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── INVITE USER DIALOG ── */}
      <Dialog open={inviteOpen} onOpenChange={(v) => !inviting && setInviteOpen(v)}>
        <DialogContent className="max-w-md rounded-3xl glass-panel shadow-2xl border-white/10 p-0 bg-background/95 backdrop-blur-3xl">
          <div className="p-6 border-b border-white/5 bg-foreground/5">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-amber-400" /> Invite New User
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Create the account and set the password. Share the credentials with the new team member afterward.
              </p>
            </DialogHeader>
          </div>
          <div className="p-6 space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Full Name</Label>
              <Input
                placeholder="e.g. John Doe"
                className="rounded-xl h-11 bg-background/50 border-white/10 focus-visible:ring-amber-500"
                value={inviteForm.displayName}
                onChange={(e) => setInviteForm({ ...inviteForm, displayName: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email Address</Label>
              <Input
                type="email"
                placeholder="user@example.com"
                className="rounded-xl h-11 bg-background/50 border-white/10 focus-visible:ring-amber-500"
                value={inviteForm.email}
                onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Set Password</Label>
              <Input
                type="password"
                placeholder="Min. 6 characters"
                className="rounded-xl h-11 bg-background/50 border-white/10 focus-visible:ring-amber-500"
                value={inviteForm.password}
                onChange={(e) => setInviteForm({ ...inviteForm, password: e.target.value })}
              />
              <p className="text-xs text-muted-foreground">You're setting this password. Share it securely with the user.</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Assign Role</Label>
              <Select value={inviteForm.role} onValueChange={(v) => setInviteForm({ ...inviteForm, role: v })}>
                <SelectTrigger className="rounded-xl h-11 bg-background/50 border-white/10 focus-visible:ring-amber-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-panel rounded-xl">
                  <RoleOptions />
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="p-6 pt-0 gap-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)} disabled={inviting} className="rounded-xl border-white/10">
              Cancel
            </Button>
            <Button onClick={handleInvite} disabled={inviting} className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-lg shadow-amber-500/20">
              {inviting ? "Creating Account..." : "Create & Invite"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── TRANSFER SUPER ADMIN DIALOG ── */}
      <Dialog open={transferOpen} onOpenChange={(v) => !transferring && setTransferOpen(v)}>
        <DialogContent className="max-w-md rounded-3xl glass-panel shadow-2xl border-white/10 p-0 bg-background/95 backdrop-blur-3xl">
          <div className="p-6 border-b border-white/5 bg-amber-500/5">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center gap-2 text-amber-400">
                <ArrowRightLeft className="h-5 w-5" /> Transfer Super Admin Role
              </DialogTitle>
              <p className="text-sm text-muted-foreground mt-1">
                This will promote the selected user to Super Admin and demote you to the selected role.
              </p>
            </DialogHeader>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-500/80">
                This action will immediately revoke your Super Admin access. Make sure you trust the user you're promoting.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transfer Super Admin To</Label>
              <Select value={transferTarget} onValueChange={setTransferTarget}>
                <SelectTrigger className="rounded-xl h-11 bg-background/50 border-white/10 focus-visible:ring-amber-500">
                  <SelectValue placeholder="Select a team member..." />
                </SelectTrigger>
                <SelectContent className="glass-panel rounded-xl">
                  {otherUsers.map((u: any) => (
                    <SelectItem key={u.user_id} value={u.user_id} className="rounded-lg">
                      {u.profile?.display_name || "Unknown User"} — <span className="opacity-60">{roleLabel(u.role, roleLabels)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Downgrade My Role To</Label>
              <Select value={transferDowngradeTo} onValueChange={setTransferDowngradeTo}>
                <SelectTrigger className="rounded-xl h-11 bg-background/50 border-white/10 focus-visible:ring-amber-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="glass-panel rounded-xl">
                  <RoleOptions />
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="p-6 pt-0 gap-2">
            <Button variant="outline" onClick={() => setTransferOpen(false)} disabled={transferring} className="rounded-xl border-white/10">
              Cancel
            </Button>
            <Button
              onClick={handleTransfer}
              disabled={transferring || !transferTarget}
              className="bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-lg shadow-amber-500/20"
            >
              {transferring ? "Transferring..." : "Confirm Transfer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

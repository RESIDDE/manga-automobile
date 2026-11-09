// ─── Roles, pages and the permission matrix ─────────────────────────────────
// Pure functions only: no storage, no network. Every check takes the matrix as
// an argument so the same logic serves guards, pages and tests.

/**
 * `super_admin` is this app's historical top role and behaves exactly like
 * `admin`: unconditional access that the matrix cannot revoke. Custom roles
 * created in Settings are plain strings, so the type stays open.
 */
export type AppRole = "super_admin" | "admin" | "sales" | "mechanic" | (string & {});

export type PageKey =
  | "dashboard"
  | "vehicles"
  | "customers"
  | "sales"
  | "authority-to-sell"
  | "performance-quotes"
  | "meetings"
  | "property-intake";

export type PermissionAction = "view" | "create" | "edit" | "delete";

export const PERMISSION_ACTIONS: PermissionAction[] = ["view", "create", "edit", "delete"];

export const ALL_PAGES: { key: PageKey; label: string; path: string }[] = [
  { key: "dashboard",          label: "Dashboard",        path: "/dashboard" },
  { key: "vehicles",           label: "Vehicles",         path: "/vehicles" },
  { key: "customers",          label: "Customers",        path: "/customers" },
  { key: "sales",              label: "Sales",            path: "/sales" },
  { key: "authority-to-sell",  label: "Auth. Form",       path: "/authority-to-sell" },
  { key: "performance-quotes", label: "Proforma Invoice", path: "/performance-quotes" },
  { key: "meetings",           label: "Meetings",         path: "/meetings" },
  { key: "property-intake",    label: "Property Intake",  path: "/property-intake" },
];

export type RolePermissions = Record<PermissionAction, PageKey[]>;
export type PermissionsMap = Record<string, RolePermissions>;

const ALL_PAGE_KEYS = ALL_PAGES.map((p) => p.key);

/** Roles that always have every right, whatever the matrix says. */
export const UNRESTRICTED_ROLES = ["super_admin", "admin"];

export const isUnrestricted = (role: AppRole | null): boolean =>
  !!role && UNRESTRICTED_ROLES.includes(role);

// ─── Defaults ───────────────────────────────────────────────────────────────
// Used when the stored matrix is missing or unreadable, so a bad read degrades
// to sane access rather than locking everybody out.

const SALES_PAGES: PageKey[] = [
  "dashboard", "vehicles", "customers", "sales", "meetings",
  "property-intake", "authority-to-sell", "performance-quotes",
];
const SALES_WRITE: PageKey[] = [
  "vehicles", "customers", "sales", "property-intake",
  "authority-to-sell", "performance-quotes",
];

export const DEFAULT_PERMISSIONS: PermissionsMap = {
  admin: { view: ALL_PAGE_KEYS, create: ALL_PAGE_KEYS, edit: ALL_PAGE_KEYS, delete: ALL_PAGE_KEYS },
  sales: { view: SALES_PAGES, create: SALES_WRITE, edit: SALES_WRITE, delete: [] },
  mechanic: {
    view: ["dashboard", "vehicles"],
    create: [],
    edit: ["vehicles"],
    delete: [],
  },
};

export const emptyRolePermissions = (): RolePermissions => ({
  view: [], create: [], edit: [], delete: [],
});

// ─── Reading a stored matrix ────────────────────────────────────────────────

/**
 * Brings a saved matrix up to the current shape:
 *  - a role with no `create` list backfills from `edit`
 *  - a role with no `delete` list backfills from `edit` *only* for unrestricted
 *    roles; for everyone else delete starts empty, because delete used to come
 *    bundled with edit and must now be granted deliberately
 *  - default roles missing from the saved JSON are added from the defaults
 */
export function normalizePermissions(raw: unknown): PermissionsMap {
  const out: PermissionsMap = {};
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, any>;

  for (const [role, value] of Object.entries(source)) {
    if (!value || typeof value !== "object") continue;

    const clean = (list: unknown): PageKey[] =>
      Array.isArray(list)
        ? (list as unknown[]).filter((p): p is PageKey => ALL_PAGE_KEYS.includes(p as PageKey))
        : [];

    // The oldest shape was a flat array of page keys = view + edit
    if (Array.isArray(value)) {
      const pages = clean(value);
      out[role] = { view: pages, create: pages, edit: pages, delete: [] };
      continue;
    }

    const view = clean(value.view);
    const edit = clean(value.edit);
    const create = value.create === undefined ? edit : clean(value.create);
    const del = value.delete === undefined
      ? (UNRESTRICTED_ROLES.includes(role) ? edit : [])
      : clean(value.delete);

    out[role] = { view, create, edit, delete: del };
  }

  for (const [role, perms] of Object.entries(DEFAULT_PERMISSIONS)) {
    if (!out[role]) out[role] = { ...perms };
  }

  return out;
}

// ─── The checks ─────────────────────────────────────────────────────────────

function allows(
  role: AppRole | null,
  page: PageKey,
  action: PermissionAction,
  permissions?: PermissionsMap | null
): boolean {
  // Signed in but no role row yet: a pending user sees nothing
  if (!role) return false;
  // Admin can never lock itself out, whatever the matrix says
  if (isUnrestricted(role)) return true;

  const map = permissions ?? DEFAULT_PERMISSIONS;
  const perms = map[role] ?? DEFAULT_PERMISSIONS[role];
  if (!perms) return false;

  return (perms[action] ?? []).includes(page);
}

export const canAccess = (
  role: AppRole | null, page: PageKey, permissions?: PermissionsMap | null
) => allows(role, page, "view", permissions);

export const canCreate = (
  role: AppRole | null, page: PageKey, permissions?: PermissionsMap | null
) => allows(role, page, "create", permissions);

export const canEdit = (
  role: AppRole | null, page: PageKey, permissions?: PermissionsMap | null
) => allows(role, page, "edit", permissions);

/** Delete is never implied by edit — it is granted on its own. */
export const canDelete = (
  role: AppRole | null, page: PageKey, permissions?: PermissionsMap | null
) => allows(role, page, "delete", permissions);

/** The pages this role may open, in the order they appear in the sidebar. */
export function getAccessiblePages(
  role: AppRole | null, permissions?: PermissionsMap | null
): PageKey[] {
  if (!role) return [];
  if (isUnrestricted(role)) return [...ALL_PAGE_KEYS];
  const map = permissions ?? DEFAULT_PERMISSIONS;
  const view = (map[role] ?? DEFAULT_PERMISSIONS[role])?.view ?? [];
  return ALL_PAGE_KEYS.filter((key) => view.includes(key));
}

/**
 * Where to send this role when no particular page was asked for, or when the
 * page they asked for is not theirs: the first page they can actually open, in
 * sidebar order. Null means they have been given nothing yet.
 *
 * Restricted access should feel like a smaller app, not a wall of refusals, so
 * callers navigate here instead of showing an "access denied" screen.
 */
export function firstAccessiblePath(
  role: AppRole | null, permissions?: PermissionsMap | null
): string | null {
  const [first] = getAccessiblePages(role, permissions);
  if (!first) return null;
  return ALL_PAGES.find((p) => p.key === first)?.path ?? null;
}

/** Every role key the matrix knows about, unrestricted roles first. */
export function allRoleKeys(permissions?: PermissionsMap | null): string[] {
  const keys = new Set<string>(["admin", ...Object.keys(permissions ?? DEFAULT_PERMISSIONS)]);
  return [...keys].sort((a, b) => {
    const rank = (r: string) => (r === "super_admin" ? 0 : r === "admin" ? 1 : 2);
    return rank(a) - rank(b) || a.localeCompare(b);
  });
}

/** "sales" → "Sales"; a stored label in `role_labels` wins. */
export function roleLabel(role: string, labels?: Record<string, string> | null): string {
  if (labels?.[role]) return labels[role];
  return role
    .split("_")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

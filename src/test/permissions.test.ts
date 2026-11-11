import { describe, it, expect } from "vitest";
import {
  ALL_PAGES, DEFAULT_PERMISSIONS, allRoleKeys, canAccess, canCreate, canDelete, canEdit,
  emptyRolePermissions, getAccessiblePages, isUnrestricted, normalizePermissions, roleLabel,
  type PermissionsMap,
} from "@/lib/permissions";

const matrix: PermissionsMap = {
  ...DEFAULT_PERMISSIONS,
  accountant: { view: ["dashboard", "sales"], create: [], edit: ["sales"], delete: [] },
};

describe("permission checks", () => {
  it("denies everything to a user whose role has not resolved yet", () => {
    expect(canAccess(null, "dashboard", matrix)).toBe(false);
    expect(canCreate(null, "sales", matrix)).toBe(false);
    expect(canEdit(null, "sales", matrix)).toBe(false);
    expect(canDelete(null, "sales", matrix)).toBe(false);
    expect(getAccessiblePages(null, matrix)).toEqual([]);
  });

  it("gives admin and super_admin everything, whatever the matrix says", () => {
    const locked: PermissionsMap = {
      admin: emptyRolePermissions(),
      super_admin: emptyRolePermissions(),
    };
    for (const role of ["admin", "super_admin"]) {
      expect(isUnrestricted(role)).toBe(true);
      expect(canAccess(role, "sales", locked)).toBe(true);
      expect(canDelete(role, "vehicles", locked)).toBe(true);
      expect(getAccessiblePages(role, locked)).toHaveLength(ALL_PAGES.length);
    }
  });

  it("reads each action from its own list", () => {
    expect(canAccess("accountant", "sales", matrix)).toBe(true);
    expect(canCreate("accountant", "sales", matrix)).toBe(false);
    expect(canEdit("accountant", "sales", matrix)).toBe(true);
    expect(canAccess("accountant", "vehicles", matrix)).toBe(false);
  });

  it("never implies delete from edit", () => {
    expect(canEdit("sales", "sales", matrix)).toBe(true);
    expect(canDelete("sales", "sales", matrix)).toBe(false);
    expect(canDelete("mechanic", "vehicles", matrix)).toBe(false);
  });

  it("falls back to the defaults when no matrix is supplied", () => {
    expect(canAccess("mechanic", "vehicles")).toBe(true);
    expect(canAccess("mechanic", "sales")).toBe(false);
  });

  it("denies an unknown role rather than guessing", () => {
    expect(canAccess("intern", "dashboard", matrix)).toBe(false);
  });

  it("lists accessible pages in sidebar order", () => {
    const pages = getAccessiblePages("accountant", matrix);
    expect(pages).toEqual(["dashboard", "sales"]);
  });
});

describe("normalizePermissions", () => {
  it("backfills create from edit for a legacy role", () => {
    const out = normalizePermissions({
      sales: { view: ["sales", "vehicles"], edit: ["sales"] },
    });
    expect(out.sales.create).toEqual(["sales"]);
  });

  it("starts delete empty for a restricted legacy role, so nothing silently gains it", () => {
    const out = normalizePermissions({ sales: { view: ["sales"], edit: ["sales"] } });
    expect(out.sales.delete).toEqual([]);
  });

  it("keeps delete for an unrestricted legacy role", () => {
    const out = normalizePermissions({ admin: { view: ["sales"], edit: ["sales"] } });
    expect(out.admin.delete).toEqual(["sales"]);
  });

  it("migrates the oldest flat-array shape", () => {
    const out = normalizePermissions({ sales: ["dashboard", "sales"] });
    expect(out.sales.view).toEqual(["dashboard", "sales"]);
    expect(out.sales.edit).toEqual(["dashboard", "sales"]);
    expect(out.sales.delete).toEqual([]);
  });

  it("adds any default role missing from the saved JSON, and drops unknown pages", () => {
    const out = normalizePermissions({ sales: { view: ["sales", "bogus-page"] } });
    expect(out.sales.view).toEqual(["sales"]);
    expect(out.mechanic).toBeDefined();
    expect(out.admin).toBeDefined();
  });

  it("survives junk", () => {
    expect(normalizePermissions(null).admin).toBeDefined();
    expect(normalizePermissions("nonsense").mechanic).toBeDefined();
    expect(normalizePermissions({ sales: 42 }).sales).toEqual(DEFAULT_PERMISSIONS.sales);
  });
});

describe("role naming", () => {
  it("prefers a stored label and otherwise title-cases the key", () => {
    expect(roleLabel("sales")).toBe("Sales");
    expect(roleLabel("super_admin")).toBe("Super Admin");
    expect(roleLabel("sales", { sales: "Showroom Staff" })).toBe("Showroom Staff");
  });

  it("lists every role key with the unrestricted ones first", () => {
    const keys = allRoleKeys({ ...matrix, super_admin: emptyRolePermissions() });
    expect(keys[0]).toBe("super_admin");
    expect(keys[1]).toBe("admin");
    expect(keys).toContain("accountant");
  });
});

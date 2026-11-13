import { describe, expect, it } from "vitest";
import { allRoleKeys, canAccess, firstAccessiblePath, normalizePermissions } from "@/lib/permissions";

describe("deleting roles", () => {
  it("keeps a deleted built-in role gone instead of re-adding it from the defaults", () => {
    const map = normalizePermissions({ admin: { view: [] }, mechanic: { view: ["vehicles"] }, __deleted: ["sales"] });
    expect(map.sales).toBeUndefined();
    expect(allRoleKeys(map)).not.toContain("sales");
    expect(allRoleKeys(map)).not.toContain("__deleted");
  });

  it("gives someone still holding a deleted role no access", () => {
    const map = normalizePermissions({ __deleted: ["sales"] });
    expect(canAccess("sales", "vehicles", map)).toBe(false);
    expect(firstAccessiblePath("sales", map)).toBeNull();
  });

  it("never deletes admin, and still fills defaults for roles that were not deleted", () => {
    const map = normalizePermissions({ __deleted: ["admin", "sales"] });
    expect(map.admin).toBeDefined();
    expect(map.mechanic).toBeDefined();
    expect(canAccess("admin", "expenses", map)).toBe(true);
  });
});

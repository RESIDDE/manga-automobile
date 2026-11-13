import { describe, expect, it } from "vitest";
import {
  ALL_PAGES, DEFAULT_PERMISSIONS, allRoleKeys, canAccess, canEdit, firstAccessiblePath,
  getAccessiblePages, normalizePermissions, roleLabel,
} from "@/lib/permissions";

describe("Direct Sales Agent", () => {
  it("can open no page from the matrix, even if someone ticks one", () => {
    const view = ALL_PAGES.map((p) => p.key);
    const map = normalizePermissions({ dsa: { view, create: view, edit: view, delete: view } });
    for (const p of ALL_PAGES) {
      expect(canAccess("dsa", p.key, map)).toBe(false);
      expect(canEdit("dsa", p.key, map)).toBe(false);
    }
    expect(getAccessiblePages("dsa", map)).toEqual([]);
  });

  it("lands on the available-cars page", () => {
    expect(firstAccessiblePath("dsa", DEFAULT_PERMISSIONS)).toBe("/available-cars");
  });

  it("stays out of the permission table and has a readable name", () => {
    expect(allRoleKeys(normalizePermissions({ dsa: { view: [] } }))).not.toContain("dsa");
    expect(roleLabel("dsa")).toBe("Direct Sales Agent");
  });
});

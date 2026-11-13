import { describe, expect, it } from "vitest";
import { featuresFor, hasFeature, normalizeFeatureAccess } from "@/lib/permissions";

describe("collaboration feature access", () => {
  it("is on for every role when nothing has been configured", () => {
    expect(hasFeature("mechanic", "messages", {})).toBe(true);
    expect(hasFeature("accountant", "tags", null)).toBe(true);
  });

  it("follows the saved list once a role is configured", () => {
    const access = { sales: ["messages" as const] };
    expect(hasFeature("sales", "messages", access)).toBe(true);
    expect(hasFeature("sales", "tags", access)).toBe(false);
    expect(hasFeature("mechanic", "tags", access)).toBe(true);
  });

  it("never takes anything from admin, and gives nothing without a role", () => {
    expect(hasFeature("admin", "messages", { admin: [] })).toBe(true);
    expect(hasFeature(null, "messages", {})).toBe(false);
  });

  it("drops unknown entries and fills defaults for toggling", () => {
    expect(normalizeFeatureAccess({ sales: ["tags", "bogus"], x: "nope" })).toEqual({ sales: ["tags"] });
    expect(featuresFor("mechanic", {})).toEqual(["messages", "tags"]);
  });
});

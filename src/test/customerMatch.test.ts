import { describe, it, expect } from "vitest";
import {
  findCustomerMatches, normalizeName, normalizePhone, samePhone,
} from "@/lib/customerMatch";

const CUSTOMERS = [
  { id: "c1", name: "Zainab Bello", phone: "08031234567", email: "z@example.com" },
  { id: "c2", name: "Ibrahim Musa", phone: "+234 802 765 4321", email: "i@example.com" },
  { id: "c3", name: "Fatima Al-Hussaini", phone: null, email: "f@example.com" },
];

describe("normalizePhone", () => {
  it("reduces every local format to the same subscriber digits", () => {
    const expected = "8031234567";
    for (const written of [
      "08031234567", "0803 123 4567", "+2348031234567", "234-803-123-4567",
      "(0803) 123-4567", "8031234567",
    ]) {
      expect(normalizePhone(written), written).toBe(expected);
    }
  });

  it("ignores something too short to be a number", () => {
    expect(normalizePhone("0803")).toBe("");
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone(null)).toBe("");
  });
});

describe("samePhone", () => {
  it("matches across formats and rejects different numbers", () => {
    expect(samePhone("08031234567", "+234 803 123 4567")).toBe(true);
    expect(samePhone("08031234567", "08031234568")).toBe(false);
    expect(samePhone(null, "08031234567")).toBe(false);
    expect(samePhone("", "")).toBe(false);
  });
});

describe("findCustomerMatches", () => {
  it("finds the customer on file however the number was typed", () => {
    const matches = findCustomerMatches(CUSTOMERS, { phone: "+234 803 123 4567" });
    expect(matches).toHaveLength(1);
    expect(matches[0].customer.id).toBe("c1");
    expect(matches[0].reason).toBe("phone");
  });

  it("reports only the phone match when one exists, so the hint stays clear", () => {
    const matches = findCustomerMatches(CUSTOMERS, {
      name: "Ibrahim Musa",
      phone: "08031234567", // Zainab's number
    });
    expect(matches.map((m) => m.customer.id)).toEqual(["c1"]);
  });

  it("falls back to a name hint when the number is new", () => {
    const matches = findCustomerMatches(CUSTOMERS, { name: "ibrahim", phone: "09099999999" });
    expect(matches).toHaveLength(1);
    expect(matches[0].customer.id).toBe("c2");
    expect(matches[0].reason).toBe("name");
  });

  it("never matches the record being edited against itself", () => {
    const matches = findCustomerMatches(
      CUSTOMERS, { name: "Zainab Bello", phone: "08031234567" }, { excludeId: "c1" }
    );
    expect(matches).toEqual([]);
  });

  it("stays quiet on a couple of letters or an empty form", () => {
    expect(findCustomerMatches(CUSTOMERS, { name: "Za" })).toEqual([]);
    expect(findCustomerMatches(CUSTOMERS, {})).toEqual([]);
    expect(findCustomerMatches(CUSTOMERS, { name: "", phone: "" })).toEqual([]);
  });

  it("does not trip over a customer with no phone on file", () => {
    expect(() => findCustomerMatches(CUSTOMERS, { phone: "08031234567" })).not.toThrow();
    const byName = findCustomerMatches(CUSTOMERS, { name: "Fatima Al-Hussaini" });
    expect(byName[0].customer.id).toBe("c3");
  });

  it("normalises names for comparison", () => {
    expect(normalizeName("  Zainab   BELLO ")).toBe("zainab bello");
  });
});

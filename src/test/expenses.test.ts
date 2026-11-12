import { describe, it, expect } from "vitest";
import {
  carryGroupsForward, expenseAmount, groupCount, groupMatches, groupShare,
  groupTotal, monthTotals, numberedItems, sortedGroups, type ExpenseGroup,
} from "@/lib/expenses";

/** A month as the office would type it: a few groups, each with its own entries. */
const FUEL: ExpenseGroup = {
  id: "g1", name: "Fuel", sort_order: 0,
  expense_items: [
    { id: "i1", description: "Diesel for the generator", amount: 45_000, sort_order: 0 },
    { id: "i2", description: "Petrol, office car", amount: 30_000, sort_order: 1 },
    { id: "i3", description: "Diesel top-up", amount: 25_000, sort_order: 2 },
  ],
};

const OFFICE: ExpenseGroup = {
  id: "g2", name: "Office supplies", sort_order: 1,
  expense_items: [
    { id: "i4", description: "Printer paper", amount: "15,000", sort_order: 0 },
    { id: "i5", description: "Toner", amount: 35_000, sort_order: 1 },
  ],
};

const EMPTY_GROUP: ExpenseGroup = { id: "g3", name: "Repairs", sort_order: 2, expense_items: [] };

const MONTH = [FUEL, OFFICE, EMPTY_GROUP];

describe("reading an amount", () => {
  it("takes a number, a plain string and a comma-formatted one", () => {
    expect(expenseAmount(45_000)).toBe(45_000);
    expect(expenseAmount("45000")).toBe(45_000);
    // CurrencyInput hands back commas, and NUMERIC comes back as a string
    expect(expenseAmount("1,250,000")).toBe(1_250_000);
  });

  it("reads anything unusable as zero rather than NaN", () => {
    // One bad cell must never turn the month's total into "NaN"
    expect(expenseAmount(null)).toBe(0);
    expect(expenseAmount(undefined)).toBe(0);
    expect(expenseAmount("")).toBe(0);
    expect(expenseAmount("abc")).toBe(0);
  });
});

describe("a group", () => {
  it("costs the sum of its entries", () => {
    expect(groupTotal(FUEL)).toBe(100_000);
    expect(groupTotal(OFFICE)).toBe(50_000);
  });

  it("costs nothing when it has no entries", () => {
    expect(groupTotal(EMPTY_GROUP)).toBe(0);
    expect(groupCount(EMPTY_GROUP)).toBe(0);
    expect(groupTotal({ name: "Unsaved" })).toBe(0);
  });

  it("counts its entries", () => {
    expect(groupCount(FUEL)).toBe(3);
    expect(groupCount(OFFICE)).toBe(2);
  });
});

describe("numbering the entries", () => {
  it("numbers them 1, 2, 3 in the order they were typed", () => {
    expect(numberedItems(FUEL).map((i) => i.no)).toEqual([1, 2, 3]);
    expect(numberedItems(FUEL).map((i) => i.id)).toEqual(["i1", "i2", "i3"]);
  });

  it("orders by sort_order, not by how the database handed them back", () => {
    const shuffled: ExpenseGroup = {
      name: "Fuel",
      expense_items: [
        { id: "c", amount: 1, sort_order: 2 },
        { id: "a", amount: 1, sort_order: 0 },
        { id: "b", amount: 1, sort_order: 1 },
      ],
    };
    expect(numberedItems(shuffled).map((i) => i.id)).toEqual(["a", "b", "c"]);
  });

  it("renumbers after a deletion rather than leaving a gap", () => {
    const afterDelete: ExpenseGroup = {
      name: "Fuel",
      expense_items: [
        { id: "i1", amount: 1, sort_order: 0 },
        { id: "i3", amount: 1, sort_order: 2 },
      ],
    };
    // Entry 2 was removed; what is left reads as 1 and 2, not 1 and 3
    expect(numberedItems(afterDelete).map((i) => i.no)).toEqual([1, 2]);
  });

  it("leaves the stored items alone", () => {
    numberedItems(FUEL);
    expect(FUEL.expense_items!.map((i) => i.id)).toEqual(["i1", "i2", "i3"]);
    expect((FUEL.expense_items![0] as any).no).toBeUndefined();
  });
});

describe("the month", () => {
  it("totals every group and every entry in one pass", () => {
    const totals = monthTotals(MONTH);
    expect(totals.groups).toBe(3);
    expect(totals.entries).toBe(5);
    expect(totals.total).toBe(150_000);
  });

  it("names the group that cost the most", () => {
    expect(monthTotals(MONTH).largest).toEqual({ name: "Fuel", total: 100_000 });
  });

  it("has no largest group when nothing has been spent", () => {
    expect(monthTotals([]).largest).toBeNull();
    // A month of groups that exist but hold nothing has no meaningful largest
    expect(monthTotals([EMPTY_GROUP]).largest).toBeNull();
  });

  it("reads an empty month as zero, not as an error", () => {
    expect(monthTotals([])).toEqual({ groups: 0, entries: 0, total: 0, largest: null });
  });

  it("gives each group its share of the month", () => {
    expect(groupShare(FUEL, MONTH)).toBeCloseTo(66.67, 1);
    expect(groupShare(OFFICE, MONTH)).toBeCloseTo(33.33, 1);
    expect(groupShare(EMPTY_GROUP, MONTH)).toBe(0);
  });

  it("gives a share of zero rather than dividing by zero", () => {
    expect(groupShare(EMPTY_GROUP, [EMPTY_GROUP])).toBe(0);
  });

  it("sorts groups by sort_order, falling back to the name", () => {
    expect(sortedGroups([OFFICE, EMPTY_GROUP, FUEL]).map((g) => g.name))
      .toEqual(["Fuel", "Office supplies", "Repairs"]);

    const unordered = [{ name: "Zinc" }, { name: "Acid" }];
    expect(sortedGroups(unordered).map((g) => g.name)).toEqual(["Acid", "Zinc"]);
  });

  it("does not reorder the caller's array", () => {
    const input = [OFFICE, FUEL];
    sortedGroups(input);
    expect(input.map((g) => g.name)).toEqual(["Office supplies", "Fuel"]);
  });
});

describe("searching a month", () => {
  it("matches on the group's own name", () => {
    expect(groupMatches(FUEL, "fuel")).toBe(true);
    expect(groupMatches(FUEL, "FUEL")).toBe(true);
  });

  it("matches on an entry inside the group", () => {
    // The group is "Fuel"; the generator is only named on one of its entries
    expect(groupMatches(FUEL, "generator")).toBe(true);
    expect(groupMatches(OFFICE, "toner")).toBe(true);
  });

  it("matches on who was paid and on the reference", () => {
    const g: ExpenseGroup = {
      name: "Repairs",
      expense_items: [{ amount: 1, paid_to: "Musa Panel Beater", reference: "TRF-9931" }],
    };
    expect(groupMatches(g, "musa")).toBe(true);
    expect(groupMatches(g, "trf-99")).toBe(true);
  });

  it("keeps everything when nothing is typed", () => {
    expect(groupMatches(FUEL, "")).toBe(true);
    expect(groupMatches(FUEL, "   ")).toBe(true);
  });

  it("rejects what genuinely does not match", () => {
    expect(groupMatches(FUEL, "salary")).toBe(false);
  });
});

describe("carrying groups into a new month", () => {
  const carried = carryGroupsForward(MONTH);

  it("brings the group names across", () => {
    expect(carried.map((g) => g.name)).toEqual(["Fuel", "Office supplies", "Repairs"]);
  });

  it("brings no money across", () => {
    // An expense is something that happened. Copying last month's figures would
    // invent spending nobody made.
    expect(monthTotals(carried).total).toBe(0);
  });

  it("gives each copied group one blank entry to type into", () => {
    expect(carried.every((g) => groupCount(g) === 1)).toBe(true);
    expect(carried[0].expense_items![0].description).toBe("");
  });

  it("renumbers the copied groups from the top", () => {
    expect(carried.map((g) => g.sort_order)).toEqual([0, 1, 2]);
  });

  it("carries no ids, so the copies are new rows", () => {
    expect(carried.every((g) => g.id === undefined)).toBe(true);
  });

  it("copies an empty month to an empty month", () => {
    expect(carryGroupsForward([])).toEqual([]);
  });
});

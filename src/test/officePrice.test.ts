import { describe, it, expect } from "vitest";
import {
  OFFICE_MARKUP, isStandardMarkup, marginOf, markupLabel, markupPercent,
  officeFollowsActual, officePriceFor, outsideTotals,
} from "@/lib/officePrice";

describe("officePriceFor", () => {
  it("adds the house 10% to the owner's price", () => {
    expect(OFFICE_MARKUP).toBe(0.1);
    expect(officePriceFor(5_000_000)).toBe(5_500_000);
    expect(officePriceFor(3_750_000)).toBe(4_125_000);
  });

  it("accepts the comma-formatted string the currency input produces", () => {
    expect(officePriceFor("5,000,000")).toBe(5_500_000);
  });

  it("returns zero rather than NaN for nothing, zero or rubbish", () => {
    expect(officePriceFor(0)).toBe(0);
    expect(officePriceFor("")).toBe(0);
    expect(officePriceFor(null)).toBe(0);
    expect(officePriceFor(undefined)).toBe(0);
    expect(officePriceFor("abc")).toBe(0);
  });
});

describe("marginOf", () => {
  it("is what the office makes on the car", () => {
    expect(marginOf(5_000_000, 5_500_000)).toBe(500_000);
    expect(marginOf("5,000,000", "5,500,000")).toBe(500_000);
  });

  it("goes negative when the office quotes below the owner", () => {
    expect(marginOf(5_000_000, 4_800_000)).toBe(-200_000);
  });
});

describe("markupPercent", () => {
  it("measures the markup actually applied", () => {
    expect(markupPercent(5_000_000, 5_500_000)).toBeCloseTo(10);
    expect(markupPercent(5_000_000, 5_700_000)).toBeCloseTo(14);
    expect(markupPercent(5_000_000, 4_750_000)).toBeCloseTo(-5);
  });

  it("is null with no actual price to measure against", () => {
    expect(markupPercent(0, 5_000_000)).toBeNull();
    expect(markupPercent(null, 5_000_000)).toBeNull();
  });
});

describe("isStandardMarkup", () => {
  it("is true at exactly the house rate, so the office price keeps following", () => {
    expect(isStandardMarkup(5_000_000, 5_500_000)).toBe(true);
    expect(isStandardMarkup(3_750_000, 4_125_000)).toBe(true);
  });

  it("tolerates a naira of rounding", () => {
    expect(isStandardMarkup(5_000_000, 5_500_000.4)).toBe(true);
  });

  it("is false once someone has negotiated the price", () => {
    expect(isStandardMarkup(5_000_000, 5_700_000)).toBe(false);
    expect(isStandardMarkup(5_000_000, 5_000_000)).toBe(false);
  });

  it("is false with no actual price, so a blank form does not claim to be standard", () => {
    expect(isStandardMarkup(0, 0)).toBe(false);
  });
});

describe("officeFollowsActual", () => {
  it("follows on a fresh form, where there is no office price yet", () => {
    // The bug this guards: a new form starts at "0"/"0", and isStandardMarkup is
    // false there, so the office price never filled when the actual was typed.
    expect(officeFollowsActual("0", "0")).toBe(true);
    expect(officeFollowsActual("5000000", "0")).toBe(true);
    expect(officeFollowsActual("5000000", "")).toBe(true);
    expect(officeFollowsActual("5000000", null)).toBe(true);
  });

  it("keeps following while the office price is the untouched +10%", () => {
    expect(officeFollowsActual(5_000_000, 5_500_000)).toBe(true);
  });

  it("stops following once someone has negotiated the office price", () => {
    expect(officeFollowsActual(5_000_000, 5_700_000)).toBe(false);
    expect(officeFollowsActual(5_000_000, 5_000_000)).toBe(false);
  });
});

describe("markupLabel", () => {
  it("reads as a badge", () => {
    expect(markupLabel(5_000_000, 5_500_000)).toBe("+10%");
    expect(markupLabel(5_000_000, 5_700_000)).toBe("+14%");
    expect(markupLabel(5_000_000, 4_750_000)).toBe("−5%");
    expect(markupLabel(0, 1)).toBeNull();
  });
});

describe("outsideTotals", () => {
  it("totals both prices and the margin between them", () => {
    const totals = outsideTotals([
      { cost_price: 5_000_000, price: 5_500_000 },
      { cost_price: 3_000_000, price: 3_300_000 },
    ]);
    expect(totals).toEqual({
      units: 2,
      actual: 8_000_000,
      office: 8_800_000,
      margin: 800_000,
    });
  });

  it("copes with missing figures", () => {
    const totals = outsideTotals([{ cost_price: null, price: undefined }]);
    expect(totals).toEqual({ units: 1, actual: 0, office: 0, margin: 0 });
  });
});

describe("rounding", () => {
  it("rounds to the naira, so a re-typed figure still reads as standard", () => {
    // 1,234,567 × 1.1 = 1,358,023.7
    expect(officePriceFor(1_234_567)).toBe(1_358_024);
    expect(isStandardMarkup(1_234_567, 1_358_024)).toBe(true);
  });
});

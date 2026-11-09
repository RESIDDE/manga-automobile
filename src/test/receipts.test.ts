import { describe, it, expect } from "vitest";
import {
  buildReceiptLedger, derivePaymentState, paymentLabel, receiptMatches, receiptNumber,
} from "@/lib/receipts";

const sale = (over: Partial<Parameters<typeof derivePaymentState>[0]> = {}) => ({
  id: "ab12cd34-0000-0000-0000-000000000000",
  sale_price: 5_000_000,
  sale_date: "2026-11-06",
  payment_status: "paid_in_full",
  payment_type: "transfer",
  ...over,
});

describe("derivePaymentState", () => {
  it("adds instalments up and leaves the remainder as the balance", () => {
    const s = derivePaymentState(sale({
      sale_payments: [
        { id: "p1", amount: 2_000_000, payment_date: "2026-11-01" },
        { id: "p2", amount: 1_000_000, payment_date: "2026-11-04" },
      ],
    }));
    expect(s.totalPaid).toBe(3_000_000);
    expect(s.balance).toBe(2_000_000);
    expect(s.isPaidInFull).toBe(false);
  });

  it("never reports a negative balance when a sale is overpaid", () => {
    const s = derivePaymentState(sale({
      sale_payments: [{ id: "p1", amount: 6_000_000, payment_date: "2026-11-01" }],
    }));
    expect(s.balance).toBe(0);
    expect(s.isPaidInFull).toBe(true);
  });

  it("treats a deposit-flagged sale with no instalments as nothing paid", () => {
    const s = derivePaymentState(sale({ payment_status: "deposit", sale_payments: [] }));
    expect(s.totalPaid).toBe(0);
    expect(s.balance).toBe(5_000_000);
    expect(s.isPaidInFull).toBe(false);
  });

  it("treats any other status with no instalments as paid in full", () => {
    const s = derivePaymentState(sale({ sale_payments: [] }));
    expect(s.totalPaid).toBe(5_000_000);
    expect(s.balance).toBe(0);
    expect(s.isPaidInFull).toBe(true);
  });

  it("ignores the stored flag once instalments exist", () => {
    const s = derivePaymentState(sale({
      payment_status: "paid_in_full",
      sale_payments: [{ id: "p1", amount: 1_000_000, payment_date: "2026-11-01" }],
    }));
    expect(s.isPaidInFull).toBe(false);
    expect(s.balance).toBe(4_000_000);
  });

  it("orders instalments oldest first", () => {
    const s = derivePaymentState(sale({
      sale_payments: [
        { id: "late", amount: 1, payment_date: "2026-11-05" },
        { id: "early", amount: 1, payment_date: "2026-11-01" },
      ],
    }));
    expect(s.payments.map((p) => p.id)).toEqual(["early", "late"]);
  });
});

describe("receiptNumber", () => {
  it("is deterministic: RCT-DDMM-NNNN from the date and the uuid", () => {
    expect(receiptNumber("ab12cd34-0000", "2026-11-06")).toBe("RCT-0611-AB12");
    // same inputs → same number, so a re-print quotes what the ledger shows
    expect(receiptNumber("ab12cd34-0000", "2026-11-06")).toBe("RCT-0611-AB12");
  });

  it("pads a short id and copes with a missing date", () => {
    expect(receiptNumber("7f", "2026-01-02")).toBe("RCT-0201-007F");
    expect(receiptNumber("abcd", null)).toBe("RCT-0000-ABCD");
  });
});

describe("paymentLabel", () => {
  it("names the first one Deposit and the closing one Final", () => {
    expect(paymentLabel(0, 3, false)).toBe("Deposit");
    expect(paymentLabel(1, 3, false)).toBe("2nd payment");
    expect(paymentLabel(2, 3, true)).toBe("Final payment");
  });
});

describe("buildReceiptLedger", () => {
  const ledger = buildReceiptLedger([
    sale({
      id: "aaaa1111-0000",
      sale_price: 5_000_000,
      sale_date: "2026-11-06",
      sale_payments: [
        { id: "bbbb2222-0000", amount: 2_000_000, payment_date: "2026-11-01", payment_method: "cash" },
        { id: "cccc3333-0000", amount: 3_000_000, payment_date: "2026-11-05", payment_method: "pos" },
      ],
    }),
  ]);

  it("emits one sale receipt plus one per instalment", () => {
    expect(ledger).toHaveLength(3);
    expect(ledger.filter((e) => e.type === "sale")).toHaveLength(1);
    expect(ledger.filter((e) => e.type === "payment")).toHaveLength(2);
  });

  it("tracks the running balance on each payment receipt", () => {
    const payments = ledger
      .filter((e) => e.type === "payment")
      .sort((a, b) => new Date(a.date!).getTime() - new Date(b.date!).getTime());
    expect(payments[0].balance).toBe(3_000_000);
    expect(payments[1].balance).toBe(0);
    expect(payments[1].label).toBe("Final payment");
  });

  it("sorts newest first", () => {
    const dates = ledger.map((e) => e.date);
    expect(dates[0]).toBe("2026-11-06");
  });

  it("titles a registered sale as the agreement receipt", () => {
    const [entry] = buildReceiptLedger([sale({ is_registered: true, sale_payments: [] })]);
    expect(entry.label).toBe("Vehicle Sales Agreement Receipt");
  });
});

describe("receiptMatches", () => {
  const [entry] = buildReceiptLedger([
    sale({ id: "aaaa1111-0000", sale_date: "2026-11-06", sale_payments: [] }),
  ]);
  const context = { customer: "Zainab Bello", vehicles: "2015 Lexus RX 350", vins: "JN1AZ4EH4FM" };

  it("matches the receipt number, customer, vehicle and VIN", () => {
    expect(receiptMatches(entry, "RCT-0611", context)).toBe(true);
    expect(receiptMatches(entry, "zainab", context)).toBe(true);
    expect(receiptMatches(entry, "lexus", context)).toBe(true);
    expect(receiptMatches(entry, "jn1az", context)).toBe(true);
  });

  it("matches the amount, status and method", () => {
    expect(receiptMatches(entry, "5,000,000", context)).toBe(true);
    expect(receiptMatches(entry, "paid in full", context)).toBe(true);
    expect(receiptMatches(entry, "transfer", context)).toBe(true);
  });

  it("matches the date written several ways", () => {
    for (const q of ["november", "nov", "06/11/2026", "2026-11-06", "6"]) {
      expect(receiptMatches(entry, q, context), q).toBe(true);
    }
  });

  it("rejects what does not match, and matches everything on an empty query", () => {
    expect(receiptMatches(entry, "december", context)).toBe(false);
    expect(receiptMatches(entry, "toyota", context)).toBe(false);
    expect(receiptMatches(entry, "   ", context)).toBe(true);
  });
});

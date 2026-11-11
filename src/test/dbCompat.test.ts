import { describe, it, expect, vi } from "vitest";
import { firstWorkingSelect, isMissingSchema, omitKeys, withSchemaFallback } from "@/lib/dbCompat";

const ok = (data: any) => Promise.resolve({ data, error: null });
const fail = (error: any) => Promise.resolve({ data: null, error });

describe("isMissingSchema", () => {
  it("recognises the codes PostgREST uses for absent schema", () => {
    expect(isMissingSchema({ code: "42703" })).toBe(true); // undefined column
    expect(isMissingSchema({ code: "42P01" })).toBe(true); // undefined table
    expect(isMissingSchema({ code: "PGRST200" })).toBe(true); // missing relationship
    expect(isMissingSchema({ code: "PGRST204" })).toBe(true); // column not in cache
  });

  it("recognises the message when there is no useful code", () => {
    expect(isMissingSchema(
      { message: "column vehicles.inventory_type does not exist" },
      ["inventory_type"]
    )).toBe(true);
    expect(isMissingSchema(
      { message: "Could not find a relationship between 'sales' and 'sale_payments'" },
      ["sale_payments"]
    )).toBe(true);
  });

  it("does not swallow an unrelated failure", () => {
    expect(isMissingSchema({ code: "23505", message: "duplicate key value" })).toBe(false);
    expect(isMissingSchema({ message: "permission denied for table sales" })).toBe(false);
    expect(isMissingSchema(null)).toBe(false);
    // a schema-ish message about some *other* column is not our case
    expect(isMissingSchema(
      { message: "column vehicles.nickname does not exist" },
      ["inventory_type"]
    )).toBe(false);
  });
});

describe("withSchemaFallback", () => {
  it("returns the primary result when the database is up to date", async () => {
    const fallback = vi.fn(() => ok(["fallback"]));
    const data = await withSchemaFallback(() => ok(["primary"]), fallback, ["sale_payments"]);
    expect(data).toEqual(["primary"]);
    expect(fallback).not.toHaveBeenCalled();
  });

  it("falls back when the embedded table is missing — the bug that emptied the sales list", async () => {
    const onFallback = vi.fn();
    const data = await withSchemaFallback(
      () => fail({ code: "PGRST200", message: "Could not find a relationship … 'sale_payments'" }),
      () => ok([{ id: "s1" }]),
      ["sale_payments"],
      onFallback
    );
    expect(data).toEqual([{ id: "s1" }]);
    expect(onFallback).toHaveBeenCalledOnce();
  });

  it("rethrows anything that is not a schema problem, so real errors stay visible", async () => {
    const fallback = vi.fn(() => ok(["fallback"]));
    await expect(
      withSchemaFallback(
        () => fail({ code: "42501", message: "permission denied for table sales" }),
        fallback,
        ["sale_payments"]
      )
    ).rejects.toMatchObject({ code: "42501" });
    expect(fallback).not.toHaveBeenCalled();
  });

  it("rethrows a failure from the fallback itself", async () => {
    await expect(
      withSchemaFallback(
        () => fail({ code: "42P01" }),
        () => fail({ code: "08006", message: "connection failure" }),
        []
      )
    ).rejects.toMatchObject({ code: "08006" });
  });
});

describe("omitKeys", () => {
  it("drops only the named keys and leaves the original untouched", () => {
    const payload = { make: "Lexus", model: "RX", inventory_type: "main", accepted_date: "2026-11-08" };
    const stripped = omitKeys(payload, ["inventory_type", "accepted_date"]);
    expect(stripped).toEqual({ make: "Lexus", model: "RX" });
    expect(payload.inventory_type).toBe("main");
  });
});

describe("firstWorkingSelect", () => {
  it("uses the first shape when the database is current", async () => {
    const second = vi.fn(() => ok(["wide"]));
    const data = await firstWorkingSelect([() => ok(["narrow"]), second]);
    expect(data).toEqual(["narrow"]);
    expect(second).not.toHaveBeenCalled();
  });

  it("steps down past every shape that names a missing column", async () => {
    const onFallback = vi.fn();
    const data = await firstWorkingSelect(
      [
        () => fail({ code: "PGRST200", message: "… relationship … 'sale_payments'" }),
        () => fail({ code: "42703", message: "column sales.is_registered does not exist" }),
        () => fail({ code: "42703", message: "column sales.sale_number does not exist" }),
        () => ok([{ id: "s1" }]), // select("*") — always works
      ],
      [],
      onFallback
    );
    expect(data).toEqual([{ id: "s1" }]);
    expect(onFallback).toHaveBeenCalledWith(3, expect.anything());
  });

  it("still surfaces a real error instead of trying the next shape", async () => {
    const last = vi.fn(() => ok(["wide"]));
    await expect(
      firstWorkingSelect([
        () => fail({ code: "42501", message: "permission denied for table sales" }),
        last,
      ])
    ).rejects.toMatchObject({ code: "42501" });
    expect(last).not.toHaveBeenCalled();
  });

  it("throws the last schema error when no shape works", async () => {
    await expect(
      firstWorkingSelect([
        () => fail({ code: "42703", message: "column a does not exist" }),
        () => fail({ code: "42P01", message: "relation b does not exist" }),
      ])
    ).rejects.toMatchObject({ code: "42P01" });
  });
});

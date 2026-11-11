import { beforeEach, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...args: unknown[]) => invoke(...args) } },
}));

import {
  buildResult, checkDigitOk, decoderSummary, fieldsFromDecoder, hasAnything, normalizeVin,
  parsePhotoReply, toFuelType, toTransmission, toYear, type PhotoRead, type VinReadResult,
} from "../../supabase/functions/vin-reader/vin";
import {
  applyVinResult, canonicalMake, canonicalModel, describeFilled, readVin,
} from "@/lib/vinReader";

/** A real 2018 Nissan Leaf row from NHTSA vPIC, trimmed to the fields we read. */
const LEAF_ROW = {
  Make: "NISSAN", Model: "Leaf", ModelYear: "2018", Trim: "", Series: "",
  FuelTypePrimary: "Electric", FuelTypeSecondary: "", ElectrificationLevel: "BEV (Battery Electric Vehicle)",
  TransmissionStyle: "", BodyClass: "Hatchback/Liftback/Notchback", DisplacementL: "",
  EngineCylinders: "", DriveType: "4x2",
};

const photo = (over: Partial<PhotoRead> = {}): PhotoRead => ({
  vin: "1N4AZ1CP8JC306135", confidence: "high", make: null, model: null, year: null,
  trim: null, color: null, fuel_type: null, transmission: null, notes: null, ...over,
});

describe("VIN text", () => {
  it("cleans spacing, plate asterisks and the letters a VIN never uses", () => {
    expect(normalizeVin(" *1n4az1cp8jc306135* ")).toBe("1N4AZ1CP8JC306135");
    expect(normalizeVin("1N4AZ1CP8JC3O6I35")).toBe("1N4AZ1CP8JC306135");
    expect(normalizeVin("JN1 AZ4 EH4 FM")).toBe("JN1AZ4EH4FM");
  });

  it("leaves a Japanese-market frame number as printed", () => {
    expect(normalizeVin("nze141-1234567")).toBe("NZE141-1234567");
  });

  it("checks the 9th-character check digit", () => {
    expect(checkDigitOk("1N4AZ1CP8JC306135")).toBe(true);
    expect(checkDigitOk("1HGCM82633A004352")).toBe(true);
    expect(checkDigitOk("5TDZA23C06S395187")).toBe(false);
    expect(checkDigitOk("JN1AZ4EH4FM")).toBe(false); // not a full VIN
  });
});

describe("field mapping", () => {
  it("maps decoder and free-text fuel to the form's options", () => {
    expect(toFuelType("Gasoline")).toBe("Petrol");
    expect(toFuelType("Flexible Fuel Vehicle (FFV)")).toBe("Petrol");
    expect(toFuelType("Diesel")).toBe("Diesel");
    expect(toFuelType("BEV (Battery Electric Vehicle)")).toBe("Electric");
    expect(toFuelType("PHEV (Plug-in Hybrid Electric Vehicle)")).toBe("Hybrid");
    expect(toFuelType("Strong HEV (Hybrid Electric Vehicle)")).toBe("Hybrid");
    expect(toFuelType("Compressed Natural Gas (CNG)")).toBeNull();
    expect(toFuelType("")).toBeNull();
  });

  it("calls gasoline plus electric a hybrid", () => {
    expect(fieldsFromDecoder({ FuelTypePrimary: "Gasoline", FuelTypeSecondary: "Electric" }).fuel_type)
      .toBe("Hybrid");
  });

  it("maps transmissions, counting automated manuals as automatic", () => {
    expect(toTransmission("Automatic")).toBe("Automatic");
    expect(toTransmission("Continuously Variable Transmission (CVT)")).toBe("Automatic");
    expect(toTransmission("Automated Manual Transmission (AMT)")).toBe("Automatic");
    expect(toTransmission("Manual/Standard")).toBe("Manual");
    expect(toTransmission("")).toBeNull();
  });

  it("accepts only plausible model years", () => {
    expect(toYear("2018")).toBe("2018");
    expect(toYear("MY 2015")).toBe("2015");
    expect(toYear("1890")).toBeNull();
    expect(toYear(String(new Date().getFullYear() + 5))).toBeNull();
  });

  it("summarises body, engine and drive", () => {
    expect(decoderSummary({ BodyClass: "Coupe", DisplacementL: "3.7", EngineCylinders: "6",
      DriveType: "FWD/Front-Wheel Drive" })).toBe("Coupe · 3.7L 6-cyl · FWD");
    expect(decoderSummary(LEAF_ROW)).toBe("Hatchback/Liftback/Notchback · 4x2");
  });
});

describe("parsePhotoReply", () => {
  it("reads JSON wrapped in a code fence and treats placeholders as empty", () => {
    const reply = '```json\n{"vin":"1N4AZ1CP8JC306135","confidence":"high","make":"Unknown","color":"SILVER","notes":null}\n```';
    expect(parsePhotoReply(reply)).toMatchObject({
      vin: "1N4AZ1CP8JC306135", confidence: "high", make: null, color: "SILVER", notes: null,
    });
  });

  it("downgrades an unrecognised confidence to low, and rejects non-JSON", () => {
    expect(parsePhotoReply('{"vin":"X","confidence":"certain"}')?.confidence).toBe("low");
    expect(parsePhotoReply("I can't see a VIN here.")).toBeNull();
  });
});

describe("buildResult", () => {
  it("prefers the decoder, takes colour from the photo, and records sources", () => {
    const r = buildResult({
      vin: "1N4AZ1CP8JC306135",
      photo: photo({ color: "Silver", model: "LEAF SV" }),
      decoded: LEAF_ROW,
    });
    expect(r.fields).toEqual({
      make: "NISSAN", model: "Leaf", year: "2018", trim: null, color: "Silver",
      fuel_type: "Electric", transmission: null,
    });
    expect(r.sources).toMatchObject({ make: "decoder", model: "decoder", color: "photo" });
    expect(r.standard).toBe(true);
    expect(r.checkDigitOk).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it("warns on a failed check digit, a low-confidence read, and a make mismatch", () => {
    const r = buildResult({
      vin: "5TDZA23C06S395187",
      photo: photo({ vin: "5TDZA23C06S395187", confidence: "low", make: "Honda", notes: "Glare on the last digit." }),
      decoded: { Make: "TOYOTA", Model: "Sienna", ModelYear: "2006" },
    });
    expect(r.checkDigitOk).toBe(false);
    expect(r.warnings.join(" ")).toMatch(/hard to read/);
    expect(r.warnings.join(" ")).toMatch(/check digit/);
    expect(r.warnings.join(" ")).toMatch(/photo says Honda but the VIN decodes as TOYOTA/);
    expect(r.warnings).toContain("Glare on the last digit.");
  });

  it("has nothing to offer when the photo shows no VIN and no details", () => {
    const r = buildResult({ vin: "", photo: photo({ vin: null, notes: "No VIN visible." }), decoded: null });
    expect(r.vin).toBeNull();
    expect(hasAnything(r)).toBe(false);
    expect(hasAnything(buildResult({ vin: "", photo: photo({ vin: null, make: "Toyota" }), decoded: null })))
      .toBe(true);
  });

  it("says so when the decoder is down or doesn't know the VIN", () => {
    expect(buildResult({ vin: "1N4AZ1CP8JC306135", photo: null, decoded: null, decoderUnavailable: true })
      .warnings.join(" ")).toMatch(/didn't answer/);
    expect(buildResult({ vin: "WDD1234567A123456", photo: null, decoded: { Make: "" } })
      .warnings.join(" ")).toMatch(/isn't in the decoder's records/);
    expect(buildResult({ vin: "NZE141-1234567", photo: photo({ vin: "NZE141-1234567" }), decoded: null })
      .warnings.join(" ")).toMatch(/isn't a standard 17-character VIN/);
  });
});

describe("applying a result to the form", () => {
  const emptyForm = {
    vin: "", make: "", model: "", year: "2026", trim: "", color: "",
    fuel_type: "Petrol", transmission: "Automatic", price: "0",
  };
  const result = (fields: Partial<VinReadResult["fields"]>, vin = "1N4AZ1CP8JC306135"): VinReadResult => ({
    vin, standard: true, checkDigitOk: true, confidence: "high", summary: null, warnings: [], sources: {},
    fields: { make: null, model: null, year: null, trim: null, color: null, fuel_type: null, transmission: null, ...fields },
  });

  it("spells makes and models the way the app's list does", () => {
    expect(canonicalMake("NISSAN")).toBe("Nissan");
    expect(canonicalMake("MERCEDES-BENZ")).toBe("Mercedes-Benz");
    expect(canonicalMake("CITROEN")).toBe("Citroën");
    expect(canonicalMake("BMW")).toBe("BMW");
    expect(canonicalMake("ZOTYE AUTO")).toBe("Zotye Auto");
    expect(canonicalModel("Toyota", "COROLLA")).toBe("Corolla");
    expect(canonicalModel("Nissan", "Leaf")).toBe("Leaf");
  });

  it("fills only what was found, keeps the first 11 VIN characters, and remembers the old values", () => {
    const form = { ...emptyForm, price: "5000000" };
    const { next, previous, filled } = applyVinResult(form,
      result({ make: "NISSAN", model: "Leaf", year: "2018", fuel_type: "Electric", color: "SILVER" }));
    expect(next).toEqual({
      ...form, vin: "1N4AZ1CP8JC", make: "Nissan", model: "Leaf", year: "2018",
      fuel_type: "Electric", color: "Silver",
    });
    expect(filled).toEqual(["vin", "make", "model", "year", "color", "fuel_type"]);
    expect(previous).toEqual({ vin: "", make: "", model: "", year: "2026", color: "", fuel_type: "Petrol" });
    expect({ ...next, ...previous }).toEqual(form); // undo restores the form exactly
  });

  it("reports nothing filled when the form already matches", () => {
    const form = { ...emptyForm, vin: "1N4AZ1CP8JC", make: "Nissan" };
    expect(applyVinResult(form, result({ make: "NISSAN" })).filled).toEqual([]);
  });

  it("describes the filled fields in plain words", () => {
    expect(describeFilled(["make"])).toBe("make");
    expect(describeFilled(["vin", "make", "fuel_type"])).toBe("chassis number, make and fuel type");
  });
});

describe("readVin", () => {
  beforeEach(() => invoke.mockReset());

  it("returns the function's answer", async () => {
    invoke.mockResolvedValue({ data: { vin: "X" }, error: null });
    await expect(readVin({ vin: "1N4AZ1CP8JC" })).resolves.toEqual({ vin: "X" });
    expect(invoke).toHaveBeenCalledWith("vin-reader", { body: { vin: "1N4AZ1CP8JC" } });
  });

  it("passes on the function's own error message", async () => {
    const context = new Response(JSON.stringify({ error: "No chassis number found in that photo." }), { status: 422 });
    invoke.mockResolvedValue({ data: null, error: { name: "FunctionsHttpError", message: "non-2xx", context } });
    await expect(readVin({ image: "data:image/jpeg;base64,AA" }))
      .rejects.toThrow("No chassis number found in that photo.");
  });

  it("explains a missing deployment", async () => {
    const context = new Response(JSON.stringify({ message: "Requested function was not found" }), { status: 404 });
    invoke.mockResolvedValue({ data: null, error: { name: "FunctionsHttpError", message: "non-2xx", context } });
    await expect(readVin({ vin: "1N4AZ1CP8JC" })).rejects.toThrow(/isn't deployed/);
  });

  it("points at a missing deployment when the browser can't reach the function", async () => {
    // What a browser actually sees for an undeployed function: the CORS pre-flight fails
    invoke.mockResolvedValue({ data: null, error: { name: "FunctionsFetchError", message: "Failed to send a request" } });
    await expect(readVin({ vin: "1N4AZ1CP8JC" })).rejects.toThrow(/hasn't been deployed to Supabase/);
  });

  it("says so when the device is offline", async () => {
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    invoke.mockResolvedValue({ data: null, error: { name: "FunctionsFetchError", message: "Failed to send a request" } });
    await expect(readVin({ vin: "1N4AZ1CP8JC" })).rejects.toThrow(/offline/);
    onLine.mockRestore();
  });
});

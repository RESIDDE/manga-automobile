/**
 * Pure VIN helpers for the vin-reader edge function.
 *
 * No Deno, browser or network APIs in here, so the app's vitest suite imports
 * this file directly (src/test/vinReader.test.ts) and the shapes stay in step
 * with the client in src/lib/vinReader.ts.
 */

export type FuelType = "Petrol" | "Diesel" | "Electric" | "Hybrid";
export type Transmission = "Automatic" | "Manual";

/** The vehicle form fields the reader can fill, as form-ready strings. */
export interface VinFields {
  make: string | null;
  model: string | null;
  year: string | null;
  trim: string | null;
  color: string | null;
  fuel_type: FuelType | null;
  transmission: Transmission | null;
}

/** What the function returns to the app. */
export interface VinReadResult {
  /** Chassis number as read or typed, cleaned up. Null when the photo showed none. */
  vin: string | null;
  /** True for a full 17-character ISO VIN. */
  standard: boolean;
  /** Check digit (9th character) result for a full VIN; null when it does not apply. */
  checkDigitOk: boolean | null;
  /** How sure the model was of every VIN character. Null for typed look-ups. */
  confidence: "high" | "medium" | "low" | null;
  fields: VinFields;
  /** Where each filled field came from. */
  sources: Partial<Record<keyof VinFields, "decoder" | "photo">>;
  /** One line of extra detail from the decoder, e.g. "Coupe · 3.7L 6-cyl · FWD". */
  summary: string | null;
  /** Things a person should check before saving. */
  warnings: string[];
}

/** What the vision model reports from the photo. */
export interface PhotoRead {
  vin: string | null;
  confidence: "high" | "medium" | "low";
  make: string | null;
  model: string | null;
  year: string | null;
  trim: string | null;
  color: string | null;
  fuel_type: string | null;
  transmission: string | null;
  notes: string | null;
}

/** The subset of NHTSA vPIC DecodeVinValuesExtended we read. Every value is a string, "" when unknown. */
export type NhtsaRow = Record<string, string | null | undefined>;

// ── VIN text ────────────────────────────────────────────────────────────────

/** I, O and Q never appear in a VIN; in a photo they are almost always 1 and 0. */
const NEVER_IN_VIN: Record<string, string> = { I: "1", O: "0", Q: "0" };

/**
 * Upper-cases and strips spacing and the asterisks plates print around a VIN.
 * A VIN-like run (11–17 letters and digits) also has I/O/Q corrected. Anything
 * else — an older or Japanese-market frame number such as "NZE141-1234567" —
 * keeps its own characters.
 */
export function normalizeVin(raw: string | null | undefined): string {
  const compact = (raw ?? "").toUpperCase().replace(/[\s*.]/g, "");
  if (/^[A-Z0-9]{11,17}$/.test(compact)) {
    return compact.replace(/[IOQ]/g, (c) => NEVER_IN_VIN[c]);
  }
  return compact;
}

/** A full 17-character VIN (ISO 3779 alphabet). */
export function isStandardVin(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(vin);
}

/** Long enough for the NHTSA decoder: it decodes the first 11 characters on their own. */
export function isDecodable(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{11,17}$/.test(vin);
}

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * The 9th-character check digit. Mandatory on North American VINs, so a
 * failure there usually means a misread character; many cars built for other
 * markets don't use it at all.
 */
export function checkDigitOk(vin: string): boolean {
  if (!isStandardVin(vin)) return false;
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const c = vin[i];
    const value = c >= "0" && c <= "9" ? Number(c) : TRANSLITERATION[c];
    sum += value * WEIGHTS[i];
  }
  const remainder = sum % 11;
  return vin[8] === (remainder === 10 ? "X" : String(remainder));
}

// ── Field mapping ───────────────────────────────────────────────────────────

/** Trimmed text, or null for blanks and the placeholders models and decoders use. */
export function clean(value: unknown, max = 60): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value).trim();
  if (!text || /^(null|none|unknown|n\/a|not applicable|-)$/i.test(text)) return null;
  return text.slice(0, max);
}

/** Free text ("Gasoline", "HEV (Hybrid…)", "petrol") to the form's fuel options. */
export function toFuelType(text: string | null | undefined): FuelType | null {
  const t = (text ?? "").toLowerCase();
  if (!t) return null;
  // The form has no gas option; leave its fuel field alone for CNG/LPG cars
  if (/natural gas|\bcng\b|\blpg\b|propane/.test(t)) return null;
  if (/hybrid|\bp?hev\b/.test(t)) return "Hybrid";
  if (/diesel/.test(t)) return "Diesel";
  if (/electric|\bbev\b|\bfcev\b|\bev\b/.test(t)) return "Electric";
  if (/gasoline|petrol|\bgas\b|flex|ffv|ethanol/.test(t)) return "Petrol";
  return null;
}

/** Free text to the form's transmission options. Automated manuals (AMT) count as automatic. */
export function toTransmission(text: string | null | undefined): Transmission | null {
  const t = (text ?? "").toLowerCase();
  if (!t) return null;
  if (/auto|cvt|continuously|dual[- ]clutch|\bdct\b|\bamt\b/.test(t)) return "Automatic";
  if (/manual|standard|\bmt\b/.test(t)) return "Manual";
  return null;
}

/** A plausible four-digit model year, or null. */
export function toYear(value: unknown): string | null {
  const match = /\b(19[5-9]\d|20\d\d)\b/.exec(String(value ?? ""));
  if (!match) return null;
  return Number(match[1]) <= new Date().getFullYear() + 1 ? match[1] : null;
}

/** NHTSA's fuel story: electrification level first, then primary/secondary fuel. */
function decoderFuel(row: NhtsaRow): FuelType | null {
  const fromLevel = toFuelType(row.ElectrificationLevel);
  if (fromLevel) return fromLevel;
  const primary = toFuelType(row.FuelTypePrimary);
  const secondary = toFuelType(row.FuelTypeSecondary);
  if (primary && secondary && primary !== secondary
      && [primary, secondary].includes("Electric")) return "Hybrid";
  return primary;
}

/** The decoder's view of the car, as form fields. */
export function fieldsFromDecoder(row: NhtsaRow | null): Partial<VinFields> {
  if (!row) return {};
  return {
    make: clean(row.Make),
    model: clean(row.Model),
    year: toYear(row.ModelYear),
    trim: clean(row.Trim),
    fuel_type: decoderFuel(row),
    transmission: toTransmission(row.TransmissionStyle),
  };
}

/** What the photo itself showed, as form fields. */
export function fieldsFromPhoto(photo: PhotoRead | null): Partial<VinFields> {
  if (!photo) return {};
  return {
    make: clean(photo.make),
    model: clean(photo.model),
    year: toYear(photo.year),
    trim: clean(photo.trim),
    color: clean(photo.color, 30),
    fuel_type: toFuelType(photo.fuel_type),
    transmission: toTransmission(photo.transmission),
  };
}

/** "Coupe · 3.7L 6-cyl · FWD" from the decoder, or null. */
export function decoderSummary(row: NhtsaRow | null): string | null {
  if (!row) return null;
  const litres = Number(row.DisplacementL);
  const cylinders = clean(row.EngineCylinders);
  const engine = litres > 0
    ? `${litres.toFixed(1)}L${cylinders ? ` ${cylinders}-cyl` : ""}`
    : null;
  // "FWD/Front-Wheel Drive" → "FWD"
  const drive = clean(row.DriveType)?.split("/")[0] ?? null;
  const parts = [clean(row.BodyClass), engine, drive].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

// ── Parsing the model's reply ───────────────────────────────────────────────

/**
 * Pulls the JSON object out of the model's reply, tolerating code fences or a
 * stray sentence around it. Null when there is no usable object.
 */
export function parsePhotoReply(text: string): PhotoRead | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object") return null;
  const confidence = raw.confidence === "high" || raw.confidence === "medium" ? raw.confidence : "low";
  return {
    vin: clean(raw.vin, 25),
    confidence,
    make: clean(raw.make),
    model: clean(raw.model),
    year: clean(raw.year),
    trim: clean(raw.trim),
    color: clean(raw.color),
    fuel_type: clean(raw.fuel_type),
    transmission: clean(raw.transmission),
    notes: clean(raw.notes, 200),
  };
}

// ── Putting it together ─────────────────────────────────────────────────────

const FIELD_KEYS: (keyof VinFields)[] = [
  "make", "model", "year", "trim", "color", "fuel_type", "transmission",
];

/** Loose comparison for make names: "MERCEDES-BENZ" matches "Mercedes Benz". */
const nameKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Merges the decoder and the photo into one answer. The decoder wins where it
 * has a value — it is the manufacturer's own data — and the photo fills the
 * gaps (colour is only ever from the photo).
 */
export function buildResult(input: {
  vin: string;
  photo: PhotoRead | null;
  decoded: NhtsaRow | null;
  /** True when the VIN was decodable but the decoder could not be reached. */
  decoderUnavailable?: boolean;
}): VinReadResult {
  const { vin, photo, decoded } = input;
  const fromDecoder = fieldsFromDecoder(decoded);
  const fromPhoto = fieldsFromPhoto(photo);

  const fields: VinFields = {
    make: fromDecoder.make ?? fromPhoto.make ?? null,
    model: fromDecoder.model ?? fromPhoto.model ?? null,
    year: fromDecoder.year ?? fromPhoto.year ?? null,
    trim: fromDecoder.trim ?? fromPhoto.trim ?? null,
    color: fromPhoto.color ?? null,
    fuel_type: fromDecoder.fuel_type ?? fromPhoto.fuel_type ?? null,
    transmission: fromDecoder.transmission ?? fromPhoto.transmission ?? null,
  };
  const sources: VinReadResult["sources"] = {};
  for (const key of FIELD_KEYS) {
    if (fromDecoder[key]) sources[key] = "decoder";
    else if (fromPhoto[key]) sources[key] = "photo";
  }

  const standard = isStandardVin(vin);
  const digitOk = standard ? checkDigitOk(vin) : null;
  const warnings: string[] = [];

  if (photo?.vin && photo.confidence === "low") {
    warnings.push("Some VIN characters were hard to read. Compare it with the plate before saving.");
  }
  if (digitOk === false) {
    warnings.push(
      "The VIN's check digit doesn't add up. Cars built for outside North America often skip it, " +
      "but compare each character with the plate."
    );
  }
  if (fromDecoder.make && fromPhoto.make
      && !nameKey(fromDecoder.make).includes(nameKey(fromPhoto.make))
      && !nameKey(fromPhoto.make).includes(nameKey(fromDecoder.make))) {
    warnings.push(
      `The photo says ${fromPhoto.make} but the VIN decodes as ${fromDecoder.make}. ` +
      "A character in the VIN may be misread."
    );
  }
  if (input.decoderUnavailable) {
    warnings.push("The VIN decoder didn't answer, so only what the photo shows was filled.");
  } else if (vin && isDecodable(vin) && !fromDecoder.make && !fromPhoto.make) {
    warnings.push("This VIN isn't in the decoder's records (common for cars built for other markets). Fill the make and model by hand.");
  } else if (vin && !isDecodable(vin) && !fields.make) {
    warnings.push("This chassis number isn't a standard 17-character VIN, so it can't be decoded. Fill the details by hand.");
  }
  if (photo?.notes) warnings.push(photo.notes);

  return {
    vin: vin || null,
    standard,
    checkDigitOk: digitOk,
    confidence: photo ? photo.confidence : null,
    fields,
    sources,
    summary: decoderSummary(decoded),
    warnings,
  };
}

/** True when there is anything at all to put on the form. */
export function hasAnything(result: VinReadResult): boolean {
  return !!result.vin || FIELD_KEYS.some((k) => result.fields[k]);
}

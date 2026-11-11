import { supabase } from "@/integrations/supabase/client";
import { getModelsForMake, makes } from "@/data/vehicleData";
import { VIN_MAX_LENGTH } from "@/lib/constants";
import type { VinFields, VinReadResult } from "../../supabase/functions/vin-reader/vin";

export type { VinReadResult };

/** Long edge of the photo sent to the reader: plenty for plate text, quick on a phone connection. */
const MAX_EDGE = 1600;

/** The decoder needs at least the first 11 characters of a VIN (maker, model, year, plant). */
export const MIN_LOOKUP_LENGTH = 11;

/** Form fields the reader can change, with the words used in the "Filled …" message. */
export const VIN_FIELD_LABELS = {
  vin: "chassis number",
  make: "make",
  model: "model",
  year: "year",
  trim: "trim",
  color: "colour",
  fuel_type: "fuel type",
  transmission: "transmission",
} as const;

export type VinFormKey = keyof typeof VIN_FIELD_LABELS;
type VinForm = Record<VinFormKey, string>;

// ── Photo → data URL ────────────────────────────────────────────────────────

/** Shrinks a photo to a JPEG data URL small enough to send quickly. */
export async function photoToDataUrl(file: File): Promise<string> {
  if (file.type && !file.type.startsWith("image/")) {
    throw new Error("Choose a photo (JPG or PNG).");
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    try {
      await img.decode();
    } catch {
      throw new Error(
        "This photo's format can't be opened here. Use a JPG or PNG, or take the photo from this page."
      );
    }
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Your browser couldn't prepare the photo.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ── Calling the function ────────────────────────────────────────────────────

/** Turns a supabase.functions.invoke error into a sentence a salesperson can act on. */
async function describeInvokeError(
  error: { name?: string; message?: string; context?: unknown }
): Promise<string> {
  // FunctionsHttpError carries the raw Response; the function puts its message in { error }
  const res = error?.context instanceof Response ? error.context : undefined;
  if (res) {
    if (res.status === 404) {
      return "The VIN reader isn't deployed on the server yet.";
    }
    try {
      const body = await res.clone().json();
      if (typeof body?.error === "string") return body.error;
    } catch {
      /* not JSON — fall through */
    }
  }
  if (error?.name === "FunctionsFetchError" || error?.name === "FunctionsRelayError") {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return "You're offline. Reconnect and try again.";
    }
    // A function that isn't deployed fails the browser's CORS pre-flight, so it
    // surfaces here as a network error rather than as a 404.
    return "Couldn't reach the VIN reader. If your internet is working, the vin-reader function " +
      "hasn't been deployed to Supabase yet.";
  }
  return error?.message || "The VIN reader failed. Try again.";
}

/** Reads a VIN from a photo, or decodes a typed one. Throws with a readable message. */
export async function readVin(input: { image: string } | { vin: string }): Promise<VinReadResult> {
  const { data, error } = await supabase.functions.invoke<VinReadResult>("vin-reader", { body: input });
  if (error) throw new Error(await describeInvokeError(error));
  if (!data) throw new Error("The VIN reader returned nothing. Try again.");
  return data;
}

// ── Result → form ───────────────────────────────────────────────────────────

/** Compare names ignoring case, accents, spaces and hyphens: "CITROEN" ↔ "Citroën". */
const nameKey = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * "LAND ROVER" → "Land Rover". Mixed-case text is left alone. With
 * keepAcronyms, short words stay in capitals (BMW, GMC) — right for makes,
 * wrong for colours ("RED" → "Red").
 */
function tidyCase(s: string, keepAcronyms = true): string {
  if (s !== s.toUpperCase()) return s;
  return s
    .toLowerCase()
    .replace(/(^|[\s-])([a-z]+)/g, (_, sep: string, word: string) =>
      sep + (keepAcronyms && word.length <= 3
        ? word.toUpperCase()
        : word[0].toUpperCase() + word.slice(1))
    );
}

/** The make as the app's own list spells it, so the model suggestions line up. */
export function canonicalMake(raw: string): string {
  const key = nameKey(raw);
  return makes.find((m) => nameKey(m) === key) ?? tidyCase(raw.trim());
}

/** The model as the app's list spells it for that make, else as given. */
export function canonicalModel(make: string, raw: string): string {
  const key = nameKey(raw);
  return getModelsForMake(make).find((m) => nameKey(m) === key) ?? raw.trim();
}

/**
 * Applies a reader result to the vehicle form. Only fields the reader actually
 * found are touched; `previous` holds what they were, for an undo.
 *
 * The chassis field keeps the first VIN_MAX_LENGTH characters — the same thing
 * typing or pasting a full VIN into it does.
 */
export function applyVinResult<T extends VinForm>(
  form: T,
  result: VinReadResult
): { next: T; previous: Partial<T>; filled: VinFormKey[] } {
  const f: VinFields = result.fields;
  const updates: Partial<VinForm> = {};

  if (result.vin) updates.vin = result.vin.toUpperCase().slice(0, VIN_MAX_LENGTH);
  if (f.make) updates.make = canonicalMake(f.make);
  if (f.model) updates.model = canonicalModel(updates.make ?? form.make, f.model);
  if (f.year) updates.year = f.year;
  if (f.trim) updates.trim = f.trim;
  if (f.color) updates.color = tidyCase(f.color, false);
  if (f.fuel_type) updates.fuel_type = f.fuel_type;
  if (f.transmission) updates.transmission = f.transmission;

  const previous: Partial<T> = {};
  const filled: VinFormKey[] = [];
  for (const key of Object.keys(updates) as VinFormKey[]) {
    if (form[key] !== updates[key]) {
      (previous as VinForm)[key] = form[key];
      filled.push(key);
    }
  }
  return { next: { ...form, ...updates }, previous, filled };
}

/** "make, model and year" */
export function describeFilled(keys: VinFormKey[]): string {
  const words = keys.map((k) => VIN_FIELD_LABELS[k]);
  return words.length <= 1
    ? words.join("")
    : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
}

/**
 * The two outside services the VIN reader talks to:
 *   - OpenRouter, for a vision model that reads the chassis number off a photo
 *   - NHTSA vPIC, a free public decoder that turns a VIN into make/model/year
 */
import { type NhtsaRow, type PhotoRead, parsePhotoReply } from "./vin.ts";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
/** Override with the OPENROUTER_MODEL secret; any OpenRouter model that accepts images works. */
export const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";

/** A failure the salesperson should see as-is, with the HTTP status to send. */
export class UserError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

const SYSTEM_PROMPT = `You read vehicle identification photos for a car dealership: VIN plates on the dashboard (often seen through the windscreen), door-pillar stickers, engine-bay plates, stamped chassis numbers, and papers such as customs documents, titles and registration cards.

Reply with only a JSON object, no other text, in exactly this shape:
{
  "vin": string or null,
  "confidence": "high" | "medium" | "low",
  "make": string or null,
  "model": string or null,
  "year": string or null,
  "trim": string or null,
  "color": string or null,
  "fuel_type": string or null,
  "transmission": string or null,
  "notes": string or null
}

Rules:
- "vin" is the chassis number exactly as printed. A modern VIN is 17 characters and never contains the letters I, O or Q. Read every character carefully; if it appears more than once (printed text and a barcode label, say), use the clearest copy. If the car has an older or Japanese-market frame number instead (like "NZE141-1234567"), return it as printed.
- Fill the other fields only from text actually visible in the photo (a document, a sticker, a badge). Do not work them out from the VIN: a separate decoder does that. Use null for anything not shown.
- "year" is the model year as four digits, never a manufacture date such as "05/17".
- "trim" is the model variant written out (such as "SV", "XLE" or "LX 600"). A door sticker's "TRIM" box holds an interior colour code, not the variant: leave "trim" null for that.
- "color" is a plain paint colour name such as "Silver", only if a name is printed (not just a paint code).
- "confidence" is how sure you are of every single VIN character: "low" if any character is blurred, covered, cut off or guessed.
- "notes" is one short sentence for the salesperson only when the VIN or a value you filled needs checking (for example "Last two characters are covered by glare"). Don't explain fields you left null. Otherwise null.
- If no chassis number is visible, set "vin" to null and say why in "notes".`;

/** Reads the chassis number and any printed details from a photo (a data: URL). */
export async function readPhoto(image: string, apiKey: string, model = DEFAULT_MODEL): Promise<PhotoRead> {
  let res: Response;
  try {
    res = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(45_000),
      body: JSON.stringify({
        model,
        temperature: 0,
        // Models that think before answering spend part of this on the thinking;
        // a short budget can leave nothing for the JSON itself.
        max_tokens: 2000,
        reasoning: { effort: "low" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: image } },
              { type: "text", text: "Read the chassis number (VIN) and any vehicle details printed in this photo." },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    if ((err as Error)?.name === "TimeoutError") {
      throw new UserError("Reading the photo took too long. Try again.", 504);
    }
    throw err;
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("OpenRouter error", res.status, detail.slice(0, 500));
    if (res.status === 401 || res.status === 403) {
      throw new UserError("The OpenRouter key was rejected. Check the OPENROUTER_API_KEY secret.", 502);
    }
    if (res.status === 402) throw new UserError("The OpenRouter account is out of credit.", 502);
    if (res.status === 429) throw new UserError("The VIN reader is busy. Try again in a moment.", 503);
    throw new UserError("The photo couldn't be read right now. Try again.", 502);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  // Most providers send a string; a few send an array of text parts.
  const text = typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content.map((part: { text?: string }) => part?.text ?? "").join("")
      : "";
  const parsed = parsePhotoReply(text);
  if (!parsed) {
    console.error("Unparseable model reply", {
      model: data?.model,
      finish: data?.choices?.[0]?.finish_reason,
      text: text.slice(0, 500),
    });
    throw new UserError("The photo couldn't be read. Try a closer, sharper shot of the plate.", 502);
  }
  return parsed;
}

/**
 * Decodes a VIN (or its first 11 characters) with NHTSA vPIC. Returns null if
 * the service can't be reached — the photo's own details still get used.
 */
export async function decodeVin(vin: string): Promise<NhtsaRow | null> {
  try {
    const res = await fetch(
      `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(vin)}?format=json`,
      { signal: AbortSignal.timeout(12_000) },
    );
    if (!res.ok) {
      console.warn("NHTSA decode failed", res.status);
      return null;
    }
    const data = await res.json();
    return (data?.Results?.[0] as NhtsaRow) ?? null;
  } catch (err) {
    console.warn("NHTSA decode failed", err);
    return null;
  }
}

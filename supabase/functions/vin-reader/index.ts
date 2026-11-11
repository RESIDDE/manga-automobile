/**
 * vin-reader — fills the vehicle form from a chassis number.
 *
 * POST { image: "data:image/jpeg;base64,…" }  reads the VIN off a photo, then decodes it
 * POST { vin: "JN1AZ4EH4FM" }                 decodes a typed VIN (11+ characters), no AI call
 *
 * Only signed-in users of the app can call it. The OpenRouter key lives in this
 * function's secrets and never reaches the browser.
 *
 * Deploy from the repo root, logged in to the Supabase account that owns the project:
 *   npx supabase secrets set --project-ref <ref> --env-file supabase/functions/.env
 *   npx supabase functions deploy vin-reader --project-ref <ref>
 *
 * Secrets: OPENROUTER_API_KEY (needed for photos), OPENROUTER_MODEL (optional, see sources.ts).
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { buildResult, hasAnything, isDecodable, normalizeVin, type PhotoRead } from "./vin.ts";
import { DEFAULT_MODEL, UserError, decodeVin, readPhoto } from "./sources.ts";

/** About 6 MB of photo once base64-encoded; the app shrinks photos well below this. */
const MAX_IMAGE_CHARS = 8_000_000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

/**
 * The gateway's JWT check is off for this function (supabase/config.toml)
 * because the public anon key is itself a valid JWT. This checks for a real
 * signed-in user instead.
 */
async function requireUser(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new UserError("Sign in to use the VIN reader.", 401);
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user) throw new UserError("Your session has expired. Sign in again.", 401);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  try {
    await requireUser(req);
    const body = await req.json().catch(() => null) as { image?: unknown; vin?: unknown } | null;

    let photo: PhotoRead | null = null;
    let vin: string;

    if (typeof body?.image === "string") {
      if (!body.image.startsWith("data:image/")) throw new UserError("Send the photo as an image.");
      if (body.image.length > MAX_IMAGE_CHARS) throw new UserError("That photo is too large. Try a smaller one.", 413);
      const apiKey = Deno.env.get("OPENROUTER_API_KEY");
      if (!apiKey) {
        throw new UserError("Photo reading isn't set up yet: the OPENROUTER_API_KEY secret is missing.", 503);
      }
      photo = await readPhoto(body.image, apiKey, Deno.env.get("OPENROUTER_MODEL") || DEFAULT_MODEL);
      vin = normalizeVin(photo.vin);
    } else if (typeof body?.vin === "string") {
      vin = normalizeVin(body.vin);
      if (!isDecodable(vin)) {
        throw new UserError("Type at least the first 11 characters of a standard VIN to look it up.");
      }
    } else {
      throw new UserError("Send a photo or a chassis number.");
    }

    const decoded = isDecodable(vin) ? await decodeVin(vin) : null;
    const result = buildResult({
      vin,
      photo,
      decoded,
      decoderUnavailable: isDecodable(vin) && !decoded,
    });

    if (!hasAnything(result)) {
      throw new UserError(
        photo?.notes || "No chassis number found in that photo. Try a closer, sharper shot of the plate.",
        422,
      );
    }
    return json(result);
  } catch (err) {
    if (err instanceof UserError) return json({ error: err.message }, err.status);
    console.error("vin-reader failed", err);
    return json({ error: "The VIN reader hit an unexpected error. Try again." }, 500);
  }
});

import { supabase } from "@/integrations/supabase/client";
import logoLetterhead from "@/assets/logo-letterhead.png";
import logoWatermark from "@/assets/logo-watermark.png";
import logoPrint from "@/assets/logo-print.png";
import { isMissingSchema, warnOnce } from "@/lib/dbCompat";

/**
 * The Document Archive: every document printed or downloaded is filed here as
 * an exact copy, permanently (the database refuses edits and deletions).
 */

export type ArchiveMeta = {
  /** "Receipt", "Sales Agreement", … — the filter list is built from these. */
  type: string;
  title: string;
  number?: string | null;
  /** The date on the document (yyyy-mm-dd or anything Date can read). */
  docDate?: string | null;
  person?: string | null;
  phone?: string | null;
  nin?: string | null;
  vehicle?: string | null;
  entityId?: string | null;
  /** Customer and vehicle records as they stood when printed. */
  details?: Record<string, unknown> | null;
};

export type ArchiveAction = "print" | "pdf" | "png" | "jpeg";

// ─── "Add to archive" switch ────────────────────────────────────────────────
// One setting for the whole app, remembered on this device. On by default:
// printing or downloading files a company copy unless the user turns it off.

const PREF_KEY = "manga_archive_on_print";
const prefListeners = new Set<() => void>();

export function archiveEnabled(): boolean {
  try {
    return localStorage.getItem(PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setArchiveEnabled(on: boolean) {
  try {
    localStorage.setItem(PREF_KEY, on ? "on" : "off");
  } catch { /* storage blocked: stays on */ }
  prefListeners.forEach((l) => l());
}

export function onArchivePrefChange(listener: () => void): () => void {
  prefListeners.add(listener);
  return () => { prefListeners.delete(listener); };
}

// ─── Letterhead images ──────────────────────────────────────────────────────
// The logo and watermark are ~145 kB data URIs. Stored in every copy they would
// dwarf the document, so they are swapped for a token and put back on display.

const ASSETS: Record<string, string> = {
  letterhead: logoLetterhead,
  watermark: logoWatermark,
  print: logoPrint,
};
const token = (name: string) => `__ARCHIVE_ASSET_${name}__`;

export function compactAssets(html: string): string {
  let out = html;
  for (const [name, url] of Object.entries(ASSETS)) {
    if (url) out = out.split(url).join(token(name));
  }
  return out;
}

export function restoreAssets(html: string): string {
  let out = html;
  for (const [name, url] of Object.entries(ASSETS)) out = out.split(token(name)).join(url);
  return out;
}

async function sha256(text: string): Promise<string> {
  // crypto.subtle exists only on HTTPS / localhost. Elsewhere (the app opened by
  // a LAN address) fall back to a 64-bit FNV pair: plenty to spot a reprint.
  if (!globalThis.crypto?.subtle) {
    let a = 0x811c9dc5, b = 0x01000193;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      a = Math.imul(a ^ c, 0x01000193);
      b = Math.imul(b ^ c, 0x811c9dc5);
    }
    return `fnv-${(a >>> 0).toString(16)}${(b >>> 0).toString(16)}-${text.length}`;
  }
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const toDate = (value?: string | null): string | null => {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};

/** Every string inside the details snapshot, so search can find any of it. */
function flattenText(value: unknown, out: string[] = []): string[] {
  if (value == null) return out;
  if (typeof value === "string") {
    // Signatures and photos are data URIs: not searchable text
    if (!value.startsWith("data:")) out.push(value);
  } else if (typeof value === "number") out.push(String(value));
  else if (Array.isArray(value)) value.forEach((v) => flattenText(v, out));
  else if (typeof value === "object") Object.values(value as object).forEach((v) => flattenText(v, out));
  return out;
}

/** The details snapshot without image data (signatures are already in the document itself). */
function stripBinary(value: unknown): unknown {
  if (typeof value === "string") return value.startsWith("data:") ? undefined : value;
  if (Array.isArray(value)) return value.map(stripBinary);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const clean = stripBinary(v);
      if (clean !== undefined) out[k] = clean;
    }
    return out;
  }
  return value;
}

/**
 * Files a document. Never throws and never blocks the print or download it
 * accompanies: a failure is logged, and only a missing table is shown once.
 */
export async function archiveDocument(input: {
  kind: "sheet" | "page";
  html: string;
  text: string;
  meta: ArchiveMeta;
  action: ArchiveAction;
}): Promise<void> {
  try {
    const html = compactAssets(input.html);
    if (!html.trim()) return;
    const content_hash = await sha256(`${input.kind}|${input.meta.type}|${html}`);
    const searchable = [input.text, ...flattenText(input.meta.details)].join(" ").replace(/\s+/g, " ").slice(0, 20000);

    const { error } = await (supabase as any).from("document_archive").upsert(
      {
        doc_type: input.meta.type,
        title: input.meta.title,
        doc_number: input.meta.number || null,
        doc_date: toDate(input.meta.docDate) ?? new Date().toISOString().slice(0, 10),
        person_name: input.meta.person?.trim() || null,
        person_phone: input.meta.phone?.trim() || null,
        person_nin: input.meta.nin?.trim() || null,
        vehicle_summary: input.meta.vehicle?.trim() || null,
        entity_id: input.meta.entityId ?? null,
        html_kind: input.kind,
        html,
        details: input.meta.details ? stripBinary(input.meta.details) : null,
        search_text: searchable,
        content_hash,
        action: input.action,
      },
      { onConflict: "content_hash", ignoreDuplicates: true },
    );
    if (error) throw error;
  } catch (error: any) {
    if (isMissingSchema(error, ["document_archive"])) {
      warnOnce("document_archive", () => console.warn("[archive] table missing — run the document archive migration"));
      return;
    }
    console.warn("[archive] could not file document", error);
  }
}

/** Files the A4 sheet(s) under a PrintSheet ref exactly as they are on screen. */
export function archiveSheet(el: HTMLElement | null, meta: ArchiveMeta, action: ArchiveAction) {
  if (!el || !archiveEnabled()) return Promise.resolve();
  return archiveDocument({ kind: "sheet", html: el.innerHTML, text: el.innerText || el.textContent || "", meta, action });
}

/** Files a stand-alone HTML page (the older table and report printouts). */
export function archivePage(html: string, meta: ArchiveMeta, action: ArchiveAction) {
  if (!archiveEnabled()) return Promise.resolve();
  let text = "";
  try {
    text = new DOMParser().parseFromString(html, "text/html").body.textContent ?? "";
  } catch { /* text stays empty; the record is still filed */ }
  return archiveDocument({ kind: "page", html, text, meta, action });
}

// ─── Showing an archived copy ───────────────────────────────────────────────

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const label = (key: string) =>
  key.replace(/_/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());

/** Keys never shown on the details page: internal ids and image data. */
const HIDDEN_KEY = /(^id$|_id$|Id$|signature|image|photo|^created_by$|^updated_at$)/i;

function detailRows(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .filter(([k, v]) => !HIDDEN_KEY.test(k) && v !== null && v !== undefined && v !== "" && typeof v !== "object")
    .map(([k, v]) => `<tr><td style="padding:4px 8px 4px 0;color:#555;width:38%;border-bottom:1px solid #e5e5e5;vertical-align:top">${escapeHtml(label(k))}</td><td style="padding:4px 0;font-weight:600;border-bottom:1px solid #e5e5e5">${escapeHtml(String(v))}</td></tr>`)
    .join("");
}

function detailSections(value: unknown, heading: string): string {
  if (value == null || typeof value !== "object") return "";
  if (Array.isArray(value)) {
    return value.map((v, i) => detailSections(v, `${heading} ${value.length > 1 ? i + 1 : ""}`.trim())).join("");
  }
  const obj = value as Record<string, unknown>;
  const rows = detailRows(obj);
  const nested = Object.entries(obj)
    .filter(([k, v]) => !HIDDEN_KEY.test(k) && v && typeof v === "object")
    .map(([k, v]) => detailSections(v, label(k)))
    .join("");
  if (!rows && !nested) return "";
  return `${rows ? `<h3 style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;margin:16px 0 6px;color:#1b3a6b">${escapeHtml(heading)}</h3><table style="width:100%;border-collapse:collapse;font-size:11px">${rows}</table>` : ""}${nested}`;
}

// ─── "Company Copy" ─────────────────────────────────────────────────────────
// Every page that comes out of the archive carries this stamp, so a copy
// printed from the record can never pass for the original handed to a customer.

export const COMPANY_COPY = "Company Copy";

const STAMP_STYLE =
  "position:absolute;top:7mm;left:50%;transform:translateX(-50%) rotate(-6deg);z-index:60;" +
  "border:2.5px solid #c81e1e;color:#c81e1e;background:rgba(255,255,255,.75);" +
  "padding:3px 14px;border-radius:4px;font:900 13px/1.2 'Segoe UI',Arial,sans-serif;" +
  "letter-spacing:.24em;text-transform:uppercase;white-space:nowrap;pointer-events:none";

const stampHtml = () => `<div class="company-copy-stamp" style="${STAMP_STYLE}">${COMPANY_COPY}</div>`;

/** Puts the stamp on every A4 sheet, or once at the top of an older full-page printout. */
function stampCopies(html: string, kind: "sheet" | "page"): string {
  try {
    const doc = new DOMParser().parseFromString(
      kind === "sheet" ? `<!doctype html><html><body>${html}</body></html>` : html,
      "text/html",
    );
    const sheets = Array.from(doc.querySelectorAll<HTMLElement>(".print-document-page"));
    if (sheets.length) {
      for (const sheet of sheets) {
        if (!sheet.querySelector(".company-copy-stamp")) sheet.insertAdjacentHTML("afterbegin", stampHtml());
      }
    } else {
      doc.body.style.position = "relative";
      doc.body.insertAdjacentHTML("afterbegin", stampHtml());
    }
    return kind === "sheet" ? doc.body.innerHTML : `<!doctype html>${doc.documentElement.outerHTML}`;
  } catch {
    return html;
  }
}

/** An extra A4 sheet listing every customer and vehicle detail on record. */
export function detailsSheetHtml(record: ArchiveRecord): string {
  const body = record.details ? detailSections(record.details, "Record") : "";
  const facts = detailRows({
    document: record.doc_type,
    number: record.doc_number ?? "",
    "document date": record.doc_date ?? "",
    person: record.person_name ?? "",
    phone: record.person_phone ?? "",
    NIN: record.person_nin ?? "",
    vehicle: record.vehicle_summary ?? "",
    "archived on": new Date(record.created_at).toLocaleString(),
    "archived by": record.created_by_name ?? "",
  });
  return `<div class="print-document-page archive-details" style="font-family:'Segoe UI',system-ui,Arial,sans-serif;color:#000;background:#fff;width:210mm;min-height:297mm;padding:16mm;box-sizing:border-box;position:relative">
    ${stampHtml()}
    <h2 style="font-size:15px;letter-spacing:.16em;text-transform:uppercase;margin:0 0 4px">Record details</h2>
    <p style="font-size:10px;color:#666;margin:0 0 12px">Customer and vehicle details held when this document was printed. Archived copy — read only.</p>
    <table style="width:100%;border-collapse:collapse;font-size:11px">${facts}</table>
    ${body}
  </div>`;
}

export type ArchiveRecord = {
  id: string;
  doc_type: string;
  title: string;
  doc_number: string | null;
  doc_date: string | null;
  person_name: string | null;
  person_phone: string | null;
  person_nin: string | null;
  vehicle_summary: string | null;
  html_kind: "sheet" | "page";
  html?: string;
  details: Record<string, unknown> | null;
  action: string | null;
  created_by_name: string | null;
  created_at: string;
};

/** The app's own stylesheets, so an archived sheet looks exactly as printed. */
function appStyles(): string {
  return Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => {
      if (node instanceof HTMLLinkElement) return `<link rel="stylesheet" href="${node.href}">`;
      return node.outerHTML;
    })
    .join("\n");
}

/**
 * A complete HTML document for an archived copy, shown in a sandboxed iframe
 * (no scripts can run, whatever the stored HTML contains).
 */
export function archiveSrcDoc(record: ArchiveRecord, includeDetails: boolean): string {
  const html = stampCopies(restoreAssets(record.html ?? ""), record.html_kind);
  const details = includeDetails ? detailsSheetHtml(record) : "";
  if (record.html_kind === "page") {
    // A full page of its own: add the details at the end of its body
    const pageBreak = `<div style="break-before:page;page-break-before:always"></div>`;
    return html.includes("</body>") ? html.replace("</body>", `${details ? pageBreak + details : ""}</body>`) : html + details;
  }
  return `<!doctype html><html class="archive-frame"><head><meta charset="utf-8">${appStyles()}
    <style>
      html,body{margin:0;background:#fff}
      .archive-wrap{display:flex;flex-direction:column;align-items:center;gap:24px;padding:16px 0}
      .print-document-page{box-shadow:0 0 0 1px #e5e5e5}
      @media print{.archive-wrap{display:block;padding:0}.print-document-page{box-shadow:none}
        .print-document-page + .print-document-page{break-before:page;page-break-before:always}}
    </style></head>
    <body><div class="archive-wrap">${html}${details}</div></body></html>`;
}

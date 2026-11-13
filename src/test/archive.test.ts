import { beforeEach, describe, expect, it, vi } from "vitest";

const upsert = vi.fn(async () => ({ error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ upsert }) },
}));

import {
  archiveEnabled, setArchiveEnabled, archiveSheet, archiveSrcDoc, compactAssets, detailsSheetHtml, restoreAssets, type ArchiveRecord,
} from "@/lib/archive";
import logoWatermark from "@/assets/logo-watermark.png";

const record = (over: Partial<ArchiveRecord> = {}): ArchiveRecord => ({
  id: "r1", doc_type: "Receipt", title: "Receipt 001", doc_number: "001", doc_date: "2026-11-13",
  person_name: "Ada Obi", person_phone: "0803", person_nin: "12345678901", vehicle_summary: "2020 Toyota Camry",
  html_kind: "sheet", html: '<div class="print-document-page">Hello</div>',
  details: { customer: { name: "Ada <b>Obi</b>", nin: "12345678901", signature_data: "data:image/png;base64,AAA" } },
  action: "print", created_by_name: "Sam", created_at: "2026-11-13T10:00:00Z", ...over,
});

describe("document archive", () => {
  beforeEach(() => { upsert.mockClear(); setArchiveEnabled(true); });

  it("swaps the big letterhead images for tokens and back", () => {
    const html = `<img src="${logoWatermark}">`;
    const compact = compactAssets(html);
    expect(compact).not.toContain(logoWatermark);
    expect(restoreAssets(compact)).toBe(html);
  });

  it("builds a details page that escapes stored text and hides signatures", () => {
    const html = detailsSheetHtml(record());
    expect(html).toContain("Ada &lt;b&gt;Obi&lt;/b&gt;");
    expect(html).not.toContain("<b>Obi</b>");
    expect(html).not.toContain("data:image");
    expect(html).toContain("12345678901");
  });

  it("adds the details page only when asked", () => {
    expect(archiveSrcDoc(record(), true)).toContain("Record details");
    expect(archiveSrcDoc(record(), false)).not.toContain("Record details");
  });

  it("files a sheet with its search text, without image data in the details", async () => {
    const el = document.createElement("div");
    el.innerHTML = '<div class="print-document-page">Receipt for Ada Obi — chassis ABC123</div>';
    await archiveSheet(el, { type: "Receipt", title: "Receipt 001", person: "Ada Obi", details: record().details }, "pdf");
    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = upsert.mock.calls[0] as any[];
    expect(row.doc_type).toBe("Receipt");
    expect(row.search_text).toContain("ABC123");
    expect(JSON.stringify(row.details)).not.toContain("data:image");
    expect(row.content_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(opts).toEqual({ onConflict: "content_hash", ignoreDuplicates: true });
  });

  it("stamps every archived sheet, and the details page, as a Company Copy", () => {
    const html = archiveSrcDoc(record({ html: '<div class="print-document-page">One</div><div class="print-document-page">Two</div>' }), true);
    expect(html.match(/company-copy-stamp/g)?.length).toBe(3);
    expect(html).toContain("Company Copy");
  });

  it("stamps an older full-page printout once", () => {
    const html = archiveSrcDoc(record({ html_kind: "page", html: "<html><head><title>Vehicles</title></head><body><table></table></body></html>" }), false);
    expect(html.match(/company-copy-stamp/g)?.length).toBe(1);
  });

  it("files nothing when 'Add to archive' is switched off", async () => {
    setArchiveEnabled(false);
    expect(archiveEnabled()).toBe(false);
    const el = document.createElement("div");
    el.innerHTML = '<div class="print-document-page">x</div>';
    await archiveSheet(el, { type: "Receipt", title: "R" }, "print");
    expect(upsert).not.toHaveBeenCalled();
  });
});

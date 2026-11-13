import { toast } from "sonner";

/**
 * html2canvas and jsPDF are ~600 kB together, and most sessions never export
 * anything, so they are imported at the moment of use rather than shipped in the
 * page's chunk.
 */
const loadHtml2Canvas = async () => (await import("html2canvas")).default;
const loadJsPDF = async () => (await import("jspdf")).jsPDF;

export type DocFormat = "pdf" | "png" | "jpeg";

/**
 * Runs on html2canvas's private copy of the page, just before it is drawn.
 *
 * html2canvas draws ordinary text one *word* at a time: each word starts at its
 * on-screen position but is drawn with the canvas's own glyph widths. When the
 * canvas font comes out even slightly wider than the screen's (it does in some
 * browsers and settings), every long word spills into the space after it and
 * the PDF reads "Safe keepingand custodyof the vehiclewhile…". Text that has
 * letter-spacing is drawn one *letter* at a time instead, each at its exact
 * on-screen position — which is why the spaced-out headings never broke.
 *
 * So every text element without letter-spacing gets 0.001px: below what
 * layout can resolve (nothing moves on the page), but non-zero, which switches
 * html2canvas to letter-by-letter placement. Only the copy is touched.
 */
export function prepareCaptureClone(_doc: Document, root: HTMLElement) {
  const doc = root.ownerDocument;
  const win = doc?.defaultView;
  if (!doc || !win) return;

  // Collect first, then wrap: wrapping while walking would revisit new nodes
  const walker = doc.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const targets: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text;
    const parent = text.parentElement;
    if (!parent || !(text.textContent ?? "").trim()) continue;
    const spacing = win.getComputedStyle(parent).letterSpacing;
    if (!spacing || spacing === "normal" || parseFloat(spacing) === 0) targets.push(text);
  }

  // The text goes in its own span rather than styling the parent: a list item
  // draws its "a." / "1." marker with its own letter-spacing, and changing it
  // there put the marker on top of the first word.
  for (const text of targets) {
    const span = doc.createElement("span");
    span.style.letterSpacing = "0.001px";
    text.parentNode!.replaceChild(span, text);
    span.appendChild(text);
  }
}

/** The html2canvas settings every document capture uses. */
export const captureOptions = (el: HTMLElement) => ({
  scale: 2,
  useCORS: true,
  logging: false,
  backgroundColor: "#ffffff",
  windowWidth: el.scrollWidth,
  windowHeight: el.scrollHeight,
  onclone: prepareCaptureClone,
});

/** True when the app is running as an installed/standalone PWA (no print dialog on iOS). */
export function isStandaloneApp(): boolean {
  if (typeof window === "undefined") return false;
  const iosStandalone = (window.navigator as any).standalone === true;
  return iosStandalone || window.matchMedia?.("(display-mode: standalone)")?.matches === true;
}

/**
 * Rasterises a DOM node and returns a Blob sized to the node's own content, so the
 * exported file always matches what is on screen (and what prints).
 */
export async function captureDocumentElement(
  el: HTMLElement,
  format: DocFormat = "pdf"
): Promise<Blob> {
  // Same reason as printing: an undecoded logo rasterises as nothing at all.
  await waitForImages(el);

  // A document of several sheets becomes a PDF of several A4 pages, one per
  // sheet, rather than one tall page with the sheets stacked.
  const sheets = Array.from(el.querySelectorAll<HTMLElement>(".print-document-page"));
  if (format === "pdf" && sheets.length > 1) return capturePagedPdf(sheets);

  const html2canvas = await loadHtml2Canvas();
  const canvas = await html2canvas(el, captureOptions(el));

  if (format === "pdf") {
    // Page is the size of the captured content, so nothing is cropped or padded
    const widthPt = (canvas.width * 72) / 192; // 2x scale at 96dpi → points
    const heightPt = (canvas.height * 72) / 192;
    const jsPDF = await loadJsPDF();
    const pdf = new jsPDF({
      orientation: heightPt >= widthPt ? "portrait" : "landscape",
      unit: "pt",
      format: [widthPt, heightPt],
      compress: true,
    });
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 0, 0, widthPt, heightPt);
    return pdf.output("blob");
  }

  const mime = format === "png" ? "image/png" : "image/jpeg";
  const quality = format === "png" ? undefined : 0.95;
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas is empty"))),
      mime,
      quality
    );
  });
}

/** A4 in points. */
const A4_W = 595.28;
const A4_H = 841.89;

async function capturePagedPdf(sheets: HTMLElement[]): Promise<Blob> {
  const html2canvas = await loadHtml2Canvas();
  const jsPDF = await loadJsPDF();
  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4", compress: true });

  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    const canvas = await html2canvas(sheet, captureOptions(sheet));
    if (i > 0) pdf.addPage("a4", "portrait");
    // Fill the page width; a sheet that ran long is shrunk to fit the height
    let w = A4_W;
    let h = (canvas.height * w) / canvas.width;
    if (h > A4_H) {
      h = A4_H;
      w = (canvas.width * h) / canvas.height;
    }
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", (A4_W - w) / 2, 0, w, h);
  }
  return pdf.output("blob");
}

/** Triggers a browser download for a generated document blob. */
export function saveBlob(blob: Blob, filename: string, format: DocFormat) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.${format === "jpeg" ? "jpg" : format}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before revoking
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Waits for every image under `root` to be decoded.
 *
 * Chrome rasterises the print preview from the live DOM the moment `print()` is
 * called. An image that has not finished decoding by then prints as a broken
 * placeholder — which is how documents came out with no letterhead and no
 * watermark. Waiting costs nothing once the images are warm, and a failed image
 * resolves rather than rejecting so a print is never blocked by one.
 */
export async function waitForImages(root: ParentNode | null): Promise<void> {
  if (!root) return;
  const images = Array.from(root.querySelectorAll("img"));

  await Promise.all(
    images.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            // decode() can still reject on a detached or cross-origin image
            img.decode().then(() => resolve(), () => resolve());
            return;
          }
          img.addEventListener("load", () => resolve(), { once: true });
          img.addEventListener("error", () => resolve(), { once: true });
        })
    )
  );
}

/**
 * Prints the document. In a browser tab this is the native print dialog; in an
 * installed app (where iOS offers no print dialog) it builds a PDF and hands it to
 * the share sheet, falling back to a download.
 */
export async function printDocument(
  getBlob: () => Promise<Blob>,
  filename: string
): Promise<void> {
  if (!isStandaloneApp()) {
    // The portal copy (PrintSheet) is what actually prints, so its images are
    // the ones that have to be ready.
    await waitForImages(document.getElementById("print-portal"));
    window.print();
    return;
  }

  try {
    const blob = await getBlob();
    const file = new File([blob], `${filename}.pdf`, { type: "application/pdf" });
    const nav = navigator as any;
    if (nav.canShare?.({ files: [file] })) {
      await nav.share({ files: [file], title: filename });
      return;
    }
    saveBlob(blob, filename, "pdf");
    toast.info("Saved as PDF — open it to print");
  } catch (error: any) {
    if (error?.name === "AbortError") return; // user dismissed the share sheet
    console.error("Print failed:", error);
    toast.error("Could not prepare the document for printing");
  }
}

/** Convenience wrapper used by the document toolbars. */
export async function downloadDocument(
  el: HTMLElement | null,
  filename: string,
  format: DocFormat
) {
  if (!el) {
    toast.error("Nothing to export yet");
    return;
  }
  try {
    toast.info(`Preparing ${format.toUpperCase()}...`);
    const blob = await captureDocumentElement(el, format);
    saveBlob(blob, filename, format);
    toast.success(`Saved as ${format.toUpperCase()}`);
  } catch (error) {
    console.error("Document export failed:", error);
    toast.error("Failed to generate the file");
  }
}

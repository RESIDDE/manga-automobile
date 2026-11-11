import { toast } from "sonner";

/**
 * html2canvas and jsPDF are ~600 kB together, and most sessions never export
 * anything, so they are imported at the moment of use rather than shipped in the
 * page's chunk.
 */
const loadHtml2Canvas = async () => (await import("html2canvas")).default;
const loadJsPDF = async () => (await import("jspdf")).jsPDF;

export type DocFormat = "pdf" | "png" | "jpeg";

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
  const html2canvas = await loadHtml2Canvas();
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    logging: false,
    backgroundColor: "#ffffff",
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  });

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
 * Prints the document. In a browser tab this is the native print dialog; in an
 * installed app (where iOS offers no print dialog) it builds a PDF and hands it to
 * the share sheet, falling back to a download.
 */
export async function printDocument(
  getBlob: () => Promise<Blob>,
  filename: string
): Promise<void> {
  if (!isStandaloneApp()) {
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

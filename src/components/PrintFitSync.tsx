import { useEffect } from "react";

const A4_HEIGHT_PX = 1122; // 297mm at 96dpi
const MIN_ZOOM = 0.62;

/**
 * Mounted once at app root. Before printing, measures every `.print-document-page`
 * and, when one is taller than a sheet of A4, sets `--print-zoom` so the print CSS
 * shrinks it to fit — a long document never spills its footer onto a second page.
 */
export function PrintFitSync() {
  useEffect(() => {
    const fit = () => {
      const pages = Array.from(
        document.querySelectorAll<HTMLElement>(".print-document-page")
      );
      pages.forEach((page) => {
        page.style.removeProperty("--print-zoom");
        const height = page.scrollHeight;
        if (height > A4_HEIGHT_PX) {
          const zoom = Math.max(MIN_ZOOM, (A4_HEIGHT_PX / height) * 0.995);
          page.style.setProperty("--print-zoom", String(zoom));
        }
      });
    };

    const reset = () => {
      document
        .querySelectorAll<HTMLElement>(".print-document-page")
        .forEach((page) => page.style.removeProperty("--print-zoom"));
    };

    window.addEventListener("beforeprint", fit);
    window.addEventListener("afterprint", reset);

    // Safari/iOS fire no beforeprint — hook the print media query instead
    const mql = window.matchMedia?.("print");
    const onMedia = (e: MediaQueryListEvent) => (e.matches ? fit() : reset());
    mql?.addEventListener?.("change", onMedia);

    return () => {
      window.removeEventListener("beforeprint", fit);
      window.removeEventListener("afterprint", reset);
      mql?.removeEventListener?.("change", onMedia);
    };
  }, []);

  return null;
}

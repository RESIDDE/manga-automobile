import type { ReactNode } from "react";
import logoPrint from "@/assets/logo-print.png";
import logoWatermark from "@/assets/logo-watermark.png";

// Single source of truth for the letterhead stamped on every printed document
// (sales receipts, authority to sell, property intake).
export const COMPANY = {
  name: "MANGA",
  nameSuffix: "AUTOMOBILES",
  tagline: "Dealers in all types of motors vehicles",
  addressLines: [
    "No. 34 Shehu Shagari Way Maitama,",
    "by Transcorp Hilton, Millennium Park,",
    "Abuja Nigeria.",
  ],
  tel: "09032216333",
  // RC number and email are not on the current letterhead; add them here when known
};

const NAVY = "#1b3a6b";

// ─── Shared document tokens ──────────────────────────────────────────────────
// Every printable document pulls its colours and rules from here, so the three
// document pages stay visually identical.
export const BRAND_NAVY = NAVY;
/** Kept for documents that want the accent colour by its generic name. */
export const BRAND_RED = NAVY;
export const INK = "#000000";
export const RULE = "1px solid #000000";
export const ROW_RULE = "1px solid #d4d4d4";
export const POSITIVE = "#047857";
export const MODERN_FONT =
  "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";

// For use inside React DOM trees (like AuthorityToSell.tsx, PropertyIntake.tsx)
export function PrintHeader() {
  return (
    <div className="pb-2 mb-4 relative">
      <div className="flex items-start justify-between gap-6">
        <div className="shrink-0">
          <img src={logoPrint} alt={`${COMPANY.name} ${COMPANY.nameSuffix}`} className="h-[62px] w-auto object-contain" />
          <div className="mt-2 inline-block border-[1.5px] px-2 py-[2px]" style={{ borderColor: NAVY }}>
            <span className="text-[8.5px] font-black uppercase tracking-wide" style={{ color: NAVY }}>
              {COMPANY.tagline}
            </span>
          </div>
        </div>
        <div className="text-right text-[12.5px] font-bold text-black leading-snug">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] mb-1" style={{ color: NAVY }}>
            Address
          </p>
          {COMPANY.addressLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
          <p className="mt-1 font-extrabold tracking-wide">Tel: {COMPANY.tel}</p>
        </div>
      </div>
      <div className="mt-2 h-[3px] w-full" style={{ backgroundColor: NAVY }} />
    </div>
  );
}

// For use inside string-based html popups (like Sales.tsx, exportHelpers.ts)
export function getPrintHeaderHTML() {
  return `
    <div style="padding-bottom: 8px; margin-bottom: 14px; position: relative;">
      <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 24px;">
        <div style="flex-shrink: 0;">
          <img src="${window.location.origin}${logoPrint}" alt="${COMPANY.name} ${COMPANY.nameSuffix}" style="height: 62px; width: auto; object-fit: contain; display: block;" />
          <div style="display: inline-block; border: 1.5px solid ${NAVY}; padding: 2px 8px; margin-top: 8px;">
            <span style="font-family: sans-serif; font-size: 8.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; color: ${NAVY};">
              ${COMPANY.tagline}
            </span>
          </div>
        </div>
        <div style="text-align: right; font-family: sans-serif; font-size: 12.5px; font-weight: bold; color: #000; line-height: 1.35;">
          <p style="font-size: 9px; font-weight: 900; text-transform: uppercase; letter-spacing: 2px; color: ${NAVY}; margin: 0 0 4px 0;">Address</p>
          ${COMPANY.addressLines.map((line) => `<p style="margin: 0;">${line}</p>`).join("")}
          <p style="margin: 4px 0 0 0; font-weight: 800; letter-spacing: 0.4px;">Tel: ${COMPANY.tel}</p>
        </div>
      </div>
      <div style="margin-top: 8px; height: 3px; width: 100%; background: ${NAVY};"></div>
    </div>
  `;
}

// React component for watermark (used in AuthorityToSell.tsx / PropertyIntake.tsx previews)
/**
 * The faint logo behind a document.
 *
 * Positioned **absolutely within the sheet**, not fixed to the viewport: a
 * fixed element is laid out against the window, so html2canvas either missed it
 * or stamped it in the wrong place, and downloaded PNG/JPEG/PDF copies came out
 * without the watermark that the printed page had. The parent `.print-document-page`
 * is `position: relative`, so this now centres on the page itself and is
 * captured with it.
 */
export function PrintWatermark() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 flex items-center justify-center pointer-events-none select-none"
      style={{ zIndex: 0 }}
    >
      <img
        src={logoWatermark}
        alt=""
        className="w-[70%] max-w-[560px] object-contain"
        style={{ opacity: 0.07, transform: "rotate(-30deg)" }}
      />
    </div>
  );
}

// For use inside string-based html popups (like Sales.tsx, exportHelpers.ts)
export function getPrintWatermarkHTML() {
  return `
    <div style="
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(-30deg);
      pointer-events: none;
      z-index: 0;
      opacity: 0.07;
      user-select: none;
    ">
      <img src="${window.location.origin}${logoWatermark}" alt="" style="width: 560px; max-width: 80vw; object-fit: contain; display: block;" />
    </div>
  `;
}

// ─── Modern letterhead + document primitives ────────────────────────────────
// Used by the Authority to Sell, Sales Agreement and Proforma Invoice documents.

/**
 * Letterhead with a document title and number block on the right, for documents
 * that carry a reference (e.g. a proforma invoice).
 */
export function ModernLetterhead({
  docTitle,
  docNumber,
}: {
  docTitle?: string;
  docNumber?: string;
}) {
  return (
    <div className="pb-2 mb-5 relative" style={{ fontFamily: MODERN_FONT }}>
      <div className="flex items-start justify-between gap-6">
        <div className="shrink-0">
          <img
            src={logoPrint}
            alt={`${COMPANY.name} ${COMPANY.nameSuffix}`}
            className="h-[58px] w-auto object-contain"
          />
          <div
            className="mt-2 inline-block border-[1.5px] px-2 py-[2px]"
            style={{ borderColor: NAVY }}
          >
            <span
              className="text-[8px] font-black uppercase tracking-wide"
              style={{ color: NAVY }}
            >
              {COMPANY.tagline}
            </span>
          </div>
        </div>

        <div className="text-right leading-snug">
          {docTitle && (
            <p
              className="text-[15px] font-black uppercase tracking-[0.18em]"
              style={{ color: NAVY }}
            >
              {docTitle}
            </p>
          )}
          {docNumber && (
            <p className="text-[11px] font-bold text-black tracking-wider mt-[2px]">
              No. {docNumber}
            </p>
          )}
          <div className="mt-2 text-[10.5px] font-semibold text-black">
            {COMPANY.addressLines.map((line) => (
              <p key={line} className="m-0">{line}</p>
            ))}
            <p className="m-0 mt-[2px] font-extrabold">Tel: {COMPANY.tel}</p>
          </div>
        </div>
      </div>
      <div className="mt-2 h-[3px] w-full" style={{ backgroundColor: NAVY }} />
    </div>
  );
}

/** Small uppercase caption used above a value on a document. */
export function MetaLabel({ children }: { children: ReactNode }) {
  return (
    <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-neutral-500 mb-[2px]">
      {children}
    </p>
  );
}

/**
 * A signature slot: the drawn signature (printed solid black) sitting on a ruled
 * line, with a caption underneath. An unsigned slot still prints its line so it can
 * be signed by hand.
 */
export function ModernSignSlot({
  signature,
  caption,
  name,
  date,
}: {
  signature?: string | null;
  caption: string;
  name?: string | null;
  date?: string | null;
}) {
  return (
    <div className="flex flex-col">
      <div
        className="h-[52px] flex items-end justify-center pb-[2px]"
        style={{ borderBottom: RULE }}
      >
        {signature ? (
          <img
            src={signature}
            alt=""
            className="max-h-[48px] object-contain"
            style={{ filter: "brightness(0)" }}
          />
        ) : null}
      </div>
      <p className="text-[8.5px] font-bold uppercase tracking-[0.12em] text-black mt-[3px]">
        {caption}
      </p>
      {name !== undefined && (
        <p className="text-[10px] text-black mt-[6px]" style={{ borderBottom: ROW_RULE }}>
          <span className="text-neutral-500">Name: </span>
          <span className="font-semibold">{name || " "}</span>
        </p>
      )}
      {date !== undefined && (
        <p className="text-[10px] text-black mt-[4px]" style={{ borderBottom: ROW_RULE }}>
          <span className="text-neutral-500">Date: </span>
          <span className="font-semibold">{date || " "}</span>
        </p>
      )}
    </div>
  );
}

/** Grey strip section heading used on all three documents. */
export function DocSectionTitle({ children }: { children: ReactNode }) {
  return (
    <div className="bg-neutral-100 rounded-[3px] px-2 py-[3px] mb-2">
      <p className="text-[9.5px] font-black uppercase tracking-[0.16em] text-black">
        {children}
      </p>
    </div>
  );
}

/** A label with its value sitting on a ruled line. */
export function DocField({
  label,
  value,
  className = "",
}: {
  label: string;
  value?: string | null;
  className?: string;
}) {
  return (
    <div className={`flex items-baseline gap-2 ${className}`} style={{ borderBottom: ROW_RULE }}>
      <span className="text-[9.5px] font-semibold uppercase tracking-wide text-neutral-500 shrink-0">
        {label}:
      </span>
      <span className="text-[11px] font-semibold text-black flex-1 min-w-0 break-words">
        {value || " "}
      </span>
    </div>
  );
}

/** An inline name on a short ruled underline, for use inside a paragraph. */
export function InlineRuled({ children }: { children: ReactNode }) {
  return (
    <span
      className="inline-block min-w-[110px] px-1 font-bold text-black text-center"
      style={{ borderBottom: RULE }}
    >
      {children || " "}
    </span>
  );
}

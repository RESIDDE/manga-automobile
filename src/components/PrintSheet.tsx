import { forwardRef, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Wraps a document so that printing produces a sheet of white paper and nothing
 * else.
 *
 * The problem it solves: `window.print()` prints the whole page, so the printed
 * document inherited every wrapper the app shell puts around it. The print
 * stylesheet hid the sidebar and reset `body`, but the layout divs in between
 * still painted their dark backgrounds, which came out as black borders down
 * the sides and under the sheet.
 *
 * Hiding those wrappers one by one is a losing game — any new wrapper brings
 * the black back. Instead the sheet is rendered a second time into a portal
 * that is a direct child of `<body>`, and the print stylesheet hides every
 * other child of `<body>`. There is then no app chrome in the printed document
 * at all, whatever the page around it looks like.
 *
 * The on-screen copy keeps the ref, because that is the node the PDF/PNG/JPEG
 * exports rasterise.
 */

const PORTAL_ID = "print-portal";

/**
 * Marks <body> while a sheet is mounted. The print stylesheet only blanks the
 * app shell when this class is present, so a page that prints by some other
 * means (or a plain Ctrl+P on an ordinary page) still prints what is on screen
 * instead of an empty portal.
 */
const BODY_FLAG = "has-print-sheet";

/** Several sheets can be mounted at once; the flag goes when the last one does. */
let mounted = 0;

function usePrintPortal(): HTMLElement | null {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let node = document.getElementById(PORTAL_ID);
    if (!node) {
      node = document.createElement("div");
      node.id = PORTAL_ID;
      document.body.appendChild(node);
    }
    setHost(node);

    mounted += 1;
    document.body.classList.add(BODY_FLAG);

    return () => {
      mounted -= 1;
      if (mounted <= 0) {
        mounted = 0;
        document.body.classList.remove(BODY_FLAG);
      }
    };
    // The host div is shared and left in place: another document page mounting
    // later reuses it, and an empty div costs nothing.
  }, []);

  return host;
}

export const PrintSheet = forwardRef<HTMLDivElement, { children: ReactNode }>(
  function PrintSheet({ children }, ref) {
    const host = usePrintPortal();

    return (
      <>
        <div className="print-pages-container screen-only">
          <div ref={ref}>{children}</div>
        </div>
        {host
          ? createPortal(
              // aria-hidden because this is the same document twice: a screen
              // reader should read the copy in the page, not this one.
              <div className="print-pages-container" aria-hidden="true">
                {children}
              </div>,
              host
            )
          : null}
      </>
    );
  }
);

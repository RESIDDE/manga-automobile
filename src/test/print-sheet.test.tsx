import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { createRef } from "react";
import { PrintSheet } from "@/components/PrintSheet";
import { waitForImages } from "@/lib/documentExport";

beforeEach(() => {
  document.getElementById("print-portal")?.remove();
  document.body.className = "";
});

describe("PrintSheet", () => {
  it("renders the sheet in the page and again in a portal on <body>", () => {
    render(<PrintSheet><p>Sales Receipt</p></PrintSheet>);

    const portal = document.getElementById("print-portal");
    expect(portal).not.toBeNull();
    // Once on screen, once for print
    expect(screen.getAllByText("Sales Receipt")).toHaveLength(2);
    expect(portal!.textContent).toContain("Sales Receipt");
  });

  it("puts the print portal directly on <body>, outside the app shell", () => {
    render(
      <div className="app-shell">
        <PrintSheet><p>Document</p></PrintSheet>
      </div>
    );
    // This is the whole point: nothing the app wraps the page in can reach it,
    // so no wrapper background can print as a black border.
    expect(document.getElementById("print-portal")!.parentElement).toBe(document.body);
  });

  it("hides the duplicate from assistive tech", () => {
    render(<PrintSheet><p>Document</p></PrintSheet>);
    const portal = document.getElementById("print-portal")!;
    expect(portal.firstElementChild).toHaveAttribute("aria-hidden", "true");
  });

  it("flags <body> only while a sheet is mounted", () => {
    const { unmount } = render(<PrintSheet><p>Document</p></PrintSheet>);
    // The stylesheet blanks the app shell off this flag, so a page with no
    // sheet still prints normally.
    expect(document.body.classList.contains("has-print-sheet")).toBe(true);
    unmount();
    expect(document.body.classList.contains("has-print-sheet")).toBe(false);
  });

  it("keeps the flag until the last sheet unmounts", () => {
    const first = render(<PrintSheet><p>One</p></PrintSheet>);
    const second = render(<PrintSheet><p>Two</p></PrintSheet>);
    first.unmount();
    expect(document.body.classList.contains("has-print-sheet")).toBe(true);
    second.unmount();
    expect(document.body.classList.contains("has-print-sheet")).toBe(false);
  });

  it("gives the on-screen copy the ref, since that is what gets rasterised", () => {
    const ref = createRef<HTMLDivElement>();
    render(<PrintSheet ref={ref}><p>Document</p></PrintSheet>);
    expect(ref.current).not.toBeNull();
    expect(ref.current!.closest(".screen-only")).not.toBeNull();
    expect(document.getElementById("print-portal")!.contains(ref.current)).toBe(false);
  });
});

describe("waitForImages", () => {
  it("resolves on a tree with no images", async () => {
    const el = document.createElement("div");
    await expect(waitForImages(el)).resolves.toBeUndefined();
  });

  it("resolves when given nothing", async () => {
    await expect(waitForImages(null)).resolves.toBeUndefined();
  });

  it("does not hang on an image that fails to load", async () => {
    const el = document.createElement("div");
    const img = document.createElement("img");
    img.src = "http://localhost/does-not-exist.png";
    el.appendChild(img);
    document.body.appendChild(el);

    const done = waitForImages(el);
    img.dispatchEvent(new Event("error"));
    // A broken letterhead must never stop someone printing
    await expect(done).resolves.toBeUndefined();
    el.remove();
  });
});

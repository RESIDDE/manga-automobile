import { describe, expect, it } from "vitest";
import { prepareCaptureClone } from "@/lib/documentExport";

describe("PDF capture: letter-by-letter text", () => {
  it("wraps plain text in a barely-spaced span, leaving list items and spaced headings alone", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <p id="p">Safe keeping and custody</p>
      <ol><li id="li">Handling all sales-related communication.</li></ol>
      <h2 id="h" style="letter-spacing: 0.2em">TERMS OF AGREEMENT</h2>`;
    document.body.appendChild(root);
    prepareCaptureClone(document, root);

    const p = root.querySelector("#p")!;
    expect(p.firstElementChild?.tagName).toBe("SPAN");
    expect((p.firstElementChild as HTMLElement).style.letterSpacing).toBe("0.001px");
    expect(p.textContent).toBe("Safe keeping and custody");

    const li = root.querySelector<HTMLElement>("#li")!;
    expect(li.style.letterSpacing).toBe(""); // the marker keeps its own spacing
    expect(li.firstElementChild?.tagName).toBe("SPAN");

    expect(root.querySelector("#h")!.firstElementChild).toBeNull(); // already letter-by-letter
    root.remove();
  });
});

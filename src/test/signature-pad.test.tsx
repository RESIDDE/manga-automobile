import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { SignaturePad } from "@/components/SignaturePad";

/** A 2D context stub that records what the pad asks it to do. */
function makeContext() {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    drawImage: vi.fn(),
    lineCap: "",
    lineJoin: "",
    lineWidth: 0,
    strokeStyle: "",
    fillStyle: "",
  };
}

let ctx = makeContext();

beforeEach(() => {
  ctx = makeContext();
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx) as any;
  HTMLCanvasElement.prototype.toDataURL = vi.fn(() => "data:image/png;base64,DRAWN") as any;
  // jsdom gives the canvas no size; the pad falls back to sensible defaults
  HTMLCanvasElement.prototype.getBoundingClientRect = vi.fn(() => ({
    left: 0, top: 0, width: 300, height: 160, right: 300, bottom: 160, x: 0, y: 0, toJSON: () => {},
  })) as any;

  // Images never load in jsdom, so resolve them immediately
  class FakeImage {
    onload: (() => void) | null = null;
    set src(_v: string) { setTimeout(() => this.onload?.(), 0); }
  }
  vi.stubGlobal("Image", FakeImage);
});

const pad = () => screen.getByRole("img", { name: /signature pad/i });

const drawAStroke = () => {
  const canvas = pad();
  fireEvent.pointerDown(canvas, { clientX: 20, clientY: 40, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 60, clientY: 70, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 60, clientY: 70, pointerId: 1 });
};

describe("SignaturePad", () => {
  it("uses a real ink colour, not an unresolvable CSS variable", () => {
    render(<SignaturePad onChange={() => {}} />);
    // "hsl(var(--foreground))" is silently ignored by canvas, which left black
    // ink on the near-black dark-mode pad — the signature was invisible.
    expect(ctx.strokeStyle).not.toContain("var(");
    expect(ctx.strokeStyle).toMatch(/^#|^rgb/);
  });

  it("gives the pad a light surface so dark ink shows on it", () => {
    render(<SignaturePad onChange={() => {}} />);
    // White comes from the element, not from paint on the canvas: the exported
    // PNG stays transparent so it does not cover a document's ruled line.
    expect(pad()).toHaveStyle({ backgroundColor: "#ffffff" });
    expect(ctx.fillRect).not.toHaveBeenCalled();
  });

  it("draws and reports the signature when a stroke is made", () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);
    drawAStroke();

    expect(ctx.stroke).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalledWith("data:image/png;base64,DRAWN");
  });

  it("keeps a single tap, so a dot still counts as a mark", () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);
    const canvas = pad();
    fireEvent.pointerDown(canvas, { clientX: 30, clientY: 30, pointerId: 1 });
    fireEvent.pointerUp(canvas, { clientX: 30, clientY: 30, pointerId: 1 });

    expect(onChange).toHaveBeenCalledWith("data:image/png;base64,DRAWN");
  });

  it("shows a signature that arrives after mount", async () => {
    // The old pad read `value` once on mount, so a record loaded from the
    // database a moment later never appeared on the pad.
    function Host() {
      const [value, setValue] = useState("");
      return (
        <>
          <button onClick={() => setValue("data:image/png;base64,FROM_RECORD")}>load</button>
          <SignaturePad value={value} onChange={() => {}} />
        </>
      );
    }
    render(<Host />);
    expect(ctx.drawImage).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("load"));
    await vi.waitFor(() => expect(ctx.drawImage).toHaveBeenCalled());
  });

  it("empties the pad when the parent clears the value", async () => {
    function Host() {
      const [value, setValue] = useState("data:image/png;base64,OLD");
      return (
        <>
          <button onClick={() => setValue("")}>reset</button>
          <SignaturePad value={value} onChange={() => {}} />
        </>
      );
    }
    render(<Host />);
    await vi.waitFor(() => expect(ctx.drawImage).toHaveBeenCalled());

    const before = ctx.clearRect.mock.calls.length;
    fireEvent.click(screen.getByText("reset"));
    // Cleared, and nothing redrawn on top
    await vi.waitFor(() => expect(ctx.clearRect.mock.calls.length).toBeGreaterThan(before));
  });

  it("Clear wipes the pad and tells the parent", () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} />);
    drawAStroke();
    onChange.mockClear();

    fireEvent.click(screen.getByRole("button", { name: /Clear Signature/i }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("prompts for a signature until there is ink, and disables Clear while empty", () => {
    render(<SignaturePad onChange={() => {}} label="Buyer" />);
    expect(screen.getByText(/Sign here — Buyer/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clear Signature/i })).toBeDisabled();

    drawAStroke();
    expect(screen.queryByText(/Sign here/)).toBeNull();
    expect(screen.getByRole("button", { name: /Clear Signature/i })).toBeEnabled();
  });

  it("ignores drawing when disabled", () => {
    const onChange = vi.fn();
    render(<SignaturePad onChange={onChange} disabled />);
    drawAStroke();
    expect(onChange).not.toHaveBeenCalled();
  });
});

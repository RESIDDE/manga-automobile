import React, { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

interface SignaturePadProps {
  value?: string;
  onChange: (dataUrl: string) => void;
  /** Caption under the ruled line, e.g. "Buyer". */
  label?: string;
  disabled?: boolean;
}

/**
 * Ink is black because the documents print it black. The pad's white surface is
 * the element's CSS background, not paint on the canvas: the exported PNG stays
 * transparent, so a signature does not drop a white box over the ruled line it
 * sits on in a document.
 */
const INK = "#111111";
const PAD_BACKGROUND = "#ffffff";

/**
 * Draw-to-sign pad.
 *
 * Three things it has to get right, each of which was previously wrong:
 *  - the ink must be a real colour. `strokeStyle = "hsl(var(--foreground))"` is
 *    not one: canvas cannot resolve CSS variables, so the assignment was
 *    ignored and the default black ink was drawn on the near-black dark-mode
 *    pad — invisible.
 *  - a `value` that arrives after mount (a record loaded from the database, a
 *    restored draft) must appear, and a `value` cleared by the parent must
 *    disappear. The old effect ran once on mount, so neither happened.
 *  - resizing the canvas clears it, so whatever is on the pad has to be
 *    redrawn afterwards.
 */
export function SignaturePad({ value, onChange, label, disabled = false }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const strokeStarted = useRef(false);
  /** What is currently painted, so an external change can be told apart from our own. */
  const painted = useRef<string>("");
  const [hasInk, setHasInk] = useState(false);

  /** Applies size, scale and pen settings. Returns the CSS-pixel size. */
  const prepareContext = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null; // jsdom, or a browser refusing a context

    const rect = canvas.getBoundingClientRect();
    const width = rect.width || canvas.clientWidth || 300;
    const height = rect.height || canvas.clientHeight || 160;
    const dpr = window.devicePixelRatio || 1;

    // Setting width/height clears the canvas, so only touch it when it changed
    if (canvas.width !== Math.floor(width * dpr) || canvas.height !== Math.floor(height * dpr)) {
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = INK;
    return { ctx, width, height };
  }, []);

  /** Empties the pad and puts `src` back on it, if there is one. */
  const render = useCallback((src: string) => {
    const prepared = prepareContext();
    if (!prepared) return;
    const { ctx, width, height } = prepared;

    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = INK;

    if (!src) {
      painted.current = "";
      setHasInk(false);
      return;
    }

    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, width, height);
      painted.current = src;
      setHasInk(true);
    };
    img.src = src;
  }, [prepareContext]);

  // Follow the value: a signature loaded from a record or a restored draft
  // appears, and a parent clearing the field empties the pad. The first run
  // also sizes the canvas and sets the pen, before any stroke is made.
  const initialised = useRef(false);
  useEffect(() => {
    const next = value ?? "";
    if (initialised.current && next === painted.current) return;
    if (drawing.current) return; // never yank the pad out from under a stroke
    initialised.current = true;
    render(next);
  }, [value, render]);

  // Keep the drawing when the pad is resized (rotation, a dialog opening, a
  // tab becoming visible after mounting at zero width).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => render(painted.current));
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [render]);

  /** Pointer position in CSS pixels, correct however the canvas is scaled. */
  const positionOf = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled) return;
    const prepared = prepareContext();
    if (!prepared) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);

    const { x, y } = positionOf(e);
    prepared.ctx.beginPath();
    prepared.ctx.moveTo(x, y);
    // A dot counts as a mark, so a full stop or a tap is kept
    prepared.ctx.lineTo(x + 0.01, y);
    prepared.ctx.stroke();

    drawing.current = true;
    strokeStarted.current = true;
    setHasInk(true);
  };

  const continueStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = positionOf(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endStroke = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    if (e) e.currentTarget.releasePointerCapture?.(e.pointerId);

    const canvas = canvasRef.current;
    if (!canvas || !strokeStarted.current) return;
    try {
      const data = canvas.toDataURL("image/png");
      painted.current = data;
      onChange(data);
    } catch {
      // A tainted or zero-sized canvas cannot be exported; the drawing stays on screen
    }
  };

  const clear = () => {
    strokeStarted.current = false;
    render("");
    onChange("");
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          aria-label={label ? `${label} signature pad` : "Signature pad"}
          role="img"
          className={`w-full h-40 rounded-md border border-input touch-none ${
            disabled ? "cursor-not-allowed opacity-60" : "cursor-crosshair"
          }`}
          style={{ backgroundColor: PAD_BACKGROUND }}
          onPointerDown={startStroke}
          onPointerMove={continueStroke}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
          onPointerLeave={() => endStroke()}
        />

        {/* Baseline and prompt, hidden as soon as there is ink */}
        {!hasInk && (
          <div className="absolute inset-x-6 bottom-8 pointer-events-none select-none">
            <div className="border-b border-neutral-300" />
            <p className="mt-1 text-center text-[11px] font-medium text-neutral-400">
              {disabled ? "Signing is disabled" : `Sign here${label ? ` — ${label}` : ""}`}
            </p>
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={clear}
        disabled={disabled || !hasInk}
        className="gap-1.5"
      >
        <Eraser className="h-3.5 w-3.5" /> Clear Signature
      </Button>
    </div>
  );
}

import { useRef, useState } from "react";
import { Camera, CheckCircle2, Loader2, ScanLine, Search, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { VIN_MAX_LENGTH } from "@/lib/constants";
import {
  MIN_LOOKUP_LENGTH, canonicalMake, photoToDataUrl, readVin, type VinReadResult,
} from "@/lib/vinReader";

interface Props {
  /** What is typed in the chassis field; "Look up" decodes it. */
  vin: string;
  /** Called with every successful read. The form decides what to fill. */
  onResult: (result: VinReadResult) => void;
  className?: string;
}

/**
 * "Fill from the VIN": upload a photo of the chassis plate (or papers) and the
 * reader finds the VIN and the car's details, or decode a VIN typed by hand.
 */
export function VinScanner({ vin, onResult, className }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"photo" | "lookup" | null>(null);
  const [last, setLast] = useState<VinReadResult | null>(null);

  const run = async (
    kind: "photo" | "lookup",
    input: () => Promise<{ image: string } | { vin: string }>
  ) => {
    setBusy(kind);
    try {
      const result = await readVin(await input());
      setLast(result);
      onResult(result);
    } catch (err) {
      toast.error(err instanceof Error && err.message ? err.message : "The VIN reader failed. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // so the same photo can be chosen again
    if (file) run("photo", async () => ({ image: await photoToDataUrl(file) }));
  };

  const typed = vin.trim();
  const canLookUp = typed.length >= MIN_LOOKUP_LENGTH && busy === null;

  const f = last?.fields;
  const car = f ? [f.year, f.make && canonicalMake(f.make), f.model, f.trim].filter(Boolean).join(" ") : "";
  const headline = [car, last?.summary].filter(Boolean).join(" · ");

  return (
    <div className={cn("rounded-xl border border-dashed border-violet-500/30 bg-violet-500/5 p-4", className)}>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="p-2 rounded-lg bg-violet-500/10 shrink-0">
            <ScanLine className="h-4 w-4 text-violet-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold">Fill from the VIN</p>
            <p className="text-xs text-muted-foreground">
              Upload a photo of the chassis plate, windscreen tag, door sticker or papers.
              Make, model, year and more fill in for you.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleFile}
            className="hidden"
            aria-hidden
            tabIndex={-1}
          />
          <Button
            type="button"
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={busy !== null}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {busy === "photo"
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Reading photo…</>
              : <><Camera className="h-4 w-4 mr-1.5" /> Upload VIN photo</>}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => run("lookup", async () => ({ vin: typed }))}
            disabled={!canLookUp}
            title={typed.length < MIN_LOOKUP_LENGTH
              ? `Type at least ${MIN_LOOKUP_LENGTH} characters in the chassis field`
              : "Decode the chassis number typed below"}
          >
            {busy === "lookup"
              ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Looking up…</>
              : <><Search className="h-4 w-4 mr-1.5" /> Look up typed VIN</>}
          </Button>
        </div>
      </div>

      <div aria-live="polite">
        {last && (
          <div className="mt-3 pt-3 border-t border-violet-500/15 space-y-1.5 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {last.vin && (
                <span className="font-mono font-semibold tracking-wider text-foreground">{last.vin}</span>
              )}
              {last.checkDigitOk && (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Check digit OK
                </span>
              )}
              {headline && <span className="text-muted-foreground">{headline}</span>}
            </div>
            {last.vin && last.vin.length > VIN_MAX_LENGTH && (
              <p className="text-muted-foreground">
                The chassis field keeps the first {VIN_MAX_LENGTH} characters, as on the paper records.
              </p>
            )}
            {last.warnings.map((w) => (
              <p key={w} className="flex gap-1.5 text-amber-600">
                <TriangleAlert className="h-3.5 w-3.5 shrink-0 mt-px" />
                <span>{w}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

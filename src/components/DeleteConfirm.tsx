import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Every delete in the app goes through this: the person must type the phrase
 * before the Delete button works, so nothing is ever removed by a stray tap.
 */
export const DELETE_PHRASE = "DELETE";

export const phraseMatches = (typed: string, phrase = DELETE_PHRASE) =>
  typed.trim().toUpperCase() === phrase.toUpperCase();

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Button text, e.g. "Delete vehicle". */
  confirmLabel?: string;
  onConfirm: () => void | Promise<void>;
  busy?: boolean;
};

/** A controlled "type DELETE to confirm" dialog. */
export function DeleteConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = "Delete", onConfirm, busy = false,
}: DialogProps) {
  const [typed, setTyped] = useState("");
  const [running, setRunning] = useState(false);
  const ready = phraseMatches(typed);
  const working = busy || running;

  // A fresh, empty box every time it opens
  useEffect(() => { if (open) setTyped(""); }, [open]);

  const confirm = async () => {
    if (!ready || working) return;
    setRunning(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // The caller has shown the error; stay open so they can retry or cancel
    } finally {
      setRunning(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !working && onOpenChange(v)}>
      <AlertDialogContent className="rounded-3xl glass-panel border-white/10 max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5 shrink-0" /> {title}
          </AlertDialogTitle>
          {description && <AlertDialogDescription asChild><div className="text-sm text-muted-foreground space-y-1">{description}</div></AlertDialogDescription>}
        </AlertDialogHeader>

        <form
          className="space-y-2"
          onSubmit={(e) => { e.preventDefault(); confirm(); }}
        >
          <label htmlFor="delete-phrase" className="text-sm">
            To confirm, type <span className="font-mono font-bold text-destructive select-all">{DELETE_PHRASE}</span> below.
          </label>
          <Input
            id="delete-phrase"
            autoFocus
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={DELETE_PHRASE}
            className="h-11 rounded-xl font-mono tracking-widest"
            onPaste={(e) => e.preventDefault()}
            aria-describedby="delete-phrase-hint"
          />
          <p id="delete-phrase-hint" className="text-[11px] text-muted-foreground">
            This cannot be undone. The Delete button stays off until the word is typed exactly.
          </p>

          <AlertDialogFooter className="pt-2">
            <AlertDialogCancel type="button" disabled={working} className="rounded-xl">Cancel</AlertDialogCancel>
            <Button type="submit" variant="destructive" disabled={!ready || working} className="rounded-xl">
              {working ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              {confirmLabel}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Imperative form ────────────────────────────────────────────────────────
// For places that had a plain confirm() or no confirmation at all:
//   if (!(await confirmDelete({ title: "Delete this meeting?" }))) return;

type Request = Omit<DialogProps, "open" | "onOpenChange" | "onConfirm" | "busy"> & {
  resolve: (ok: boolean) => void;
};

let pushRequest: ((r: Request) => void) | null = null;

export function confirmDelete(options: Omit<Request, "resolve">): Promise<boolean> {
  return new Promise((resolve) => {
    if (!pushRequest) {
      // The host is mounted at the app root; without it nothing may be deleted
      console.error("[delete] DeleteConfirmHost is not mounted");
      resolve(false);
      return;
    }
    pushRequest({ ...options, resolve });
  });
}

/** Mount once at the app root. */
export function DeleteConfirmHost() {
  const [request, setRequest] = useState<Request | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    pushRequest = (r) => {
      settled.current = false;
      setRequest(r);
    };
    return () => { pushRequest = null; };
  }, []);

  const finish = (ok: boolean) => {
    if (request && !settled.current) {
      settled.current = true;
      request.resolve(ok);
    }
    setRequest(null);
  };

  return (
    <DeleteConfirmDialog
      open={!!request}
      onOpenChange={(open) => { if (!open) finish(false); }}
      title={request?.title ?? ""}
      description={request?.description}
      confirmLabel={request?.confirmLabel}
      onConfirm={() => finish(true)}
    />
  );
}

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText, ImageOff, Loader2, Mic, Pause, Play, Square, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const CHAT_BUCKET = "chat-attachments";
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

export type Attachment = {
  attachment_path: string;
  attachment_type: "image" | "audio" | "file";
  attachment_name: string | null;
  attachment_size: number | null;
  attachment_duration: number | null;
};

export const formatBytes = (n?: number | null) => {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};

export const formatDuration = (s?: number | null) => {
  const t = Math.max(0, Math.round(s ?? 0));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/**
 * Downloads the file through the signed-in session and keeps it as an
 * in-memory blob URL. There is no shareable link: the file only exists inside
 * this browser tab, for as long as the chat is open.
 */
function useAttachmentBlob(path: string) {
  const query = useQuery({
    queryKey: ["chat-attachment", path],
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(CHAT_BUCKET).download(path);
      if (error) throw error;
      return URL.createObjectURL(data);
    },
  });
  return query;
}

/** Stops casual saving: no right-click menu, no dragging the image out. */
const guard = {
  onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  onDragStart: (e: React.DragEvent) => e.preventDefault(),
  draggable: false,
};

function ChatImage({ a }: { a: Attachment }) {
  const { data: url, isLoading, isError } = useAttachmentBlob(a.attachment_path);
  const [open, setOpen] = useState(false);

  if (isLoading) {
    return <div className="h-48 w-60 max-w-full rounded-xl bg-black/10 grid place-items-center"><Loader2 className="h-5 w-5 animate-spin opacity-60" /></div>;
  }
  if (isError || !url) {
    return <div className="h-24 w-48 rounded-xl bg-black/10 grid place-items-center text-xs gap-1"><ImageOff className="h-5 w-5 opacity-60" />Couldn't load photo</div>;
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="block rounded-xl overflow-hidden" aria-label="View photo">
        <img src={url} alt={a.attachment_name ?? "Photo"} className="max-h-72 w-auto max-w-full object-cover select-none" {...guard} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[95vw] w-auto p-0 bg-black/95 border-none [&>button]:hidden"
          onContextMenu={(e) => e.preventDefault()}
        >
          <DialogTitle className="sr-only">{a.attachment_name ?? "Photo"}</DialogTitle>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute top-3 right-3 z-10 h-9 w-9 rounded-full bg-white/15 text-white grid place-items-center hover:bg-white/25"
          >
            <X className="h-5 w-5" />
          </button>
          <img src={url} alt={a.attachment_name ?? "Photo"} className="max-h-[90vh] max-w-[95vw] object-contain select-none" {...guard} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function VoiceNote({ a, mine }: { a: Attachment; mine: boolean }) {
  const { data: url, isLoading } = useAttachmentBlob(a.attachment_path);
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  const toggle = () => {
    const el = audio.current;
    if (!el) return;
    if (el.paused) el.play(); else el.pause();
  };

  return (
    <div className="flex items-center gap-2.5 min-w-[200px] py-1">
      <button
        type="button"
        onClick={toggle}
        disabled={isLoading}
        aria-label={playing ? "Pause voice note" : "Play voice note"}
        className={cn("h-9 w-9 shrink-0 rounded-full grid place-items-center",
          mine ? "bg-white/20" : "bg-primary text-primary-foreground")}
      >
        {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>
      <div className="flex-1">
        <div className={cn("h-1.5 rounded-full overflow-hidden", mine ? "bg-white/25" : "bg-foreground/10")}>
          <div className={cn("h-full", mine ? "bg-white" : "bg-primary")} style={{ width: `${progress * 100}%` }} />
        </div>
        <p className="text-[11px] mt-1 opacity-75">
          🎤 {formatDuration(playing || elapsed ? elapsed : a.attachment_duration)}
        </p>
      </div>
      {url && (
        <audio
          ref={audio}
          src={url}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => { setPlaying(false); setProgress(0); setElapsed(0); }}
          onTimeUpdate={(e) => {
            const el = e.currentTarget;
            const total = Number.isFinite(el.duration) ? el.duration : a.attachment_duration ?? 0;
            setElapsed(el.currentTime);
            setProgress(total ? Math.min(1, el.currentTime / total) : 0);
          }}
        />
      )}
    </div>
  );
}

function FileCard({ a, mine }: { a: Attachment; mine: boolean }) {
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.storage.from(CHAT_BUCKET).download(a.attachment_path);
      if (error) throw error;
      const url = URL.createObjectURL(data);
      const link = document.createElement("a");
      link.href = url;
      link.download = a.attachment_name ?? "file";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setBusy(false);
    }
  };
  return (
    <button type="button" onClick={download} className="flex items-center gap-3 min-w-[200px] py-1 text-left">
      <span className={cn("h-10 w-10 shrink-0 rounded-lg grid place-items-center", mine ? "bg-white/20" : "bg-primary/10 text-primary")}>
        <FileText className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{a.attachment_name ?? "File"}</span>
        <span className="block text-[11px] opacity-75">{formatBytes(a.attachment_size)}</span>
      </span>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4 opacity-75" />}
    </button>
  );
}

export function AttachmentView({ a, mine }: { a: Attachment; mine: boolean }) {
  if (a.attachment_type === "image") return <ChatImage a={a} />;
  if (a.attachment_type === "audio") return <VoiceNote a={a} mine={mine} />;
  return <FileCard a={a} mine={mine} />;
}

// ─── Voice recording ────────────────────────────────────────────────────────

function pickMime() {
  const options = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return options.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m)) ?? "";
}

/**
 * Hold-free recorder: tap the mic to start, then send or discard. Returns the
 * finished clip through onDone.
 */
export function VoiceRecorder({
  onDone, onCancel,
}: { onDone: (file: File, seconds: number) => void; onCancel: () => void }) {
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const started = useRef(0);
  const discard = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: number | undefined;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const mime = pickMime();
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
        recorder.current = rec;
        rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        rec.onstop = () => {
          stream?.getTracks().forEach((t) => t.stop());
          if (discard.current) return;
          const type = rec.mimeType || "audio/webm";
          const ext = type.includes("mp4") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
          const blob = new Blob(chunks.current, { type });
          const secs = (Date.now() - started.current) / 1000;
          onDone(new File([blob], `voice-note.${ext}`, { type }), secs);
        };
        rec.start();
        started.current = Date.now();
        timer = window.setInterval(() => setSeconds((Date.now() - started.current) / 1000), 250);
      } catch {
        setError("Microphone access was blocked. Allow it in your browser to record.");
      }
    })();

    return () => {
      window.clearInterval(timer);
      if (recorder.current?.state === "recording") {
        discard.current = true;
        recorder.current.stop();
      }
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = (send: boolean) => {
    discard.current = !send;
    if (recorder.current?.state === "recording") recorder.current.stop();
    if (!send) onCancel();
  };

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-between gap-2 rounded-xl border px-3 h-11 text-sm text-destructive">
        {error}
        <button type="button" onClick={onCancel} aria-label="Close" className="text-muted-foreground"><X className="h-4 w-4" /></button>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center gap-3 rounded-xl border px-3 h-11">
      <button type="button" onClick={() => stop(false)} aria-label="Discard recording" className="text-muted-foreground hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </button>
      <span className="h-2.5 w-2.5 rounded-full bg-rose-500 animate-pulse" />
      <span className="text-sm font-mono flex-1">{formatDuration(seconds)}</span>
      <Mic className="h-4 w-4 text-rose-500" />
      <button
        type="button"
        onClick={() => stop(true)}
        aria-label="Stop and send voice note"
        className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-bold flex items-center gap-1.5"
      >
        <Square className="h-3 w-3 fill-current" /> Send
      </button>
    </div>
  );
}

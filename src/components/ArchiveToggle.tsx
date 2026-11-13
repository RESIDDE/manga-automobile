import { useEffect, useState } from "react";
import { Archive } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { archiveEnabled, onArchivePrefChange, setArchiveEnabled } from "@/lib/archive";
import { cn } from "@/lib/utils";

/** The current "Add to archive" setting, kept in step across every toggle on screen. */
export function useArchiveEnabled(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(archiveEnabled);
  useEffect(() => onArchivePrefChange(() => setOn(archiveEnabled())), []);
  return [on, setArchiveEnabled];
}

/**
 * "Add to archive" switch, shown beside Print / Download. When on, the next
 * print or download files a company copy in the Document Archive.
 */
export function ArchiveToggle({ className }: { className?: string }) {
  const [on, setOn] = useArchiveEnabled();
  return (
    <label
      className={cn(
        "inline-flex items-center gap-2 rounded-xl border px-3 h-10 text-sm font-medium cursor-pointer select-none print:hidden",
        on ? "border-indigo-500/40 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300" : "border-white/10 text-muted-foreground",
        className,
      )}
      title={on ? "Printing or downloading files a company copy in the Document Archive" : "Nothing will be filed in the archive"}
    >
      <Archive className="h-4 w-4 shrink-0" />
      <span className="whitespace-nowrap">Add to archive</span>
      <Switch checked={on} onCheckedChange={setOn} aria-label="Add to archive when printing or downloading" />
    </label>
  );
}

import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ArrowLeft, Download, FileImage, FileText, Printer } from "lucide-react";
import {
  captureDocumentElement, downloadDocument, printDocument, type DocFormat,
} from "@/lib/documentExport";
import { logAction } from "@/lib/logger";

type Props = {
  /** The A4 sheet to rasterise — the same node that previews and prints. */
  documentRef: React.RefObject<HTMLDivElement>;
  filename: string;
  /** Audit entity name, e.g. "Authority to Sell". */
  entity: string;
  recordId?: string | null;
  onBack: () => void;
  backLabel?: string;
  /** Tailwind classes for the solid Print button. */
  accentClass?: string;
};

/**
 * Back / Download (PDF · PNG · JPEG) / Print strip above a document preview.
 * Every format comes off the same rendered sheet, so the file always matches
 * what is on screen.
 */
export function DocumentToolbar({
  documentRef, filename, entity, recordId, onBack,
  backLabel = "Back to Editor",
  accentClass = "bg-sky-500 hover:bg-sky-600",
}: Props) {
  const handleDownload = async (fmt: DocFormat) => {
    await downloadDocument(documentRef.current, filename, fmt);
    logAction("EXPORT", entity, recordId ?? undefined, { format: fmt });
  };

  const handlePrint = async () => {
    logAction("PRINT", entity, recordId ?? undefined);
    await printDocument(
      async () => captureDocumentElement(documentRef.current as HTMLElement, "pdf"),
      filename
    );
  };

  return (
    <div className="print:hidden flex flex-wrap items-center justify-between gap-3 mb-6">
      <Button variant="outline" onClick={onBack} className="rounded-xl border-white/10 hover:bg-white/5">
        <ArrowLeft className="h-4 w-4 mr-2" /> {backLabel}
      </Button>

      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="rounded-xl border-white/10 hover:bg-white/5">
              <Download className="h-4 w-4 mr-2" /> Download
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="glass-panel border-white/10 rounded-xl">
            <DropdownMenuItem onClick={() => handleDownload("pdf")} className="rounded-lg cursor-pointer">
              <FileText className="h-4 w-4 mr-2" /> Save as PDF
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload("png")} className="rounded-lg cursor-pointer">
              <FileImage className="h-4 w-4 mr-2" /> Save as PNG
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleDownload("jpeg")} className="rounded-lg cursor-pointer">
              <FileImage className="h-4 w-4 mr-2" /> Save as JPEG
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button onClick={handlePrint} className={`rounded-xl text-white border-0 shadow-lg ${accentClass}`}>
          <Printer className="h-4 w-4 mr-2" /> Print Document
        </Button>
      </div>
    </div>
  );
}

import { QRCodeSVG } from "qrcode.react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export function getSignUrl(type: "customer" | "sale", id: string) {
  return `${window.location.origin}/sign/${type}/${id}`;
}

export function QrSignDialog({
  open,
  onOpenChange,
  type,
  id,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: "customer" | "sale";
  id: string | null;
}) {
  if (!id) return null;
  const url = getSignUrl(type, id);

  const copyUrl = () => {
    navigator.clipboard.writeText(url);
    toast.success("Link copied to clipboard");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xs rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-center">Scan to Sign</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <QRCodeSVG value={url} size={200} />
          <p className="text-[10px] text-muted-foreground text-center break-all px-2">{url}</p>
          <div className="flex gap-2 w-full">
            <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={copyUrl}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy Link
            </Button>
            <Button variant="outline" size="sm" className="flex-1 rounded-xl" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Open
              </a>
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

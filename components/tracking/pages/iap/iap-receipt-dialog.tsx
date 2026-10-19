"use client";

import { FileJson } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function IapReceiptDialog({
  description = "Store receipt payload used for IAP verification and troubleshooting.",
  onOpenChange,
  receipt,
  title = "Decoded Receipt Details",
}: {
  description?: string;
  onOpenChange: (open: boolean) => void;
  receipt: unknown;
  title?: string;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col p-6 sm:max-w-4xl">
        <DialogHeader className="border-b pb-2">
          <DialogTitle className="flex items-center gap-2">
            <FileJson size={18} className="text-primary" />
            <span>{title}</span>
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 flex-1 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(receipt, null, 2)}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

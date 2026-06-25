import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ManagedAccount } from "../types";

type DeleteAccountDialogProps = {
  account: ManagedAccount | null;
  confirmEmail: string;
  onConfirm: () => void;
  onConfirmEmailChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
};

export function DeleteAccountDialog({
  account,
  confirmEmail,
  onConfirm,
  onConfirmEmailChange,
  onOpenChange,
}: DeleteAccountDialogProps) {
  return (
    <Dialog open={Boolean(account)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete account</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            Type the exact Gmail account to confirm deletion.
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deleteEmail">Gmail account</Label>
            <Input
              id="deleteEmail"
              value={confirmEmail}
              onChange={(event) => onConfirmEmailChange(event.target.value)}
              placeholder={account?.email ?? "account@gmail.com"}
            />
            <div className="text-xs text-muted-foreground">
              Required: {account?.email ?? ""}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={
                !account ||
                confirmEmail.trim().toLowerCase() !== account.email.toLowerCase()
              }
              onClick={onConfirm}
            >
              Delete account
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

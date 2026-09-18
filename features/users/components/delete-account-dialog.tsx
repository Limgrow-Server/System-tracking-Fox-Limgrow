import { Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ManagedAccount } from "../types";

type DeleteAccountDialogProps = {
  account: ManagedAccount | null;
  confirmEmail: string;
  deleting?: boolean;
  onConfirm: () => void;
  onConfirmEmailChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
};

export function DeleteAccountDialog({
  account,
  confirmEmail,
  deleting = false,
  onConfirm,
  onConfirmEmailChange,
  onOpenChange,
}: DeleteAccountDialogProps) {
  return (
    <AlertDialog open={Boolean(account)} onOpenChange={onOpenChange}>
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <Trash2 />
          </AlertDialogMedia>
          <AlertDialogTitle>Delete account</AlertDialogTitle>
          <AlertDialogDescription>
            This permanently removes console access and cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-4">
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
            Type the exact account email to confirm deletion.
          </div>
          <div className="grid gap-2">
            <Label htmlFor="deleteEmail">Account email</Label>
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
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={
                deleting ||
                !account ||
                confirmEmail.trim().toLowerCase() !== account.email.toLowerCase()
              }
              onClick={(event) => {
                event.preventDefault();
                onConfirm();
              }}
            >
              {deleting ? "Deleting..." : "Delete account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </div>
      </AlertDialogContent>
    </AlertDialog>
  );
}

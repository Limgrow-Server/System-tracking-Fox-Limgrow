import { Pencil, Trash2, UserCheck, UserX } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { ManagedAccount } from "../types";
import { isInactiveUser } from "../utils";

type AccountRowActionsProps = {
  account: ManagedAccount;
  onDelete: (account: ManagedAccount) => void;
  onEdit: (account: ManagedAccount) => void;
  onToggleActive?: (account: ManagedAccount) => void;
  showToggle?: boolean;
};

export function AccountRowActions({
  account,
  onDelete,
  onEdit,
  onToggleActive,
  showToggle = false,
}: AccountRowActionsProps) {
  const inactive = isInactiveUser(account);

  return (
    <div className="flex items-center justify-start gap-1">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onEdit(account)}
        aria-label={`Edit ${account.email}`}
      >
        <Pencil size={14} />
      </Button>
      {showToggle && onToggleActive ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => onToggleActive(account)}
          aria-label={`${inactive ? "Activate" : "Deactivate"} ${account.email}`}
        >
          {inactive ? <UserCheck size={14} /> : <UserX size={14} />}
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onDelete(account)}
        aria-label={`Delete ${account.email}`}
      >
        <Trash2 size={14} />
      </Button>
    </div>
  );
}

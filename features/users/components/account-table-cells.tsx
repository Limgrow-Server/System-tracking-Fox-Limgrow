import { Badge } from "@/components/ui/badge";
import type { ManagedAccount } from "../types";

export function EmailCell({ account }: { account: ManagedAccount }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate font-medium">{account.email}</span>
        {account.isPreview ? (
          <Badge variant="outline" className="border-blue-200 bg-blue-50 text-blue-700">
            Preview
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

export function AccountNameCell({ account }: { account: ManagedAccount }) {
  return (
    <div className="min-w-0">
      <div className="truncate font-medium">{account.name}</div>
    </div>
  );
}

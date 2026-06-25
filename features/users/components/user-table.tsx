import { UserCog } from "lucide-react";

import { StatusBadge, TableEmptyState } from "@/components/tracking/primitives";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ManagedAccount } from "../types";
import { formatAccountDate, roleBadgeTone } from "../utils";
import { AccountNameCell, EmailCell } from "./account-table-cells";
import { AccountRowActions } from "./account-row-actions";

type UserTableProps = {
  accounts: ManagedAccount[];
  onDelete: (account: ManagedAccount) => void;
  onEdit: (account: ManagedAccount) => void;
  onToggleActive: (account: ManagedAccount) => void;
};

export function UserTable({
  accounts,
  onDelete,
  onEdit,
  onToggleActive,
}: UserTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Account</TableHead>
          <TableHead>Account Name</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Created Date</TableHead>
          <TableHead className="pr-4 text-left">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => (
          <TableRow key={account.id}>
            <TableCell className="pl-4">
              <EmailCell account={account} />
            </TableCell>
            <TableCell>
              <AccountNameCell account={account} />
            </TableCell>
            <TableCell>
              {account.role ? (
                <Badge variant="outline" className={roleBadgeTone(account.role)}>
                  {account.role}
                </Badge>
              ) : null}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                <StatusBadge status={account.consoleStatus ?? account.authStatus} />
              </div>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {formatAccountDate(account.createdAt)}
            </TableCell>
            <TableCell className="pr-4 text-left">
              <AccountRowActions
                account={account}
                onDelete={onDelete}
                onEdit={onEdit}
                onToggleActive={onToggleActive}
                showToggle
              />
            </TableCell>
          </TableRow>
        ))}
        {!accounts.length ? (
          <TableEmptyState
            colSpan={6}
            icon={UserCog}
            title="No users"
            description="Try a different search or role filter."
          />
        ) : null}
      </TableBody>
    </Table>
  );
}

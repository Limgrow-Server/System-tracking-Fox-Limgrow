import { UserCog } from "lucide-react";

import { TableEmptyState } from "@/components/tracking/primitives";
import { Avatar, AvatarBadge, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { ManagedAccount, ManagedAppOption } from "../types";
import {
  accountInitials,
  appOptionLabel,
  availabilityBadgeTone,
  availabilityLabel,
  formatAccountDate,
  managedAppsForAccount,
  roleBadgeTone,
} from "../utils";
import { AccountRowActions } from "./account-row-actions";

type UserTableProps = {
  accounts: ManagedAccount[];
  appOptions: ManagedAppOption[];
  onDelete: (account: ManagedAccount) => void;
  onEdit: (account: ManagedAccount) => void;
  onToggleActive: (account: ManagedAccount) => void;
  togglingAccountId?: string | null;
};

export function UserTable({
  accounts,
  appOptions,
  onDelete,
  onEdit,
  onToggleActive,
  togglingAccountId = null,
}: UserTableProps) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Member</TableHead>
          <TableHead>Availability</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Managed apps</TableHead>
          <TableHead>Joined</TableHead>
          <TableHead className="pr-4 text-left">Action</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => {
          const apps = managedAppsForAccount(account, appOptions);
          const visibleApps = account.role === "Admin" ? [] : apps.slice(0, 3);
          const extraCount = Math.max(0, apps.length - visibleApps.length);

          return (
            <TableRow key={account.id}>
              <TableCell className="pl-4">
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar size="lg">
                    <AvatarFallback>{accountInitials(account)}</AvatarFallback>
                    <AvatarBadge
                      className={
                        account.consoleStatus === "active"
                          ? "bg-emerald-500"
                          : "bg-muted-foreground"
                      }
                    />
                  </Avatar>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {account.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {account.email}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className={availabilityBadgeTone(account)}
                >
                  {availabilityLabel(account)}
                </Badge>
              </TableCell>
              <TableCell>
                <Badge variant="outline" className={roleBadgeTone(account.role)}>
                  {account.role}
                </Badge>
              </TableCell>
              <TableCell>
                {account.role === "Admin" ? (
                  <Badge variant="secondary">All apps</Badge>
                ) : (
                  <div className="flex max-w-96 flex-wrap gap-1">
                    {visibleApps.map((app) => (
                      <Badge key={app.id} variant="secondary" className="max-w-40 truncate">
                        {appOptionLabel(app)}
                      </Badge>
                    ))}
                    {extraCount ? (
                      <Badge variant="outline">+{extraCount}</Badge>
                    ) : null}
                    {!visibleApps.length ? (
                      <span className="text-sm text-muted-foreground">No apps</span>
                    ) : null}
                  </div>
                )}
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
                  toggling={togglingAccountId === account.id}
                />
              </TableCell>
            </TableRow>
          );
        })}
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

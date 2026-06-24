"use client";

import { FormEvent, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/tracking/primitives";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StaffRole, TeamMember } from "@/lib/tracking/types";
import { AccountTableFooter } from "./components/account-table-footer";
import { CreateAccountDialog } from "./components/create-account-dialog";
import { DeleteAccountDialog } from "./components/delete-account-dialog";
import { EditAccountDrawer } from "./components/edit-account-drawer";
import { UserTable } from "./components/user-table";
import { accountPageSize, roleOptions } from "./constants";
import type { AccountPatch, ManagedAccount } from "./types";
import { accountFromTeamMember, isInactiveUser, searchAccount } from "./utils";

type AccountManagementPageProps = {
  users: TeamMember[];
};

export function AccountManagementPage({
  users: initialUsers,
}: AccountManagementPageProps) {
  const [draftAccounts, setDraftAccounts] = useState<ManagedAccount[]>([]);
  const [accountPatches, setAccountPatches] = useState<
    Record<string, AccountPatch>
  >({});
  const [deletedAccountIds, setDeletedAccountIds] = useState<Set<string>>(
    new Set(),
  );
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | StaffRole>("all");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("Marketing");
  const [editAccount, setEditAccount] = useState<ManagedAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<StaffRole>("Marketing");
  const [deleteAccount, setDeleteAccount] = useState<ManagedAccount | null>(
    null,
  );
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");

  const accounts = useMemo(
    () =>
      [...draftAccounts, ...initialUsers.map(accountFromTeamMember)]
        .filter((account) => !deletedAccountIds.has(account.id))
        .map((account) => ({
          ...account,
          ...(accountPatches[account.id] ?? {}),
        })),
    [accountPatches, deletedAccountIds, draftAccounts, initialUsers],
  );

  const search = query.trim().toLowerCase();
  const filteredAccounts = useMemo(
    () =>
      accounts.filter((account) => {
        const matchesRole = roleFilter === "all" || account.role === roleFilter;
        const matchesSearch =
          !search || searchAccount(account).includes(search);

        return matchesRole && matchesSearch;
      }),
    [accounts, roleFilter, search],
  );

  const totalPages = Math.max(
    1,
    Math.ceil(filteredAccounts.length / accountPageSize),
  );
  const currentPage = Math.min(page, totalPages);
  const visibleRows = filteredAccounts.slice(
    (currentPage - 1) * accountPageSize,
    currentPage * accountPageSize,
  );

  function submitPreviewAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName || !cleanEmail) {
      toast.error("Account name and email are required.");
      return;
    }

    const newAccount: ManagedAccount = {
      id: `draft-${Date.now()}`,
      name: cleanName,
      email: cleanEmail,
      authUserId: `preview-${Date.now()}`,
      role,
      consoleStatus: "active",
      authStatus: "confirmed",
      createdAt: new Date().toISOString(),
      isPreview: true,
    };

    setDraftAccounts((current) => [newAccount, ...current]);
    setName("");
    setEmail("");
    setRole("Marketing");
    setPage(1);
    setDialogOpen(false);
    toast.success("Preview account added to the table.");
  }

  function openEditAccount(account: ManagedAccount) {
    setEditAccount(account);
    setEditName(account.name);
    setEditEmail(account.email);
    setEditRole(account.role);
  }

  function saveEditAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editAccount) return;

    const cleanName = editName.trim();
    const cleanEmail = editEmail.trim().toLowerCase();
    if (!cleanName || !cleanEmail) {
      toast.error("Account name and email are required.");
      return;
    }

    setAccountPatches((current) => ({
      ...current,
      [editAccount.id]: {
        name: cleanName,
        email: cleanEmail,
        role: editRole,
      },
    }));
    setEditAccount(null);
    toast.success("Preview account updated.");
  }

  function openDeleteAccount(account: ManagedAccount) {
    setDeleteAccount(account);
    setDeleteConfirmEmail("");
  }

  function closeDeleteAccount() {
    setDeleteAccount(null);
    setDeleteConfirmEmail("");
  }

  function confirmDeleteAccount() {
    if (!deleteAccount) return;

    if (
      deleteConfirmEmail.trim().toLowerCase() !==
      deleteAccount.email.toLowerCase()
    ) {
      toast.error("Email confirmation does not match.");
      return;
    }

    setDeletedAccountIds((current) => {
      const next = new Set(current);
      next.add(deleteAccount.id);
      return next;
    });
    closeDeleteAccount();
    toast.success("Preview account deleted.");
  }

  function toggleUserActive(account: ManagedAccount) {
    const inactive = isInactiveUser(account);
    setAccountPatches((current) => ({
      ...current,
      [account.id]: {
        ...(current[account.id] ?? {}),
        consoleStatus: inactive ? "active" : "disabled",
        authStatus: inactive ? "confirmed" : "disabled",
      },
    }));
    toast.success(
      inactive ? "Preview account activated." : "Preview account deactivated.",
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="General / User Management"
        title="User Management"
        description="Manage users and Supabase Auth access."
        action={
          <CreateAccountDialog
            email={email}
            name={name}
            onEmailChange={setEmail}
            onNameChange={setName}
            onOpenChange={setDialogOpen}
            onRoleChange={setRole}
            onSubmit={submitPreviewAccount}
            open={dialogOpen}
            role={role}
          />
        }
      />

      <Card className="rounded-lg">
        <CardHeader className="gap-4 border-b">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>Users</CardTitle>

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label className="relative min-w-0 sm:w-72">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  size={15}
                />
                <Input
                  className="h-9 pl-9"
                  value={query}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setPage(1);
                  }}
                  placeholder="Search accounts..."
                />
              </label>
              <Select
                value={roleFilter}
                onValueChange={(value) => {
                  setRoleFilter(value as typeof roleFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-full sm:w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All roles</SelectItem>
                  {roleOptions.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <UserTable
            accounts={visibleRows}
            onDelete={openDeleteAccount}
            onEdit={openEditAccount}
            onToggleActive={toggleUserActive}
          />

          <AccountTableFooter
            currentPage={currentPage}
            onPageChange={setPage}
            shown={visibleRows.length}
            total={filteredAccounts.length}
            totalPages={totalPages}
          />
        </CardContent>
      </Card>

      <EditAccountDrawer
        account={editAccount}
        email={editEmail}
        name={editName}
        onEmailChange={setEditEmail}
        onNameChange={setEditName}
        onOpenChange={(open) => !open && setEditAccount(null)}
        onRoleChange={setEditRole}
        onSubmit={saveEditAccount}
        role={editRole}
      />

      <DeleteAccountDialog
        account={deleteAccount}
        confirmEmail={deleteConfirmEmail}
        onConfirm={confirmDeleteAccount}
        onConfirmEmailChange={setDeleteConfirmEmail}
        onOpenChange={(open) => {
          if (!open) closeDeleteAccount();
        }}
      />
    </div>
  );
}

"use client";

import { FormEvent, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/tracking/primitives";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { UsersPageData } from "@/lib/tracking/page-data";
import type { StaffRole, TeamMember } from "@/lib/tracking/types";
import { AccountTableFooter } from "./components/account-table-footer";
import { CreateAccountDialog } from "./components/create-account-dialog";
import { DeleteAccountDialog } from "./components/delete-account-dialog";
import { EditAccountDrawer } from "./components/edit-account-drawer";
import { UserTable } from "./components/user-table";
import { accountPageSize, roleOptions } from "./constants";
import type { ManagedAccount } from "./types";
import {
  accountFromTeamMember,
  accountHasApp,
  isInactiveUser,
  managedAppsForAccount,
  searchAccount,
} from "./utils";

type AccountManagementPageProps = {
  data: UsersPageData;
};

type UserMutationResponse = {
  deleted?: string;
  error?: string;
  message?: string;
  ok: boolean;
  user?: TeamMember;
};

export function AccountManagementPage({ data }: AccountManagementPageProps) {
  const [accounts, setAccounts] = useState<ManagedAccount[]>(() =>
    data.users.map(accountFromTeamMember),
  );
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | StaffRole>("all");
  const [appFilter, setAppFilter] = useState("all");
  const [page, setPage] = useState(1);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("Marketing");
  const [appScope, setAppScope] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const [editAccount, setEditAccount] = useState<ManagedAccount | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<StaffRole>("Marketing");
  const [editAppScope, setEditAppScope] = useState<string[]>([]);
  const [savingEdit, setSavingEdit] = useState(false);

  const [deleteAccount, setDeleteAccount] = useState<ManagedAccount | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [togglingAccountId, setTogglingAccountId] = useState<string | null>(null);

  const appOptions = data.appOptions;
  const selectedFilterApp = useMemo(
    () => appOptions.find((app) => app.id === appFilter) ?? null,
    [appFilter, appOptions],
  );
  const search = query.trim().toLowerCase();
  const filteredAccounts = useMemo(
    () =>
      accounts.filter((account) => {
        const matchesRole = roleFilter === "all" || account.role === roleFilter;
        const matchesSearch =
          !search || searchAccount(account, appOptions).includes(search);
        const matchesApp =
          !selectedFilterApp ||
          account.role === "Admin" ||
          accountHasApp(account, selectedFilterApp);

        return matchesRole && matchesSearch && matchesApp;
      }),
    [accounts, appOptions, roleFilter, search, selectedFilterApp],
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

  async function mutateUser(
    method: "DELETE" | "PATCH" | "POST",
    body: Record<string, unknown>,
  ) {
    const response = await fetch("/api/admin/users", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as UserMutationResponse;

    if (!response.ok || !payload.ok) {
      throw new Error(payload.error ?? "User operation failed.");
    }

    return payload;
  }

  function resetCreateForm() {
    setName("");
    setEmail("");
    setPassword("");
    setRole("Marketing");
    setAppScope([]);
  }

  async function submitCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName || !cleanEmail || !password) {
      toast.error("Account name, email and password are required.");
      return;
    }

    if (password.length < 6) {
      toast.error("Password must contain at least 6 characters.");
      return;
    }

    if (role !== "Admin" && !appScope.length) {
      toast.error("Select at least one app for this user.");
      return;
    }

    setCreating(true);

    try {
      const payload = await mutateUser("POST", {
        appScope: role === "Admin" ? [] : appScope,
        email: cleanEmail,
        name: cleanName,
        password,
        role,
        storeScope: [],
      });

      if (!payload.user) throw new Error("Created user was missing.");

      setAccounts((current) => [accountFromTeamMember(payload.user!), ...current]);
      resetCreateForm();
      setPage(1);
      setDialogOpen(false);
      toast.success(payload.message ?? "Account created.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Account could not be created.",
      );
    } finally {
      setCreating(false);
    }
  }

  function openEditAccount(account: ManagedAccount) {
    setEditAccount(account);
    setEditName(account.name);
    setEditEmail(account.email);
    setEditRole(account.role);
    setEditAppScope(
      account.role === "Admin"
        ? []
        : managedAppsForAccount(account, appOptions).map((app) => app.id),
    );
  }

  async function saveEditAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editAccount || savingEdit) return;

    const cleanName = editName.trim();
    if (!cleanName) {
      toast.error("Account name is required.");
      return;
    }

    if (editRole !== "Admin" && !editAppScope.length) {
      toast.error("Select at least one app for this user.");
      return;
    }

    setSavingEdit(true);

    try {
      const payload = await mutateUser("PATCH", {
        appScope: editRole === "Admin" ? [] : editAppScope,
        id: editAccount.id,
        name: cleanName,
        role: editRole,
        storeScope: [],
      });

      if (!payload.user) throw new Error("Updated user was missing.");

      setAccounts((current) =>
        current.map((account) =>
          account.id === payload.user!.id
            ? accountFromTeamMember(payload.user!)
            : account,
        ),
      );
      setEditAccount(null);
      toast.success(payload.message ?? "Account updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Account could not be updated.",
      );
    } finally {
      setSavingEdit(false);
    }
  }

  function openDeleteAccount(account: ManagedAccount) {
    setDeleteAccount(account);
    setDeleteConfirmEmail("");
  }

  function closeDeleteAccount() {
    setDeleteAccount(null);
    setDeleteConfirmEmail("");
  }

  async function confirmDeleteAccount() {
    if (!deleteAccount || deleting) return;

    if (
      deleteConfirmEmail.trim().toLowerCase() !==
      deleteAccount.email.toLowerCase()
    ) {
      toast.error("Email confirmation does not match.");
      return;
    }

    setDeleting(true);
    try {
      const payload = await mutateUser("DELETE", { id: deleteAccount.id });
      setAccounts((current) =>
        current.filter((account) => account.id !== payload.deleted),
      );
      closeDeleteAccount();
      toast.success(payload.message ?? "Account deleted.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Account could not be deleted.",
      );
    } finally {
      setDeleting(false);
    }
  }

  async function toggleUserActive(account: ManagedAccount) {
    if (togglingAccountId) return;

    const inactive = isInactiveUser(account);
    setTogglingAccountId(account.id);

    try {
      const payload = await mutateUser("PATCH", {
        appScope: account.role === "Admin" ? [] : account.appScope,
        id: account.id,
        name: account.name,
        role: account.role,
        status: inactive ? "active" : "disabled",
        storeScope: account.storeScope,
      });

      if (!payload.user) throw new Error("Updated user was missing.");

      setAccounts((current) =>
        current.map((item) =>
          item.id === payload.user!.id ? accountFromTeamMember(payload.user!) : item,
        ),
      );
      toast.success(
        inactive ? "Account activated." : "Account deactivated.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Account status could not be changed.",
      );
    } finally {
      setTogglingAccountId(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="General / User Management"
        title="User Management"
        description="Manage console access and assign app ownership."
        action={
          <CreateAccountDialog
            appOptions={appOptions}
            appScope={appScope}
            creating={creating}
            email={email}
            name={name}
            password={password}
            onAppScopeChange={setAppScope}
            onEmailChange={setEmail}
            onNameChange={setName}
            onOpenChange={(open) => {
              setDialogOpen(open);
              if (!open && !creating) resetCreateForm();
            }}
            onPasswordChange={setPassword}
            onRoleChange={(value) => {
              setRole(value);
              if (value === "Admin") setAppScope([]);
            }}
            onSubmit={submitCreateAccount}
            open={dialogOpen}
            role={role}
          />
        }
      />

      <Card className="rounded-lg">
        <CardHeader className="gap-4 border-b">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex items-center gap-2">
              <CardTitle>Members</CardTitle>
              <Badge variant="secondary">{filteredAccounts.length}</Badge>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <label className="relative min-w-0 md:w-72">
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
                  placeholder="Search members..."
                />
              </label>
              <Select
                value={roleFilter}
                onValueChange={(value) => {
                  setRoleFilter(value as typeof roleFilter);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-full md:w-36">
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
              <Select
                value={appFilter}
                onValueChange={(value) => {
                  setAppFilter(value);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-full md:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All apps</SelectItem>
                  {appOptions.map((app) => (
                    <SelectItem key={app.id} value={app.id}>
                      {app.app_name}
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
            appOptions={appOptions}
            onDelete={openDeleteAccount}
            onEdit={openEditAccount}
            onToggleActive={toggleUserActive}
            togglingAccountId={togglingAccountId}
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
        appOptions={appOptions}
        appScope={editAppScope}
        email={editEmail}
        name={editName}
        onAppScopeChange={setEditAppScope}
        onNameChange={setEditName}
        onOpenChange={(open) => {
          if (!open) setEditAccount(null);
        }}
        onRoleChange={(value) => {
          setEditRole(value);
          if (value === "Admin") setEditAppScope([]);
        }}
        onSubmit={saveEditAccount}
        role={editRole}
        saving={savingEdit}
      />

      <DeleteAccountDialog
        account={deleteAccount}
        confirmEmail={deleteConfirmEmail}
        deleting={deleting}
        onConfirm={confirmDeleteAccount}
        onConfirmEmailChange={setDeleteConfirmEmail}
        onOpenChange={(open) => {
          if (!open) closeDeleteAccount();
        }}
      />
    </div>
  );
}

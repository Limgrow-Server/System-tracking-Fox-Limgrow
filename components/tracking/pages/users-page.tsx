"use client";

import { FormEvent, useMemo, useState } from "react";
import { Check, Lock, Plus, Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, TableEmptyState } from "@/components/tracking/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { StaffRole, TeamMember } from "@/lib/tracking/types";

const permissions: Record<StaffRole, string[]> = {
  Admin: ["CRUD users", "Manage App Mapping", "Manage Credential Config", "Approve destructive actions"],
  Dev: ["Access dashboard", "Read operational status"],
  Marketing: ["Access dashboard", "Read operational status"],
};

const pageSize = 8;

export function UsersPage({ users: initialUsers }: { users: TeamMember[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("Marketing");
  const [pending, setPending] = useState(false);
  const [pendingRow, setPendingRow] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const totalPages = Math.max(1, Math.ceil(users.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleUsers = useMemo(
    () => users.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [currentPage, users]
  );

  async function createUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, role, status: "active" }),
      });
      const payload = (await response.json()) as { ok?: boolean; user?: TeamMember; message?: string; error?: string };

      if (!response.ok || !payload.ok || !payload.user) {
        throw new Error(payload.error ?? "Create user failed.");
      }

      setUsers((current) => [payload.user!, ...current]);
      setName("");
      setEmail("");
      setRole("Marketing");
      setPage(1);
      setDialogOpen(false);
      toast.success(payload.message ?? `User ${payload.user.email} created.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create user failed.");
    } finally {
      setPending(false);
    }
  }

  async function updateUser(user: TeamMember, patch: Partial<Pick<TeamMember, "role" | "status">>) {
    const previousUsers = users;
    setPendingRow(user.id);
    setUsers((current) => current.map((item) => (item.id === user.id ? { ...item, ...patch } : item)));

    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: user.id, ...patch }),
      });
      const payload = (await response.json()) as { ok?: boolean; user?: TeamMember; message?: string; error?: string };

      if (!response.ok || !payload.ok || !payload.user) {
        throw new Error(payload.error ?? "Update user failed.");
      }

      setUsers((current) => current.map((item) => (item.id === user.id ? payload.user! : item)));
      toast.success(payload.message ?? "User updated.");
    } catch (error) {
      setUsers(previousUsers);
      toast.error(error instanceof Error ? error.message : "Update user failed.");
    } finally {
      setPendingRow(null);
    }
  }

  async function deleteUser(user: TeamMember) {
    const previousUsers = users;
    setPendingRow(user.id);
    setUsers((current) => current.filter((item) => item.id !== user.id));

    try {
      const response = await fetch("/api/admin/users", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: user.id }),
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Delete user failed.");
      }

      toast.success(payload.message ?? "User deleted.");
    } catch (error) {
      setUsers(previousUsers);
      toast.error(error instanceof Error ? error.message : "Delete user failed.");
    } finally {
      setPendingRow(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="General / Users"
        title="User and role management"
        description="CRUD nhân sự Admin, Dev và Marketing. Production nên đồng bộ role vào Supabase Auth app_metadata để RLS và server actions cùng dùng một nguồn phân quyền."
        action={
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus size={15} />
                Invite user
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create user</DialogTitle>
              </DialogHeader>
              <form className="space-y-4" onSubmit={createUser}>
                <div className="grid gap-2">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="role">Role</Label>
                  <Select value={role} onValueChange={(value) => setRole(value as StaffRole)}>
                    <SelectTrigger id="role" className="h-9 w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Admin">Admin</SelectItem>
                      <SelectItem value="Dev">Dev</SelectItem>
                      <SelectItem value="Marketing">Marketing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" disabled={pending}>
                  {pending ? <Spinner /> : <Plus size={15} />}
                  {pending ? "Inviting..." : "Invite user"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="rounded-lg">
          <CardHeader className="border-b">
            <CardTitle>Users</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4">User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="pl-4">
                      <div className="font-medium">{user.name}</div>
                      <div className="text-xs text-muted-foreground">{user.email}</div>
                    </TableCell>
                    <TableCell>
                      <Select value={user.role} onValueChange={(value) => updateUser(user, { role: value as StaffRole })}>
                        <SelectTrigger className="h-8 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Admin">Admin</SelectItem>
                          <SelectItem value="Dev">Dev</SelectItem>
                          <SelectItem value="Marketing">Marketing</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={user.status} onValueChange={(value) => updateUser(user, { status: value as TeamMember["status"] })}>
                        <SelectTrigger className="h-8 w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">active</SelectItem>
                          <SelectItem value="invited">invited</SelectItem>
                          <SelectItem value="suspended">suspended</SelectItem>
                          <SelectItem value="disabled">disabled</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[220px] truncate text-xs text-muted-foreground">
                        {user.app_scope?.length ? user.app_scope.join(", ") : "All allowed by role"}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteUser(user)}
                        disabled={pendingRow === user.id || user.email === "admin@limgrow.com"}
                        aria-label={`Delete ${user.email}`}
                      >
                        {pendingRow === user.id ? <Spinner className="size-3.5" /> : <Trash2 size={14} />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {!visibleUsers.length ? (
                  <TableEmptyState
                    colSpan={5}
                    icon={UserCog}
                    title="No users"
                    description="Active team members will appear here."
                  />
                ) : null}
              </TableBody>
            </Table>
            {users.length ? (
              <div className="flex flex-col gap-3 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>
                  Showing {visibleUsers.length} of {users.length}
                </span>
                <Pagination className="mx-0 w-auto justify-start sm:justify-end">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        text="Prev"
                        className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                        onClick={(event) => {
                          event.preventDefault();
                          setPage((value) => Math.max(1, value - 1));
                        }}
                      />
                    </PaginationItem>
                    {Array.from({ length: totalPages }).slice(0, 4).map((_, index) => {
                      const pageNumber = index + 1;
                      return (
                        <PaginationItem key={pageNumber}>
                          <PaginationLink
                            href="#"
                            isActive={currentPage === pageNumber}
                            onClick={(event) => {
                              event.preventDefault();
                              setPage(pageNumber);
                            }}
                          >
                            {pageNumber}
                          </PaginationLink>
                        </PaginationItem>
                      );
                    })}
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        text="Next"
                        className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
                        onClick={(event) => {
                          event.preventDefault();
                          setPage((value) => Math.min(totalPages, value + 1));
                        }}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            ) : null}
          </CardContent>
      </Card>

      <Card className="rounded-lg">
        <CardHeader className="border-b">
          <CardTitle>Role matrix</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          {(Object.keys(permissions) as StaffRole[]).map((item) => (
            <div key={item} className="rounded-lg border p-3">
              <div className="mb-3 flex items-center gap-2 font-medium">
                <UserCog size={16} />
                {item}
              </div>
              <div className="space-y-2">
                {permissions[item].map((permission) => (
                  <div key={permission} className="flex items-center gap-2 text-sm text-muted-foreground">
                    {item === "Marketing" && permission.includes("CRUD") ? <Lock size={13} /> : <Check size={13} />}
                    {permission}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

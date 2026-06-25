"use client";

import { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { StaffRole } from "@/lib/tracking/types";
import { roleOptions } from "../constants";
import type { ManagedAccount, ManagedAppOption } from "../types";
import { AppScopePicker } from "./app-scope-picker";

type EditAccountDrawerProps = {
  account: ManagedAccount | null;
  appOptions: ManagedAppOption[];
  appScope: string[];
  email: string;
  name: string;
  onAppScopeChange: (value: string[]) => void;
  onNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onRoleChange: (value: StaffRole) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  role: StaffRole;
  saving?: boolean;
};

export function EditAccountDrawer({
  account,
  appOptions,
  appScope,
  email,
  name,
  onAppScopeChange,
  onNameChange,
  onOpenChange,
  onRoleChange,
  onSubmit,
  role,
  saving = false,
}: EditAccountDrawerProps) {
  return (
    <Dialog open={Boolean(account)} onOpenChange={onOpenChange}>
      <DialogContent className="flex h-[90svh] max-h-[90svh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Edit account</DialogTitle>
          <DialogDescription>
            Update account name, role, and managed apps.
          </DialogDescription>
        </DialogHeader>
        <form className="flex min-h-0 flex-1 flex-col overflow-hidden" onSubmit={onSubmit}>
          <div className="flex min-h-0 flex-1 flex-col gap-4 px-5 py-4">
            <div className="grid gap-2">
              <Label htmlFor="editEmail">Email</Label>
              <Input
                id="editEmail"
                type="email"
                value={email}
                disabled
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="editName">Account name</Label>
              <Input
                id="editName"
                value={name}
                onChange={(event) => onNameChange(event.target.value)}
                required
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="editRole">Role</Label>
              <Select value={role} onValueChange={(value) => onRoleChange(value as StaffRole)}>
                <SelectTrigger id="editRole" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((item) => (
                    <SelectItem key={item} value={item}>
                      {item}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <AppScopePicker
              appOptions={appOptions}
              display="inline"
              onSelectionChange={onAppScopeChange}
              role={role}
              selectedAppIds={appScope}
            />
          </div>
          <div className="flex flex-col-reverse gap-2 border-t bg-muted/20 px-5 py-4 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

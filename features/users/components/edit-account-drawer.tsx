"use client";

import { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
    <Sheet open={Boolean(account)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Edit account</SheetTitle>
          <SheetDescription>
            Update account name, role, and managed apps.
          </SheetDescription>
        </SheetHeader>
        <form className="flex flex-1 flex-col overflow-hidden" onSubmit={onSubmit}>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
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
              onSelectionChange={onAppScopeChange}
              role={role}
              selectedAppIds={appScope}
            />
          </div>
          <SheetFooter className="border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

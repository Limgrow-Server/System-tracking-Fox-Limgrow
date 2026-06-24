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
import type { ManagedAccount } from "../types";

type EditAccountDrawerProps = {
  account: ManagedAccount | null;
  email: string;
  name: string;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onRoleChange: (value: StaffRole) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  role: StaffRole;
};

export function EditAccountDrawer({
  account,
  email,
  name,
  onEmailChange,
  onNameChange,
  onOpenChange,
  onRoleChange,
  onSubmit,
  role,
}: EditAccountDrawerProps) {
  return (
    <Sheet open={Boolean(account)} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Edit account</SheetTitle>
          <SheetDescription>
            Update email, account name, and role.
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
                onChange={(event) => onEmailChange(event.target.value)}
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
          </div>
          <SheetFooter className="border-t">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">Save changes</Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

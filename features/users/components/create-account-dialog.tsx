"use client";

import { FormEvent } from "react";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import type { ManagedAppOption } from "../types";
import { AppScopePicker } from "./app-scope-picker";

type CreateAccountDialogProps = {
  appOptions: ManagedAppOption[];
  appScope: string[];
  email: string;
  name: string;
  password: string;
  creating: boolean;
  onAppScopeChange: (value: string[]) => void;
  onEmailChange: (value: string) => void;
  onNameChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onPasswordChange: (value: string) => void;
  onRoleChange: (value: StaffRole) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  open: boolean;
  role: StaffRole;
};

export function CreateAccountDialog({
  appOptions,
  appScope,
  creating,
  email,
  name,
  password,
  onAppScopeChange,
  onEmailChange,
  onNameChange,
  onOpenChange,
  onPasswordChange,
  onRoleChange,
  onSubmit,
  open,
  role,
}: CreateAccountDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create account</DialogTitle>
        </DialogHeader>

        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="name">Account name</Label>
            <Input
              id="name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="Jane Nguyen"
              required
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => onEmailChange(event.target.value)}
                placeholder="jane@limgrow.com"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => onPasswordChange(event.target.value)}
                placeholder="Enter password"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={(value) => onRoleChange(value as StaffRole)}>
              <SelectTrigger id="role" className="w-full">
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

          <Button className="w-full" disabled={creating}>
            <Plus size={15} />
            {creating ? "Creating account..." : "Create account"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

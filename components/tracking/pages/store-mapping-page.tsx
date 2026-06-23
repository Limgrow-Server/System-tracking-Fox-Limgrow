"use client";

import { FormEvent, type ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Cable, Eye, Pencil, Plus, Power, PowerOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader, StatusBadge, TableEmptyState, TablePaginationFooter } from "@/components/tracking/primitives";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime } from "@/lib/tracking/format";
import type { StoreMappingPageData } from "@/lib/tracking/page-data";
import type { StoreMapping } from "@/lib/tracking/types";

type StoreMappingForm = {
  appIconUrl: string;
  appLink: string;
  appId: string;
  storeAccountName: string;
  appName: string;
  platform: "android" | "ios";
  packageName: string;
  bundleId: string;
  status: string;
};

type StoreMappingPlatformFilter = "android" | "ios";
type DrawerMode = "create" | "edit" | "view";

function appInitial(value: string | null | undefined) {
  return (value?.trim().charAt(0) || "A").toUpperCase();
}

function AppIcon({ src, name }: { src: string | null | undefined; name: string | null | undefined }) {
  const cleanedSrc = src?.trim();

  if (cleanedSrc) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={cleanedSrc}
        alt={name ? `${name} icon` : "App icon"}
        className="size-10 rounded-md border object-cover"
      />
    );
  }

  return (
    <div className="flex size-10 items-center justify-center rounded-md border bg-muted text-sm font-medium text-muted-foreground">
      {appInitial(name)}
    </div>
  );
}

function createEmptyForm(platform: StoreMappingPlatformFilter): StoreMappingForm {
  return {
    appIconUrl: "",
    appLink: "",
    appId: "",
    storeAccountName: "",
    appName: "",
    platform,
    packageName: "",
    bundleId: "",
    status: "active",
  };
}

function value(value: string | null | undefined) {
  return value ?? "";
}

function formFromMapping(mapping: StoreMapping): StoreMappingForm {
  return {
    appIconUrl: value(mapping.app_icon_url),
    appLink: value(mapping.app_link),
    appId: value(mapping.app_id),
    storeAccountName: mapping.store_account_name,
    appName: mapping.app_name,
    platform: mapping.platform,
    packageName: value(mapping.package_name),
    bundleId: value(mapping.bundle_id),
    status: mapping.status,
  };
}

function MappingFormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="text-sm font-medium">{title}</div>
      {children}
    </section>
  );
}

export function StoreMappingPage({
  data,
  platformFilter,
}: {
  data: StoreMappingPageData;
  platformFilter?: StoreMappingPlatformFilter;
}) {
  const router = useRouter();
  const [mappings, setMappings] = useState(data.storeMappings);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StoreMappingForm>(() => createEmptyForm(platformFilter ?? "android"));
  const [pending, setPending] = useState(false);
  const [pendingRow, setPendingRow] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoreMapping | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
  const storeNameOptions = useMemo(
    () =>
      Array.from(
        new Set(
          data.credentialSecrets
            .filter((credential) => credential.platform === form.platform && credential.store_account_name)
            .map((credential) => credential.store_account_name!)
        )
      ).sort((left, right) => left.localeCompare(right)),
    [data.credentialSecrets, form.platform]
  );

  function openCreate() {
    setDrawerMode("create");
    setEditingId(null);
    setForm(createEmptyForm(platformFilter ?? "android"));
    setDrawerOpen(true);
  }

  function openEdit(mapping: StoreMapping) {
    setDrawerMode("edit");
    setEditingId(mapping.id);
    setForm(formFromMapping(mapping));
    setDrawerOpen(true);
  }

  function openView(mapping: StoreMapping) {
    setDrawerMode("view");
    setEditingId(mapping.id);
    setForm(formFromMapping(mapping));
    setDrawerOpen(true);
  }

  function updateField<K extends keyof StoreMappingForm>(key: K, nextValue: StoreMappingForm[K]) {
    setForm((current) => ({ ...current, [key]: nextValue }));
  }

  function selectStoreAccount(nextValue: string) {
    if (nextValue === "none") {
      setForm((current) => ({ ...current, storeAccountName: "" }));
      return;
    }

    setForm((current) => ({ ...current, storeAccountName: nextValue }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    try {
      const response = await fetch("/api/admin/store-mappings", {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id: editingId, ...form }),
      });
      const payload = (await response.json()) as { ok?: boolean; mapping?: StoreMapping; message?: string; error?: string };

      if (!response.ok || !payload.ok || !payload.mapping) {
        throw new Error(payload.error ?? "Store mapping operation failed.");
      }

      setMappings((current) =>
        editingId
          ? current.map((item) => (item.id === payload.mapping!.id ? payload.mapping! : item))
          : [payload.mapping!, ...current.filter((item) => item.id !== payload.mapping!.id)]
      );
      toast.success(payload.message ?? "Store mapping saved.");
      setDrawerOpen(false);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Store mapping operation failed.");
    } finally {
      setPending(false);
    }
  }

  async function saveMappingPatch(mapping: StoreMapping, patch: Partial<StoreMappingForm>, message: string) {
    const nextForm = {
      ...formFromMapping(mapping),
      ...patch,
    };

    const response = await fetch("/api/admin/store-mappings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: mapping.id, ...nextForm }),
    });
    const payload = (await response.json()) as { ok?: boolean; mapping?: StoreMapping; error?: string };

    if (!response.ok || !payload.ok || !payload.mapping) {
      throw new Error(payload.error ?? message);
    }

    setMappings((current) => current.map((item) => (item.id === payload.mapping!.id ? payload.mapping! : item)));
    router.refresh();
    return payload.mapping;
  }

  async function toggleMappingStatus(mapping: StoreMapping) {
    const nextStatus = mapping.status === "active" ? "inactive" : "active";
    setPendingRow(mapping.id);

    try {
      await saveMappingPatch(mapping, { status: nextStatus }, "Mapping status update failed.");
      toast.success(`Mapping ${nextStatus === "active" ? "activated" : "deactivated"}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Mapping status update failed.");
    } finally {
      setPendingRow(null);
    }
  }

  function openDeleteMapping(mapping: StoreMapping) {
    setDeleteTarget(mapping);
    setDeleteConfirmationName("");
  }

  async function deleteMapping(mapping: StoreMapping) {
    const previous = mappings;
    setPendingRow(mapping.id);
    setMappings((current) => current.filter((item) => item.id !== mapping.id));

    try {
      const response = await fetch("/api/admin/store-mappings", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: mapping.id,
          platform: mapping.platform,
        }),
      });
      const payload = (await response.json()) as { ok?: boolean; message?: string; error?: string };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Delete store mapping failed.");
      }

      toast.success(payload.message ?? "Store mapping deleted.");
      setDeleteTarget(null);
      setDeleteConfirmationName("");
      router.refresh();
    } catch (error) {
      setMappings(previous);
      toast.error(error instanceof Error ? error.message : "Delete store mapping failed.");
    } finally {
      setPendingRow(null);
    }
  }

  const isAndroidForm = form.platform === "android";
  const pageLabel = platformFilter === "android" ? "Android App Mapping" : platformFilter === "ios" ? "iOS App Mapping" : "App Mapping";
  const tableTitle = platformFilter === "android" ? "Android App Mapping" : platformFilter === "ios" ? "iOS App Mapping" : "App Mapping";
  const selectedStoreAccountValue = form.storeAccountName || "none";
  const hasSelectedStoreName = form.storeAccountName ? storeNameOptions.includes(form.storeAccountName) : false;
  const pageDescription =
    platformFilter === "android"
      ? "Manage Android app mappings by app profile, package name, and store ref."
      : platformFilter === "ios"
        ? "Manage iOS app mappings by app profile, BundleId, and store ref."
        : "Connect apps to store credentials by store ref.";
  const drawerReadOnly = drawerMode === "view";
  const drawerTitle =
    drawerMode === "view" ? "View app mapping" : drawerMode === "edit" ? "Edit app mapping" : "Create app mapping";
  const deleteExpectedName = deleteTarget?.app_name ?? "";
  const deleteConfirmDisabled =
    !deleteTarget ||
    pendingRow === deleteTarget.id ||
    deleteConfirmationName.trim() !== deleteExpectedName;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={platformFilter === "android" ? "Operations / App Mapping / Android" : platformFilter === "ios" ? "Operations / App Mapping / iOS" : "Operations / App Mapping"}
        title={pageLabel}
        description={pageDescription}
        action={
          <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
            <SheetTrigger asChild>
              <Button onClick={openCreate}>
                <Plus size={15} />
                Add mapping
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="gap-0 p-0 data-[side=right]:w-full md:data-[side=right]:w-[40vw] md:data-[side=right]:max-w-none"
            >
              <SheetHeader className="border-b px-5 py-4">
                <SheetTitle>{drawerTitle}</SheetTitle>
              </SheetHeader>
              <form className="flex-1 space-y-5 overflow-y-auto px-5 py-5" onSubmit={submit}>
                <MappingFormSection title="App mapping">
                  <div className="grid gap-4 2xl:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="appIconUrl">App avatar/icon</Label>
                      <div className="flex items-center gap-3">
                        <AppIcon src={form.appIconUrl} name={form.appName} />
                        <Input
                          id="appIconUrl"
                          value={form.appIconUrl}
                          onChange={(event) => updateField("appIconUrl", event.target.value)}
                          placeholder="https://.../icon.png"
                          readOnly={drawerReadOnly}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="appId">App ID</Label>
                      <Input
                        id="appId"
                        value={form.appId}
                        onChange={(event) => updateField("appId", event.target.value)}
                        placeholder="LA-009 or internal app id"
                        required
                        readOnly={drawerReadOnly}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="appName">Display name</Label>
                      <Input
                        id="appName"
                        value={form.appName}
                        onChange={(event) => updateField("appName", event.target.value)}
                        placeholder="Display app name"
                        required
                        readOnly={drawerReadOnly}
                      />
                    </div>
                    <div className="grid gap-2 2xl:col-span-2">
                      <Label htmlFor="appLink">App link</Label>
                      <Input
                        id="appLink"
                        value={form.appLink}
                        onChange={(event) => updateField("appLink", event.target.value)}
                        placeholder={isAndroidForm ? "https://play.google.com/store/apps/details?id=..." : "https://apps.apple.com/app/..."}
                        readOnly={drawerReadOnly}
                      />
                    </div>
                    {isAndroidForm ? (
                      <div className="grid gap-2">
                        <Label htmlFor="packageName">Package name</Label>
                        <Input id="packageName" value={form.packageName} onChange={(event) => updateField("packageName", event.target.value)} required readOnly={drawerReadOnly} />
                      </div>
                    ) : (
                      <div className="grid gap-2">
                        <Label htmlFor="bundleId">BundleId</Label>
                        <Input id="bundleId" value={form.bundleId} onChange={(event) => updateField("bundleId", event.target.value)} required readOnly={drawerReadOnly} />
                      </div>
                    )}
                    <div className="grid gap-2">
                      <Label htmlFor="storeAccountName">Store ref</Label>
                      <Select value={selectedStoreAccountValue} onValueChange={selectStoreAccount}>
                        <SelectTrigger id="storeAccountName" className="w-full" disabled={drawerReadOnly}>
                          <SelectValue placeholder="Select store ref" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            {storeNameOptions.length ? "No store ref selected" : "No store ref in credentials"}
                          </SelectItem>
                          {form.storeAccountName && !hasSelectedStoreName && form.storeAccountName !== "none" ? (
                            <SelectItem value={form.storeAccountName}>Current: {form.storeAccountName}</SelectItem>
                          ) : null}
                          {storeNameOptions.map((storeName) => (
                            <SelectItem key={storeName} value={storeName}>
                              {storeName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </MappingFormSection>

                {drawerReadOnly ? null : (
                  <Button disabled={pending} className="w-full">
                    {pending ? <Spinner /> : <Cable size={15} />}
                    {pending ? "Saving..." : editingId ? "Update mapping" : "Create mapping"}
                  </Button>
                )}
              </form>
            </SheetContent>
          </Sheet>
        }
      />

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !pendingRow) {
            setDeleteTarget(null);
            setDeleteConfirmationName("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete app mapping?</DialogTitle>
            <DialogDescription>
              This action permanently removes the mapping for {deleteExpectedName || "this app"}. Type the app name to confirm.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="deleteAppMappingConfirmation">Type `{deleteExpectedName}` to confirm</Label>
            <Input
              id="deleteAppMappingConfirmation"
              value={deleteConfirmationName}
              onChange={(event) => setDeleteConfirmationName(event.target.value)}
              placeholder={deleteExpectedName}
              autoComplete="off"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={Boolean(pendingRow)}
              onClick={() => {
                setDeleteTarget(null);
                setDeleteConfirmationName("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteConfirmDisabled}
              onClick={() => deleteTarget && deleteMapping(deleteTarget)}
            >
              {deleteTarget && pendingRow === deleteTarget.id ? <Spinner /> : <Trash2 size={15} />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="rounded-lg">
        <CardHeader className="border-b">
          <CardTitle>{tableTitle}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[72px] pl-4">Avatar</TableHead>
                <TableHead>App ID</TableHead>
                <TableHead>App name</TableHead>
                <TableHead>Link app</TableHead>
                <TableHead>{platformFilter === "ios" ? "BundleId" : "Package name"}</TableHead>
                <TableHead>Store ref</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated at</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.slice(0, 30).map((mapping) => {
                const runtimeId = mapping.platform === "ios" ? mapping.bundle_id : mapping.package_name;

                return (
                  <TableRow key={mapping.id}>
                    <TableCell className="pl-4">
                      <AppIcon src={mapping.app_icon_url} name={mapping.app_name} />
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[180px] truncate font-mono text-sm">{mapping.app_id ?? "N/A"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[240px] truncate font-medium">{mapping.app_name}</div>
                    </TableCell>
                    <TableCell>
                      {mapping.app_link ? (
                        <a
                          href={mapping.app_link}
                          target="_blank"
                          rel="noreferrer"
                          className="block max-w-[320px] truncate text-sm text-primary underline-offset-4 hover:underline"
                        >
                          {mapping.app_link}
                        </a>
                      ) : (
                        <span className="text-muted-foreground">N/A</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[260px] truncate font-mono text-sm">{runtimeId ?? "N/A"}</div>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[220px] truncate text-sm">{mapping.store_account_name}</div>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={mapping.status} />
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{dateTime(mapping.updated_at)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-start gap-1">
                        <Button variant="ghost" size="icon-sm" onClick={() => openView(mapping)} aria-label={`View ${mapping.app_name}`} title="View mapping">
                          <Eye size={14} />
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => openEdit(mapping)} aria-label={`Edit ${mapping.app_name}`}>
                          <Pencil size={14} />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => toggleMappingStatus(mapping)}
                          disabled={pendingRow === mapping.id}
                          aria-label={mapping.status === "active" ? `Deactivate ${mapping.app_name}` : `Activate ${mapping.app_name}`}
                          title={mapping.status === "active" ? "Deactivate mapping" : "Activate mapping"}
                        >
                          {pendingRow === mapping.id ? <Spinner className="size-3.5" /> : mapping.status === "active" ? <PowerOff size={14} /> : <Power size={14} />}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openDeleteMapping(mapping)}
                          disabled={pendingRow === mapping.id}
                          aria-label={`Delete ${mapping.app_name}`}
                          title="Delete mapping"
                        >
                          <Trash2 size={14} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!mappings.length ? (
                <TableEmptyState
                  colSpan={9}
                  icon={Cable}
                  title="No App Mapping"
                  description="Create the first app mapping and select a store ref with credentials in the vault."
                />
              ) : null}
            </TableBody>
          </Table>
          <TablePaginationFooter shown={Math.min(mappings.length, 30)} total={mappings.length} />
        </CardContent>
      </Card>
    </div>
  );
}

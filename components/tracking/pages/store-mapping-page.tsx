"use client";

import { FormEvent, type ReactNode, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Cable, Eye, Link2, Pencil, Plus, Power, PowerOff, Search, Trash2 } from "lucide-react";
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
  storeProfileId: string;
  appName: string;
  platform: "android" | "ios";
  packageName: string;
  bundleId: string;
  status: string;
};

type StoreMappingPlatformFilter = "android" | "ios";
type DrawerMode = "create" | "edit" | "view";
type StoreOption = {
  id: string;
  name: string;
};
type StoreMappingListResponse = {
  success?: boolean;
  data?: StoreMapping[];
  error?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
};

const APP_MAPPING_PAGE_SIZE = 10;

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

function InlineAppLink({ href, appName }: { href: string | null | undefined; appName: string | null | undefined }) {
  const cleanedHref = href?.trim();
  if (!cleanedHref) return null;

  return (
    <a
      href={cleanedHref}
      target="_blank"
      rel="noreferrer"
      title={cleanedHref}
      aria-label={`Open app link for ${appName || "app"}`}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-md border text-muted-foreground transition hover:border-primary/50 hover:text-primary"
    >
      <Link2 size={13} />
    </a>
  );
}

function createEmptyForm(platform: StoreMappingPlatformFilter): StoreMappingForm {
  return {
    appIconUrl: "",
    appLink: "",
    appId: "",
    storeAccountName: "",
    storeProfileId: "",
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
    storeProfileId: mapping.store_profile_id,
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
  const [tablePagination, setTablePagination] = useState(
    data.storeMappingPagination,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("create");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<StoreMappingForm>(() =>
    createEmptyForm(platformFilter ?? "android"),
  );
  const [pending, setPending] = useState(false);
  const [pendingRow, setPendingRow] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StoreMapping | null>(null);
  const [deleteConfirmationName, setDeleteConfirmationName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [tableLoading, setTableLoading] = useState(false);
  const storeOptions = useMemo(() => {
    const options = new Map<string, StoreOption>();

    for (const credential of data.credentialSecrets) {
      if (credential.platform !== form.platform || !credential.store_profile_id)
        continue;

      const name = credential.store_account_name?.trim();
      if (!name || options.has(credential.store_profile_id)) continue;

      options.set(credential.store_profile_id, {
        id: credential.store_profile_id,
        name,
      });
    }

    return Array.from(options.values()).sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [data.credentialSecrets, form.platform]);

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

  function updateField<K extends keyof StoreMappingForm>(
    key: K,
    nextValue: StoreMappingForm[K],
  ) {
    setForm((current) => ({ ...current, [key]: nextValue }));
  }

  function selectStoreProfile(nextValue: string) {
    if (nextValue === "none") {
      setForm((current) => ({
        ...current,
        storeAccountName: "",
        storeProfileId: "",
      }));
      return;
    }

    const option = storeOptions.find((store) => store.id === nextValue);
    if (!option) return;

    setForm((current) => ({
      ...current,
      storeAccountName: option.name,
      storeProfileId: option.id,
    }));
  }

  function updateSearchQuery(nextValue: string) {
    setSearchQuery(nextValue);
    void loadMappingsPage(1, { searchQuery: nextValue });
  }

  function updateStoreFilter(nextValue: string) {
    setStoreFilter(nextValue);
    void loadMappingsPage(1, { storeFilter: nextValue });
  }

  async function loadMappingsPage(
    page: number,
    overrides?: { searchQuery?: string; storeFilter?: string },
  ) {
    const nextSearchQuery = overrides?.searchQuery ?? searchQuery;
    const nextStoreFilter = overrides?.storeFilter ?? storeFilter;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(APP_MAPPING_PAGE_SIZE),
      platform: platformFilter ?? "android",
    });
    const cleanedSearch = nextSearchQuery.trim();

    if (cleanedSearch) params.set("search", cleanedSearch);
    if (nextStoreFilter !== "all")
      params.set("storeProfileId", nextStoreFilter);

    setTableLoading(true);

    try {
      const response = await fetch(
        `/api/admin/store-mappings?${params.toString()}`,
      );
      const payload = (await response.json()) as StoreMappingListResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "Load app mappings failed.");
      }

      setMappings(payload.data);
      setTablePagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? APP_MAPPING_PAGE_SIZE,
        total: payload.total ?? payload.data.length,
        totalPages: payload.totalPages ?? 1,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Load app mappings failed.",
      );
    } finally {
      setTableLoading(false);
    }
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
      const payload = (await response.json()) as {
        ok?: boolean;
        mapping?: StoreMapping;
        message?: string;
        error?: string;
      };

      if (!response.ok || !payload.ok || !payload.mapping) {
        throw new Error(payload.error ?? "Store mapping operation failed.");
      }

      toast.success(payload.message ?? "Store mapping saved.");
      setDrawerOpen(false);
      await loadMappingsPage(editingId ? tablePagination.page : 1);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Store mapping operation failed.",
      );
    } finally {
      setPending(false);
    }
  }

  async function saveMappingPatch(
    mapping: StoreMapping,
    patch: Partial<StoreMappingForm>,
    message: string,
  ) {
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
      await loadMappingsPage(mappings.length <= 1 && tablePagination.page > 1 ? tablePagination.page - 1 : tablePagination.page);
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
  const tableStoreOptions = storeOptions;
  const currentTablePage = tablePagination.page;
  const tableStartIndex = (currentTablePage - 1) * tablePagination.pageSize;
  const visibleMappings = mappings;
  const hasTableFilters = Boolean(searchQuery.trim()) || storeFilter !== "all";
  const selectedStoreProfileValue = form.storeProfileId || "none";
  const hasSelectedStoreProfile = form.storeProfileId
    ? storeOptions.some((store) => store.id === form.storeProfileId)
    : false;
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
                      <Label htmlFor="appName">App name</Label>
                      <Input
                        id="appName"
                        value={form.appName}
                        onChange={(event) => updateField("appName", event.target.value)}
                        placeholder="Display app name"
                        required
                        readOnly={drawerReadOnly}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="appId">App ID</Label>
                      <Input
                        id="appId"
                        value={form.appId}
                        onChange={(event) => updateField("appId", event.target.value)}
                        placeholder={isAndroidForm ? "LA-001" : "1234567890"}
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
                      <Label htmlFor="storeProfileId">Store ref</Label>
                      <Select value={selectedStoreProfileValue} onValueChange={selectStoreProfile}>
                        <SelectTrigger id="storeProfileId" className="w-full" disabled={drawerReadOnly}>
                          <SelectValue placeholder="Select store ref" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            {storeOptions.length ? "No store ref selected" : "No store ref in credentials"}
                          </SelectItem>
                          {form.storeProfileId && form.storeAccountName && !hasSelectedStoreProfile ? (
                            <SelectItem value={form.storeProfileId}>Current: {form.storeAccountName}</SelectItem>
                          ) : null}
                          {storeOptions.map((store) => (
                            <SelectItem key={store.id} value={store.id}>
                              {store.name}
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
        <CardHeader className="gap-4 border-b">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle className="flex items-center gap-2">
              {tableTitle}
              {tableLoading ? <Spinner className="size-4" /> : null}
            </CardTitle>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative sm:w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={searchQuery}
                  onChange={(event) => updateSearchQuery(event.target.value)}
                  placeholder={platformFilter === "ios" ? "Search apps, stores, BundleId..." : "Search apps, stores, packages..."}
                  className="pl-9"
                />
              </div>
              <Select value={storeFilter} onValueChange={updateStoreFilter}>
                <SelectTrigger className="sm:w-[220px]">
                  <SelectValue placeholder="All stores" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stores</SelectItem>
                  {tableStoreOptions.map((store) => (
                    <SelectItem key={store.id} value={store.id}>
                      {store.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[72px] pl-4">Avatar</TableHead>
                <TableHead>App name</TableHead>
                <TableHead>{platformFilter === "ios" ? "BundleId" : "Package name"}</TableHead>
                <TableHead>Store ref</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated at</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleMappings.map((mapping) => {
                const runtimeId = mapping.platform === "ios" ? mapping.bundle_id : mapping.package_name;

                return (
                  <TableRow key={mapping.id}>
                    <TableCell className="pl-4">
                      <AppIcon src={mapping.app_icon_url} name={mapping.app_name} />
                    </TableCell>
                    <TableCell>
                      <div className="flex max-w-[260px] items-center gap-2">
                        <span className="min-w-0 truncate font-medium">{mapping.app_name}</span>
                        <InlineAppLink href={mapping.app_link} appName={mapping.app_name} />
                      </div>
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
                        {mapping.status === "inactive" ? (
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
                        ) : null}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!mappings.length ? (
                <TableEmptyState
                  colSpan={7}
                  icon={Cable}
                  title={hasTableFilters ? "No matching app mappings" : "No App Mapping"}
                  description={
                    hasTableFilters
                      ? "Adjust the search or store filter to see more app mappings."
                      : "Create the first app mapping and select a store ref with credentials in the vault."
                  }
                />
              ) : null}
            </TableBody>
          </Table>
          <TablePaginationFooter
            from={tableStartIndex + 1}
            onPageChange={(page) => void loadMappingsPage(page)}
            page={currentTablePage}
            shown={visibleMappings.length}
            to={tableStartIndex + visibleMappings.length}
            total={tablePagination.total}
            totalPages={tablePagination.totalPages}
          />
        </CardContent>
      </Card>
    </div>
  );
}

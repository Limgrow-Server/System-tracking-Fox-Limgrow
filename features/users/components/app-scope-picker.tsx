"use client";

import { useMemo, useState } from "react";
import { Link2, Search } from "lucide-react";

import { TablePaginationFooter } from "@/components/tracking/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StaffRole } from "@/lib/tracking/types";
import { cn } from "@/lib/utils";
import type { ManagedAppOption } from "../types";
import { appOptionIdentifier, appOptionLabel } from "../utils";

type AppPlatformTab = "android" | "ios";

const APP_SCOPE_PAGE_SIZE = 6;

type AppScopePickerProps = {
  appOptions: ManagedAppOption[];
  display?: "dialog" | "inline";
  onSelectionChange: (value: string[]) => void;
  role: StaffRole;
  selectedAppIds: string[];
};

function appSearchText(app: ManagedAppOption) {
  return [
    app.app_name,
    app.app_id,
    app.package_name,
    app.bundle_id,
    app.store_account_name,
    app.platform,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function appInitial(value: string | null | undefined) {
  return (value?.trim().charAt(0) || "A").toUpperCase();
}

function appPlatformBadgeClass(platform: string | null | undefined) {
  if (platform === "ios") return "border-sky-200 bg-sky-50 text-sky-700";
  if (platform === "android") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-zinc-200 bg-zinc-50 text-zinc-700";
}

function AppIcon({
  app,
}: {
  app: ManagedAppOption;
}) {
  const src = app.app_icon_url?.trim();

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={app.app_name ? `${app.app_name} icon` : "App icon"}
        className="size-10 rounded-md border object-cover"
      />
    );
  }

  return (
    <div className="flex size-10 items-center justify-center rounded-md border bg-muted text-sm font-medium text-muted-foreground">
      {appInitial(app.app_name)}
    </div>
  );
}

function AppLink({
  app,
}: {
  app: ManagedAppOption;
}) {
  const href = app.app_link?.trim();
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${app.app_name || "app"} link`}
      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border text-muted-foreground hover:border-primary/50 hover:text-primary"
      onClick={(event) => event.stopPropagation()}
    >
      <Link2 size={13} />
    </a>
  );
}

export function AppScopePicker({
  appOptions,
  display = "dialog",
  onSelectionChange,
  role,
  selectedAppIds,
}: AppScopePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState<AppPlatformTab>(() =>
    appOptions.some((app) => app.platform === "android") ? "android" : "ios",
  );
  const [page, setPage] = useState(1);
  const selectedSet = useMemo(() => new Set(selectedAppIds), [selectedAppIds]);
  const selectedApps = useMemo(
    () => appOptions.filter((app) => selectedSet.has(app.id)),
    [appOptions, selectedSet],
  );
  const search = query.trim().toLowerCase();
  const searchMatchedApps = useMemo(
    () =>
      appOptions.filter((app) => {
        const matchesSearch = !search || appSearchText(app).includes(search);
        return matchesSearch;
      }),
    [appOptions, search],
  );
  const platformCounts = useMemo(
    () => ({
      android: searchMatchedApps.filter((app) => app.platform === "android").length,
      ios: searchMatchedApps.filter((app) => app.platform === "ios").length,
    }),
    [searchMatchedApps],
  );
  const visibleApps = useMemo(
    () => searchMatchedApps.filter((app) => app.platform === platform),
    [platform, searchMatchedApps],
  );
  const totalPages = Math.max(Math.ceil(visibleApps.length / APP_SCOPE_PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * APP_SCOPE_PAGE_SIZE;
  const pagedApps = visibleApps.slice(pageStart, pageStart + APP_SCOPE_PAGE_SIZE);
  const pageFrom = visibleApps.length ? pageStart + 1 : undefined;
  const pageTo = visibleApps.length ? pageStart + pagedApps.length : undefined;

  if (role === "Admin") {
    return (
      <div className="flex items-center gap-2 rounded-lg border bg-muted/30 p-3">
        <Badge variant="secondary">All apps</Badge>
        <span className="text-sm text-muted-foreground">Admin scope</span>
      </div>
    );
  }

  function toggleApp(appId: string, checked: boolean) {
    const next = new Set(selectedSet);
    if (checked) {
      next.add(appId);
    } else {
      next.delete(appId);
    }
    onSelectionChange(Array.from(next));
  }

  function selectVisible() {
    const next = new Set(selectedSet);
    for (const app of pagedApps) next.add(app.id);
    onSelectionChange(Array.from(next));
  }

  const pickerContent = (
    <>
      <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <label className="relative block">
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
            placeholder="Search apps..."
          />
        </label>
        <Button type="button" variant="outline" size="sm" onClick={selectVisible}>
          Select visible
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onSelectionChange([])}
        >
          Clear
        </Button>
      </div>

      <Tabs
        value={platform}
        onValueChange={(value) => {
          setPlatform(value as AppPlatformTab);
          setPage(1);
        }}
      >
        <TabsList className="grid w-full grid-cols-2 sm:w-72">
          <TabsTrigger value="android">
            Android
            <span className="rounded bg-background/80 px-1.5 py-0.5 text-[11px] tabular-nums">
              {platformCounts.android}
            </span>
          </TabsTrigger>
          <TabsTrigger value="ios">
            iOS
            <span className="rounded bg-background/80 px-1.5 py-0.5 text-[11px] tabular-nums">
              {platformCounts.ios}
            </span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <div className={display === "inline" ? "min-h-0 flex-1 overflow-hidden rounded-lg border" : "overflow-hidden rounded-lg border"}>
        <div className={display === "inline" ? "h-full overflow-y-auto" : "max-h-[56svh] overflow-y-auto"}>
          {pagedApps.map((app) => {
            const checked = selectedSet.has(app.id);
            return (
              <label
                key={app.id}
                className="grid min-h-16 cursor-pointer grid-cols-[auto_auto_1fr_auto] items-center gap-3 border-b px-3 py-2 last:border-b-0 hover:bg-muted/40"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) => toggleApp(app.id, value === true)}
                />
                <AppIcon app={app} />
                <span className="min-w-0">
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {appOptionLabel(app)}
                    </span>
                    <AppLink app={app} />
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-xs text-muted-foreground">
                    {appOptionIdentifier(app)}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {app.store_account_name}
                  </span>
                </span>
                <Badge variant="outline" className={cn("capitalize", appPlatformBadgeClass(app.platform))}>
                  {app.platform}
                </Badge>
              </label>
            );
          })}
          {!pagedApps.length ? (
            <div className="px-3 py-10 text-center text-sm text-muted-foreground">
              No apps found.
            </div>
          ) : null}
        </div>
        <TablePaginationFooter
          from={pageFrom}
          onPageChange={setPage}
          page={currentPage}
          shown={pagedApps.length}
          to={pageTo}
          total={visibleApps.length}
          totalPages={totalPages}
        />
      </div>
    </>
  );

  if (display === "inline") {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3 rounded-lg border bg-background p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-sm font-medium">Managed apps</div>
            <div className="mt-1 text-sm text-muted-foreground">
              {selectedAppIds.length} app selected
            </div>
          </div>
          {selectedApps.length ? (
            <Badge variant="secondary">{selectedApps.length}</Badge>
          ) : null}
        </div>
        {pickerContent}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border bg-background p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium">Managed apps</div>
            <div className="mt-1 flex flex-wrap gap-1">
              {selectedApps.slice(0, 4).map((app) => (
                <Badge key={app.id} variant="secondary" className="max-w-36 truncate">
                  {appOptionLabel(app)}
                </Badge>
              ))}
              {selectedApps.length > 4 ? (
                <Badge variant="outline">+{selectedApps.length - 4}</Badge>
              ) : null}
              {!selectedApps.length ? (
                <span className="text-sm text-muted-foreground">No apps selected</span>
              ) : null}
            </div>
          </div>
          <DialogTrigger asChild>
            <Button type="button" variant="outline">
              Assign apps
            </Button>
          </DialogTrigger>
        </div>
      </div>

      <DialogContent className="max-h-[90svh] overflow-hidden p-0 sm:max-w-4xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>Assign apps</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {pickerContent}

          <div className="flex items-center justify-between gap-3 border-t pt-4">
            <div className="text-sm text-muted-foreground">
              {selectedAppIds.length} app selected
            </div>
            <Button type="button" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

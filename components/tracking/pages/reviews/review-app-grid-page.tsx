"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  ChevronsUpDown,
  Link2,
  MessageSquareText,
  Search,
  Smartphone,
  Star,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  PageHeader,
  StatusBadge,
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import { cn } from "@/lib/utils";
import type {
  PaginationMeta,
  ReviewAppCard,
  ReviewAppGridPageData,
} from "@/lib/tracking/page-data";
import { compactNumber, dateTime } from "@/lib/tracking/format";
import { showToast } from "@/lib/client/toast";

function ratingLabel(value: number | null) {
  return value ? value.toFixed(1) : "N/A";
}

type ReviewAppListResponse = {
  data?: ReviewAppCard[];
  error?: string;
  filters?: ReviewAppGridPageData["filters"];
  page?: number;
  pageSize?: number;
  storeOptions?: ReviewAppGridPageData["storeOptions"];
  success?: boolean;
  total?: number;
  totalPages?: number;
};

function platformBadgeClass(platform: ReviewAppCard["platform"]) {
  return platform === "ios"
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function platformLabel(platform: ReviewAppCard["platform"]) {
  return platform === "ios" ? "iOS" : "Android";
}

export function ReviewAppGridPage({ data }: { data: ReviewAppGridPageData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [apps, setApps] = useState(data.apps);
  const [appPagination, setAppPagination] =
    useState<PaginationMeta>(data.appPagination);
  const [storeOptions, setStoreOptions] = useState(data.storeOptions);
  const [searchQuery, setSearchQuery] = useState(data.filters.search);
  const [selectedStore, setSelectedStore] = useState(
    data.filters.storeProfileId,
  );
  const [openStoreCombobox, setOpenStoreCombobox] = useState(false);
  const [loadingApps, setLoadingApps] = useState(false);
  const [pendingMappingId, setPendingMappingId] = useState<string | null>(null);

  const selectedStoreLabel =
    selectedStore === "all"
      ? "All Stores"
      : storeOptions.find((store) => store.id === selectedStore)?.name ??
        "All Stores";

  async function loadAppsPage(
    page: number,
    overrides?: {
      searchQuery?: string;
      selectedStore?: string;
    },
  ) {
    const nextSearch = overrides?.searchQuery ?? searchQuery;
    const nextStore = overrides?.selectedStore ?? selectedStore;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "12",
    });

    if (nextSearch.trim()) params.set("search", nextSearch.trim());
    if (nextStore !== "all") params.set("storeProfileId", nextStore);

    setLoadingApps(true);

    try {
      const response = await fetch(`/api/comments/apps?${params.toString()}`);
      const payload = (await response.json()) as ReviewAppListResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "Applications could not be loaded.");
      }

      setApps(payload.data);
      setAppPagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? 12,
        total: payload.total ?? payload.data.length,
        totalPages: payload.totalPages ?? 1,
      });
      if (payload.storeOptions) setStoreOptions(payload.storeOptions);
    } catch (error) {
      void showToast("error",
        error instanceof Error ? error.message : "Applications could not be loaded.",
      );
    } finally {
      setLoadingApps(false);
    }
  }

  function openAppDetail(app: ReviewAppCard) {
    setPendingMappingId(app.mappingId);
    startTransition(() => {
      router.push(`/comments/${app.mappingId}`);
    });
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <PageHeader
        eyebrow="App Stores"
        title="List Apps"
        description="Select an application to inspect comment sync, ratings and replies."
      />

      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search apps or packages..."
            className="pl-8"
            value={searchQuery}
            onChange={(event) => {
              const nextValue = event.target.value;
              setSearchQuery(nextValue);
              void loadAppsPage(1, { searchQuery: nextValue });
            }}
          />
        </div>

        <Popover open={openStoreCombobox} onOpenChange={setOpenStoreCombobox}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={openStoreCombobox}
              className="w-full justify-between sm:w-[250px]"
            >
              {selectedStoreLabel}
              <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[250px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search store..." />
              <CommandList>
                <CommandEmpty>No store found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="all"
                    onSelect={() => {
                      setSelectedStore("all");
                      setOpenStoreCombobox(false);
                      void loadAppsPage(1, { selectedStore: "all" });
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        selectedStore === "all"
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    All Stores
                  </CommandItem>
                  {storeOptions.map((store) => (
                    <CommandItem
                      key={store.id}
                      value={store.name}
                      onSelect={() => {
                        setSelectedStore(store.id);
                        setOpenStoreCombobox(false);
                        void loadAppsPage(1, { selectedStore: store.id });
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
                          selectedStore === store.id
                            ? "opacity-100"
                            : "opacity-0",
                        )}
                      />
                      {store.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {apps.map((app) => {
          const isPending = pendingMappingId === app.mappingId;

          return (
            <li key={app.mappingId}>
              <Card
                aria-busy={isPending}
                className={cn(
                  "relative h-full cursor-pointer rounded-lg transition-colors hover:bg-muted/50",
                  isPending &&
                    "pointer-events-none border-primary/50 bg-muted/30",
                )}
                onClick={() => openAppDetail(app)}
              >
                <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                  <Avatar className="size-11 rounded-lg border">
                    {app.appIconUrl ? (
                      <AvatarImage
                        src={app.appIconUrl}
                        alt={app.appName}
                        className="rounded-lg"
                      />
                    ) : null}
                    <AvatarFallback className="rounded-lg text-xs">
                      {app.appName.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <Badge
                    variant="outline"
                    className={cn("gap-1", platformBadgeClass(app.platform))}
                  >
                    <Smartphone size={12} />
                    {platformLabel(app.platform)}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CardTitle
                        className="line-clamp-1 flex-1 text-lg"
                        title={app.appName}
                      >
                        {app.appName}
                      </CardTitle>
                      {app.appLink ? (
                        <Button
                          variant="outline"
                          size="icon-sm"
                          asChild
                          onClick={(event) => event.stopPropagation()}
                        >
                          <a
                            href={app.appLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={app.appLink}
                          >
                            <Link2 size={14} />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {app.identifier}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="rounded-md border bg-muted/20 p-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MessageSquareText size={12} />
                        Comments
                      </div>
                      <div className="mt-1 font-semibold">
                        {compactNumber(app.reviewCount)}
                      </div>
                    </div>
                    <div className="rounded-md border bg-muted/20 p-2">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Star size={12} />
                        Rating
                      </div>
                      <div className="mt-1 font-semibold">
                        {ratingLabel(app.averageRating)}
                      </div>
                    </div>
                    <div className="rounded-md border bg-muted/20 p-2">
                      <div className="text-xs text-muted-foreground">Replies</div>
                      <div className="mt-1 font-semibold">
                        {compactNumber(app.repliedCount)}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <StatusBadge status={app.lastSyncStatus ?? "not_found"} />
                    <span className="truncate text-muted-foreground">
                      {dateTime(app.lastFetchedAt)}
                    </span>
                  </div>
                </CardContent>
                {isPending ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-[1px]">
                    <div className="flex size-10 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm">
                      <Spinner />
                    </div>
                  </div>
                ) : null}
              </Card>
            </li>
          );
        })}
        {!apps.length && loadingApps
          ? Array.from({ length: 8 }).map((_, index) => (
              <li key={`review-app-loading-${index}`}>
                <Card className="h-full rounded-lg">
                  <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-3">
                    <div className="size-11 animate-pulse rounded-lg bg-muted" />
                    <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
                      <div className="h-3 w-1/2 animate-pulse rounded bg-muted/70" />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="h-14 animate-pulse rounded-md bg-muted/70" />
                      <div className="h-14 animate-pulse rounded-md bg-muted/70" />
                      <div className="h-14 animate-pulse rounded-md bg-muted/70" />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))
          : null}
        {!apps.length && !loadingApps ? (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            No applications found.
          </div>
        ) : null}
      </ul>
      <TablePaginationFooter
        onPageChange={(page) => void loadAppsPage(page)}
        page={appPagination.page}
        shown={apps.length}
        total={appPagination.total}
        totalPages={appPagination.totalPages}
      />
    </div>
  );
}

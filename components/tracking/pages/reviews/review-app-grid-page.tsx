"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Apple,
  Check,
  ChevronsUpDown,
  Link2,
  Search,
  Smartphone,
  Star,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useDebouncedCallback } from "@/lib/hooks/use-debounced-callback";

const REVIEW_APP_SKELETON_COUNT = 12;

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

type PlatformFilter = ReviewAppGridPageData["filters"]["platform"];

function platformBadgeClass(platform: ReviewAppCard["platform"]) {
  return platform === "ios"
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function platformLabel(platform: ReviewAppCard["platform"]) {
  return platform === "ios" ? "iOS" : "Android";
}

function PlatformBadge({ platform }: { platform: ReviewAppCard["platform"] }) {
  const Icon = platform === "ios" ? Apple : Smartphone;

  return (
    <Badge
      variant="outline"
      className={cn("gap-1.5", platformBadgeClass(platform))}
    >
      <Icon size={14} />
      {platformLabel(platform)}
    </Badge>
  );
}

export function ReviewAppGridPage({ data }: { data: ReviewAppGridPageData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [apps, setApps] = useState(data.apps);
  const [appPagination, setAppPagination] =
    useState<PaginationMeta>(data.appPagination);
  const [storeOptions, setStoreOptions] = useState(data.storeOptions);
  const [searchQuery, setSearchQuery] = useState(data.filters.search);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformFilter>(
    data.filters.platform,
  );
  const [selectedStore, setSelectedStore] = useState(
    data.filters.storeProfileId,
  );
  const [openStoreCombobox, setOpenStoreCombobox] = useState(false);
  const [loadingApps, setLoadingApps] = useState(false);
  const [loadingPage, setLoadingPage] = useState<number | null>(null);
  const [pendingMappingId, setPendingMappingId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedCallback((value: string) => {
    void loadAppsPage(1, { searchQuery: value });
  }, 500);

  const selectedStoreLabel =
    selectedStore === "all"
      ? "All Stores"
      : storeOptions.find((store) => store.id === selectedStore)?.name ??
        "All Stores";

  async function loadAppsPage(
    page: number,
    overrides?: {
      selectedPlatform?: PlatformFilter;
      searchQuery?: string;
      selectedStore?: string;
    },
  ) {
    const nextPlatform = overrides?.selectedPlatform ?? selectedPlatform;
    const nextSearch = overrides?.searchQuery ?? searchQuery;
    const nextStore = overrides?.selectedStore ?? selectedStore;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "12",
    });

    if (nextPlatform !== "all") params.set("platform", nextPlatform);
    if (nextSearch.trim()) params.set("search", nextSearch.trim());
    if (nextStore !== "all") params.set("storeProfileId", nextStore);

    setLoadingApps(true);
    setLoadingPage(page);

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
      setLoadingPage(null);
    }
  }

  function updateSelectedPlatform(value: string) {
    const nextPlatform: PlatformFilter =
      value === "android" || value === "ios" ? value : "all";
    setSelectedPlatform(nextPlatform);
    setSelectedStore("all");
    void loadAppsPage(1, {
      selectedPlatform: nextPlatform,
      selectedStore: "all",
    });
  }

  function openAppDetail(app: ReviewAppCard) {
    setPendingMappingId(app.mappingId);
    startTransition(() => {
      router.push(`/comments/${app.mappingId}`);
    });
  }

  function prefetchAppDetail(app: ReviewAppCard) {
    router.prefetch(`/comments/${app.mappingId}`);
  }

  const tableStartIndex = (appPagination.page - 1) * appPagination.pageSize;

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
              debouncedSearch(nextValue);
            }}
          />
        </div>

        <Select value={selectedPlatform} onValueChange={updateSelectedPlatform}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="All platforms" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Platforms</SelectItem>
            <SelectItem value="android">Android</SelectItem>
            <SelectItem value="ios">iOS</SelectItem>
          </SelectContent>
        </Select>

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

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table className="min-w-[76rem]">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>App</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead>Rating</TableHead>
                <TableHead>Replies</TableHead>
                <TableHead>Last Sync</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingApps
                ? Array.from({ length: REVIEW_APP_SKELETON_COUNT }).map(
                    (_, index) => (
                      <TableRow key={`review-app-skeleton-${index}`}>
                        <TableCell>
                          <div className="flex animate-pulse items-center gap-3">
                            <div className="size-10 rounded-lg bg-muted" />
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="h-4 w-48 max-w-full rounded bg-muted" />
                              <div className="h-3 w-64 max-w-full rounded bg-muted/70" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-12 animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-12 animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-12 animate-pulse rounded bg-muted" />
                        </TableCell>
                        <TableCell>
                          <div className="h-6 w-36 animate-pulse rounded-full bg-muted" />
                        </TableCell>
                      </TableRow>
                    ),
                  )
                : apps.map((app) => {
                    const isPending = pendingMappingId === app.mappingId;

                    return (
                      <TableRow
                        key={app.mappingId}
                        aria-busy={isPending}
                        role="link"
                        tabIndex={0}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                          isPending && "pointer-events-none bg-muted/30",
                        )}
                        onClick={() => openAppDetail(app)}
                        onFocus={() => prefetchAppDetail(app)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openAppDetail(app);
                          }
                        }}
                        onMouseEnter={() => prefetchAppDetail(app)}
                      >
                        <TableCell>
                          <div className="flex min-w-[18rem] items-center gap-3">
                            <Avatar className="size-10 rounded-lg border">
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
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className="truncate font-medium text-foreground"
                                  title={app.appName}
                                >
                                  {app.appName}
                                </span>
                                {isPending ? <Spinner /> : null}
                                {app.appLink ? (
                                  <Button
                                    asChild
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    className="size-7 shrink-0"
                                  >
                                    <a
                                      href={app.appLink}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      title={app.appLink}
                                      onClick={(event) => event.stopPropagation()}
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
                          </div>
                        </TableCell>
                        <TableCell>
                          <PlatformBadge platform={app.platform} />
                        </TableCell>
                        <TableCell>
                          <div className="max-w-[14rem] truncate text-sm">
                            {app.storeAccountName}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {compactNumber(app.reviewCount)}
                        </TableCell>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-1.5">
                            <Star className="size-4 fill-amber-400 text-amber-400" />
                            <span>{ratingLabel(app.averageRating)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">
                          {compactNumber(app.repliedCount)}
                        </TableCell>
                        <TableCell>
                          <div className="flex min-w-[11rem] flex-col gap-1.5">
                            <StatusBadge status={app.lastSyncStatus ?? "not_found"} />
                            <span className="text-xs text-muted-foreground">
                              {dateTime(app.lastFetchedAt)}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
              {!loadingApps && apps.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No applications found.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </div>
      <TablePaginationFooter
        from={tableStartIndex + 1}
        loadingPage={loadingPage}
        onPageChange={(page) => void loadAppsPage(page)}
        page={appPagination.page}
        shown={apps.length}
        to={tableStartIndex + apps.length}
        total={appPagination.total}
        totalPages={appPagination.totalPages}
      />
    </div>
  );
}

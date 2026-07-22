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
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { PageHeader, TablePaginationFooter } from "@/components/tracking/primitives";
import { cn } from "@/lib/utils";
import type { IapAppCard, IapAppGridPageData } from "@/lib/tracking/page-data";
import { showToast } from "@/lib/client/toast";
import { compactNumber, microsToMoney } from "@/lib/tracking/format";
import { useDebouncedCallback } from "@/lib/hooks/use-debounced-callback";

const IAP_APP_SKELETON_COUNT = 12;

type IapAppListResponse = {
  success?: boolean;
  data?: IapAppCard[];
  error?: string;
  page?: number;
  pageSize?: number;
  storeNames?: string[];
  total?: number;
  totalPages?: number;
};

type PlatformFilter = IapAppGridPageData["filters"]["platform"];

function PlatformBadge({ platform }: { platform: IapAppCard["platform"] }) {
  return platform === "ios" ? (
    <Badge
      variant="outline"
      className="gap-1.5 border-zinc-200 bg-zinc-50 text-zinc-700"
    >
      <Apple size={14} />
      iOS
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="gap-1.5 border-emerald-200 bg-emerald-50 text-emerald-700"
    >
      <Smartphone size={14} />
      Android
    </Badge>
  );
}

function formatTransactionCount(value: number | null | undefined) {
  return typeof value === "number" ? compactNumber(value) : "—";
}

function formatRevenue(app: IapAppCard) {
  if (app.revenueMicros === null || app.revenueMicros === undefined) {
    return "—";
  }

  return microsToMoney(app.revenueMicros, app.revenueCurrency ?? "USD");
}

export function IapAppGridPage({ data }: { data: IapAppGridPageData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [apps, setApps] = useState(data.apps);
  const [pagination, setPagination] = useState(data.appPagination);
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformFilter>(
    data.filters.platform,
  );
  const [searchQuery, setSearchQuery] = useState(data.filters.search);
  const [selectedStore, setSelectedStore] = useState<string>(
    data.filters.storeAccountName || "All Stores",
  );
  const [storeNames, setStoreNames] = useState(data.storeNames);
  const [loading, setLoading] = useState(false);
  const [loadingPage, setLoadingPage] = useState<number | null>(null);
  const [openStoreCombobox, setOpenStoreCombobox] = useState(false);
  const [pendingMappingId, setPendingMappingId] = useState<string | null>(null);

  const debouncedSearch = useDebouncedCallback((value: string) => {
    void loadAppsPage(1, { searchQuery: value });
  }, 500);

  async function loadAppsPage(
    page: number,
    overrides?: {
      searchQuery?: string;
      selectedPlatform?: PlatformFilter;
      selectedStore?: string;
    },
  ) {
    const nextSelectedPlatform =
      overrides?.selectedPlatform ?? selectedPlatform;
    const nextSearchQuery = overrides?.searchQuery ?? searchQuery;
    const nextSelectedStore = overrides?.selectedStore ?? selectedStore;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "12",
    });
    const search = nextSearchQuery.trim();

    if (nextSelectedPlatform !== "all") {
      params.set("platform", nextSelectedPlatform);
    }
    if (search) params.set("search", search);
    if (nextSelectedStore !== "All Stores") {
      params.set("store", nextSelectedStore);
    }

    setLoading(true);
    setLoadingPage(page);

    try {
      const response = await fetch(`/api/admin/iap/apps?${params.toString()}`);
      const payload = (await response.json()) as IapAppListResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "Load IAP apps failed.");
      }

      setApps(payload.data);
      setPagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? 12,
        total: payload.total ?? payload.data.length,
        totalPages: payload.totalPages ?? 1,
      });
      if (payload.storeNames) setStoreNames(payload.storeNames);
    } catch (error) {
      void showToast("error", error instanceof Error ? error.message : "Load IAP apps failed.");
    } finally {
      setLoading(false);
      setLoadingPage(null);
    }
  }

  function updateSearchQuery(nextValue: string) {
    setSearchQuery(nextValue);
    debouncedSearch(nextValue);
  }

  function updateSelectedPlatform(value: string) {
    const nextValue: PlatformFilter =
      value === "android" || value === "ios" ? value : "all";
    setSelectedPlatform(nextValue);
    setSelectedStore("All Stores");
    void loadAppsPage(1, {
      selectedPlatform: nextValue,
      selectedStore: "All Stores",
    });
  }

  function updateSelectedStore(nextValue: string) {
    setSelectedStore(nextValue);
    setOpenStoreCombobox(false);
    void loadAppsPage(1, { selectedStore: nextValue });
  }

  function openAppDetail(app: IapAppCard) {
    setPendingMappingId(app.mappingId);
    startTransition(() => {
      router.push(`/iap/${app.mappingId}?platform=${app.platform}`);
    });
  }

  function prefetchAppDetail(app: IapAppCard) {
    router.prefetch(`/iap/${app.mappingId}?platform=${app.platform}`);
  }

  const tableStartIndex = (pagination.page - 1) * pagination.pageSize;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <PageHeader
        eyebrow=""
        title="In-App Purchases"
        description="Select an application to view its transaction details."
      />

      {/* Filters Row */}
      <div className="flex flex-col sm:flex-row items-center gap-4">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search applications..."
            className="pl-8"
            value={searchQuery}
            onChange={(e) => updateSearchQuery(e.target.value)}
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
              className="w-full sm:w-[250px] justify-between"
            >
              {selectedStore}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[250px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search store..." />
              <CommandList>
                <CommandEmpty>No store found.</CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="All Stores"
                    onSelect={() => updateSelectedStore("All Stores")}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        selectedStore === "All Stores"
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    All Stores
                  </CommandItem>
                  {storeNames.map((store) => (
                    <CommandItem
                      key={store}
                      value={store}
                      onSelect={(currentValue) =>
                        updateSelectedStore(currentValue)
                      }
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          selectedStore === store ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {store}
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
          <Table className="min-w-[68rem]">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>App</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Store</TableHead>
                <TableHead>Transactions</TableHead>
                <TableHead>Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: IAP_APP_SKELETON_COUNT }).map((_, index) => (
                    <TableRow key={`iap-app-skeleton-${index}`}>
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
                        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
                      </TableCell>
                      <TableCell>
                        <div className="h-4 w-20 animate-pulse rounded bg-muted" />
                      </TableCell>
                    </TableRow>
                  ))
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
                          {formatTransactionCount(app.transactionCount)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatRevenue(app)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              {!loading && apps.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No applications found matching your criteria.
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
        page={pagination.page}
        shown={apps.length}
        to={tableStartIndex + apps.length}
        total={pagination.total}
        totalPages={pagination.totalPages}
      />
    </div>
  );
}

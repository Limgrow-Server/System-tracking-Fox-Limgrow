"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Apple,
  ExternalLink,
  Search,
  Smartphone,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
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
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import { compactNumber, dateTime } from "@/lib/tracking/format";
import { cn } from "@/lib/utils";
import type {
  PaginationMeta,
  ReplyStoreListPageData,
  ReplyStoreSummary,
} from "@/lib/tracking/page-data";
import { showToast } from "@/lib/client/toast";
import { useDebouncedCallback } from "@/lib/hooks/use-debounced-callback";

const REPLY_STORE_SKELETON_COUNT = 10;

function platformBadgeClass(platform: ReplyStoreSummary["platform"]) {
  return platform === "ios"
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function platformLabel(platform: ReplyStoreSummary["platform"]) {
  return platform === "ios" ? "iOS" : "Android";
}

function PlatformBadge({ platform }: { platform: ReplyStoreSummary["platform"] }) {
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

function ContactBadges({ store }: { store: ReplyStoreSummary }) {
  const contacts = [
    store.contactEmail ? { label: "Email", value: store.contactEmail } : null,
    store.supportPhone ? { label: "Phone", value: store.supportPhone } : null,
    store.websiteUrl ? { label: "Web", value: store.websiteUrl } : null,
  ].filter((item): item is { label: string; value: string } => Boolean(item));

  if (!contacts.length) {
    return (
      <Badge
        variant="outline"
        className="border-slate-200 bg-slate-50 text-slate-600"
      >
        Missing contact
      </Badge>
    );
  }

  return (
    <div className="flex max-w-[15rem] flex-wrap gap-1.5">
      {contacts.map((contact) => (
        <Badge
          key={contact.label}
          variant="outline"
          title={contact.value}
          className="border-slate-200 bg-slate-50 text-slate-700"
        >
          {contact.label}
        </Badge>
      ))}
    </div>
  );
}

type ReplyStoresResponse = {
  data?: ReplyStoreSummary[];
  error?: string;
  page?: number;
  pageSize?: number;
  success?: boolean;
  total?: number;
  totalPages?: number;
};

export function ReplyStoreListPage({ data }: { data: ReplyStoreListPageData }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [stores, setStores] = useState(data.stores);
  const [storePagination, setStorePagination] =
    useState<PaginationMeta>(data.storePagination);
  const [search, setSearch] = useState(data.filters.search);
  const [loadingStores, setLoadingStores] = useState(false);
  const [loadingPage, setLoadingPage] = useState<number | null>(null);
  const [pendingStoreProfileId, setPendingStoreProfileId] = useState<
    string | null
  >(null);

  const debouncedSearch = useDebouncedCallback((value: string) => {
    void loadStoresPage(1, value);
  }, 500);

  async function loadStoresPage(page: number, nextSearch = search) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "10",
    });

    if (nextSearch.trim()) params.set("search", nextSearch.trim());

    setLoadingStores(true);
    setLoadingPage(page);

    try {
      const response = await fetch(`/api/reply/stores?${params.toString()}`);
      const payload = (await response.json()) as ReplyStoresResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "Reply stores could not be loaded.");
      }

      setStores(payload.data);
      setStorePagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? 10,
        total: payload.total ?? payload.data.length,
        totalPages: payload.totalPages ?? 1,
      });
    } catch (error) {
      void showToast("error",
        error instanceof Error ? error.message : "Reply stores could not be loaded.",
      );
    } finally {
      setLoadingStores(false);
      setLoadingPage(null);
    }
  }

  function openStoreConfig(store: ReplyStoreSummary) {
    setPendingStoreProfileId(store.storeProfileId);
    startTransition(() => {
      router.push(`/reply/${store.storeProfileId}`);
    });
  }

  function prefetchStoreConfig(store: ReplyStoreSummary) {
    router.prefetch(`/reply/${store.storeProfileId}`);
  }

  const tableStartIndex = (storePagination.page - 1) * storePagination.pageSize;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="App Stores"
        title="Reply Stores"
        description="Select a store to configure shared reply settings and app templates."
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 className="font-heading text-lg font-semibold">Stores</h2>
        <div className="relative w-full md:max-w-sm">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            type="search"
            value={search}
            className="pl-8"
            placeholder="Search stores or apps..."
            onChange={(event) => {
              const nextValue = event.target.value;
              setSearch(nextValue);
              debouncedSearch(nextValue);
            }}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table className="min-w-[74rem]">
            <TableHeader className="bg-muted/40">
              <TableRow>
                <TableHead>Store</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Apps</TableHead>
                <TableHead>Comments</TableHead>
                <TableHead>Pending Replies</TableHead>
                <TableHead>Contact Info</TableHead>
                <TableHead>Last Fetch</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingStores
                ? Array.from({ length: REPLY_STORE_SKELETON_COUNT }).map(
                    (_, index) => (
                      <TableRow key={`reply-store-skeleton-${index}`}>
                        <TableCell>
                          <div className="flex animate-pulse items-center gap-3">
                            <div className="size-10 rounded-lg bg-muted" />
                            <div className="min-w-0 flex-1 space-y-2">
                              <div className="h-4 w-48 max-w-full rounded bg-muted" />
                              <div className="h-3 w-36 max-w-full rounded bg-muted/70" />
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="h-6 w-20 animate-pulse rounded-full bg-muted" />
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
                          <div className="h-6 w-40 animate-pulse rounded-full bg-muted" />
                        </TableCell>
                        <TableCell>
                          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                        </TableCell>
                      </TableRow>
                    ),
                  )
                : stores.map((store) => {
                    const isPending =
                      pendingStoreProfileId === store.storeProfileId;

                    return (
                      <TableRow
                        key={store.storeProfileId}
                        aria-busy={isPending}
                        role="link"
                        tabIndex={0}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-none",
                          isPending && "pointer-events-none bg-muted/30",
                        )}
                        onClick={() => openStoreConfig(store)}
                        onFocus={() => prefetchStoreConfig(store)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openStoreConfig(store);
                          }
                        }}
                        onMouseEnter={() => prefetchStoreConfig(store)}
                      >
                        <TableCell>
                          <div className="flex min-w-[18rem] items-center gap-3">
                            <Avatar className="size-10 rounded-lg border">
                              {store.storeAvatarUrl ? (
                                <AvatarImage
                                  src={store.storeAvatarUrl}
                                  alt={store.storeAccountName}
                                  className="rounded-lg"
                                />
                              ) : null}
                              <AvatarFallback className="rounded-lg text-xs">
                                {store.storeAccountName.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="min-w-0">
                              <div className="flex min-w-0 items-center gap-2">
                                <span
                                  className="truncate font-medium text-foreground"
                                  title={store.storeAccountName}
                                >
                                  {store.storeAccountName}
                                </span>
                                {isPending ? <Spinner /> : null}
                                {store.storeLink ? (
                                  <Button
                                    asChild
                                    type="button"
                                    variant="outline"
                                    size="icon-sm"
                                    className="size-7 shrink-0"
                                  >
                                    <a
                                      href={store.storeLink}
                                      target="_blank"
                                      rel="noreferrer"
                                      title={store.storeLink}
                                      aria-label={`Open store link for ${store.storeAccountName}`}
                                      onClick={(event) => event.stopPropagation()}
                                    >
                                      <ExternalLink size={14} />
                                    </a>
                                  </Button>
                                ) : null}
                              </div>
                              <div className="mt-1 text-xs text-muted-foreground">
                                {compactNumber(store.appCount)} apps
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <PlatformBadge platform={store.platform} />
                        </TableCell>
                        <TableCell className="font-medium">
                          {compactNumber(store.appCount)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {compactNumber(store.reviewCount)}
                        </TableCell>
                        <TableCell className="font-medium">
                          {compactNumber(store.pendingReplyCount)}
                        </TableCell>
                        <TableCell>
                          <ContactBadges store={store} />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {dateTime(store.lastFetchedAt)}
                        </TableCell>
                      </TableRow>
                    );
                  })}
              {!loadingStores && stores.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={7}
                    className="py-12 text-center text-muted-foreground"
                  >
                    No stores found.
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
        onPageChange={(page) => void loadStoresPage(page)}
        page={storePagination.page}
        shown={stores.length}
        to={tableStartIndex + stores.length}
        total={storePagination.total}
        totalPages={storePagination.totalPages}
      />
    </div>
  );
}

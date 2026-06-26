"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  ExternalLink,
  Search,
  Smartphone,
} from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  EmptyPanel,
  PageHeader,
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import { compactNumber } from "@/lib/tracking/format";
import { cn } from "@/lib/utils";
import type {
  PaginationMeta,
  ReplyStoreListPageData,
  ReplyStoreSummary,
} from "@/lib/tracking/page-data";
import { showToast } from "@/lib/client/toast";

function StoreCard({
  isPending,
  onOpen,
  store,
}: {
  isPending: boolean;
  onOpen: () => void;
  store: ReplyStoreSummary;
}) {
  return (
    <Card
      aria-busy={isPending}
      className={cn(
        "relative h-full cursor-pointer gap-0 rounded-lg py-0 transition hover:bg-muted/40",
        isPending && "pointer-events-none border-primary/50 bg-muted/30",
      )}
      onClick={onOpen}
    >
      <CardHeader className="flex items-center justify-between gap-4 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar className="size-12 rounded-xl border">
            {store.storeAvatarUrl ? (
              <AvatarImage
                src={store.storeAvatarUrl}
                alt={store.storeAccountName}
                className="rounded-xl"
              />
            ) : null}
            <AvatarFallback className="rounded-xl text-sm font-medium">
              {store.storeAccountName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <CardTitle className="truncate text-lg">
              {store.storeAccountName}
            </CardTitle>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge
                variant="outline"
                className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                <Smartphone size={11} />
                Android
              </Badge>
              <span>{compactNumber(store.appCount)} apps</span>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {store.storeLink ? (
            <Button
              type="button"
              variant="outline"
              size="icon"
              asChild
              onClick={(event) => event.stopPropagation()}
            >
              <a
                href={store.storeLink}
                target="_blank"
                rel="noreferrer"
                title={store.storeLink}
                aria-label={`Open store link for ${store.storeAccountName}`}
              >
                <ExternalLink size={15} />
              </a>
            </Button>
          ) : null}
          <div className="flex size-10 items-center justify-center rounded-xl border bg-background">
            <ChevronRight size={17} />
          </div>
        </div>
      </CardHeader>
      {isPending ? (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-background/80 backdrop-blur-[1px]">
          <div className="flex size-10 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm">
            <Spinner />
          </div>
        </div>
      ) : null}
    </Card>
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
  const [pendingStoreProfileId, setPendingStoreProfileId] = useState<
    string | null
  >(null);

  async function loadStoresPage(page: number, nextSearch = search) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "10",
    });

    if (nextSearch.trim()) params.set("search", nextSearch.trim());

    setLoadingStores(true);

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
    }
  }

  function openStoreConfig(store: ReplyStoreSummary) {
    setPendingStoreProfileId(store.storeProfileId);
    startTransition(() => {
      router.push(`/reply/${store.storeProfileId}`);
    });
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Google Play"
        title="Reply Stores"
        description="Select a store to configure shared reply settings and app templates."
        action={
          <Badge
            variant="outline"
            className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
          >
            <Smartphone size={12} />
            Android
          </Badge>
        }
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
              void loadStoresPage(1, nextValue);
            }}
          />
        </div>
      </div>

      {stores.length ? (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {stores.map((store) => (
            <StoreCard
              key={store.storeProfileId}
              isPending={pendingStoreProfileId === store.storeProfileId}
              onOpen={() => openStoreConfig(store)}
              store={store}
            />
          ))}
        </div>
      ) : (
        <EmptyPanel
          icon={Search}
          title={loadingStores ? "Loading stores" : "No stores found"}
          description={
            loadingStores
              ? "The current page is being loaded."
              : "No Android store matches the current search."
          }
          className="rounded-lg border"
        />
      )}
      <TablePaginationFooter
        onPageChange={(page) => void loadStoresPage(page)}
        page={storePagination.page}
        shown={stores.length}
        total={storePagination.total}
        totalPages={storePagination.totalPages}
      />
    </div>
  );
}

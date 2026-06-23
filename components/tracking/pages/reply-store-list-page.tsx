"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  Search,
  Smartphone,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  EmptyPanel,
  PageHeader,
  StatusBadge,
} from "@/components/tracking/primitives";
import { compactNumber, dateTime } from "@/lib/tracking/format";
import type {
  ReplyStoreListPageData,
  ReplyStoreSummary,
} from "@/lib/tracking/page-data";

function StoreCard({ store }: { store: ReplyStoreSummary }) {
  const previewApps = store.apps.slice(0, 3);

  return (
    <Link href={`/reply/${store.storeProfileId}`} className="block h-full">
      <Card className="h-full rounded-lg transition hover:bg-muted/40">
        <CardHeader className="gap-3 border-b">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="truncate text-base">
                {store.storeAccountName}
              </CardTitle>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge variant="outline" className="gap-1">
                  <Smartphone size={11} />
                  Android
                </Badge>
                <span>{compactNumber(store.appCount)} apps</span>
              </div>
            </div>
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background">
              <ChevronRight size={16} />
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 p-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border bg-background px-2 py-3">
              <div className="text-lg font-semibold">
                {compactNumber(store.reviewCount)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Reviews
              </div>
            </div>
            <div className="rounded-lg border bg-background px-2 py-3">
              <div className="text-lg font-semibold">
                {compactNumber(store.pendingReplyCount)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Pending
              </div>
            </div>
            <div className="rounded-lg border bg-background px-2 py-3">
              <div className="text-lg font-semibold">
                {compactNumber(store.activeTemplateCount)}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                Active
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {previewApps.map((app) => (
              <div
                key={app.mappingId}
                className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">
                    {app.appName}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {app.identifier}
                  </div>
                </div>
                <StatusBadge status={app.lastSyncStatus ?? "not_found"} />
              </div>
            ))}
            {store.apps.length > previewApps.length ? (
              <div className="text-xs text-muted-foreground">
                +{store.apps.length - previewApps.length} more apps
              </div>
            ) : null}
          </div>

          <div className="border-t pt-3 text-xs text-muted-foreground">
            Last fetch {dateTime(store.lastFetchedAt)}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function ReplyStoreListPage({ data }: { data: ReplyStoreListPageData }) {
  const [search, setSearch] = useState("");
  const filteredStores = useMemo(() => {
    const query = search.toLowerCase();

    return data.stores.filter(
      (store) =>
        !query ||
        store.storeAccountName.toLowerCase().includes(query) ||
        store.apps.some(
          (app) =>
            app.appName.toLowerCase().includes(query) ||
            app.identifier.toLowerCase().includes(query),
        ),
    );
  }, [data.stores, search]);

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
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      {filteredStores.length ? (
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filteredStores.map((store) => (
            <StoreCard key={store.storeProfileId} store={store} />
          ))}
        </div>
      ) : (
        <EmptyPanel
          icon={Search}
          title="No stores found"
          description="No Android store matches the current search."
          className="rounded-lg border"
        />
      )}
    </div>
  );
}

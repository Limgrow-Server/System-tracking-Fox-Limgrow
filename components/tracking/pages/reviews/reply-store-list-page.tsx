"use client";

import { useMemo, useState } from "react";
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
import {
  EmptyPanel,
  PageHeader,
} from "@/components/tracking/primitives";
import { compactNumber } from "@/lib/tracking/format";
import type {
  ReplyStoreListPageData,
  ReplyStoreSummary,
} from "@/lib/tracking/page-data";

function StoreCard({ store }: { store: ReplyStoreSummary }) {
  const router = useRouter();

  return (
    <Card
      className="h-full cursor-pointer gap-0 rounded-lg py-0 transition hover:bg-muted/40"
      onClick={() => router.push(`/reply/${store.storeProfileId}`)}
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
    </Card>
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

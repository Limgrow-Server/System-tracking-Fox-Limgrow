"use client";

import { useMemo, useState } from "react";
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
import { StatusBadge, PageHeader } from "@/components/tracking/primitives";
import { cn } from "@/lib/utils";
import type { ReviewAppGridPageData } from "@/lib/tracking/page-data";
import { compactNumber, dateTime } from "@/lib/tracking/format";

function ratingLabel(value: number | null) {
  return value ? value.toFixed(1) : "N/A";
}

export function ReviewAppGridPage({ data }: { data: ReviewAppGridPageData }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStore, setSelectedStore] = useState("All Stores");
  const [openStoreCombobox, setOpenStoreCombobox] = useState(false);

  const filteredApps = useMemo(() => {
    return data.apps.filter((app) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        app.appName.toLowerCase().includes(query) ||
        app.identifier.toLowerCase().includes(query);
      const matchesStore =
        selectedStore === "All Stores" ||
        app.storeAccountName === selectedStore;

      return matchesSearch && matchesStore;
    });
  }, [data.apps, searchQuery, selectedStore]);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <PageHeader
        eyebrow="Google Play"
        title="Comments"
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
            onChange={(event) => setSearchQuery(event.target.value)}
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
              {selectedStore}
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
                    value="All Stores"
                    onSelect={() => {
                      setSelectedStore("All Stores");
                      setOpenStoreCombobox(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        selectedStore === "All Stores"
                          ? "opacity-100"
                          : "opacity-0",
                      )}
                    />
                    All Stores
                  </CommandItem>
                  {data.storeNames.map((store) => (
                    <CommandItem
                      key={store}
                      value={store}
                      onSelect={(currentValue) => {
                        setSelectedStore(currentValue);
                        setOpenStoreCombobox(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 size-4",
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

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredApps.map((app) => (
          <li key={app.mappingId}>
            <Card
              className="h-full cursor-pointer rounded-lg transition-colors hover:bg-muted/50"
              onClick={() => router.push(`/comments/${app.mappingId}`)}
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
                  className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
                >
                  <Smartphone size={12} />
                  Android
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
            </Card>
          </li>
        ))}
        {filteredApps.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            No applications found.
          </div>
        ) : null}
      </ul>
    </div>
  );
}

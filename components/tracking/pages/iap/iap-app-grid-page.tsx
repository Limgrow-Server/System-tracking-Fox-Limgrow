"use client";

import { useState } from "react";
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
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { Spinner } from "@/components/ui/spinner";
import { PageHeader, TablePaginationFooter } from "@/components/tracking/primitives";
import { cn } from "@/lib/utils";
import type { IapAppCard, IapAppGridPageData } from "@/lib/tracking/page-data";
import { toast } from "sonner";

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

export function IapAppGridPage({ data }: { data: IapAppGridPageData }) {
  const router = useRouter();
  const [apps, setApps] = useState(data.apps);
  const [pagination, setPagination] = useState(data.appPagination);
  const [searchQuery, setSearchQuery] = useState(data.filters.search);
  const [selectedStore, setSelectedStore] = useState<string>(
    data.filters.storeAccountName || "All Stores",
  );
  const [storeNames, setStoreNames] = useState(data.storeNames);
  const [loading, setLoading] = useState(false);
  const [openStoreCombobox, setOpenStoreCombobox] = useState(false);

  async function loadAppsPage(
    page: number,
    overrides?: { searchQuery?: string; selectedStore?: string },
  ) {
    const nextSearchQuery = overrides?.searchQuery ?? searchQuery;
    const nextSelectedStore = overrides?.selectedStore ?? selectedStore;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "12",
    });
    const search = nextSearchQuery.trim();

    if (search) params.set("search", search);
    if (nextSelectedStore !== "All Stores") {
      params.set("store", nextSelectedStore);
    }

    setLoading(true);

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
      toast.error(error instanceof Error ? error.message : "Load IAP apps failed.");
    } finally {
      setLoading(false);
    }
  }

  function updateSearchQuery(nextValue: string) {
    setSearchQuery(nextValue);
    void loadAppsPage(1, { searchQuery: nextValue });
  }

  function updateSelectedStore(nextValue: string) {
    setSelectedStore(nextValue);
    setOpenStoreCombobox(false);
    void loadAppsPage(1, { selectedStore: nextValue });
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
        {loading ? <Spinner className="size-4" /> : null}
      </div>

      {/* Grid Layout */}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {apps.map((app) => (
          <li key={app.mappingId}>
            <Card
              className="hover:bg-muted/50 transition-colors h-full cursor-pointer"
              onClick={() =>
                router.push(`/iap/${app.mappingId}?platform=${app.platform}`)
              }
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <Avatar className="h-10 w-10 border rounded-lg">
                  {app.appIconUrl ? (
                    <AvatarImage
                      src={app.appIconUrl}
                      alt={app.appName}
                      className="rounded-lg"
                    />
                  ) : null}
                  <AvatarFallback className="text-xs rounded-lg">
                    {app.appName.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  {app.platform === "ios" ? (
                    <Badge
                      variant="outline"
                      className="border-zinc-200 bg-zinc-50 text-zinc-700 gap-1.5 text-sm px-2.5 py-1"
                    >
                      <Apple size={16} />
                      iOS
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-emerald-200 bg-emerald-50 text-emerald-700 gap-1.5 text-sm px-2.5 py-1"
                    >
                      <Smartphone size={16} />
                      Android
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <CardTitle
                    className="text-lg line-clamp-1 flex-1"
                    title={app.appName}
                  >
                    {app.appName}
                  </CardTitle>
                  {app.appLink && (
                    <a
                      href={app.appLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={app.appLink}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        asChild
                      >
                        <span>
                          <Link2 size={16} />
                        </span>
                      </Button>
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          </li>
        ))}
        {apps.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            No applications found matching your criteria.
          </div>
        )}
      </ul>
      <TablePaginationFooter
        from={tableStartIndex + 1}
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

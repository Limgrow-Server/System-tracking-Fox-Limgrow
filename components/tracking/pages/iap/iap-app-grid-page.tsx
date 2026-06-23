"use client";

import { useMemo, useState } from "react";
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
import { PageHeader } from "@/components/tracking/primitives";
import { cn } from "@/lib/utils";
import type { IapAppGridPageData } from "@/lib/tracking/page-data";
import { PageHeader } from "../primitives";

export function IapAppGridPage({ data }: { data: IapAppGridPageData }) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStore, setSelectedStore] = useState<string>("All Stores");
  const [openStoreCombobox, setOpenStoreCombobox] = useState(false);

  const filteredApps = useMemo(() => {
    return data.apps.filter((app) => {
      const matchesSearch = app.appName
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      const matchesStore =
        selectedStore === "All Stores" ||
        app.storeAccountName === selectedStore;
      return matchesSearch && matchesStore;
    });
  }, [data.apps, searchQuery, selectedStore]);

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
            onChange={(e) => setSearchQuery(e.target.value)}
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
                    onSelect={() => {
                      setSelectedStore("All Stores");
                      setOpenStoreCombobox(false);
                    }}
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

      {/* Grid Layout */}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filteredApps.map((app) => (
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
        {filteredApps.length === 0 && (
          <div className="col-span-full py-12 text-center text-muted-foreground">
            No applications found matching your criteria.
          </div>
        )}
      </ul>
    </div>
  );
}

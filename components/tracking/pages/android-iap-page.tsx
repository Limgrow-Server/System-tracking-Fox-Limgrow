"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  Calendar,
  CreditCard,
  DollarSign,
  FileJson,
  Search,
  Smartphone,
  Sparkles,
  Store,
} from "lucide-react";

import { PageHeader, StatusBadge, TableEmptyState } from "@/components/tracking/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AndroidIapPageData } from "@/lib/tracking/page-data";

const pageSize = 10;

export function AndroidIapPage({ data }: { data: AndroidIapPageData }) {
  const { storeProfiles, transactions } = data;
  const [selectedStoreId, setSelectedStoreId] = useState("all");
  const [selectedAppPackage, setSelectedAppPackage] = useState("all");
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [kindFilter, setKindFilter] = useState<string>("all");
  const [testFilter, setTestFilter] = useState<string>("all");
  const [selectedReceipt, setSelectedReceipt] = useState<unknown | null>(null);
  const [page, setPage] = useState(1);

  // Overview filtering (Store & App level)
  const overviewTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      const matchesStore = selectedStoreId === "all" || tx.storeProfileId === selectedStoreId;
      const matchesApp = selectedAppPackage === "all" || tx.packageName === selectedAppPackage;
      return matchesStore && matchesApp;
    });
  }, [transactions, selectedStoreId, selectedAppPackage]);

  // Stats calculation
  const stats = useMemo(() => {
    let totalRevenueMicros = 0;
    let testCount = 0;
    let activeSubs = 0;
    let productSales = 0;

    overviewTransactions.forEach((tx) => {
      if (tx.isTestPurchase) {
        testCount++;
      } else if (tx.revenueMicros) {
        totalRevenueMicros += tx.revenueMicros;
      }

      if (tx.purchaseKind === "subscription" && tx.state === "active") {
        activeSubs++;
      }

      if (tx.purchaseKind === "product" && tx.state === "purchased") {
        productSales++;
      }
    });

    return {
      revenue: totalRevenueMicros / 1_000_000,
      testCount,
      activeSubs,
      productSales,
      totalCount: overviewTransactions.length,
    };
  }, [overviewTransactions]);

  // Table filtering
  const filteredTransactions = useMemo(() => {
    return overviewTransactions.filter((tx) => {
      // Search matches orderId, packageName, productId, or purchaseToken
      const query = search.toLowerCase();
      const matchesSearch =
        !search ||
        tx.orderId?.toLowerCase().includes(query) ||
        tx.packageName.toLowerCase().includes(query) ||
        tx.productId.toLowerCase().includes(query) ||
        tx.purchaseToken.toLowerCase().includes(query);

      const matchesState = stateFilter === "all" || tx.state === stateFilter;
      const matchesKind = kindFilter === "all" || tx.purchaseKind === kindFilter;
      const matchesTest =
        testFilter === "all" ||
        (testFilter === "test" && tx.isTestPurchase) ||
        (testFilter === "live" && !tx.isTestPurchase);

      return matchesSearch && matchesState && matchesKind && matchesTest;
    });
  }, [overviewTransactions, search, stateFilter, kindFilter, testFilter]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredTransactions.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleTransactions = useMemo(() => {
    return filteredTransactions.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  }, [currentPage, filteredTransactions]);

  const formatRevenue = (micros: number | null, currency: string | null) => {
    if (micros === null) return "—";
    const amount = micros / 1_000_000;
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency: currency || "VND",
    }).format(amount);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Operations / IAP"
        title="Android In-App Purchases"
        description="Manage item purchases and subscription transaction history from the Google Play Store. Data is securely verified via the Google Play Developer API and synchronized in a database-first approach."
        action={
          <Card className="rounded-lg border-border/80 shadow-sm w-full sm:w-[300px]">
            <CardContent className="p-3">
              <div className="flex items-center gap-3 min-w-0">
                {selectedStoreId !== "all" ? (() => {
                  const store = storeProfiles.find(s => s.id === selectedStoreId);
                  if (!store) return null;
                  return (
                    <>
                      {store.avatarUrl ? (
                        <Image
                          src={store.avatarUrl}
                          alt="Store Avatar"
                          width={40}
                          height={40}
                          unoptimized
                          className="w-10 h-10 rounded-full border bg-muted object-cover shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full border bg-muted flex items-center justify-center text-muted-foreground text-xs font-semibold shrink-0">
                          {store.storeAccountName.substring(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <div className="font-semibold text-sm text-foreground truncate">{store.storeAccountName}</div>
                        {store.linkStore ? (
                          <a href={store.linkStore} target="_blank" rel="noreferrer" className="text-[10px] text-primary hover:underline truncate">
                            View Developer Page
                          </a>
                        ) : (
                          <span className="text-[10px] text-muted-foreground truncate">No link provided</span>
                        )}
                      </div>
                    </>
                  );
                })() : (
                  <>
                    <div className="w-10 h-10 rounded-full border border-dashed bg-muted/50 flex items-center justify-center text-muted-foreground shrink-0">
                      <Store size={18} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="font-semibold text-sm text-foreground">All Stores</div>
                      <span className="text-[10px] text-muted-foreground">Global Overview</span>
                    </div>
                  </>
                )}
              </div>
              <div className="mt-3">
                <Select
                  value={selectedStoreId}
                  onValueChange={(val) => {
                    setSelectedStoreId(val);
                    setSelectedAppPackage("all");
                    setPage(1);
                  }}
                >
                  <SelectTrigger className="h-8 text-xs bg-background">
                    <SelectValue placeholder="Switch Store Context" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Stores</SelectItem>
                    {storeProfiles.map(store => (
                      <SelectItem key={store.id} value={store.id}>
                        {store.storeAccountName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        }
      />

      {/* Quick Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-lg shadow-sm border border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Revenue (Live)
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <DollarSign size={16} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(stats.revenue)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Excluding test transactions
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-lg shadow-sm border border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Active Subscriptions
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600 border border-sky-100">
              <Sparkles size={16} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {stats.activeSubs}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Subscriptions with &apos;active&apos; state
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-lg shadow-sm border border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Item Purchases (Products)
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600 border border-purple-100">
              <CreditCard size={16} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {stats.productSales}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Successful one-time transactions
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-lg shadow-sm border border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Test Transactions / Total
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
              <Smartphone size={16} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {stats.testCount} <span className="text-sm font-normal text-muted-foreground">/ {stats.totalCount}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Purchased via Google Sandbox License
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtering Section */}
      <Card className="rounded-lg border border-border/80">
        <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-end flex-wrap">
          <div className="w-full md:w-56 space-y-1.5">
            <Label htmlFor="filter-app" className="text-xs font-medium text-muted-foreground">Application Filter</Label>
            <Select
              value={selectedAppPackage}
              onValueChange={(val) => {
                setSelectedAppPackage(val);
                setPage(1);
              }}
              disabled={selectedStoreId === "all"}
            >
              <SelectTrigger id="filter-app" className="h-9">
                <SelectValue placeholder={selectedStoreId === "all" ? "Select a store first" : "All Apps"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Apps</SelectItem>
                {selectedStoreId !== "all" && storeProfiles.find(s => s.id === selectedStoreId)?.apps.map(app => (
                  <SelectItem key={app.id} value={app.packageName}>
                    {app.appName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 space-y-1.5 min-w-[200px]">
            <Label htmlFor="search-tx" className="text-xs font-medium text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <Input
                id="search-tx"
                placeholder="Order ID, Package name, Product ID, Purchase token..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                className="pl-8 h-9"
              />
            </div>
          </div>

          <div className="w-full md:w-40 space-y-1.5">
            <Label htmlFor="filter-kind" className="text-xs font-medium text-muted-foreground">Purchase Kind</Label>
            <Select
              value={kindFilter}
              onValueChange={(val) => {
                setKindFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger id="filter-kind" className="h-9">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="subscription">Subscription</SelectItem>
                <SelectItem value="product">One-time product</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full md:w-40 space-y-1.5">
            <Label htmlFor="filter-state" className="text-xs font-medium text-muted-foreground">State</Label>
            <Select
              value={stateFilter}
              onValueChange={(val) => {
                setStateFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger id="filter-state" className="h-9">
                <SelectValue placeholder="All states" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All States</SelectItem>
                <SelectItem value="active">active (Sub)</SelectItem>
                <SelectItem value="expired">expired (Sub)</SelectItem>
                <SelectItem value="purchased">purchased (Product)</SelectItem>
                <SelectItem value="canceled">canceled</SelectItem>
                <SelectItem value="pending">pending</SelectItem>
                <SelectItem value="grace_period">grace_period</SelectItem>
                <SelectItem value="on_hold">on_hold</SelectItem>
                <SelectItem value="paused">paused</SelectItem>
                <SelectItem value="revoked">revoked</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full md:w-40 space-y-1.5">
            <Label htmlFor="filter-test" className="text-xs font-medium text-muted-foreground">Environment</Label>
            <Select
              value={testFilter}
              onValueChange={(val) => {
                setTestFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger id="filter-test" className="h-9">
                <SelectValue placeholder="All traffic" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Traffic</SelectItem>
                <SelectItem value="live">Live only</SelectItem>
                <SelectItem value="test">Sandbox/Test only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* App Overview Banner */}
      {selectedAppPackage !== "all" && (() => {
        const store = storeProfiles.find(s => s.id === selectedStoreId);
        const app = store?.apps.find(a => a.packageName === selectedAppPackage);
        if (!app) return null;
        return (
          <div className="rounded-lg border border-border/80 bg-muted/20 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {app.appIconUrl ? (
                <Image
                  src={app.appIconUrl}
                  alt="App Icon"
                  width={36}
                  height={36}
                  unoptimized
                  className="w-9 h-9 rounded-lg border bg-muted object-cover shrink-0"
                />
              ) : (
                <div className="w-9 h-9 rounded-lg border bg-muted flex items-center justify-center text-muted-foreground shrink-0">
                  <Smartphone size={18} />
                </div>
              )}
              <div className="flex flex-col min-w-0">
                <div className="font-semibold text-sm text-foreground truncate">{app.appName}</div>
                <div className="text-xs text-muted-foreground font-mono truncate">{app.packageName}</div>
              </div>
            </div>
            {app.appLink && (
              <a href={app.appLink} target="_blank" rel="noreferrer" className="shrink-0">
                <Button variant="outline" size="sm" className="h-8 text-xs">
                  View in Play Store
                </Button>
              </a>
            )}
          </div>
        );
      })()}

      {/* Main Table Card */}
      <Card className="rounded-lg border border-border/80 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-foreground">
              <thead className="bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Transaction / Order</th>
                  <th className="px-4 py-3">App Info</th>
                  <th className="px-4 py-3">Purchase Kind</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Revenue / Price</th>
                  <th className="px-4 py-3">Time</th>
                  <th className="px-4 py-3 text-right">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y border-b bg-background">
                {visibleTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3.5 max-w-[240px]">
                      <div className="font-semibold text-foreground truncate" title={tx.orderId || tx.purchaseToken}>
                        {tx.orderId || "N/A (No Order ID)"}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate" title={tx.purchaseToken}>
                        Token: {tx.purchaseToken.substring(0, 12)}...
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-foreground">{tx.storeAccountName || "N/A"}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{tx.packageName}</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1 items-start">
                        <Badge variant="secondary" className="px-2 py-0.5 text-[11px] font-medium">
                          {tx.purchaseKind === "subscription" ? "Subscription" : "Product"}
                        </Badge>
                        <div className="text-xs text-muted-foreground font-semibold">{tx.productId}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1 items-start">
                        <StatusBadge status={tx.state} />
                        {tx.isTestPurchase && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-100">
                            Sandbox
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold text-foreground">
                        {formatRevenue(tx.revenueMicros, tx.currency)}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {tx.regionCode && `Region: ${tx.regionCode}`}
                        {tx.currency && ` (${tx.currency})`}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <Calendar size={12} className="shrink-0" />
                        <span>Purchased: {formatDate(tx.purchaseDate)}</span>
                      </div>
                      {tx.expiresDate && (
                        <div className="flex items-center gap-1.5 text-muted-foreground mt-1">
                          <Calendar size={12} className="shrink-0" />
                          <span>Expires: {formatDate(tx.expiresDate)}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 gap-1.5 px-2.5 border-border/80 hover:bg-muted"
                            onClick={() => setSelectedReceipt(tx.rawReceipt)}
                          >
                            <FileJson size={13} />
                            <span>JSON</span>
                          </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-4xl max-h-[80vh] flex flex-col p-6">
                          <DialogHeader className="pb-2 border-b">
                            <DialogTitle className="flex items-center gap-2">
                              <FileJson size={18} className="text-primary" />
                              <span>Google Play Receipt Details</span>
                            </DialogTitle>
                          </DialogHeader>
                          <div className="flex-1 overflow-auto mt-4 p-4 rounded-lg bg-zinc-950 font-mono text-xs text-zinc-300 border border-zinc-800">
                            <pre className="whitespace-pre-wrap word-break-all">
                              {JSON.stringify(selectedReceipt, null, 2)}
                            </pre>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </td>
                  </tr>
                ))}
                {!visibleTransactions.length && (
                  <TableEmptyState
                    colSpan={7}
                    icon={CreditCard}
                    title="No transactions found"
                    description="Try changing your search terms or filters to find IAP transactions."
                  />
                )}
              </tbody>
            </table>
          </div>

          {filteredTransactions.length > 0 && (
            <div className="flex flex-col gap-3 border-t px-4 py-3.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between bg-muted/10">
              <span>
                Showing {visibleTransactions.length} of {filteredTransactions.length} transactions
              </span>
              <Pagination className="mx-0 w-auto justify-start sm:justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      href="#"
                      text="Prev"
                      className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""}
                      onClick={(e) => {
                        e.preventDefault();
                        setPage((val) => Math.max(1, val - 1));
                      }}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }).map((_, index) => {
                    const pageNumber = index + 1;
                    return (
                      <PaginationItem key={pageNumber}>
                        <PaginationLink
                          href="#"
                          isActive={currentPage === pageNumber}
                          onClick={(e) => {
                            e.preventDefault();
                            setPage(pageNumber);
                          }}
                        >
                          {pageNumber}
                        </PaginationLink>
                      </PaginationItem>
                    );
                  })}
                  <PaginationItem>
                    <PaginationNext
                      href="#"
                      text="Next"
                      className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""}
                      onClick={(e) => {
                        e.preventDefault();
                        setPage((val) => Math.min(totalPages, val + 1));
                      }}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

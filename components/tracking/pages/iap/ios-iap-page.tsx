"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  CheckCircle2,
  CreditCard,
  DollarSign,
  Eye,
  FileJson,
  Search,
  Smartphone,
  Sparkles,
  XCircle,
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
import type { IosIapDto } from "@/lib/server/services/iap/ios-iap.service";

const pageSize = 10;

export function IosIapPage({ transactions }: { transactions: IosIapDto[] }) {
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [environmentFilter, setEnvironmentFilter] = useState<string>("all");
  const [selectedReceipt, setSelectedReceipt] = useState<unknown | null>(null);
  const [page, setPage] = useState(1);

  // Stats calculation
  const stats = useMemo(() => {
    let totalRevenueMicros = 0;
    let sandboxCount = 0;
    let activeCount = 0;
    let productCount = 0;

    transactions.forEach((tx) => {
      // Add revenue from all transactions (including sandbox)
      if (tx.revenueMicros) {
        totalRevenueMicros += tx.revenueMicros;
      }

      if (tx.environment === "sandbox") {
        sandboxCount++;
      }

      if (tx.state === "active") {
        activeCount++;
      }

      if (tx.state === "purchased") {
        productCount++;
      }
    });

    return {
      revenue: totalRevenueMicros / 1_000_000,
      sandboxCount,
      activeCount,
      productCount,
      totalCount: transactions.length,
    };
  }, [transactions]);

  // Filtering
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      // Search matches transactionId, bundleId, productId, or userId
      const query = search.toLowerCase();
      const matchesSearch =
        !search ||
        tx.transactionId?.toLowerCase().includes(query) ||
        tx.bundleId?.toLowerCase().includes(query) ||
        tx.productId.toLowerCase().includes(query) ||
        tx.userId?.toLowerCase().includes(query);

      const matchesState = stateFilter === "all" || tx.state === stateFilter;
      const matchesEnvironment = environmentFilter === "all" || tx.environment === environmentFilter;

      return matchesSearch && matchesState && matchesEnvironment;
    });
  }, [transactions, search, stateFilter, environmentFilter]);

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
        title="iOS In-App Purchases"
        description="Manage subscription and transaction history from the Apple App Store. Data is securely verified via Edge Functions and synchronized in a database-first approach."
      />

      {/* Quick Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-lg shadow-sm border border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Total Revenue
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
              Tất cả giao dịch
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
              {stats.activeCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Transactions with &apos;active&apos; state
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-lg shadow-sm border border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Verified Purchases
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-purple-50 text-purple-600 border border-purple-100">
              <CreditCard size={16} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {stats.productCount}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Verified transactions
            </p>
          </CardContent>
        </Card>

        <Card className="rounded-lg shadow-sm border border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Sandbox / Total
            </CardTitle>
            <div className="flex size-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 border border-amber-100">
              <Smartphone size={16} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-foreground">
              {stats.sandboxCount} <span className="text-sm font-normal text-muted-foreground">/ {stats.totalCount}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">
              Purchased via Sandbox environment
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filtering Section */}
      <Card className="rounded-lg border border-border/80">
        <CardContent className="p-4 flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="search-tx" className="text-xs font-medium text-muted-foreground">Search</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
              <Input
                id="search-tx"
                placeholder="Transaction ID, Bundle ID, Product ID, User ID..."
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
                <SelectItem value="active">active</SelectItem>
                <SelectItem value="expired">expired</SelectItem>
                <SelectItem value="purchased">purchased</SelectItem>
                <SelectItem value="verified">verified</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="w-full md:w-40 space-y-1.5">
            <Label htmlFor="filter-env" className="text-xs font-medium text-muted-foreground">Environment</Label>
            <Select
              value={environmentFilter}
              onValueChange={(val) => {
                setEnvironmentFilter(val);
                setPage(1);
              }}
            >
              <SelectTrigger id="filter-env" className="h-9">
                <SelectValue placeholder="All environments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Environments</SelectItem>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="sandbox">Sandbox</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Main Table Card */}
      <Card className="rounded-lg border border-border/80 shadow-sm overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm text-foreground">
              <thead className="bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Transaction ID</th>
                  <th className="px-4 py-3">Bundle</th>
                  <th className="px-4 py-3">Product</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Environment</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Verified</th>
                  <th className="px-4 py-3">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {visibleTransactions.length ? (
                  visibleTransactions.map((tx) => (
                    <tr key={tx.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium text-sm">{tx.transactionId}</div>
                        {tx.userId && <div className="text-xs text-muted-foreground">{tx.userId}</div>}
                      </td>
                      <td className="px-4 py-3 text-sm max-w-40 truncate">{tx.bundleId || "—"}</td>
                      <td className="px-4 py-3 text-sm">{tx.productId}</td>
                      <td className="px-4 py-3">
                        <StatusBadge status={tx.state} />
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={tx.environment === "production" ? "default" : "secondary"}>
                          {tx.environment}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm">{formatRevenue(tx.revenueMicros, tx.currency)}</td>
                      <td className="px-4 py-3 text-sm">{formatDate(tx.verifiedAt)}</td>
                      <td className="px-4 py-3">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => setSelectedReceipt(tx.rawReceipt)}
                              title="View receipt"
                            >
                              <Eye size={14} />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl">
                            <DialogHeader>
                              <DialogTitle>Raw Receipt - {tx.transactionId}</DialogTitle>
                            </DialogHeader>
                            <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-96 text-xs">
                              {JSON.stringify(selectedReceipt, null, 2)}
                            </pre>
                          </DialogContent>
                        </Dialog>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-12">
                      <div className="flex flex-col items-center justify-center text-center">
                        <div className="flex size-12 items-center justify-center rounded-lg bg-muted mb-3">
                          <CreditCard className="text-muted-foreground" size={24} />
                        </div>
                        <p className="font-medium text-foreground">No iOS IAP transactions</p>
                        <p className="text-sm text-muted-foreground">Apple transactions will appear here.</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination>
            <PaginationContent>
              {currentPage > 1 && (
                <PaginationItem>
                  <PaginationPrevious
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage(Math.max(1, currentPage - 1));
                    }}
                  />
                </PaginationItem>
              )}

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => (
                <PaginationItem key={pageNum}>
                  <PaginationLink
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage(pageNum);
                    }}
                    isActive={pageNum === currentPage}
                  >
                    {pageNum}
                  </PaginationLink>
                </PaginationItem>
              ))}

              {currentPage < totalPages && (
                <PaginationItem>
                  <PaginationNext
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      setPage(Math.min(totalPages, currentPage + 1));
                    }}
                  />
                </PaginationItem>
              )}
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronRight,
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Smartphone,
  Apple,
  Calendar,
  FileJson,
  CreditCard,
  MoreHorizontal,
  ReceiptText,
  ClipboardCheck,
  Sparkles,
  Receipt,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TableEmptyState } from "@/components/tracking/primitives";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { IapAppDetailPageData } from "@/lib/tracking/page-data";

const pageSize = 10;

function formatRevenue(micros: string | null, currency: string | null) {
  if (!micros) return "N/A";
  const num = parseInt(micros);
  if (isNaN(num)) return "N/A";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: currency || "VND" }).format(num / 1000000);
}

function formatDate(dateVal: any) {
  if (!dateVal) return "N/A";
  let d = new Date(dateVal);
  if (isNaN(d.getTime()) && !isNaN(Number(dateVal))) {
    d = new Date(Number(dateVal));
  }
  if (isNaN(d.getTime())) return "N/A";
  return d.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls = "bg-muted border-border text-muted-foreground";
  if (s.includes("active") || s.includes("purchased")) cls = "bg-emerald-50 border-emerald-300 text-emerald-700 dark:bg-emerald-200 dark:text-emerald-400";
  else if (s.includes("expired") || s.includes("canceled")) cls = "bg-destructive/10 border-destructive/30 text-destructive dark:bg-destructive/50 dark:text-foreground";
  else if (s.includes("grace") || s.includes("paused")) cls = "bg-orange-50 border-orange-300 text-orange-700 dark:bg-orange-200 dark:text-orange-400";
  return <span className={`inline-flex items-center border font-semibold rounded-full px-2 py-[4px] text-[11px] leading-none ${cls}`}>{status}</span>;
}

/* ── Overview Card (matches shadcnblocks dashboard-11) ─────────── */
function OverviewCard({ title, value, trendPct, trendText, trendDir }: {
  title: string; value: string; trendPct: string; trendText: string;
  trendDir: "up" | "down" | "flat";
}) {
  return (
    <div className="bg-card text-card-foreground rounded-lg border h-full w-full">
      {/* Header */}
      <div className="flex flex-row items-center justify-between space-y-0 p-4">
        <div className="tracking-tight flex items-center gap-2 text-sm font-medium">
          <span>{title}</span>
        </div>
        <MoreHorizontal size={16} className="cursor-pointer opacity-60" />
      </div>
      {/* Content */}
      <div className="space-y-[10px] px-4 pt-0 pb-4">
        <p className="text-2xl font-bold">{value}</p>
        <div className="flex flex-wrap items-center gap-2">
          {trendDir === "up" && (
            <div className="flex items-center gap-1 text-emerald-400">
              <ArrowUpRight size={16} />
              <p className="text-xs font-semibold">{trendPct}</p>
            </div>
          )}
          {trendDir === "down" && (
            <div className="flex items-center gap-1 text-red-400">
              <ArrowDownRight size={16} />
              <p className="text-xs font-semibold">{trendPct}</p>
            </div>
          )}
          {trendDir === "flat" && (
            <p className="text-xs font-semibold text-muted-foreground">{trendPct}</p>
          )}
          <p className="text-xs text-muted-foreground">{trendText}</p>
        </div>
      </div>
    </div>
  );
}

export function IapAppDetailPage({ data }: { data: IapAppDetailPageData }) {
  const { app, transactions } = data;
  const isIos = app.platform === "ios";

  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState<string>("all");
  const [filterKind, setFilterKind] = useState<string>("all");
  const [page, setPage] = useState(1);
  const [selectedReceipt, setSelectedReceipt] = useState<unknown | null>(null);

  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx: any) => {
      const txId = isIos ? tx.transaction_id : tx.orderId;
      const tState = tx.state;
      const tKind = isIos ? "unknown" : tx.purchaseKind;
      const matchSearch = !search || (txId?.toLowerCase().includes(search.toLowerCase())) || (tx.productId || tx.product_id || "").toLowerCase().includes(search.toLowerCase());
      const matchState = filterState === "all" || (tState?.toLowerCase() === filterState);
      const matchKind = filterKind === "all" || (tKind?.toLowerCase() === filterKind);
      return matchSearch && matchState && matchKind;
    }).sort((a: any, b: any) => {
      const dA = new Date((isIos ? a.purchase_date : a.purchaseDate) || 0).getTime();
      const dB = new Date((isIos ? b.purchase_date : b.purchaseDate) || 0).getTime();
      return dB - dA;
    });
  }, [transactions, search, filterState, filterKind, isIos]);

  // MOCK DATA INJECTION ONLY FOR CHART & STATS UI TESTING
  const chartTransactions = useMemo(() => {
    if (filteredTransactions.length >= 10) return filteredTransactions;
    // Deterministic seeded PRNG to avoid hydration mismatch
    let seed = 42;
    const rand = () => { seed = (seed * 16807 + 0) % 2147483647; return (seed - 1) / 2147483646; };
    const baseTime = new Date("2026-06-22T00:00:00Z").getTime();
    const mockTxs = [];
    for (let i = 0; i < 80; i++) {
      const daysAgo = Math.floor(rand() * 360);
      const isTest = rand() > 0.8;
      const state = rand() > 0.2 ? "active" : "canceled";
      const revenue = Math.floor(rand() * 500000 + 50000) * 1000000;
      const txHash = Math.floor(rand() * 1e9).toString(36);
      mockTxs.push({
        id: `mock-${i}`,
        transaction_id: `mock-tx-${txHash}`,
        orderId: `GPA.3300-${Math.floor(rand() * 9999)}-${Math.floor(rand() * 9999)}`,
        productId: `com.limgrow.app.premium_${Math.floor(rand() * 3 + 1)}m`,
        product_id: `com.limgrow.app.premium_${Math.floor(rand() * 3 + 1)}m`,
        state,
        purchaseKind: "subscription",
        isTestPurchase: isTest,
        environment: isTest ? "Sandbox" : "Production",
        revenueMicros: revenue.toString(),
        revenue_micros: revenue.toString(),
        purchaseDate: new Date(baseTime - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
        purchase_date: new Date(baseTime - daysAgo * 24 * 60 * 60 * 1000).toISOString(),
        currency: "VND",
        regionCode: "VN",
      });
    }
    return [...filteredTransactions, ...mockTxs];
  }, [filteredTransactions, isIos]);

  const stats = useMemo(() => {
    let rev = 0; let active = 0; let canceled = 0;
    const now = Date.now(); const week = 7*24*60*60*1000;
    let revL7 = 0; let revP7 = 0; let ordL7 = 0; let ordP7 = 0;
    chartTransactions.forEach((tx: any) => {
      const test = isIos ? tx.environment === "Sandbox" : tx.isTestPurchase;
      const st = (tx.state || "").toLowerCase();
      const m = isIos ? tx.revenue_micros : tx.revenueMicros;
      const v = m ? parseInt(m) / 1e6 : 0;
      const d = new Date((isIos ? tx.purchase_date : tx.purchaseDate) || 0).getTime();
      if (!test && m) { rev += v; if (d >= now - week) { revL7 += v; ordL7++; } else if (d >= now - 2*week) { revP7 += v; ordP7++; } }
      if (st === "active" || st === "purchased") active++;
      if (st === "canceled" || st === "expired") canceled++;
    });
    const sg = revP7 > 0 ? ((revL7 - revP7) / revP7) * 100 : revL7 > 0 ? 100 : 0;
    const og = ordP7 > 0 ? ((ordL7 - ordP7) / ordP7) * 100 : ordL7 > 0 ? 100 : 0;
    return { rev, active, canceled, total: chartTransactions.length, sg, ogDir: og >= 0 ? "up" as const : "down" as const, sgDir: sg >= 0 ? "up" as const : "down" as const, revL7, revP7, ordL7, ordP7, og };
  }, [chartTransactions, isIos]);

  // Monthly chart data (12 months)
  const { buckets, maxVal } = useMemo(() => {
    const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
    const b: { label: string; prod: number; sand: number }[] = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); b.push({ label: months[d.getMonth()], prod: 0, sand: 0 }); }
    chartTransactions.forEach((tx: any) => {
      const test = isIos ? tx.environment === "Sandbox" : tx.isTestPurchase;
      const pd = new Date((isIos ? tx.purchase_date : tx.purchaseDate) || 0);
      const m = isIos ? tx.revenue_micros : tx.revenueMicros;
      if (!m) return;
      const v = parseInt(m) / 1e6;
      const mIdx = b.findIndex((_, idx) => { const ref = new Date(now.getFullYear(), now.getMonth() - (11 - idx), 1); return ref.getMonth() === pd.getMonth() && ref.getFullYear() === pd.getFullYear(); });
      if (mIdx >= 0) { if (test) b[mIdx].sand += v; else b[mIdx].prod += v; }
    });
    let mx = 1; b.forEach(x => { if (x.prod + x.sand > mx) mx = x.prod + x.sand; });
    return { buckets: b, maxVal: mx };
  }, [chartTransactions, isIos]);

  const uniqueStates = useMemo(() => { const s = new Set<string>(); transactions.forEach((tx: any) => { if (tx.state) s.add(tx.state.toLowerCase()); }); return Array.from(s).sort(); }, [transactions]);

  const totalPages = Math.ceil(filteredTransactions.length / pageSize);
  const currentPage = Math.min(page, Math.max(1, totalPages));
  const visible = useMemo(() => filteredTransactions.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filteredTransactions, currentPage]);

  const fmtVND = (n: number) => new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(n);
  const fmtNum = (n: number) => new Intl.NumberFormat("vi-VN").format(n);
  const revTrendBadgePct = stats.sg >= 0 ? `+${stats.sg.toFixed(0)}%` : `${stats.sg.toFixed(0)}%`;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-muted/10 p-4 sm:p-6 gap-6">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-muted-foreground font-medium shrink-0">
        <Link href="/iap" className="hover:text-foreground transition-colors flex items-center"><ArrowLeft className="mr-1.5 h-4 w-4" />Apps</Link>
        <ChevronRight className="h-4 w-4" />
        <div className="flex items-center gap-2 text-foreground bg-background px-2 py-1 rounded-md border shadow-sm">
          {isIos
            ? <Badge variant="outline" className="border-zinc-200 bg-zinc-50 text-zinc-700 gap-1"><Apple size={12} />iOS</Badge>
            : <Badge variant="outline" className="border-emerald-200 bg-emerald-50 text-emerald-700 gap-1"><Smartphone size={12} />Android</Badge>}
          {app.appName}
        </div>
      </nav>

      {/* Overview Grid: Left = 4 cards (2×2), Right = Revenue Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 shrink-0">
        {/* Left: 4 Overview Cards in 2×2 sub-grid */}
        <div className="lg:col-span-5 grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1">
            <OverviewCard title="Total Sales" value={fmtVND(stats.rev)} trendPct={`${Math.abs(stats.sg).toFixed(1)}%`} trendText={`${stats.sgDir === "up" ? "+" : "-"}${fmtVND(Math.abs(stats.revL7 - stats.revP7))} this week`} trendDir={stats.sgDir} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <OverviewCard title="Total Orders" value={fmtNum(stats.total - stats.canceled)} trendPct={`${Math.abs(stats.og).toFixed(1)}%`} trendText={`${stats.ogDir === "up" ? "+" : "-"}${Math.abs(stats.ordL7 - stats.ordP7)} orders this week`} trendDir={stats.ogDir} />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <OverviewCard title="Active Subs" value={fmtNum(stats.active)} trendPct={`${stats.total > 0 ? ((stats.active / stats.total) * 100).toFixed(0) : 0}%`} trendText="of total transactions" trendDir="flat" />
          </div>
          <div className="col-span-2 sm:col-span-1">
            <OverviewCard title="Refunded" value={fmtNum(stats.canceled)} trendPct={`${stats.total > 0 ? ((stats.canceled / stats.total) * 100).toFixed(0) : 0}%`} trendText="churned transactions" trendDir={stats.canceled > 0 ? "down" : "flat"} />
          </div>
        </div>

        {/* Right: Revenue Chart Card */}
        <div className="lg:col-span-7 bg-card text-card-foreground rounded-lg border flex flex-col">
          <div className="flex flex-col space-y-1.5 p-4">
            <div className="flex items-center justify-between">
              <div className="leading-none font-semibold tracking-tight">Revenue</div>
              <Select defaultValue="2026"><SelectTrigger className="w-[100px] h-9"><SelectValue placeholder="Year" /></SelectTrigger><SelectContent><SelectItem value="2026">2026</SelectItem><SelectItem value="2025">2025</SelectItem></SelectContent></Select>
            </div>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-bold">{fmtVND(stats.rev)}</p>
              <span className="text-muted-foreground text-sm font-medium">
                {revTrendBadgePct} from last week
              </span>
            </div>
          </div>
          <div className="p-4 pt-0 flex-1 flex flex-col justify-end mt-4">
            {/* Custom Bar Chart matching Shadcn Reference */}
            <div className="relative flex items-end w-full h-[180px] xl:h-[220px]">
              {/* Horizontal Grid Lines */}
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-[24px]">
                <div className="w-full border-t border-border/50"></div>
                <div className="w-full border-t border-border/50"></div>
                <div className="w-full border-t border-border/50"></div>
              </div>

              {/* Bars */}
              <div className="relative z-10 w-full flex items-end justify-between h-full pb-[24px]">
                {buckets.map((b, i) => {
                  const total = b.prod + b.sand;
                  const hPct = maxVal > 0 ? (total / maxVal) * 100 : 0;
                  return (
                    <div key={i} className="flex flex-col items-center flex-1 group relative h-full justify-end">
                      <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center pointer-events-none bg-zinc-950 text-white text-xs p-2.5 rounded-lg shadow-xl z-50 border border-zinc-800 min-w-[120px]">
                        <p className="font-semibold border-b border-zinc-800 pb-1.5 mb-1 w-full text-center">{b.label}</p>
                        <div className="flex justify-between w-full gap-3"><span className="text-zinc-400">Total:</span><span className="font-bold">{fmtVND(total)}</span></div>
                        <div className="flex justify-between w-full gap-3 mt-1 text-[10px]"><span className="text-zinc-500">Prod:</span><span className="font-semibold text-zinc-300">{fmtVND(b.prod)}</span></div>
                        <div className="flex justify-between w-full gap-3 mt-0.5 text-[10px]"><span className="text-zinc-500">Sand:</span><span className="font-semibold text-zinc-300">{fmtVND(b.sand)}</span></div>
                      </div>
                      <div className="w-full px-[2px] sm:px-1 md:px-2 flex justify-center items-end h-full">
                        <div className="w-full max-w-[32px] bg-primary rounded-t-[4px] transition-all duration-500 hover:opacity-80" style={{ height: `${hPct}%` }}></div>
                      </div>
                      <span className="absolute -bottom-[20px] text-[12px] text-muted-foreground font-medium">{b.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Table Card */}
      <div className="flex-1 min-h-0 flex flex-col bg-card text-card-foreground border rounded-lg overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-b bg-muted/20">
          <Input type="search" placeholder="Search Order ID or Product ID..." className="w-full sm:max-w-xs h-9 bg-background" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {!isIos && (<Select value={filterKind} onValueChange={(v) => { setFilterKind(v); setPage(1); }}><SelectTrigger className="w-full sm:w-[130px] h-9 bg-background"><SelectValue placeholder="Kind" /></SelectTrigger><SelectContent><SelectItem value="all">All Kinds</SelectItem><SelectItem value="subscription">Subscription</SelectItem><SelectItem value="inapp">In-App</SelectItem></SelectContent></Select>)}
            <Select value={filterState} onValueChange={(v) => { setFilterState(v); setPage(1); }}><SelectTrigger className="w-full sm:w-[140px] h-9 bg-background"><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">All Statuses</SelectItem>{uniqueStates.map(s => <SelectItem key={s} value={s}>{s.toUpperCase()}</SelectItem>)}</SelectContent></Select>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full border-collapse text-left text-sm text-foreground">
            <thead className="bg-muted/40 border-b text-xs font-semibold text-muted-foreground uppercase tracking-wider sticky top-0 z-10 backdrop-blur">
              <tr><th className="px-4 py-3">Transaction / Order</th><th className="px-4 py-3">Product Info</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Revenue / Price</th><th className="px-4 py-3">Purchase time</th><th className="px-4 py-3">Receipt</th></tr>
            </thead>
            <tbody className="divide-y border-b bg-background">
              {visible.map((tx: any) => {
                const txId = isIos ? tx.transaction_id : (tx.orderId || "N/A");
                const productId = isIos ? tx.product_id : tx.productId;
                const isTest = isIos ? tx.environment === "Sandbox" : tx.isTestPurchase;
                const revenue = isIos ? tx.revenue_micros : tx.revenueMicros;
                const currency = tx.currency || "VND";
                const purchaseDate = isIos ? tx.purchase_date : tx.purchaseDate;
                const expiresDate = isIos ? tx.expires_date : tx.expiresDate;
                return (
                  <tr key={tx.id || tx.transaction_id || tx.purchaseToken} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3.5 max-w-[240px]">
                      <div className="font-semibold truncate" title={txId}>{txId}</div>
                      {isIos && tx.original_transaction_id && <div className="text-xs text-muted-foreground font-mono mt-0.5 truncate">Orig: {tx.original_transaction_id}</div>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1 items-start">
                        {!isIos && tx.purchaseKind && <Badge variant="secondary" className="px-2 py-0.5 text-[11px] font-medium">{tx.purchaseKind === "subscription" ? "Subscription" : "Product"}</Badge>}
                        <div className="text-xs text-muted-foreground font-semibold">{productId}</div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-1 items-start">
                        <StatusBadge status={tx.state || "UNKNOWN"} />
                        {isTest && <span className="inline-flex items-center border font-semibold rounded-full px-2 py-[4px] text-[11px] leading-none bg-orange-50 border-orange-300 text-orange-700">Sandbox</span>}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="font-semibold">{formatRevenue(revenue, currency)}</div>
                      {!isIos && <div className="text-[10px] text-muted-foreground mt-0.5">{tx.regionCode && `Region: ${tx.regionCode}`}{tx.currency && ` (${tx.currency})`}</div>}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div className="flex items-center gap-1.5 text-muted-foreground"><Calendar size={12} className="shrink-0" /><span>{formatDate(purchaseDate)}</span></div>
                    </td>
                    <td className="px-4 py-3.5">
                      <Dialog><DialogTrigger asChild><Button variant="outline" size="sm" className="h-8 gap-1.5 px-2.5" onClick={() => setSelectedReceipt(tx.rawReceipt || tx)}><FileJson size={13} /><span>JSON</span></Button></DialogTrigger>
                        <DialogContent className="sm:max-w-4xl max-h-[80vh] flex flex-col p-6"><DialogHeader className="pb-2 border-b"><DialogTitle className="flex items-center gap-2"><FileJson size={18} className="text-primary" /><span>Receipt Details</span></DialogTitle></DialogHeader><div className="flex-1 overflow-auto mt-4 p-4 rounded-lg bg-zinc-950 font-mono text-xs text-zinc-300 border border-zinc-800"><pre className="whitespace-pre-wrap">{JSON.stringify(selectedReceipt, null, 2)}</pre></div></DialogContent>
                      </Dialog>
                    </td>
                  </tr>
                );
              })}
              {!visible.length && <TableEmptyState colSpan={7} icon={CreditCard} title="No transactions found" description="Try changing your search terms or filters." />}
            </tbody>
          </table>
        </div>

        {filteredTransactions.length > 0 && (
          <div className="flex flex-col gap-3 border-t px-4 py-3.5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between bg-muted/10 shrink-0">
            <span>Showing {visible.length} of {filteredTransactions.length} transactions</span>
            <Pagination className="mx-0 w-auto justify-start sm:justify-end">
              <PaginationContent>
                <PaginationItem><PaginationPrevious href="#" text="Prev" className={currentPage <= 1 ? "pointer-events-none opacity-50" : ""} onClick={(e) => { e.preventDefault(); setPage(v => Math.max(1, v - 1)); }} /></PaginationItem>
                {Array.from({ length: Math.min(5, totalPages) }).map((_, i) => { let pn = i + 1; if (totalPages > 5 && currentPage > 3) pn = currentPage - 2 + i; if (pn > totalPages) return null; return <PaginationItem key={pn}><PaginationLink href="#" isActive={currentPage === pn} onClick={(e) => { e.preventDefault(); setPage(pn); }}>{pn}</PaginationLink></PaginationItem>; })}
                <PaginationItem><PaginationNext href="#" text="Next" className={currentPage >= totalPages ? "pointer-events-none opacity-50" : ""} onClick={(e) => { e.preventDefault(); setPage(v => Math.min(totalPages, v + 1)); }} /></PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        )}
      </div>
    </div>
  );
}

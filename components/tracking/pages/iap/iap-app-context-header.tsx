"use client";

import { Apple, ArrowLeft, ChartNoAxesCombined, CreditCard, Smartphone } from "lucide-react";

import { PendingNavigationLink } from "@/components/tracking/pending-navigation-link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { IapAppCard } from "@/lib/tracking/page-data";

type IapAppDetailTab = "transactions" | "trial-conversion";

export function IapAppContextHeader({
  activeTab,
  app,
}: {
  activeTab: IapAppDetailTab;
  app: IapAppCard;
}) {
  const platformQuery = `platform=${encodeURIComponent(app.platform)}`;
  const tabs = [
    {
      href: `/iap/${encodeURIComponent(app.mappingId)}?${platformQuery}`,
      icon: CreditCard,
      label: "Transactions",
      value: "transactions" as const,
    },
    ...(app.platform === "ios"
      ? [
          {
            href: `/iap/${encodeURIComponent(app.mappingId)}/conversion?${platformQuery}`,
            icon: ChartNoAxesCombined,
            label: "Trial conversion",
            value: "trial-conversion" as const,
          },
        ]
      : []),
  ];

  return (
    <header className="shrink-0 space-y-4">
      <PendingNavigationLink
        href="/iap"
        className="w-fit gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft size={15} />
        All applications
      </PendingNavigationLink>

      <div className="flex min-w-0 items-center gap-3">
        <Avatar className="size-11 rounded-xl border bg-background">
          {app.appIconUrl ? (
            <AvatarImage
              alt={app.appName}
              className="rounded-xl"
              src={app.appIconUrl}
            />
          ) : null}
          <AvatarFallback className="rounded-xl text-xs font-semibold">
            {app.appName.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="truncate font-heading text-xl font-semibold tracking-tight">
              {app.appName}
            </h1>
            {app.platform === "ios" ? (
              <Badge
                className="gap-1 border-zinc-200 bg-zinc-50 text-zinc-700"
                variant="outline"
              >
                <Apple size={12} />
                iOS
              </Badge>
            ) : (
              <Badge
                className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
                variant="outline"
              >
                <Smartphone size={12} />
                Android
              </Badge>
            )}
          </div>
          <p className="mt-0.5 truncate text-sm text-muted-foreground">
            {app.identifier}
          </p>
        </div>
      </div>

      <nav
        aria-label={`${app.appName} sections`}
        className="flex gap-5 border-b"
      >
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.value;

          return (
            <PendingNavigationLink
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative gap-2 pb-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                active &&
                  "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary",
              )}
              href={tab.href}
              key={tab.value}
            >
              <Icon size={15} />
              {tab.label}
            </PendingNavigationLink>
          );
        })}
      </nav>
    </header>
  );
}

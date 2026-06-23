"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Apple,
  Bell,
  Cable,
  ChevronRight,
  Command,
  CreditCard,
  Gauge,
  LogOut,
  Menu,
  MessageSquareReply,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Search,
  Smartphone,
  UserCog,
  UsersRound,
  X,
} from "lucide-react";
import { ReactNode, useState } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import type { ConsoleSession } from "@/lib/auth/rbac";
import { cn } from "@/lib/utils";
import type { StaffRole } from "@/lib/tracking/types";

type NavItem = {
  title: string;
  href: string;
  icon: ReactNode;
  badge?: string;
  roles: StaffRole[];
  children?: NavItem[];
};

const navGroups: { title: string; items: NavItem[] }[] = [
  {
    title: "General",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: <Gauge size={17} />,
        roles: ["Admin", "Dev", "Marketing"],
      },
      {
        title: "Users",
        href: "/users",
        icon: <UsersRound size={17} />,
        roles: ["Admin"],
      },
    ],
  },
  {
    title: "Operations",
    items: [
      {
        title: "App Mapping",
        href: "/store-mapping",
        icon: <Cable size={17} />,
        roles: ["Admin"],
        children: [
          {
            title: "Android",
            href: "/store-mapping/android",
            icon: <Smartphone size={15} />,
            roles: ["Admin"],
          },
          {
            title: "iOS",
            href: "/store-mapping/ios",
            icon: <Apple size={15} />,
            roles: ["Admin"],
          },
        ],
      },
      {
        title: "Configs",
        href: "/configs",
        icon: <Settings2 size={17} />,
        badge: "core",
        roles: ["Admin"],
        children: [
          {
            title: "Android",
            href: "/configs/android",
            icon: <Smartphone size={15} />,
            roles: ["Admin"],
          },
          {
            title: "iOS",
            href: "/configs/ios",
            icon: <Apple size={15} />,
            roles: ["Admin"],
          },
        ],
      },
    ],
  },
  {
    title: "Finance",
    items: [
      {
        title: "IAP",
        href: "/iap",
        icon: <CreditCard size={17} />,
        roles: ["Admin", "Dev", "Marketing"],
      },
    ],
  },
  {
    title: "Reply & Review",
    items: [
      {
        title: "Review",
        href: "/review",
        icon: <MessageSquareText size={17} />,
        roles: ["Admin", "Marketing"],
      },
      {
        title: "Reply",
        href: "/reply",
        icon: <MessageSquareReply size={17} />,
        roles: ["Admin", "Marketing"],
      },
    ],
  },
];

function SidebarContent({
  role,
  session,
  onLogout,
  onNavigate,
  collapsed = false,
}: {
  role: StaffRole;
  session: ConsoleSession;
  onLogout: () => void;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>(
    {},
  );

  return (
    <div className="flex h-full flex-col">
      <div
        className={cn(
          "relative border-b p-3 transition-all duration-300",
          collapsed && "p-2",
        )}
      >
        <Link
          href="/dashboard"
          onClick={onNavigate}
          title="LimGrow Tracking"
          className={cn(
            "flex items-center rounded-lg py-2 transition-colors hover:bg-muted",
            collapsed ? "justify-center px-1" : "gap-3 px-2",
          )}
        >
          <Image
            src="/company-logo.png"
            alt="LimGrow logo"
            width={40}
            height={40}
            priority
            className="size-10 shrink-0 rounded-xl object-cover shadow-sm ring-1 ring-primary/10"
          />
          {!collapsed ? (
            <div className="min-w-0">
              <div className="font-heading text-sm font-semibold">
                LimGrow Tracking
              </div>
              <div className="truncate text-xs text-muted-foreground">
                System control plane
              </div>
            </div>
          ) : null}
        </Link>
      </div>

      <div
        className={cn(
          "flex-1 overflow-y-auto p-3 transition-all duration-300",
          collapsed ? "space-y-3 px-2" : "space-y-5",
        )}
      >
        {navGroups.map((group) => (
          <div key={group.title}>
            {!collapsed ? (
              <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">
                {group.title}
              </div>
            ) : null}
            <div className="space-y-1">
              {group.items.map((item) => {
                const hasChildren = Boolean(item.children?.length);
                const active = hasChildren
                  ? item.children!.some(
                      (c) =>
                        pathname === c.href ||
                        pathname.startsWith(`${c.href}/`),
                    )
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                const allowed = item.roles.includes(role);
                const expanded = hasChildren
                  ? !collapsed && (expandedItems[item.href] ?? active)
                  : false;

                if (hasChildren) {
                  return (
                    <div
                      key={item.href}
                      className={cn(
                        !allowed && "pointer-events-none opacity-35",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (collapsed) {
                            router.push(item.href);
                            onNavigate?.();
                            return;
                          }

                          setExpandedItems((current) => ({
                            ...current,
                            [item.href]: !expanded,
                          }));
                        }}
                        aria-expanded={expanded}
                        aria-disabled={!allowed}
                        title={item.title}
                        className={cn(
                          "flex h-9 w-full items-center rounded-lg text-sm font-medium transition-all duration-200",
                          collapsed
                            ? "justify-center px-0"
                            : "justify-between px-2",
                          active
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        <span
                          className={cn(
                            "flex min-w-0 items-center",
                            collapsed ? "justify-center" : "gap-2",
                          )}
                        >
                          {item.icon}
                          {!collapsed ? (
                            <span className="truncate">{item.title}</span>
                          ) : null}
                        </span>
                        {!collapsed ? (
                          <span className="flex items-center gap-2">
                            {item.badge ? (
                              <Badge
                                variant="secondary"
                                className="h-5 rounded-md px-1.5 text-[11px]"
                              >
                                {item.badge}
                              </Badge>
                            ) : null}
                            <ChevronRight
                              size={15}
                              className={cn(
                                "transition-transform duration-300",
                                expanded && "rotate-90",
                              )}
                            />
                          </span>
                        ) : null}
                      </button>
                      <div
                        className={cn(
                          "grid transition-[grid-template-rows,opacity] duration-300 ease-in-out",
                          expanded
                            ? "grid-rows-[1fr] opacity-100"
                            : "grid-rows-[0fr] opacity-0",
                        )}
                      >
                        <div className="overflow-hidden">
                          <div className="ml-4 mt-1 space-y-1 border-l pl-3">
                            {item.children
                              ?.filter((child) => child.roles.includes(role))
                              .map((child) => {
                                const childActive =
                                  pathname === child.href ||
                                  pathname.startsWith(`${child.href}/`);

                                return (
                                  <Link
                                    key={child.href}
                                    href={child.href}
                                    onClick={onNavigate}
                                    className={cn(
                                      "flex h-8 items-center gap-2 rounded-lg px-2 text-sm font-medium transition",
                                      childActive
                                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                                    )}
                                  >
                                    {child.icon}
                                    <span className="truncate">
                                      {child.title}
                                    </span>
                                  </Link>
                                );
                              })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.href}
                    href={allowed ? item.href : "#"}
                    onClick={onNavigate}
                    aria-disabled={!allowed}
                    title={item.title}
                    className={cn(
                      "flex h-9 items-center rounded-lg text-sm font-medium transition-all duration-200",
                      collapsed
                        ? "justify-center px-0"
                        : "justify-between px-2",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                      !allowed && "pointer-events-none opacity-35",
                    )}
                  >
                    <span
                      className={cn(
                        "flex min-w-0 items-center",
                        collapsed ? "justify-center" : "gap-2",
                      )}
                    >
                      {item.icon}
                      {!collapsed ? (
                        <span className="truncate">{item.title}</span>
                      ) : null}
                    </span>
                    {!collapsed && item.badge ? (
                      <Badge
                        variant="secondary"
                        className="h-5 rounded-md px-1.5 text-[11px]"
                      >
                        {item.badge}
                      </Badge>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div
        className={cn(
          "border-t p-3 transition-all duration-300",
          collapsed && "p-2",
        )}
      >
        <div
          className={cn(
            "rounded-lg border bg-muted/30 p-3 transition-all duration-300",
            collapsed && "border-transparent bg-transparent p-0",
          )}
        >
          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div
                className="flex size-9 items-center justify-center rounded-lg bg-background ring-1 ring-border"
                title={`${session.name} (${role})`}
              >
                <UserCog size={16} />
              </div>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={onLogout}
                aria-label="Sign out"
              >
                <LogOut size={14} />
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-background ring-1 ring-border">
                <UserCog size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate text-sm font-medium">
                    {session.name}
                  </div>
                  <Badge
                    variant="outline"
                    className="h-5 rounded-md px-1.5 text-[11px]"
                  >
                    {role}
                  </Badge>
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {session.email}
                </div>
              </div>
              <Button
                variant="outline"
                size="icon-sm"
                onClick={onLogout}
                aria-label="Sign out"
              >
                <LogOut size={14} />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function AppShell({
  children,
  session,
}: {
  children: ReactNode;
  session: ConsoleSession;
}) {
  const role = session.role;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      toast.error("Sign out failed.");
      return;
    }

    toast.success("Signed out.");
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-svh bg-muted/30 text-foreground">
      <div
        className={cn(
          "grid min-h-svh transition-[grid-template-columns] duration-300 ease-in-out",
          sidebarCollapsed
            ? "lg:grid-cols-[4.75rem_1fr]"
            : "lg:grid-cols-[16rem_1fr]",
        )}
      >
        <aside className="sticky top-0 hidden h-svh self-start overflow-hidden border-r bg-sidebar lg:block">
          <SidebarContent
            role={role}
            session={session}
            onLogout={logout}
            collapsed={sidebarCollapsed}
          />
        </aside>

        <div className="flex h-svh min-w-0 flex-col overflow-y-auto overscroll-contain">
          <header className="sticky top-0 z-40 h-16 shrink-0 border-b bg-background/90 backdrop-blur">
            <div className="flex h-full items-center gap-3 px-4">
              <Sheet open={open} onOpenChange={setOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="icon" className="lg:hidden">
                    <Menu size={16} />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 p-0">
                  <div className="absolute right-3 top-3 z-10">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setOpen(false)}
                    >
                      <X size={15} />
                    </Button>
                  </div>
                  <SidebarContent
                    role={role}
                    session={session}
                    onLogout={logout}
                    onNavigate={() => setOpen(false)}
                  />
                </SheetContent>
              </Sheet>

              <Button
                type="button"
                variant="outline"
                size="icon"
                className="hidden lg:inline-flex"
                aria-label={sidebarCollapsed ? "Open sidebar" : "Close sidebar"}
                onClick={() => setSidebarCollapsed((current) => !current)}
              >
                {sidebarCollapsed ? (
                  <PanelLeftOpen size={16} />
                ) : (
                  <PanelLeftClose size={16} />
                )}
              </Button>

              <div className="hidden h-6 w-px bg-border lg:block" />

              <label className="relative min-w-0 flex-1 md:max-w-md">
                <Search
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                  size={15}
                />
                <Input
                  className="h-9 bg-muted/40 pl-9 pr-16"
                  placeholder="Search app mappings, stores, credentials..."
                />
                <span className="absolute right-2 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground sm:flex">
                  <Command size={11} /> K
                </span>
              </label>

              <Button variant="outline" size="icon">
                <Bell size={16} />
              </Button>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

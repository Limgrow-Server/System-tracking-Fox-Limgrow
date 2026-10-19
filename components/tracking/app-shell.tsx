"use client";

import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Apple,
  Activity,
  BellRing,
  Cable,
  ChartSpline,
  ChevronRight,
  Command,
  CreditCard,
  Gauge,
  ListChecks,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Settings2,
  Search,
  Smartphone,
  UserCog,
  UsersRound,
} from "lucide-react";
import { ReactNode, useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command as CommandMenu,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { ConsoleSession } from "@/lib/auth/rbac";
import { showToast } from "@/lib/client/toast";
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
        title: "User Management",
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
            title: "Event catalog & GA4",
            href: "/configs/events",
            icon: <Activity size={15} />,
            roles: ["Admin"],
          },
          {
            title: "Notification topics",
            href: "/configs/notifications",
            icon: <BellRing size={15} />,
            roles: ["Admin"],
          },
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
      {
        title: "Incoming events",
        href: "/events",
        icon: <ListChecks size={17} />,
        roles: ["Admin", "Dev", "Marketing"],
      },
      {
        title: "Event analytics",
        href: "/analytics/events",
        icon: <ChartSpline size={17} />,
        roles: ["Admin", "Dev", "Marketing"],
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
];

function visibleNavItems(items: NavItem[], role: StaffRole): NavItem[] {
  return items
    .filter((item) => item.roles.includes(role))
    .map((item) => ({
      ...item,
      children: item.children
        ? visibleNavItems(item.children, role)
        : undefined,
    }))
    .filter((item) => !item.children || item.children.length > 0);
}

function visibleNavGroups(role: StaffRole) {
  return navGroups
    .map((group) => ({
      ...group,
      items: visibleNavItems(group.items, role),
    }))
    .filter((group) => group.items.length > 0);
}

function searchableItems(role: StaffRole) {
  const items = visibleNavGroups(role).flatMap((group) =>
    group.items.flatMap((item) => [
      { ...item, group: group.title },
      ...(item.children ?? []).map((child) => ({
        ...child,
        group: item.title,
      })),
    ]),
  );

  return Array.from(new Map(items.map((item) => [item.href, item])).values());
}

function NavPendingDot({ className }: { className?: string }) {
  const { pending } = useLinkStatus();

  return (
    <span
      aria-hidden
      className={cn(
        "ml-auto size-1.5 shrink-0 rounded-full bg-current opacity-0 transition-opacity delay-100",
        pending && "animate-pulse opacity-70",
        className,
      )}
    />
  );
}

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
  const groups = visibleNavGroups(role);

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
          "flex-1 overflow-y-auto overscroll-contain p-3 transition-all duration-300",
          collapsed ? "space-y-3 px-2" : "space-y-5",
        )}
      >
        {groups.map((group) => (
          <div key={group.title}>
            {!collapsed ? (
              <div className="mb-2 px-2 text-xs font-medium text-muted-foreground">
                {group.title}
              </div>
            ) : null}
            <div className="space-y-1">
              {group.items.map((item) => {
                const hasChildren = Boolean(item.children?.length);
                const activeChildHref = hasChildren
                  ? item
                      .children!.filter(
                        (child) =>
                          pathname === child.href ||
                          pathname.startsWith(`${child.href}/`),
                      )
                      .sort((a, b) => b.href.length - a.href.length)[0]?.href
                  : null;
                const active = hasChildren
                  ? Boolean(activeChildHref)
                  : pathname === item.href ||
                    pathname.startsWith(`${item.href}/`);
                const expanded = hasChildren
                  ? !collapsed && (expandedItems[item.href] ?? active)
                  : false;

                if (hasChildren) {
                  return (
                    <div key={item.href}>
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
                                  child.href === activeChildHref;

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
                                    aria-current={
                                      childActive ? "page" : undefined
                                    }
                                  >
                                    {child.icon}
                                    <span className="truncate">
                                      {child.title}
                                    </span>
                                    <NavPendingDot />
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
                    href={item.href}
                    onClick={onNavigate}
                    title={item.title}
                    className={cn(
                      "flex h-9 items-center rounded-lg text-sm font-medium transition-all duration-200",
                      collapsed
                        ? "justify-center px-0"
                        : "justify-between px-2",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    aria-current={active ? "page" : undefined}
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
                        <NavPendingDot />
                      </span>
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
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const searchItems = useMemo(() => searchableItems(role), [role]);

  useEffect(() => {
    function openSearch(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || (!event.metaKey && !event.ctrlKey))
        return;
      event.preventDefault();
      setSearchOpen((current) => !current);
    }

    document.addEventListener("keydown", openSearch);
    return () => document.removeEventListener("keydown", openSearch);
  }, []);

  async function logout() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) {
      await showToast("error", "Sign out failed.");
      return;
    }

    await showToast("success", "Signed out.");
    router.replace("/login");
    router.refresh();
  }

  return (
    <div className="min-h-svh bg-muted/30 text-foreground">
      <a
        href="#main-content"
        className="fixed left-3 top-3 z-50 -translate-y-20 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-transform focus:translate-y-0"
      >
        Skip to content
      </a>
      <div
        className={cn(
          "grid min-h-svh transition-[grid-template-columns] duration-300 ease-in-out",
          sidebarCollapsed
            ? "lg:grid-cols-[4.75rem_1fr]"
            : "lg:grid-cols-[16rem_1fr]",
        )}
      >
        <aside className="sticky top-0 hidden h-svh self-start overflow-hidden overscroll-contain border-r bg-sidebar lg:block">
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
                  <Button
                    variant="outline"
                    size="icon"
                    className="lg:hidden"
                    aria-label="Open navigation"
                  >
                    <Menu size={16} />
                  </Button>
                </SheetTrigger>
                <SheetContent
                  side="left"
                  className="w-72 gap-0 bg-sidebar p-0 sm:max-w-72 lg:hidden"
                >
                  <SheetTitle className="sr-only">Navigation</SheetTitle>
                  <SheetDescription className="sr-only">
                    Primary navigation for the administration console.
                  </SheetDescription>
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

              <Button
                type="button"
                variant="outline"
                className="h-9 min-w-0 flex-1 justify-start bg-muted/40 text-muted-foreground md:max-w-md"
                onClick={() => setSearchOpen(true)}
              >
                <Search size={15} />
                <span className="truncate">Search pages and operations</span>
                <span className="ml-auto hidden items-center gap-1 rounded-md border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground sm:flex">
                  <Command size={11} /> K
                </span>
              </Button>
            </div>
          </header>

          <main
            id="main-content"
            key={pathname}
            tabIndex={-1}
            className="mx-auto w-full max-w-[1600px] flex-1 p-4 outline-none motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 sm:p-6"
          >
            {children}
          </main>
        </div>
      </div>

      <CommandDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        title="Navigate the tracking console"
        description="Search pages and operational tools."
        showCloseButton
      >
        <CommandMenu>
          <CommandInput
            autoFocus
            placeholder="Search pages and operations..."
          />
          <CommandList>
            <CommandEmpty>No matching page found.</CommandEmpty>
            <CommandGroup heading="Navigation">
              {searchItems.map((item) => (
                <CommandItem
                  key={item.href}
                  value={`${item.title} ${item.group}`}
                  onSelect={() => {
                    setSearchOpen(false);
                    router.push(item.href);
                  }}
                >
                  {item.icon}
                  <span className="flex-1">{item.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {item.group}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </CommandMenu>
      </CommandDialog>
    </div>
  );
}

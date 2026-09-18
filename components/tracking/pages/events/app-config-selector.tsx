"use client";

import { useMemo, useState } from "react";
import { Apple, ChevronsUpDown, Layers3, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AppConfigOption } from "@/lib/tracking/app-config";
import { cn } from "@/lib/utils";

type PlatformFilter = "all" | AppConfigOption["platform"];

export function AppConfigSelector({
  apps,
  disabled,
  onChange,
  placeholder = "Chọn ứng dụng...",
  value,
}: {
  apps: AppConfigOption[];
  disabled?: boolean;
  onChange: (app: AppConfigOption) => void;
  placeholder?: string;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const selected = apps.find((app) => app.key === value) ?? null;
  const groupedApps = useMemo(
    () => ({
      android: apps.filter((app) => app.platform === "android"),
      ios: apps.filter((app) => app.platform === "ios"),
    }),
    [apps],
  );
  const androidApps = platformFilter === "ios" ? [] : groupedApps.android;
  const iosApps = platformFilter === "android" ? [] : groupedApps.ios;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled || apps.length === 0}
          className="h-auto min-h-11 w-full justify-between px-3 py-2 text-left"
        >
          {selected ? (
            <SelectedApp app={selected} />
          ) : (
            <span className="text-muted-foreground">
              {apps.length ? placeholder : "Chưa có app mapping"}
            </span>
          )}
          <ChevronsUpDown className="ml-3 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder="Tìm theo tên, App ID hoặc nền tảng..." />
          <div
            className="grid grid-cols-3 gap-1 border-b p-2"
            role="group"
            aria-label="Lọc ứng dụng theo nền tảng"
          >
            <PlatformFilterButton
              active={platformFilter === "all"}
              count={apps.length}
              icon={Layers3}
              label="Tất cả"
              onClick={() => setPlatformFilter("all")}
            />
            <PlatformFilterButton
              active={platformFilter === "android"}
              count={groupedApps.android.length}
              icon={Smartphone}
              label="Android"
              onClick={() => setPlatformFilter("android")}
            />
            <PlatformFilterButton
              active={platformFilter === "ios"}
              count={groupedApps.ios.length}
              icon={Apple}
              label="iOS"
              onClick={() => setPlatformFilter("ios")}
            />
          </div>
          <CommandList>
            <CommandEmpty>Không tìm thấy ứng dụng.</CommandEmpty>
            <AppGroup
              apps={androidApps}
              label="Android"
              selectedKey={value}
              onSelect={(app) => {
                onChange(app);
                setOpen(false);
              }}
            />
            {androidApps.length && iosApps.length ? <CommandSeparator /> : null}
            <AppGroup
              apps={iosApps}
              label="iOS"
              selectedKey={value}
              onSelect={(app) => {
                onChange(app);
                setOpen(false);
              }}
            />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function AppGroup({
  apps,
  label,
  onSelect,
  selectedKey,
}: {
  apps: AppConfigOption[];
  label: string;
  onSelect: (app: AppConfigOption) => void;
  selectedKey: string;
}) {
  if (!apps.length) return null;
  return (
    <CommandGroup heading={label}>
      {apps.map((app) => (
        <CommandItem
          key={app.key}
          value={`${app.appName} ${app.appId} ${app.platform} ${app.key}`}
          data-checked={app.key === selectedKey}
          onSelect={() => onSelect(app)}
          className="py-2"
        >
          <AppIcon app={app} compact />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">{app.appName}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {app.appId}
            </span>
          </span>
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

function SelectedApp({ app }: { app: AppConfigOption }) {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <AppIcon app={app} />
      <span className="min-w-0">
        <span className="block truncate font-medium">{app.appName}</span>
        <span className="block truncate font-mono text-xs text-muted-foreground">
          {app.appId}
        </span>
      </span>
    </span>
  );
}

function PlatformFilterButton({
  active,
  count,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  icon: typeof Apple;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex h-8 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-medium transition-colors",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon size={13} />
      <span>{label}</span>
      <span
        className={cn("tabular-nums", active ? "opacity-70" : "opacity-50")}
      >
        {count}
      </span>
    </button>
  );
}

function AppIcon({
  app,
  compact,
}: {
  app: AppConfigOption;
  compact?: boolean;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const platformIcon =
    app.platform === "android" ? <Smartphone size={10} /> : <Apple size={10} />;

  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-visible rounded-[0.65rem] border bg-muted text-sm font-semibold text-muted-foreground",
        compact ? "size-8" : "size-10",
      )}
    >
      {app.iconUrl && !imageFailed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={app.iconUrl}
          alt=""
          className="size-full rounded-[0.6rem] object-cover"
          decoding="async"
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span aria-hidden="true">
          {app.appName.trim().charAt(0).toUpperCase() || "A"}
        </span>
      )}
      <span
        className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border-2 border-background bg-foreground text-background"
        aria-label={app.platform === "android" ? "Android" : "iOS"}
      >
        {platformIcon}
      </span>
    </span>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ChevronsUpDown,
  MessageSquareReply,
  RotateCcw,
  Save,
  Search,
  Smartphone,
  Star,
} from "lucide-react";
import { toast } from "sonner";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyPanel,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/tracking/primitives";
import { compactNumber, dateTime } from "@/lib/tracking/format";
import type {
  ReplyConfigPageData,
  ReviewAppCard,
  ReviewReplyTemplateDto,
} from "@/lib/tracking/page-data";
import { cn } from "@/lib/utils";

const RATINGS = [5, 4, 3, 2, 1] as const;
const MAX_REPLY_TEXT_LENGTH = 350;
const ALL_STORES = "All Stores";

type DraftTemplates = Record<string, ReviewReplyTemplateDto[]>;

type SaveTemplatesResponse = {
  ok?: boolean;
  message?: string;
  templates?: ReviewReplyTemplateDto[];
  error?: string;
};

function defaultTemplates(storeMappingId: string): ReviewReplyTemplateDto[] {
  return RATINGS.map((rating) => ({
    id: null,
    isActive: false,
    rating,
    replyText: "",
    storeMappingId,
    updatedAt: null,
    updatedBy: null,
  }));
}

function initialDrafts(data: ReplyConfigPageData): DraftTemplates {
  return Object.fromEntries(
    data.apps.map((app) => [
      app.mappingId,
      data.templatesByMappingId[app.mappingId] ?? defaultTemplates(app.mappingId),
    ]),
  );
}

function ratingLabel(rating: number) {
  return `${rating} star${rating === 1 ? "" : "s"}`;
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5 text-amber-500">
      {Array.from({ length: rating }, (_, index) => (
        <Star key={index} size={13} className="fill-current" />
      ))}
    </div>
  );
}

function AppListItem({
  app,
  active,
  onSelect,
}: {
  app: ReviewAppCard;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition",
        active
          ? "border-primary bg-primary/5 shadow-sm"
          : "bg-background hover:bg-muted/40",
      )}
    >
      <Avatar className="size-10 rounded-lg border">
        {app.appIconUrl ? (
          <AvatarImage
            src={app.appIconUrl}
            alt={app.appName}
            className="rounded-lg"
          />
        ) : null}
        <AvatarFallback className="rounded-lg text-xs">
          {app.appName.slice(0, 2).toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-sm font-medium">{app.appName}</div>
          <Badge
            variant="outline"
            className="shrink-0 gap-1 border-emerald-200 bg-emerald-50 px-1.5 text-[11px] text-emerald-700"
          >
            <Smartphone size={11} />
            Android
          </Badge>
        </div>
        <div className="mt-1 truncate text-xs text-muted-foreground">
          {app.identifier}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{compactNumber(app.reviewCount)} reviews</span>
          <span>{compactNumber(app.pendingReplyCount)} pending</span>
          <StatusBadge status={app.lastSyncStatus ?? "not_found"} />
        </div>
      </div>
    </button>
  );
}

function TemplateEditor({
  app,
  template,
  onChange,
}: {
  app: ReviewAppCard;
  template: ReviewReplyTemplateDto;
  onChange: (
    rating: number,
    patch: Partial<Pick<ReviewReplyTemplateDto, "replyText" | "isActive">>,
  ) => void;
}) {
  const textareaId = `reply-template-${app.mappingId}-${template.rating}`;
  const activeWithoutText = template.isActive && !template.replyText.trim();

  return (
    <section
      className={cn(
        "rounded-lg border bg-background p-4",
        activeWithoutText && "border-amber-300 bg-amber-50/40",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Label htmlFor={textareaId} className="text-base">
              {ratingLabel(template.rating)}
            </Label>
            <RatingStars rating={template.rating} />
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Updated {dateTime(template.updatedAt)}
            {template.updatedBy ? ` by ${template.updatedBy}` : ""}
          </div>
        </div>

        <label className="flex w-fit items-center gap-2 rounded-md border bg-card px-2.5 py-2 text-sm">
          <Checkbox
            checked={template.isActive}
            onCheckedChange={(checked) =>
              onChange(template.rating, { isActive: checked === true })
            }
          />
          Active
        </label>
      </div>

      <Textarea
        id={textareaId}
        value={template.replyText}
        maxLength={MAX_REPLY_TEXT_LENGTH}
        className="mt-3 min-h-28 resize-y bg-card"
        placeholder={`Reply template for ${ratingLabel(template.rating)} reviews`}
        onChange={(event) =>
          onChange(template.rating, { replyText: event.target.value })
        }
      />

      <div className="mt-2 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          {template.replyText.length}/{MAX_REPLY_TEXT_LENGTH} characters
        </span>
        {activeWithoutText ? (
          <span className="font-medium text-amber-700">
            Active templates need reply text.
          </span>
        ) : null}
      </div>
    </section>
  );
}

export function ReplyConfigPage({ data }: { data: ReplyConfigPageData }) {
  const [search, setSearch] = useState("");
  const [openStoreFilter, setOpenStoreFilter] = useState(false);
  const [selectedStore, setSelectedStore] = useState(ALL_STORES);
  const [selectedAppId, setSelectedAppId] = useState(
    data.apps[0]?.mappingId ?? "",
  );
  const [drafts, setDrafts] = useState<DraftTemplates>(() =>
    initialDrafts(data),
  );
  const [saving, setSaving] = useState(false);

  const selectedApp = useMemo(
    () => data.apps.find((app) => app.mappingId === selectedAppId) ?? null,
    [data.apps, selectedAppId],
  );
  const selectedTemplates = selectedApp
    ? drafts[selectedApp.mappingId] ?? defaultTemplates(selectedApp.mappingId)
    : [];
  const storeNames = useMemo(
    () => Array.from(new Set(data.apps.map((app) => app.storeAccountName))).sort(),
    [data.apps],
  );
  const filteredApps = useMemo(() => {
    const query = search.toLowerCase();

    return data.apps.filter(
      (app) =>
        (selectedStore === ALL_STORES ||
          app.storeAccountName === selectedStore) &&
        (!query ||
          app.appName.toLowerCase().includes(query) ||
          app.identifier.toLowerCase().includes(query) ||
          app.storeAccountName.toLowerCase().includes(query)),
    );
  }, [data.apps, search, selectedStore]);
  const totalActiveTemplates = Object.values(drafts)
    .flat()
    .filter((template) => template.isActive && template.replyText.trim()).length;
  const selectedActiveTemplates = selectedTemplates.filter(
    (template) => template.isActive && template.replyText.trim(),
  ).length;

  function updateTemplate(
    rating: number,
    patch: Partial<Pick<ReviewReplyTemplateDto, "replyText" | "isActive">>,
  ) {
    if (!selectedApp) return;

    setDrafts((current) => {
      const templates =
        current[selectedApp.mappingId] ?? defaultTemplates(selectedApp.mappingId);

      return {
        ...current,
        [selectedApp.mappingId]: templates.map((template) =>
          template.rating === rating ? { ...template, ...patch } : template,
        ),
      };
    });
  }

  function changeStoreFilter(storeName: string) {
    setSelectedStore(storeName);

    const currentApp = data.apps.find((app) => app.mappingId === selectedAppId);
    const currentAppMatches =
      storeName === ALL_STORES || currentApp?.storeAccountName === storeName;

    if (!currentAppMatches) {
      setSelectedAppId(
        data.apps.find(
          (app) =>
            storeName === ALL_STORES || app.storeAccountName === storeName,
        )?.mappingId ?? "",
      );
    }
  }

  function resetSelectedApp() {
    if (!selectedApp) return;

    setDrafts((current) => ({
      ...current,
      [selectedApp.mappingId]:
        data.templatesByMappingId[selectedApp.mappingId] ??
        defaultTemplates(selectedApp.mappingId),
    }));
    toast.success("Reply templates reset.");
  }

  async function saveSelectedApp() {
    if (!selectedApp || saving) return;

    const invalidTemplate = selectedTemplates.find(
      (template) => template.isActive && !template.replyText.trim(),
    );
    if (invalidTemplate) {
      toast.error(`${ratingLabel(invalidTemplate.rating)} template needs text.`);
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/review-reply-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeMappingId: selectedApp.mappingId,
          templates: selectedTemplates.map((template) => ({
            isActive: template.isActive,
            rating: template.rating,
            replyText: template.replyText,
          })),
        }),
      });
      const payload = (await response.json()) as SaveTemplatesResponse;

      if (!response.ok || !payload.ok || !payload.templates) {
        throw new Error(payload.error ?? "Reply templates could not be saved.");
      }

      setDrafts((current) => ({
        ...current,
        [selectedApp.mappingId]: payload.templates!,
      }));
      toast.success(payload.message ?? "Reply templates saved.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Reply templates could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (!data.apps.length) {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          eyebrow="Google Play"
          title="Reply Config"
          description="Review reply templates are configured per Android app."
        />
        <EmptyPanel
          icon={MessageSquareReply}
          title="No Android apps"
          description="Create an active Android App Mapping before configuring review replies."
          className="rounded-lg border"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        eyebrow="Google Play"
        title="Reply Config"
        description="Configure reusable review reply templates for each rating."
        action={
          <Badge
            variant="outline"
            className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
          >
            <Smartphone size={12} />
            Android
          </Badge>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Mapped Apps"
          value={compactNumber(data.apps.length)}
          detail="Active Android mappings"
          icon={Smartphone}
          trend="flat"
        />
        <StatCard
          label="Active Templates"
          value={compactNumber(totalActiveTemplates)}
          detail="Enabled rating replies"
          icon={CheckCircle2}
          trend="flat"
        />
        <StatCard
          label="Selected App"
          value={`${selectedActiveTemplates}/5`}
          detail="Active rating templates"
          icon={MessageSquareReply}
          trend={selectedActiveTemplates === 5 ? "up" : "flat"}
        />
        <StatCard
          label="Pending Replies"
          value={compactNumber(
            data.apps.reduce((total, app) => total + app.pendingReplyCount, 0),
          )}
          detail="Fetched reviews without reply"
          icon={Star}
          trend="flat"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="rounded-lg">
          <CardHeader className="flex items-center justify-between gap-3 border-b">
            <CardTitle className="text-base">Apps</CardTitle>
            <Popover
              open={openStoreFilter}
              onOpenChange={setOpenStoreFilter}
            >
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={openStoreFilter}
                  className="h-8 w-[9.75rem] shrink-0 justify-between bg-background px-3 font-normal"
                >
                  <span className="truncate">{selectedStore}</span>
                  <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-0" align="end">
                <Command>
                  <CommandInput placeholder="Search store..." />
                  <CommandList>
                    <CommandEmpty>No store found.</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value={ALL_STORES}
                        onSelect={() => {
                          changeStoreFilter(ALL_STORES);
                          setOpenStoreFilter(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 size-4",
                            selectedStore === ALL_STORES
                              ? "opacity-100"
                              : "opacity-0",
                          )}
                        />
                        {ALL_STORES}
                      </CommandItem>
                      {storeNames.map((storeName) => (
                        <CommandItem
                          key={storeName}
                          value={storeName}
                          onSelect={() => {
                            changeStoreFilter(storeName);
                            setOpenStoreFilter(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 size-4",
                              selectedStore === storeName
                                ? "opacity-100"
                                : "opacity-0",
                            )}
                          />
                          <span className="truncate">{storeName}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                className="pl-8"
                placeholder="Search apps or stores..."
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="max-h-[56rem] space-y-2 overflow-y-auto pr-1">
              {filteredApps.map((app) => (
                <AppListItem
                  key={app.mappingId}
                  app={app}
                  active={app.mappingId === selectedAppId}
                  onSelect={() => setSelectedAppId(app.mappingId)}
                />
              ))}
              {!filteredApps.length ? (
                <EmptyPanel
                  icon={Search}
                  title="No apps found"
                  description="No mapped Android app matches the current search."
                  className="rounded-lg border"
                />
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-lg">
          <CardHeader className="gap-4 border-b">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0">
                <CardTitle className="text-base">
                  {selectedApp?.appName ?? "No app selected"}
                </CardTitle>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="truncate">{selectedApp?.identifier}</span>
                  {selectedApp?.storeAccountName ? (
                    <Badge variant="outline">{selectedApp.storeAccountName}</Badge>
                  ) : null}
                  <span>
                    Last fetch {dateTime(selectedApp?.lastFetchedAt ?? null)}
                  </span>
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!selectedApp || saving}
                  onClick={resetSelectedApp}
                >
                  <RotateCcw size={15} />
                  Reset
                </Button>
                <Button
                  type="button"
                  disabled={!selectedApp || saving}
                  onClick={saveSelectedApp}
                >
                  {saving ? <Spinner /> : <Save size={15} />}
                  Save
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 p-4">
            {selectedApp ? (
              selectedTemplates.map((template) => (
                <TemplateEditor
                  key={template.rating}
                  app={selectedApp}
                  template={template}
                  onChange={updateTemplate}
                />
              ))
            ) : (
              <EmptyPanel
                icon={MessageSquareReply}
                title="No app selected"
                description="Select an Android app to configure reply templates."
                className="rounded-lg border"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Globe,
  Mail,
  MessageSquareReply,
  Phone,
  RotateCcw,
  Save,
  Search,
  Smartphone,
  Star,
} from "lucide-react";
import { showToast } from "@/lib/client/toast";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import {
  EmptyPanel,
  PageHeader,
  StatusBadge,
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import { PendingNavigationLink } from "@/components/tracking/pending-navigation-link";
import { compactNumber, dateTime } from "@/lib/tracking/format";
import {
  MAX_REVIEW_REPLY_TEXT_LENGTH,
  REVIEW_REPLY_TEMPLATE_TOKENS,
  renderReviewReplyTemplate,
} from "@/lib/tracking/reply-template";
import type {
  PaginationMeta,
  ReplyConfigPageData,
  ReviewAppCard,
  ReviewReplyTemplateDto,
} from "@/lib/tracking/page-data";
import { cn } from "@/lib/utils";

const RATINGS = [5, 4, 3, 2, 1] as const;
const MAX_REPLY_TEXT_LENGTH = MAX_REVIEW_REPLY_TEXT_LENGTH;

type DraftTemplates = Record<string, ReviewReplyTemplateDto[]>;
type StoreInfoDraft = {
  contactEmail: string;
  supportPhone: string;
  websiteUrl: string;
};
type MentionState = {
  end: number;
  query: string;
  start: number;
};

type SaveTemplatesResponse = {
  ok?: boolean;
  message?: string;
  templates?: ReviewReplyTemplateDto[];
  error?: string;
};

type SaveStoreInfoResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  store?: {
    contactEmail: string | null;
    supportPhone: string | null;
    websiteUrl: string | null;
  };
};

type ReplyStoreAppsResponse = {
  data?: ReviewAppCard[];
  error?: string;
  page?: number;
  pageSize?: number;
  success?: boolean;
  templatesByMappingId?: Record<string, ReviewReplyTemplateDto[]>;
  total?: number;
  totalPages?: number;
};

function platformBadgeClass(platform: ReviewAppCard["platform"]) {
  return platform === "ios"
    ? "border-sky-200 bg-sky-50 text-sky-700"
    : "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function platformLabel(platform: ReviewAppCard["platform"]) {
  return platform === "ios" ? "iOS" : "Android";
}

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

function draftsForApps(
  apps: ReviewAppCard[],
  templatesByMappingId: Record<string, ReviewReplyTemplateDto[]>,
): DraftTemplates {
  return Object.fromEntries(
    apps.map((app) => [
      app.mappingId,
      templatesByMappingId[app.mappingId] ?? defaultTemplates(app.mappingId),
    ]),
  );
}

function initialDrafts(data: ReplyConfigPageData): DraftTemplates {
  return draftsForApps(data.apps, data.templatesByMappingId);
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
            className={cn(
              "shrink-0 gap-1 px-1.5 text-[11px]",
              platformBadgeClass(app.platform),
            )}
          >
            <Smartphone size={11} />
            {platformLabel(app.platform)}
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
  storeInfo,
  template,
  onChange,
}: {
  app: ReviewAppCard;
  storeInfo: StoreInfoDraft;
  template: ReviewReplyTemplateDto;
  onChange: (
    rating: number,
    patch: Partial<Pick<ReviewReplyTemplateDto, "replyText" | "isActive">>,
  ) => void;
}) {
  const textareaId = `reply-template-${app.mappingId}-${template.rating}`;
  const [mention, setMention] = useState<MentionState | null>(null);
  const [activeVariableIndex, setActiveVariableIndex] = useState(0);
  const activeWithoutText = template.isActive && !template.replyText.trim();
  const previewText = renderReviewReplyTemplate(template.replyText, {
    appName: app.appName,
    authorName: "Evans Wilson",
    contactEmail: storeInfo.contactEmail,
    storeName: app.storeAccountName,
    supportPhone: storeInfo.supportPhone,
    websiteUrl: storeInfo.websiteUrl,
  });
  const previewTooLong = previewText.length > MAX_REPLY_TEXT_LENGTH;
  const matchingVariables = useMemo(() => {
    const query = mention?.query.toLowerCase() ?? "";

    return REVIEW_REPLY_TEMPLATE_TOKENS.filter((item) => {
      if (!query) return true;

      return [
        item.description,
        item.label,
        ...item.searchTerms,
        item.token,
      ].some((value) => value.toLowerCase().includes(query));
    });
  }, [mention?.query]);

  function updateMentionState(text: string, cursor: number) {
    const beforeCursor = text.slice(0, cursor);
    const match = /(?:^|\s)@([A-Za-z_]*)$/.exec(beforeCursor);

    if (!match) {
      setMention(null);
      setActiveVariableIndex(0);
      return;
    }

    setMention({
      end: cursor,
      query: match[1] ?? "",
      start: beforeCursor.lastIndexOf("@"),
    });
    setActiveVariableIndex(0);
  }

  function insertVariable(variable: string, range?: Pick<MentionState, "end" | "start">) {
    const textarea = document.getElementById(
      textareaId,
    ) as HTMLTextAreaElement | null;
    const currentText = textarea?.value ?? template.replyText;
    const start = range?.start ?? textarea?.selectionStart ?? currentText.length;
    const end = range?.end ?? textarea?.selectionEnd ?? start;
    const before = currentText.slice(0, start);
    const after = currentText.slice(end);
    const needsSpace =
      !range && before && !before.endsWith(" ") && !before.endsWith("\n");
    const needsTrailingSpace =
      after && !/^[\s.,!?;:)\]}]/.test(after);
    const insertion = `${needsSpace ? " " : ""}${variable}${needsTrailingSpace ? " " : ""}`;
    const nextValue = `${before}${insertion}${after}`.slice(0, MAX_REPLY_TEXT_LENGTH);
    const cursorPosition = Math.min(
      before.length + insertion.length,
      nextValue.length,
    );

    onChange(template.rating, { replyText: nextValue });
    setMention(null);
    setActiveVariableIndex(0);
    requestAnimationFrame(() => {
      const nextTextarea = document.getElementById(
        textareaId,
      ) as HTMLTextAreaElement | null;
      nextTextarea?.focus();
      nextTextarea?.setSelectionRange(cursorPosition, cursorPosition);
    });
  }

  function completeMention(index = activeVariableIndex) {
    const option = matchingVariables[index];
    if (!mention || !option) return;

    insertVariable(option.token, mention);
  }

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
        onChange={(event) => {
          onChange(template.rating, { replyText: event.target.value });
          updateMentionState(
            event.target.value,
            event.target.selectionStart ?? event.target.value.length,
          );
        }}
        onClick={(event) => {
          const textarea = event.currentTarget;
          updateMentionState(textarea.value, textarea.selectionStart);
        }}
        onKeyDown={(event) => {
          if (!mention || !matchingVariables.length) return;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveVariableIndex((current) =>
              current >= matchingVariables.length - 1 ? 0 : current + 1,
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveVariableIndex((current) =>
              current <= 0 ? matchingVariables.length - 1 : current - 1,
            );
          } else if (event.key === "Enter" || event.key === "Tab") {
            event.preventDefault();
            completeMention();
          } else if (event.key === "Escape") {
            setMention(null);
          }
        }}
        onKeyUp={(event) => {
          if (
            ["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(
              event.key,
            )
          ) {
            return;
          }

          const textarea = event.currentTarget;
          updateMentionState(textarea.value, textarea.selectionStart);
        }}
      />

      {mention && matchingVariables.length ? (
        <div className="relative z-20">
          <div className="absolute left-0 top-1 w-full max-w-sm overflow-hidden rounded-lg border bg-popover p-1 shadow-lg">
            {matchingVariables.map((item, index) => (
              <button
                key={item.token}
                type="button"
                className={cn(
                  "flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm",
                  index === activeVariableIndex
                    ? "bg-accent text-accent-foreground"
                    : "hover:bg-accent/70",
                )}
                onMouseEnter={() => setActiveVariableIndex(index)}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertVariable(item.token, mention)}
              >
                <span className="font-medium">{item.label}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {item.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 rounded-lg border bg-muted/20 p-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="shrink-0 sm:w-44">
            <div className="text-xs font-medium text-muted-foreground">
              Variables
            </div>
            <div className="mt-0.5 text-[11px] leading-4 text-muted-foreground">
              Type @ in the template to search variables.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {REVIEW_REPLY_TEMPLATE_TOKENS.map((item) => (
              <Button
                key={item.token}
                type="button"
                variant="outline"
                size="sm"
                title={`${item.description}: ${item.token}`}
                className="h-7 rounded-full bg-background px-3 text-xs"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => insertVariable(item.token)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-3 rounded-lg border bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Preview
          </span>
          <span
            className={cn(
              "text-xs",
              previewTooLong ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {previewText.length}/{MAX_REPLY_TEXT_LENGTH} mapped
          </span>
        </div>
        {previewText ? (
          <div className="mt-2 whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm leading-5 text-foreground">
            {previewText}
          </div>
        ) : (
          <div className="mt-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
            No preview.
          </div>
        )}
        {previewTooLong ? (
          <div className="mt-2 text-xs font-medium text-destructive">
            Mapped reply is longer than {MAX_REPLY_TEXT_LENGTH} characters.
          </div>
        ) : null}
      </div>

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
  const [apps, setApps] = useState(data.apps);
  const [appPagination, setAppPagination] =
    useState<PaginationMeta>(data.appPagination);
  const [templatesByMappingId, setTemplatesByMappingId] = useState(
    data.templatesByMappingId,
  );
  const [search, setSearch] = useState(data.filters.search);
  const [selectedAppId, setSelectedAppId] = useState(
    data.apps[0]?.mappingId ?? "",
  );
  const [storeInfo, setStoreInfo] = useState<StoreInfoDraft>({
    contactEmail: data.store.contactEmail ?? "",
    supportPhone: data.store.supportPhone ?? "",
    websiteUrl: data.store.websiteUrl ?? "",
  });
  const [drafts, setDrafts] = useState<DraftTemplates>(() =>
    initialDrafts(data),
  );
  const [saving, setSaving] = useState(false);
  const [savingStoreInfo, setSavingStoreInfo] = useState(false);
  const [loadingApps, setLoadingApps] = useState(false);

  const selectedApp = useMemo(
    () => apps.find((app) => app.mappingId === selectedAppId) ?? null,
    [apps, selectedAppId],
  );
  const selectedTemplates = selectedApp
    ? drafts[selectedApp.mappingId] ?? defaultTemplates(selectedApp.mappingId)
    : [];

  async function loadAppsPage(page: number, nextSearch = search) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: "10",
      storeProfileId: data.store.storeProfileId,
    });

    if (nextSearch.trim()) params.set("search", nextSearch.trim());

    setLoadingApps(true);

    try {
      const response = await fetch(`/api/reply/store-apps?${params.toString()}`);
      const payload = (await response.json()) as ReplyStoreAppsResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "Reply apps could not be loaded.");
      }

      const nextTemplates = payload.templatesByMappingId ?? {};
      setApps(payload.data);
      setAppPagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? 10,
        total: payload.total ?? payload.data.length,
        totalPages: payload.totalPages ?? 1,
      });
      setTemplatesByMappingId(nextTemplates);
      setDrafts(draftsForApps(payload.data, nextTemplates));
      setSelectedAppId(payload.data[0]?.mappingId ?? "");
    } catch (error) {
      void showToast("error",
        error instanceof Error ? error.message : "Reply apps could not be loaded.",
      );
    } finally {
      setLoadingApps(false);
    }
  }

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

  function resetSelectedApp() {
    if (!selectedApp) return;

    setDrafts((current) => ({
      ...current,
      [selectedApp.mappingId]:
        templatesByMappingId[selectedApp.mappingId] ??
        defaultTemplates(selectedApp.mappingId),
    }));
    void showToast("success", "Reply templates reset.");
  }

  async function saveStoreInfo() {
    if (savingStoreInfo) return;

    setSavingStoreInfo(true);

    try {
      const response = await fetch("/api/reply-store-info", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactEmail: storeInfo.contactEmail,
          platform: data.store.platform,
          storeProfileId: data.store.storeProfileId,
          supportPhone: storeInfo.supportPhone,
          websiteUrl: storeInfo.websiteUrl,
        }),
      });
      const payload = (await response.json()) as SaveStoreInfoResponse;

      if (!response.ok || !payload.ok || !payload.store) {
        throw new Error(payload.error ?? "Store info could not be saved.");
      }

      setStoreInfo({
        contactEmail: payload.store.contactEmail ?? "",
        supportPhone: payload.store.supportPhone ?? "",
        websiteUrl: payload.store.websiteUrl ?? "",
      });
      void showToast("success", payload.message ?? "Store info saved.");
    } catch (error) {
      void showToast("error",
        error instanceof Error ? error.message : "Store info could not be saved.",
      );
    } finally {
      setSavingStoreInfo(false);
    }
  }

  async function saveSelectedApp() {
    if (!selectedApp || saving) return;

    const invalidTemplate = selectedTemplates.find(
      (template) => template.isActive && !template.replyText.trim(),
    );
    if (invalidTemplate) {
      void showToast("error", `${ratingLabel(invalidTemplate.rating)} template needs text.`);
      return;
    }

    setSaving(true);

    try {
      const response = await fetch("/api/review-reply-templates", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platform: selectedApp.platform,
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
      setTemplatesByMappingId((current) => ({
        ...current,
        [selectedApp.mappingId]: payload.templates!,
      }));
      void showToast("success", payload.message ?? "Reply templates saved.");
    } catch (error) {
      void showToast("error",
        error instanceof Error
          ? error.message
          : "Reply templates could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (data.appPagination.total === 0) {
    return (
      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <PageHeader
          eyebrow="App Stores"
          title={data.store.storeAccountName}
          description="Review reply templates are configured per store."
        />
        <EmptyPanel
          icon={MessageSquareReply}
          title="No apps"
          description="Create an active App Mapping before configuring review replies."
          className="rounded-lg border"
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <nav className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <PendingNavigationLink
          href="/reply"
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Stores
        </PendingNavigationLink>
        <span className="text-muted-foreground">/</span>
        <span className="truncate text-foreground">
          {data.store.storeAccountName}
        </span>
      </nav>

      <Card className="rounded-lg">
        <CardHeader className="flex items-center justify-between gap-3 border-b">
          <div>
            <CardTitle className="text-base">Store Info</CardTitle>
            <div className="mt-1 text-xs text-muted-foreground">
              Shared values available to every app reply template in this store.
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={savingStoreInfo}
            onClick={saveStoreInfo}
          >
            {savingStoreInfo ? <Spinner /> : <Save size={15} />}
            Save Info
          </Button>
        </CardHeader>
        <CardContent className="grid gap-4 p-4 md:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="storeContactEmail">Contact email</Label>
            <div className="relative">
              <Mail className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="storeContactEmail"
                type="email"
                value={storeInfo.contactEmail}
                className="pl-8"
                placeholder="support@example.com"
                onChange={(event) =>
                  setStoreInfo((current) => ({
                    ...current,
                    contactEmail: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="storeSupportPhone">Support phone</Label>
            <div className="relative">
              <Phone className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="storeSupportPhone"
                type="tel"
                value={storeInfo.supportPhone}
                className="pl-8"
                placeholder="+1 555 0100"
                onChange={(event) =>
                  setStoreInfo((current) => ({
                    ...current,
                    supportPhone: event.target.value,
                  }))
                }
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="storeWebsiteUrl">Website</Label>
            <div className="relative">
              <Globe className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                id="storeWebsiteUrl"
                type="url"
                value={storeInfo.websiteUrl}
                className="pl-8"
                placeholder="https://example.com/support"
                onChange={(event) =>
                  setStoreInfo((current) => ({
                    ...current,
                    websiteUrl: event.target.value,
                  }))
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[22rem_minmax(0,1fr)]">
        <Card className="rounded-lg">
          <CardHeader className="border-b">
            <CardTitle className="text-base">Apps</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                type="search"
                value={search}
                className="pl-8"
                placeholder="Search apps..."
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setSearch(nextValue);
                  void loadAppsPage(1, nextValue);
                }}
              />
            </div>
            <div className="max-h-[56rem] space-y-2 overflow-y-auto pr-1">
              {apps.map((app) => (
                <AppListItem
                  key={app.mappingId}
                  app={app}
                  active={app.mappingId === selectedAppId}
                  onSelect={() => setSelectedAppId(app.mappingId)}
                />
              ))}
              {!apps.length ? (
                <EmptyPanel
                  icon={Search}
                  title={loadingApps ? "Loading apps" : "No apps found"}
                  description={
                    loadingApps
                      ? "The current page is being loaded."
                      : "No mapped app matches the current search."
                  }
                  className="rounded-lg border"
                />
              ) : null}
            </div>
            <TablePaginationFooter
              onPageChange={(page) => void loadAppsPage(page)}
              page={appPagination.page}
              shown={apps.length}
              total={appPagination.total}
              totalPages={appPagination.totalPages}
            />
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
                  storeInfo={storeInfo}
                  template={template}
                  onChange={updateTemplate}
                />
              ))
            ) : (
              <EmptyPanel
                icon={MessageSquareReply}
                title="No app selected"
                description="Select an app to configure reply templates."
                className="rounded-lg border"
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

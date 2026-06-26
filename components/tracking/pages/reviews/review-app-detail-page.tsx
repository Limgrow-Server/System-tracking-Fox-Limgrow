"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar as CalendarIcon,
  ChevronRight,
  FileJson,
  MessageSquareReply,
  MessageSquareText,
  RefreshCw,
  Search,
  Smartphone,
  Star,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  EmptyPanel,
  PageHeader,
  StatCard,
  StatusBadge,
  TablePaginationFooter,
} from "@/components/tracking/primitives";
import { PendingNavigationLink } from "@/components/tracking/pending-navigation-link";
import { compactNumber, dateTime } from "@/lib/tracking/format";
import type {
  AndroidDeviceMetadataDto,
  AndroidStoreReviewDto,
  PaginationMeta,
  ReviewAppDetailPageData,
  ReviewAppStats,
  ReviewFetchRunDto,
  ReviewFetchScheduleDto,
  ReviewReplyTemplatePreviewDto,
  ReviewSyncStateDto,
} from "@/lib/tracking/page-data";
import { cn } from "@/lib/utils";
import { showToast } from "@/lib/client/toast";

const GOOGLE_PLAY_REVIEW_FETCH_WINDOW_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

function formatRating(value: number | null) {
  return value ? value.toFixed(1) : "N/A";
}

function Stars({ rating }: { rating: number | null }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={14}
          className={cn(
            "text-muted-foreground",
            rating && star <= rating && "fill-amber-400 text-amber-400",
          )}
        />
      ))}
    </div>
  );
}

function RatingDistribution({ data }: { data: ReviewAppDetailPageData }) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">Rating Distribution</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {data.stats.ratingBuckets.map((bucket) => (
          <div key={bucket.rating} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-3">
            <div className="flex items-center gap-1 text-sm font-medium">
              {bucket.rating}
              <Star size={13} className="fill-amber-400 text-amber-400" />
            </div>
            <div className="h-2 overflow-hidden rounded-md bg-muted">
              <div
                className="h-full rounded-md bg-amber-400"
                style={{ width: `${bucket.share}%` }}
              />
            </div>
            <div className="text-right text-xs text-muted-foreground">
              {bucket.count}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromInputValue(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
}

function addDaysToInputValue(value: string, days: number) {
  const date = dateFromInputValue(value);
  if (!date) return "";
  date.setDate(date.getDate() + days);
  return dateInputValue(date);
}

function earliestInputValue(...values: string[]) {
  return values.filter(Boolean).sort()[0] ?? "";
}

function latestInputValue(...values: string[]) {
  const sortedValues = values.filter(Boolean).sort();
  return sortedValues[sortedValues.length - 1] ?? "";
}

function displayDateValue(value: string) {
  const date = dateFromInputValue(value);
  if (!date) return "Select date";

  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function defaultFetchFromDate() {
  const date = new Date();
  date.setDate(date.getDate() - (GOOGLE_PLAY_REVIEW_FETCH_WINDOW_DAYS - 1));
  return dateInputValue(date);
}

function defaultFetchToDate() {
  return dateInputValue(new Date());
}

function fetchDateRangeError(fromDate: string, toDate: string) {
  const from = dateFromInputValue(fromDate);
  const to = dateFromInputValue(toDate);
  const windowStart = dateFromInputValue(defaultFetchFromDate());
  const windowEnd = dateFromInputValue(defaultFetchToDate());

  if (!from || !to || !windowStart || !windowEnd) {
    return "Select a valid date range.";
  }
  if (from.getTime() > to.getTime()) {
    return "From date must be before or equal to To date.";
  }
  if (from.getTime() < windowStart.getTime()) {
    return "Google Play only exposes reviews from the last 7 days.";
  }
  if (to.getTime() > windowEnd.getTime()) {
    return "To date cannot be in the future.";
  }

  const selectedDays = Math.floor((to.getTime() - from.getTime()) / DAY_MS) + 1;
  if (selectedDays > GOOGLE_PLAY_REVIEW_FETCH_WINDOW_DAYS) {
    return "Date range cannot exceed 7 days.";
  }

  return "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseEmbeddedJson(value: string) {
  const jsonStart = value.indexOf("{");
  if (jsonStart === -1) return null;

  try {
    return JSON.parse(value.slice(jsonStart)) as unknown;
  } catch {
    return null;
  }
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function syncErrorCode(message: string, fallbackCode?: string | null) {
  const parsed = parseEmbeddedJson(message);
  const googleError = isRecord(parsed) && isRecord(parsed.error)
    ? parsed.error
    : isRecord(parsed)
      ? parsed
      : null;
  const status = stringValue(googleError?.status);
  const code = stringValue(googleError?.code);

  if (code && status) return `${code} ${status}`;
  if (status) return status;
  if (code) return code;
  if (fallbackCode) return fallbackCode;

  return "FETCH_FAILED";
}

function formattedRawError(message: string) {
  const parsed = parseEmbeddedJson(message);
  return parsed ? JSON.stringify(parsed, null, 2) : message;
}

function fetchReviewErrorToast(error: unknown) {
  const message =
    error instanceof Error ? error.message : "Reviews could not be fetched.";
  const code = syncErrorCode(message);

  return code === "FETCH_FAILED"
    ? "Reviews could not be fetched."
    : `Reviews could not be fetched: ${code}`;
}

function RawSyncErrorDialog({ message }: { message: string }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 border-rose-200 bg-background text-rose-700 hover:bg-rose-50 hover:text-rose-800"
        >
          <FileJson size={14} />
          View raw error
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Raw sync error</DialogTitle>
          <DialogDescription>
            Full provider error returned by the latest review fetch attempt.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[56vh] overflow-auto rounded-lg border bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
          <pre className="whitespace-pre-wrap break-words">
            {formattedRawError(message)}
          </pre>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FetchDatePicker({
  label,
  maxDate,
  minDate,
  onChange,
  value,
}: {
  label: string;
  maxDate: string;
  minDate: string;
  onChange: (value: string) => void;
  value: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedDate = dateFromInputValue(value) ?? undefined;
  const min = dateFromInputValue(minDate);
  const max = dateFromInputValue(maxDate);

  return (
    <div className="grid gap-1.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <CalendarIcon size={13} />
        {label}
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="h-9 w-full justify-start gap-2 px-3 font-normal"
          >
            <CalendarIcon size={14} />
            <span className="truncate">{displayDateValue(value)}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <CalendarPicker
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (!date) return;
              onChange(dateInputValue(date));
              setOpen(false);
            }}
            disabled={(date) =>
              Boolean(
                (min && date.getTime() < min.getTime()) ||
                  (max && date.getTime() > max.getTime()),
              )
            }
            className="rounded-lg border"
            captionLayout="dropdown"
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

function SyncPanel({
  data,
  fromDate,
  fetching,
  onFromDateChange,
  onFetch,
  onToDateChange,
  toDate,
}: {
  data: ReviewAppDetailPageData;
  fromDate: string;
  fetching: boolean;
  onFromDateChange: (value: string) => void;
  onFetch: () => void;
  onToDateChange: (value: string) => void;
  toDate: string;
}) {
  const syncRunning = data.syncState?.status === "running";
  const windowStartDate = defaultFetchFromDate();
  const windowEndDate = defaultFetchToDate();
  const fromMinDate = latestInputValue(
    windowStartDate,
    addDaysToInputValue(toDate, -(GOOGLE_PLAY_REVIEW_FETCH_WINDOW_DAYS - 1)),
  );
  const fromMaxDate = earliestInputValue(toDate, windowEndDate);
  const toMinDate = latestInputValue(fromDate, windowStartDate);
  const toMaxDate = earliestInputValue(
    windowEndDate,
    addDaysToInputValue(fromDate, GOOGLE_PLAY_REVIEW_FETCH_WINDOW_DAYS - 1),
  );
  const dateRangeError = fetchDateRangeError(fromDate, toDate);

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle className="text-base">Sync State</CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={fetching || syncRunning || Boolean(dateRangeError)}
          onClick={onFetch}
        >
          {fetching ? <Spinner /> : <RefreshCw size={14} />}
          Fetch reviews
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <FetchDatePicker
            label="From"
            maxDate={fromMaxDate}
            minDate={fromMinDate}
            onChange={onFromDateChange}
            value={fromDate}
          />
          <FetchDatePicker
            label="To"
            maxDate={toMaxDate}
            minDate={toMinDate}
            onChange={onToDateChange}
            value={toDate}
          />
        </div>
        {dateRangeError ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            {dateRangeError}
          </div>
        ) : null}

        <div className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Status</div>
            <div className="mt-1">
              <StatusBadge status={data.syncState?.status ?? "not_found"} />
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Last success</div>
            <div className="mt-1 font-medium">
              {dateTime(data.syncState?.lastSuccessAt ?? null)}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Fetched</div>
            <div className="mt-1 font-medium">
              {data.syncState?.lastFetchedCount ?? 0} reviews
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Upserted</div>
            <div className="mt-1 font-medium">
              {data.syncState?.lastUpsertedCount ?? 0} rows
            </div>
          </div>
        </div>

        {data.syncState?.lastErrorMessage ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-1.5">
                <div className="text-xs font-medium text-rose-700">
                  Last error
                </div>
                <Badge
                  variant="outline"
                  className="w-fit border-rose-200 bg-background text-rose-700"
                >
                  {syncErrorCode(
                    data.syncState.lastErrorMessage,
                    data.syncState.lastErrorCode,
                  )}
                </Badge>
              </div>
              <RawSyncErrorDialog message={data.syncState.lastErrorMessage} />
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="text-xs font-medium text-muted-foreground">
            Recent runs
          </div>
          {data.fetchRuns.length ? (
            <div className="space-y-2">
              {data.fetchRuns.slice(0, 5).map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <StatusBadge status={run.status} />
                      <span className="text-xs text-muted-foreground">
                        {run.triggerType}
                      </span>
                    </div>
                    <div className="mt-1 truncate text-xs text-muted-foreground">
                      {dateTime(run.startedAt)}
                    </div>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <div>{run.pagesFetched} pages</div>
                    <div>{run.reviewsFetched} reviews</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
              No fetch runs yet.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function CommentAuthorCell({ review }: { review: AndroidStoreReviewDto }) {
  return (
    <div className="min-w-[11rem] whitespace-normal">
      <div className="font-medium text-foreground">
        {review.authorName ?? "Anonymous reviewer"}
      </div>
    </div>
  );
}

function CommentContentCell({ review }: { review: AndroidStoreReviewDto }) {
  const commentText = review.reviewText || review.originalText || "No comment text.";

  return (
    <div className="min-w-[20rem] max-w-[34rem] whitespace-normal">
      <div className="line-clamp-3 text-sm leading-5 text-foreground">
        {commentText}
      </div>
      {review.originalText && review.originalText !== review.reviewText ? (
        <div className="mt-2 border-t pt-2 text-xs leading-5 text-muted-foreground">
          <span className="font-medium">Original: </span>
          <span className="line-clamp-2">{review.originalText}</span>
        </div>
      ) : null}
      <div className="mt-2 truncate font-mono text-[11px] text-muted-foreground">
        {review.reviewId}
      </div>
    </div>
  );
}

function CommentReplyCell({
  onSend,
  review,
  replyTemplate,
  sending,
}: {
  onSend: () => void;
  review: AndroidStoreReviewDto;
  replyTemplate: ReviewReplyTemplatePreviewDto | null;
  sending: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const commentText = review.reviewText || review.originalText || "No comment text.";
  const templatePreviewText =
    replyTemplate?.resolvedReplyText || replyTemplate?.replyText.trim() || "";
  const canSendTemplate = Boolean(
    review.rating &&
      replyTemplate?.isActive &&
      replyTemplate.resolvedReplyText.trim(),
  );

  function confirmSend() {
    if (!canSendTemplate) return;

    setConfirmOpen(false);
    onSend();
  }

  if (!review.developerReplyText) {
    return (
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={sending}
          >
            {sending ? <Spinner /> : <MessageSquareReply size={13} />}
            Send reply
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send reply?</DialogTitle>
            <DialogDescription>
              Review the mapped template before sending it to Google Play.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-3 rounded-lg border bg-muted/20 p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">
                  {review.authorName ?? "Anonymous reviewer"}
                </span>
                <span className="text-muted-foreground">/</span>
                <span className="text-muted-foreground">
                  {formatRating(review.rating)}
                </span>
              </div>
              <p className="line-clamp-4 text-sm leading-5 text-muted-foreground">
                {commentText}
              </p>
            </div>

            <div className="space-y-2 rounded-lg border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">
                  {review.rating ? `${review.rating}-star template` : "Template"}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    replyTemplate?.isActive && templatePreviewText
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700",
                  )}
                >
                  {replyTemplate?.isActive ? "Active" : "Inactive"}
                </Badge>
              </div>
              {templatePreviewText ? (
                <div className="whitespace-pre-wrap rounded-md bg-muted/30 p-3 text-sm leading-5 text-foreground">
                  {templatePreviewText}
                </div>
              ) : (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
                  No mapped reply content is available for this rating.
                </div>
              )}
              {replyTemplate?.isActive && !replyTemplate.resolvedReplyText.trim() ? (
                <div className="text-xs text-amber-700">
                  The active template becomes empty after mapping store contact
                  fields.
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button type="button" disabled={sending || !canSendTemplate} onClick={confirmSend}>
              {sending ? <Spinner /> : <MessageSquareReply size={14} />}
              Send reply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <div className="min-w-[18rem] max-w-[28rem] whitespace-normal rounded-md border border-emerald-200 bg-emerald-50 p-2 text-emerald-950">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs font-medium text-emerald-700">
        <span className="flex items-center gap-1">
          <MessageSquareReply size={13} />
          Replied
        </span>
        <span>{dateTime(review.developerReplyUpdatedAt)}</span>
      </div>
      <div className="line-clamp-3 text-sm leading-5">
        {review.developerReplyText}
      </div>
    </div>
  );
}

function deviceName(
  metadata: AndroidDeviceMetadataDto | null,
  deviceCode: string | null,
) {
  const name = [metadata?.manufacturer, metadata?.productName]
    .filter(Boolean)
    .join(" ");

  return name || metadata?.productName || deviceCode || "Unknown device";
}

function deviceSpecs(metadata: AndroidDeviceMetadataDto | null) {
  if (!metadata) return "";

  const screen =
    metadata.screenWidthPx && metadata.screenHeightPx
      ? `${metadata.screenWidthPx}x${metadata.screenHeightPx}`
      : null;
  const ram = metadata.ramMb ? `${Math.round(metadata.ramMb / 1024)}GB RAM` : null;

  return [metadata.deviceClass, screen, ram].filter(Boolean).join(" / ");
}

function VersionDeviceCell({ review }: { review: AndroidStoreReviewDto }) {
  const version = review.appVersionName
    ? `${review.appVersionName}${review.appVersionCode ? ` (${review.appVersionCode})` : ""}`
    : review.appVersionCode
      ? `Build ${review.appVersionCode}`
      : "Unknown version";
  const device = [
    deviceName(review.deviceMetadata, review.device),
    review.androidOsVersion ? `Android ${review.androidOsVersion}` : null,
  ]
    .filter(Boolean)
    .join(" / ");
  const specs = deviceSpecs(review.deviceMetadata);

  return (
    <div className="min-w-[11rem] whitespace-normal text-sm">
      <div className="font-medium">{version}</div>
      <div className="mt-1 text-xs text-muted-foreground">
        {device}
      </div>
      {specs ? (
        <div className="mt-1 text-[11px] text-muted-foreground">{specs}</div>
      ) : null}
    </div>
  );
}

function VotesCell({ review }: { review: AndroidStoreReviewDto }) {
  return (
    <div className="flex min-w-[5.5rem] items-center gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1">
        <ThumbsUp size={13} />
        {review.thumbsUpCount ?? 0}
      </span>
      <span className="flex items-center gap-1">
        <ThumbsDown size={13} />
        {review.thumbsDownCount ?? 0}
      </span>
    </div>
  );
}

function CommentJsonDialog({ review }: { review: AndroidStoreReviewDto }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileJson size={13} />
          JSON
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Comment JSON</DialogTitle>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-auto rounded-lg border bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(review.rawReview, null, 2)}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ReviewCommentsResponse = {
  data?: AndroidStoreReviewDto[];
  error?: string;
  fetchRuns?: ReviewFetchRunDto[];
  fetchSchedule?: ReviewFetchScheduleDto | null;
  isMockData?: boolean;
  page?: number;
  pageSize?: number;
  replyTemplates?: ReviewReplyTemplatePreviewDto[];
  reviewFilters?: ReviewAppDetailPageData["reviewFilters"];
  stats?: ReviewAppStats;
  success?: boolean;
  syncState?: ReviewSyncStateDto | null;
  total?: number;
  totalPages?: number;
};

export function ReviewAppDetailPage({ data }: { data: ReviewAppDetailPageData }) {
  const router = useRouter();
  const [fetchingReviews, setFetchingReviews] = useState(false);
  const [fetchFromDate, setFetchFromDate] = useState(defaultFetchFromDate);
  const [fetchToDate, setFetchToDate] = useState(defaultFetchToDate);
  const [reviews, setReviews] = useState(data.reviews);
  const [reviewPagination, setReviewPagination] =
    useState<PaginationMeta>(data.reviewPagination);
  const [stats, setStats] = useState(data.stats);
  const [syncState, setSyncState] = useState(data.syncState);
  const [fetchRuns, setFetchRuns] = useState(data.fetchRuns);
  const [fetchSchedule, setFetchSchedule] = useState(data.fetchSchedule);
  const [replyTemplates, setReplyTemplates] = useState(data.replyTemplates);
  const [isMockData, setIsMockData] = useState(Boolean(data.isMockData));
  const [search, setSearch] = useState(data.reviewFilters.search);
  const [ratingFilter, setRatingFilter] = useState(data.reviewFilters.rating);
  const [replyFilter, setReplyFilter] = useState(data.reviewFilters.reply);
  const [loadingComments, setLoadingComments] = useState(false);
  const [replyingReviewId, setReplyingReviewId] = useState<string | null>(null);
  const replyTemplateByRating = useMemo(
    () => new Map(replyTemplates.map((template) => [template.rating, template])),
    [replyTemplates],
  );
  const pageData: ReviewAppDetailPageData = {
    ...data,
    fetchRuns,
    fetchSchedule,
    isMockData,
    replyTemplates,
    reviews,
    stats,
    syncState,
  };

  async function loadReviewPage(
    page: number,
    overrides?: {
      ratingFilter?: string;
      replyFilter?: string;
      search?: string;
    },
  ) {
    const nextSearch = overrides?.search ?? search;
    const nextRating = overrides?.ratingFilter ?? ratingFilter;
    const nextReply = overrides?.replyFilter ?? replyFilter;
    const params = new URLSearchParams({
      mappingId: data.app.mappingId,
      page: String(page),
      pageSize: "10",
    });

    if (nextSearch.trim()) params.set("search", nextSearch.trim());
    if (nextRating !== "all") params.set("rating", nextRating);
    if (nextReply !== "all") params.set("reply", nextReply);
    if (isMockData) params.set("mock", "1");

    setLoadingComments(true);

    try {
      const response = await fetch(`/api/comments/reviews?${params.toString()}`);
      const payload = (await response.json()) as ReviewCommentsResponse;

      if (!response.ok || !payload.success || !Array.isArray(payload.data)) {
        throw new Error(payload.error ?? "Comments could not be loaded.");
      }

      setReviews(payload.data);
      setReviewPagination({
        page: payload.page ?? page,
        pageSize: payload.pageSize ?? 10,
        total: payload.total ?? payload.data.length,
        totalPages: payload.totalPages ?? 1,
      });
      if (payload.stats) setStats(payload.stats);
      if (payload.syncState !== undefined) setSyncState(payload.syncState);
      if (payload.fetchRuns) setFetchRuns(payload.fetchRuns);
      if (payload.fetchSchedule !== undefined) {
        setFetchSchedule(payload.fetchSchedule);
      }
      if (payload.replyTemplates) setReplyTemplates(payload.replyTemplates);
      if (payload.isMockData !== undefined) setIsMockData(payload.isMockData);
    } catch (error) {
      void showToast("error",
        error instanceof Error ? error.message : "Comments could not be loaded.",
      );
    } finally {
      setLoadingComments(false);
    }
  }

  async function fetchReviews() {
    if (fetchingReviews) return;

    setFetchingReviews(true);

    try {
      const response = await fetch("/api/review-fetch-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromDate: fetchFromDate || undefined,
          storeMappingId: data.app.mappingId,
          timezoneOffsetMinutes: new Date().getTimezoneOffset(),
          toDate: fetchToDate || undefined,
          triggerType: "manual",
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        ok?: boolean;
        result?: {
          hasMore?: boolean;
          pagesFetched?: number;
          reviewsFetched?: number;
          reviewsMatched?: number;
          reviewsSkipped?: number;
          reviewsUpserted?: number;
        };
      };

      if (!response.ok || !payload.ok || !payload.result) {
        throw new Error(payload.error ?? "Reviews could not be fetched.");
      }

      const moreText = payload.result.hasMore ? " More pages are available." : "";
      void showToast("success",
        `Fetched ${payload.result.reviewsFetched ?? 0} reviews, matched ${payload.result.reviewsMatched ?? 0}, upserted ${payload.result.reviewsUpserted ?? 0} rows.${moreText}`,
      );
      await loadReviewPage(1);
      router.refresh();
    } catch (error) {
      void showToast("error", fetchReviewErrorToast(error));
    } finally {
      setFetchingReviews(false);
    }
  }

  async function sendReply(review: AndroidStoreReviewDto) {
    if (replyingReviewId) return;

    setReplyingReviewId(review.reviewId);

    try {
      const response = await fetch("/api/review-replies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: review.reviewId,
          storeMappingId: data.app.mappingId,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        message?: string;
        ok?: boolean;
      };

      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Reply could not be sent.");
      }

      void showToast("success", payload.message ?? "Reply sent.");
      await loadReviewPage(reviewPagination.page);
    } catch (error) {
      void showToast("error",
        error instanceof Error ? error.message : "Reply could not be sent.",
      );
    } finally {
      setReplyingReviewId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <nav className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <PendingNavigationLink
          href="/comments"
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} />
          List Apps
        </PendingNavigationLink>
        <ChevronRight size={15} />
        <span className="truncate text-foreground">{data.app.appName}</span>
      </nav>

      <PageHeader
        eyebrow={data.app.storeAccountName}
        title={data.app.appName}
        description={data.app.identifier}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {isMockData ? (
              <Badge
                variant="outline"
                className="border-amber-200 bg-amber-50 text-amber-700"
              >
                Mock data
              </Badge>
            ) : null}
            <Badge
              variant="outline"
              className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
            >
              <Smartphone size={12} />
              Google Play
            </Badge>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Comments"
          value={compactNumber(stats.totalReviews)}
          detail={`${compactNumber(stats.pendingReplyCount)} pending replies`}
          icon={MessageSquareText}
          trend="flat"
        />
        <StatCard
          label="Average Rating"
          value={formatRating(stats.averageRating)}
          detail="Google Play review score"
          icon={Star}
          trend="flat"
        />
        <StatCard
          label="Reply Coverage"
          value={`${stats.replyCoverage}%`}
          detail={`${compactNumber(stats.repliedCount)} replied comments`}
          icon={MessageSquareReply}
          trend={stats.replyCoverage >= 80 ? "up" : "flat"}
        />
        <StatCard
          label="Latest Comment"
          value={dateTime(stats.latestReviewAt)}
          detail="Newest user comment"
          icon={CalendarIcon}
          trend="flat"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <RatingDistribution data={pageData} />
        <SyncPanel
          data={pageData}
          fetching={fetchingReviews}
          fromDate={fetchFromDate}
          onFetch={fetchReviews}
          onFromDateChange={setFetchFromDate}
          onToDateChange={setFetchToDate}
          toDate={fetchToDate}
        />
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-md">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              type="search"
              className="pl-8"
              placeholder="Search comments, reviewer or review id..."
              value={search}
              onChange={(event) => {
                const nextValue = event.target.value;
                setSearch(nextValue);
                void loadReviewPage(1, { search: nextValue });
              }}
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={ratingFilter}
              onValueChange={(value) => {
                setRatingFilter(value);
                void loadReviewPage(1, { ratingFilter: value });
              }}
            >
              <SelectTrigger className="w-[120px] bg-background">
                <SelectValue placeholder="Rating" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All stars</SelectItem>
                {[5, 4, 3, 2, 1].map((rating) => (
                  <SelectItem key={rating} value={String(rating)}>
                    {rating} stars
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={replyFilter}
              onValueChange={(value) => {
                setReplyFilter(value);
                void loadReviewPage(1, { replyFilter: value });
              }}
            >
              <SelectTrigger className="w-[130px] bg-background">
                <SelectValue placeholder="Reply" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All replies</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="replied">Replied</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="p-4">
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Author</TableHead>
                  <TableHead>Content of comment</TableHead>
                  <TableHead>Reply</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead>Version / Device</TableHead>
                  <TableHead>Votes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reviews.map((review) => (
                  <TableRow key={review.id}>
                    <TableCell className="align-top">
                      <CommentAuthorCell review={review} />
                    </TableCell>
                    <TableCell className="align-top whitespace-normal">
                      <CommentContentCell review={review} />
                    </TableCell>
                    <TableCell className="align-top">
                      <CommentReplyCell
                        onSend={() => sendReply(review)}
                        replyTemplate={
                          review.rating
                            ? replyTemplateByRating.get(review.rating) ?? null
                            : null
                        }
                        review={review}
                        sending={replyingReviewId === review.reviewId}
                      />
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="min-w-[5rem] space-y-1">
                        <Stars rating={review.rating} />
                        <div className="text-xs text-muted-foreground">
                          {formatRating(review.rating)}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <div className="min-w-[9rem] text-sm">
                        {dateTime(review.userCommentUpdatedAt)}
                      </div>
                    </TableCell>
                    <TableCell className="align-top">
                      <VersionDeviceCell review={review} />
                    </TableCell>
                    <TableCell className="align-top">
                      <VotesCell review={review} />
                    </TableCell>
                    <TableCell className="align-top text-right">
                      <CommentJsonDialog review={review} />
                    </TableCell>
                  </TableRow>
                ))}
                {!reviews.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10">
                      <EmptyPanel
                        icon={MessageSquareText}
                        title={loadingComments ? "Loading comments" : "No comments found"}
                        description={
                          loadingComments
                            ? "The current page is being loaded."
                            : "Fetch Google Play comments or adjust the current filters."
                        }
                        className="border-0 shadow-none"
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
          <TablePaginationFooter
            onPageChange={(page) => void loadReviewPage(page)}
            page={reviewPagination.page}
            shown={reviews.length}
            total={reviewPagination.total}
            totalPages={reviewPagination.totalPages}
          />
        </div>
      </div>
    </div>
  );
}

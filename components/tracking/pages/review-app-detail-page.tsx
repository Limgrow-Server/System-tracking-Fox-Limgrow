"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
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
} from "@/components/tracking/primitives";
import { compactNumber, dateTime } from "@/lib/tracking/format";
import type {
  AndroidDeviceMetadataDto,
  AndroidStoreReviewDto,
  ReviewAppDetailPageData,
  ReviewReplyTemplatePreviewDto,
} from "@/lib/tracking/page-data";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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

function SyncPanel({
  data,
  fetching,
  onFetch,
}: {
  data: ReviewAppDetailPageData;
  fetching: boolean;
  onFetch: () => void;
}) {
  const syncRunning = data.syncState?.status === "running";

  return (
    <Card className="rounded-lg">
      <CardHeader className="flex items-center justify-between gap-3">
        <CardTitle className="text-base">Sync State</CardTitle>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={fetching || syncRunning}
          onClick={onFetch}
        >
          {fetching ? <Spinner /> : <RefreshCw size={14} />}
          Fetch reviews
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
            {data.syncState.lastErrorMessage}
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

export function ReviewAppDetailPage({ data }: { data: ReviewAppDetailPageData }) {
  const router = useRouter();
  const [fetchingReviews, setFetchingReviews] = useState(false);
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [replyFilter, setReplyFilter] = useState("all");
  const [replyingReviewId, setReplyingReviewId] = useState<string | null>(null);
  const replyTemplateByRating = useMemo(
    () => new Map(data.replyTemplates.map((template) => [template.rating, template])),
    [data.replyTemplates],
  );

  const filteredReviews = useMemo(() => {
    const query = search.toLowerCase();

    return data.reviews.filter((review) => {
      const matchesSearch =
        !query ||
        (review.reviewText ?? "").toLowerCase().includes(query) ||
        (review.originalText ?? "").toLowerCase().includes(query) ||
        (review.authorName ?? "").toLowerCase().includes(query) ||
        review.reviewId.toLowerCase().includes(query);
      const matchesRating =
        ratingFilter === "all" || String(review.rating ?? "") === ratingFilter;
      const hasReply = Boolean(review.developerReplyText);
      const matchesReply =
        replyFilter === "all" ||
        (replyFilter === "replied" && hasReply) ||
        (replyFilter === "pending" && !hasReply);

      return matchesSearch && matchesRating && matchesReply;
    });
  }, [data.reviews, ratingFilter, replyFilter, search]);
  async function fetchReviews() {
    if (fetchingReviews) return;

    setFetchingReviews(true);

    try {
      const response = await fetch("/api/review-fetch-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeMappingId: data.app.mappingId,
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
          reviewsUpserted?: number;
        };
      };

      if (!response.ok || !payload.ok || !payload.result) {
        throw new Error(payload.error ?? "Reviews could not be fetched.");
      }

      const moreText = payload.result.hasMore ? " More pages are available." : "";
      toast.success(
        `Fetched ${payload.result.reviewsFetched ?? 0} reviews, upserted ${payload.result.reviewsUpserted ?? 0} rows.${moreText}`,
      );
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Reviews could not be fetched.",
      );
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

      toast.success(payload.message ?? "Reply sent.");
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Reply could not be sent.",
      );
    } finally {
      setReplyingReviewId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <nav className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Link
          href="/comments"
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} />
          List Apps
        </Link>
        <ChevronRight size={15} />
        <span className="truncate text-foreground">{data.app.appName}</span>
      </nav>

      <PageHeader
        eyebrow={data.app.storeAccountName}
        title={data.app.appName}
        description={data.app.identifier}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {data.isMockData ? (
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
          value={compactNumber(data.stats.totalReviews)}
          detail={`${compactNumber(data.stats.pendingReplyCount)} pending replies`}
          icon={MessageSquareText}
          trend="flat"
        />
        <StatCard
          label="Average Rating"
          value={formatRating(data.stats.averageRating)}
          detail="Google Play review score"
          icon={Star}
          trend="flat"
        />
        <StatCard
          label="Reply Coverage"
          value={`${data.stats.replyCoverage}%`}
          detail={`${compactNumber(data.stats.repliedCount)} replied comments`}
          icon={MessageSquareReply}
          trend={data.stats.replyCoverage >= 80 ? "up" : "flat"}
        />
        <StatCard
          label="Latest Comment"
          value={dateTime(data.stats.latestReviewAt)}
          detail="Newest user comment"
          icon={Calendar}
          trend="flat"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <RatingDistribution data={data} />
        <SyncPanel data={data} fetching={fetchingReviews} onFetch={fetchReviews} />
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
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Select value={ratingFilter} onValueChange={setRatingFilter}>
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
            <Select value={replyFilter} onValueChange={setReplyFilter}>
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
                {filteredReviews.map((review) => (
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
                {!filteredReviews.length ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10">
                      <EmptyPanel
                        icon={MessageSquareText}
                        title="No comments found"
                        description="Fetch Google Play comments or adjust the current filters."
                        className="border-0 shadow-none"
                      />
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </div>
  );
}

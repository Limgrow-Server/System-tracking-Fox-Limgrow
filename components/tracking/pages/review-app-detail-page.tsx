"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  ChevronRight,
  FileJson,
  MessageSquareReply,
  MessageSquareText,
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
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EmptyPanel,
  PageHeader,
  StatCard,
  StatusBadge,
} from "@/components/tracking/primitives";
import { compactNumber, dateTime } from "@/lib/tracking/format";
import type {
  AndroidStoreReviewDto,
  ReviewAppDetailPageData,
} from "@/lib/tracking/page-data";
import { cn } from "@/lib/utils";

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

function SyncPanel({ data }: { data: ReviewAppDetailPageData }) {
  return (
    <Card className="rounded-lg">
      <CardHeader>
        <CardTitle className="text-base">Sync State</CardTitle>
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

function ReviewCard({ review }: { review: AndroidStoreReviewDto }) {
  return (
    <Card className="rounded-lg">
      <CardHeader className="gap-3 pb-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle className="text-base">
                {review.authorName ?? "Anonymous reviewer"}
              </CardTitle>
              <Badge variant="outline" className="gap-1">
                <Smartphone size={12} />
                {review.reviewerLanguage ?? "unknown"}
              </Badge>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
              <Stars rating={review.rating} />
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                {dateTime(review.userCommentUpdatedAt)}
              </span>
              {review.appVersionName ? <span>{review.appVersionName}</span> : null}
              {review.device ? <span>{review.device}</span> : null}
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <ThumbsUp size={13} />
              {review.thumbsUpCount ?? 0}
            </span>
            <span className="flex items-center gap-1">
              <ThumbsDown size={13} />
              {review.thumbsDownCount ?? 0}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="whitespace-pre-wrap text-sm leading-6">
            {review.reviewText || review.originalText || "No review text."}
          </div>
          {review.originalText && review.originalText !== review.reviewText ? (
            <div className="mt-3 border-t pt-3 text-xs leading-5 text-muted-foreground">
              {review.originalText}
            </div>
          ) : null}
        </div>

        {review.developerReplyText ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-emerald-900">
            <div className="mb-2 flex items-center justify-between gap-3 text-xs font-medium text-emerald-700">
              <span className="flex items-center gap-1">
                <MessageSquareReply size={13} />
                Developer reply
              </span>
              <span>{dateTime(review.developerReplyUpdatedAt)}</span>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-6">
              {review.developerReplyText}
            </div>
          </div>
        ) : (
          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Pending reply
          </div>
        )}

        <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="truncate">
            Review ID: <span className="font-mono">{review.reviewId}</span>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="w-fit gap-1.5">
                <FileJson size={13} />
                JSON
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[80vh] overflow-hidden sm:max-w-4xl">
              <DialogHeader>
                <DialogTitle>Review JSON</DialogTitle>
              </DialogHeader>
              <div className="max-h-[60vh] overflow-auto rounded-lg border bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
                <pre className="whitespace-pre-wrap">
                  {JSON.stringify(review.rawReview, null, 2)}
                </pre>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardContent>
    </Card>
  );
}

export function ReviewAppDetailPage({ data }: { data: ReviewAppDetailPageData }) {
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [replyFilter, setReplyFilter] = useState("all");

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

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <nav className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Link
          href="/review"
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ArrowLeft size={15} />
          Reviews
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
          label="Total Reviews"
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
          label="Latest Review"
          value={dateTime(data.stats.latestReviewAt)}
          detail="Newest user comment"
          icon={Calendar}
          trend="flat"
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <RatingDistribution data={data} />
        <SyncPanel data={data} />
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

        <div className="space-y-4 p-4">
          {filteredReviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
          {!filteredReviews.length ? (
            <EmptyPanel
              icon={MessageSquareText}
              title="No reviews found"
              description="Fetch Google Play reviews or adjust the current filters."
              className="rounded-lg"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

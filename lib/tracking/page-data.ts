import type {
  CredentialSecretMetadata,
  DeviceToken,
  IosIapTransactionSummary,
  NotificationEvent,
  NotificationJob,
  NotificationSchedule,
  StoreMapping,
  TeamMember,
} from "@/lib/tracking/types";
import type { IapAndroidDto } from "@/lib/server/services/iap/android-iap.service";

export type PaginationMeta = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type StoreMappingPageData = {
  storeMappings: StoreMapping[];
  storeMappingPagination: PaginationMeta;
  credentialSecrets: CredentialSecretMetadata[];
};

export type UsersPageData = {
  appOptions: StoreMapping[];
  usersPagination: PaginationMeta;
  users: TeamMember[];
};

export type ConfigsPageData = {
  credentialSecrets: CredentialSecretMetadata[];
  credentialPagination: PaginationMeta;
};

export type NotificationsPageData = {
  credentialSecrets: CredentialSecretMetadata[];
  deviceTokens: DeviceToken[];
  notificationDeliveryEvents: NotificationEvent[];
  notificationEvents: NotificationEvent[];
  notificationJobs: NotificationJob[];
  notificationPagination: NotificationPaginationMap;
  notificationStoreOptions: string[];
  notificationSummary: NotificationOverviewSummary;
  notificationSchedules: NotificationSchedule[];
  storeMappings: StoreMapping[];
};

export type IapAppCard = {
  mappingId: string;
  platform: "android" | "ios";
  appName: string;
  identifier: string; // packageName or bundleId
  appIconUrl: string | null;
  appLink: string | null;
  storeAccountName: string;
  storeProfileId: string;
};

export type IapAppGridPageData = {
  apps: IapAppCard[];
  appPagination: PaginationMeta;
  filters: {
    search: string;
    storeAccountName: string;
  };
  storeNames: string[];
};

export type IapAppTransaction = IapAndroidDto | IosIapTransactionSummary;

export type IapAppDetailPageData = {
  app: IapAppCard;
  filters: {
    kind: string;
    search: string;
    state: string;
  };
  metricTransactions: IapAppTransaction[];
  transactionPagination: PaginationMeta;
  transactionStates: string[];
  transactions: IapAppTransaction[];
};

export type ReviewAppCard = {
  mappingId: string;
  platform: "android";
  appName: string;
  identifier: string;
  appIconUrl: string | null;
  appLink: string | null;
  storeAvatarUrl: string | null;
  storeAccountName: string;
  storeContactEmail: string | null;
  storeLink: string | null;
  storeProfileId: string;
  storeSupportPhone: string | null;
  storeWebsiteUrl: string | null;
  reviewCount: number;
  averageRating: number | null;
  repliedCount: number;
  pendingReplyCount: number;
  lastFetchedAt: string | null;
  lastSyncStatus: string | null;
  lastErrorMessage: string | null;
};

export type ReviewAppGridPageData = {
  appPagination: PaginationMeta;
  apps: ReviewAppCard[];
  filters: {
    search: string;
    storeProfileId: string;
  };
  storeNames: string[];
  storeOptions: Array<{
    id: string;
    name: string;
  }>;
};

export type AndroidStoreReviewDto = {
  id: string;
  reviewId: string;
  authorName: string | null;
  rating: number | null;
  reviewText: string | null;
  originalText: string | null;
  reviewerLanguage: string | null;
  device: string | null;
  deviceMetadata: AndroidDeviceMetadataDto | null;
  androidOsVersion: number | null;
  appVersionCode: number | null;
  appVersionName: string | null;
  thumbsUpCount: number | null;
  thumbsDownCount: number | null;
  userCommentUpdatedAt: string | null;
  developerReplyText: string | null;
  developerReplyUpdatedAt: string | null;
  fetchedAt: string;
  rawReview: unknown;
};

export type AndroidDeviceMetadataDto = {
  cpuMake: string | null;
  cpuModel: string | null;
  deviceClass: string | null;
  glEsVersion: number | null;
  manufacturer: string | null;
  nativePlatform: string | null;
  productName: string | null;
  ramMb: number | null;
  screenDensityDpi: number | null;
  screenHeightPx: number | null;
  screenWidthPx: number | null;
};

export type ReviewRatingBucket = {
  rating: number;
  count: number;
  share: number;
};

export type ReviewSyncStateDto = {
  status: string;
  lastFetchStartedAt: string | null;
  lastFetchFinishedAt: string | null;
  lastSuccessAt: string | null;
  lastReviewUpdatedAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastFetchedCount: number;
  lastUpsertedCount: number;
};

export type ReviewFetchRunDto = {
  id: string;
  triggerType: string;
  status: string;
  scheduledFor: string | null;
  nextAttemptAt: string | null;
  attemptCount: number;
  maxAttempts: number;
  pagesFetched: number;
  reviewsFetched: number;
  reviewsUpserted: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
};

export type ReviewFetchScheduleDto = {
  id: string;
  status: string;
  scheduleType: string;
  storeMappingId: string;
  timeOfDay: string;
  timezone: string;
  nextRunAt: string;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  runCount: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type ReviewFetchScheduleApp = ReviewAppCard & {
  fetchSchedule: ReviewFetchScheduleDto | null;
};

export type ReviewFetchSchedulePageData = {
  appPagination: PaginationMeta;
  apps: ReviewFetchScheduleApp[];
  filters: {
    search: string;
    storeProfileId: string;
  };
  summary: {
    activeCount: number;
    appCount: number;
    nextRunAt: string | null;
    pausedCount: number;
    scheduleStatus: string;
    scheduledCount: number;
    unscheduledCount: number;
  };
  storeNames: string[];
  storeOptions: Array<{
    id: string;
    name: string;
  }>;
};

export type ReviewAppStats = {
  totalReviews: number;
  averageRating: number | null;
  repliedCount: number;
  pendingReplyCount: number;
  replyCoverage: number;
  latestReviewAt: string | null;
  ratingBuckets: ReviewRatingBucket[];
};

export type ReviewReplyTemplatePreviewDto = {
  id: string | null;
  storeMappingId: string;
  rating: number;
  replyText: string;
  resolvedReplyText: string;
  isActive: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ReviewAppDetailPageData = {
  app: ReviewAppCard;
  stats: ReviewAppStats;
  reviews: AndroidStoreReviewDto[];
  reviewFilters: {
    rating: string;
    reply: string;
    search: string;
  };
  reviewPagination: PaginationMeta;
  replyTemplates: ReviewReplyTemplatePreviewDto[];
  syncState: ReviewSyncStateDto | null;
  fetchRuns: ReviewFetchRunDto[];
  fetchSchedule: ReviewFetchScheduleDto | null;
  isMockData?: boolean;
};

export type ReviewReplyTemplateDto = {
  id: string | null;
  storeMappingId: string;
  rating: number;
  replyText: string;
  isActive: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
};

export type ReplyStoreSummary = {
  storeProfileId: string;
  storeAccountName: string;
  storeAvatarUrl: string | null;
  contactEmail: string | null;
  storeLink: string | null;
  supportPhone: string | null;
  websiteUrl: string | null;
  apps: ReviewAppCard[];
  appCount: number;
  reviewCount: number;
  pendingReplyCount: number;
  activeTemplateCount: number;
  lastFetchedAt: string | null;
};

export type ReplyStoreListPageData = {
  filters: {
    search: string;
  };
  storePagination: PaginationMeta;
  stores: ReplyStoreSummary[];
};

export type ReplyConfigBasePageData = {
  apps: ReviewAppCard[];
  templatesByMappingId: Record<string, ReviewReplyTemplateDto[]>;
};

export type ReplyConfigPageData = ReplyConfigBasePageData & {
  appPagination: PaginationMeta;
  filters: {
    search: string;
  };
  store: ReplyStoreSummary;
};

export type NotificationPaginationKey =
  | "deliveryEvents"
  | "historyJobs"
  | "overviewApps"
  | "schedules"
  | "tokens";

export type NotificationPaginationMap = Partial<
  Record<NotificationPaginationKey, PaginationMeta>
>;

export type NotificationOverviewSummary = {
  activeSchedules: number;
  activeTokens: number;
  appCount: number;
  totalSchedules: number;
  totalTokens: number;
};

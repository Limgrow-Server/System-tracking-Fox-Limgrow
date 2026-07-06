import type {
  CredentialSecretMetadata,
  DeviceToken,
  IosIapTwoHourCheck,
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
  credentialSecrets: CredentialSecretMetadata[];
  storeMappingPagination: PaginationMeta;
  storeMappings: StoreMapping[];
  storeOptions: StoreMappingStoreOption[];
};

export type StoreMappingStoreOption = {
  id: string;
  name: string;
  platform: "android" | "ios";
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
  canManageNotifications: boolean;
  credentialSecrets: CredentialSecretMetadata[];
  notificationDeviceCounts: Record<string, number>;
  notificationScheduleStats: Record<string, NotificationCountStat>;
  notificationTokenStats: Record<string, NotificationCountStat>;
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
  revenueCurrency?: string | null;
  revenueMicros?: number | string | null;
  storeAccountName: string;
  storeProfileId: string;
  transactionCount?: number | null;
};

export type IapAppGridPageData = {
  apps: IapAppCard[];
  appPagination: PaginationMeta;
  filters: {
    platform: "all" | "android" | "ios";
    search: string;
    storeAccountName: string;
  };
  storeNames: string[];
};

export type StoreListingApp = {
  mappingId: string;
  platform: "android";
  appId: string | null;
  appName: string;
  appIconUrl: string | null;
  appLink: string | null;
  packageName: string;
  storeAccountName: string;
  storeProfileId: string;
  credentialRef: string | null;
  credentialProjectId: string | null;
  credentialClientEmail: string | null;
  hasActiveCredential: boolean;
};

export type StoreListingPageData = {
  apps: StoreListingApp[];
};

export type IapAppTransaction = IapAndroidDto | IosIapTransactionSummary;

export type IapTrialConversionCohort = {
  label: string;
  trialStarted: number;
  converted: number;
  refunded: number;
  renewalRevenueMicros: string;
  conversionRate: number;
};

export type IapTrialConversionGranularity = "day" | "week" | "month";

export type IapNotificationEventDto = {
  id: string;
  notificationUuid: string;
  notificationType: string;
  subtype: string | null;
  environment: string | null;
  status: string;
  bundleId: string | null;
  appAppleId: string | null;
  originalTransactionId: string | null;
  transactionId: string | null;
  signedDate: string | null;
  receivedAt: string;
  processedAt: string | null;
  errorMessage: string | null;
  renewalAutoRenewStatus: number | null;
  renewalDate: string | null;
  renewalProductId: string | null;
  renewalStatus: "enabled" | "disabled" | null;
  rawPayload: unknown | null;
  decodedPayload: unknown | null;
};

export type IapTrialConversionAnalytics = {
  activeAfterTrialCount: number;
  avgDaysToConversion: number | null;
  cohorts: IapTrialConversionCohort[];
  cohortsByGranularity: Record<
    IapTrialConversionGranularity,
    IapTrialConversionCohort[]
  >;
  conversionRate: number;
  convertedCount: number;
  ignoredNotificationCount: number;
  lastNotificationAt: string | null;
  notConvertedCount: number;
  pendingCount: number;
  processedNotificationCount: number;
  recentNotificationEvents: IapNotificationEventDto[];
  refundedCount: number;
  refundRate: number;
  revokedCount: number;
  trialStartedCount: number;
  failedNotificationCount: number;
  trialRevenueMicros: string;
  renewalRevenueMicros: string;
};

export type IapRevenueBucket = {
  label: string;
  prod: number;
  sand: number;
};

export type IapRevenueGranularity = "day" | "week" | "month";

export type IapAppMetrics = {
  activeCount: number;
  canceledCount: number;
  latestTimestamp: number;
  last7Orders: number;
  last7Revenue: number;
  previous7Orders: number;
  previous7Revenue: number;
  revenueBuckets: IapRevenueBucket[];
  totalCount: number;
  totalRevenue: number;
};

export type IapAppDetailPageData = {
  app: IapAppCard;
  filters: {
    environment: string;
    kind: string;
    purchaseDateFrom: string;
    purchaseDateTo: string;
    revenueGranularity: IapRevenueGranularity;
    revenueSort: string;
    state: string;
    trial: string;
  };
  metrics: IapAppMetrics;
  metricsLoaded?: boolean;
  trialAnalytics: IapTrialConversionAnalytics | null;
  transactionPagination: PaginationMeta;
  transactionStates: string[];
  transactions: IapAppTransaction[];
  twoHourChecks: IosIapTwoHourCheck[];
};

export type ReviewAppCard = {
  mappingId: string;
  platform: "android" | "ios";
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
    platform: "all" | "android" | "ios";
    search: string;
    storeProfileId: string;
  };
  storeNames: string[];
  storeOptions: Array<{
    id: string;
    name: string;
  }>;
};

export type StoreReviewDto = {
  id: string;
  reviewId: string;
  authorName: string | null;
  rating: number | null;
  reviewText: string | null;
  originalText: string | null;
  reviewerLanguage: string | null;
  device: string | null;
  deviceMetadata: ReviewDeviceMetadataDto | null;
  osVersionLabel: string | null;
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

export type ReviewDeviceMetadataDto = {
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
  nextPageToken: string | null;
  pagesFetched: number;
  requestCount: number;
  reviewsFetched: number;
  reviewsUpserted: number;
  scanMode: string;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  stopReason: string | null;
};

export type ReviewFetchScheduleDto = {
  id: string;
  intervalHours: number;
  status: string;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastStatus: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  runCount: number;
  updatedAt: string;
  updatedBy: string | null;
};

export type ReviewFetchScheduleApp = ReviewAppCard;

export type ReviewFetchSchedulePageData = {
  appPagination: PaginationMeta;
  apps: ReviewFetchScheduleApp[];
  filters: {
    search: string;
    storeProfileId: string;
  };
  schedule: ReviewFetchScheduleDto | null;
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
  reviews: StoreReviewDto[];
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
  platform: "android" | "ios";
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

export type NotificationCountStat = {
  active: number;
  lastSentAt: string | null;
  lastSeenAt: string | null;
  total: number;
};

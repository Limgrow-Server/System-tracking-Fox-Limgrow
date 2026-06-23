import type {
  CredentialSecretMetadata,
  IosIapTransactionSummary,
  StoreMapping,
} from "@/lib/tracking/types";
import type {
  AndroidStoreProfileSummary,
  IapAndroidDto,
} from "@/lib/server/services/iap/android-iap.service";

export type SupabaseAuthUser = {
  id: string;
  email: string;
};

export type StoreMappingPageData = {
  storeMappings: StoreMapping[];
  credentialSecrets: CredentialSecretMetadata[];
};

export type ConfigsPageData = {
  credentialSecrets: CredentialSecretMetadata[];
  supabaseAuthUsers: SupabaseAuthUser[];
};

export type IosIapVerifyPageData = {
  credentialSecrets: CredentialSecretMetadata[];
  recentTransactions: IosIapTransactionSummary[];
  storeMappings: StoreMapping[];
};

export type AndroidIapPageData = {
  storeProfiles: AndroidStoreProfileSummary[];
  transactions: IapAndroidDto[];
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
  storeNames: string[];
};

export type IapAppDetailPageData = {
  app: IapAppCard;
  transactions: IapAndroidDto[] | IosIapTransactionSummary[];
};

export type ReviewAppCard = {
  mappingId: string;
  platform: "android";
  appName: string;
  identifier: string;
  appIconUrl: string | null;
  appLink: string | null;
  storeAccountName: string;
  storeProfileId: string;
  reviewCount: number;
  averageRating: number | null;
  repliedCount: number;
  pendingReplyCount: number;
  lastFetchedAt: string | null;
  lastSyncStatus: string | null;
  lastErrorMessage: string | null;
};

export type ReviewAppGridPageData = {
  apps: ReviewAppCard[];
  storeNames: string[];
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
  pagesFetched: number;
  reviewsFetched: number;
  reviewsUpserted: number;
  errorCode: string | null;
  errorMessage: string | null;
  startedAt: string;
  finishedAt: string | null;
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

export type ReviewAppDetailPageData = {
  app: ReviewAppCard;
  stats: ReviewAppStats;
  reviews: AndroidStoreReviewDto[];
  syncState: ReviewSyncStateDto | null;
  fetchRuns: ReviewFetchRunDto[];
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

export type ReplyConfigPageData = {
  apps: ReviewAppCard[];
  templatesByMappingId: Record<string, ReviewReplyTemplateDto[]>;
};

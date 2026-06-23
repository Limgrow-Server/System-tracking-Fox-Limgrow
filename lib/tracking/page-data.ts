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

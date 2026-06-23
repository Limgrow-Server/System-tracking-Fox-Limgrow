import type {
  CredentialSecretMetadata,
  IosIapTransactionSummary,
  DeviceToken,
  NotificationEvent,
  NotificationJob,
  NotificationSchedule,
  StoreMapping,
} from "@/lib/tracking/types";

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
export type NotificationsPageData = {
  credentialSecrets: CredentialSecretMetadata[];
  deviceTokens: DeviceToken[];
  notificationEvents: NotificationEvent[];
  notificationJobs: NotificationJob[];
  notificationSchedules: NotificationSchedule[];
  storeMappings: StoreMapping[];
};

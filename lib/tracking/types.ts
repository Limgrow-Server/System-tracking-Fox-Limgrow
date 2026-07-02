export type NumberLike = number | string | null;

export type StaffRole = "Admin" | "Dev" | "Marketing";
export type Platform = "google_play" | "apple_app_store";

export type TeamMember = {
  id: string;
  auth_user_id: string | null;
  name: string;
  email: string;
  role: StaffRole;
  status: "active" | "invited" | "suspended" | "disabled";
  global_access: boolean;
  app_scope: string[] | null;
  store_scope: string[] | null;
  invited_at: string | null;
  last_login_at: string | null;
  last_active_at: string | null;
  created_at: string;
  updated_at: string;
};

export type StoreMapping = {
  id: string;
  store_profile_id: string;
  store_platform: Platform;
  store_account_name: string;
  app_id: string | null;
  app_name: string;
  app_icon_url: string | null;
  app_link: string | null;
  platform: "android" | "ios";
  package_name: string | null;
  bundle_id: string | null;
  status: string;
  created_at: string;
  updated_at: string;
};

export type CredentialSecretMetadata = {
  id: string;
  store_profile_id: string | null;
  credential_ref: string;
  credential_purpose: "firebase_admin" | "review" | "iap" | null;
  secret_type:
    | "firebase_service_account"
    | "apple_asc_p8"
    | "apple_iap_p8"
    | null;
  secret_format: "json" | "p8" | null;
  vault_secret_id: string | null;
  vault_secret_name: string | null;
  vault_secret_version: number;
  store_platform: Platform | null;
  store_account_name: string | null;
  link_store: string | null;
  avatar_url: string | null;
  platform: "android" | "ios" | null;
  key_id: string | null;
  issuer_id: string | null;
  client_email: string | null;
  project_id: string | null;
  status: "active" | "disabled";
  description: string | null;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
};

export type IosIapTransactionSummary = {
  id: string;
  transaction_id: string;
  original_transaction_id: string | null;
  product_id: string;
  user_id: string | null;
  bundle_id: string | null;
  purchase_date: string | null;
  expires_date: string | null;
  state: string;
  revenue_micros: string | null;
  price_milliunits: string | null;
  currency: string | null;
  is_trial: boolean | null;
  offer_discount_type: string | null;
  offer_period: string | null;
  billing_plan_type: string | null;
  transaction_reason: string | null;
  storefront: string | null;
  revocation_date: string | null;
  environment: string;
  raw_receipt: unknown;
  verified_at: string;
  created_at: string;
};

export type NotificationJob = {
  id: string;
  schedule_id: string | null;
  platform: "android" | "ios" | string;
  store_platform: Platform | string | null;
  store_profile_id: string | null;
  store_account_name: string | null;
  app_mapping_id: string | null;
  app_id: string | null;
  app_name: string;
  package_name: string | null;
  bundle_id: string | null;
  topic_base: string;
  credential_ref: string | null;
  project_id: string | null;
  target_type: string;
  target_values: string[];
  title: string | null;
  message: string | null;
  image_url: string | null;
  data_payload: unknown;
  locale_payload: unknown;
  status: string;
  sent_count: number;
  error_count: number;
  requested_by: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationSchedule = {
  id: string;
  name: string;
  platform: "android" | "ios" | string;
  store_platform: Platform | string | null;
  store_profile_id: string | null;
  store_account_name: string | null;
  app_mapping_id: string | null;
  app_id: string | null;
  app_name: string;
  package_name: string | null;
  bundle_id: string | null;
  topic_base: string;
  credential_ref: string | null;
  project_id: string | null;
  target_type: string;
  target_values: string[];
  title: string | null;
  message: string | null;
  image_url: string | null;
  data_payload: unknown;
  locale_payload: unknown;
  schedule_type: "once" | "daily" | "monthly" | string;
  timezone: string;
  scheduled_at: string | null;
  time_of_day: string | null;
  day_of_month: number | null;
  status: string;
  next_run_at: string | null;
  last_run_at: string | null;
  last_status: string | null;
  last_error: string | null;
  run_count: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type NotificationEvent = {
  id: string;
  notification_id: string;
  job_id: string | null;
  event_type: string;
  device_id: string | null;
  platform: "android" | "ios" | string | null;
  target_type: string | null;
  target_value: string | null;
  status: string | null;
  provider_message_id: string | null;
  error_code: string | null;
  error_detail: string | null;
  metadata: unknown;
  created_at: string;
};

export type DeviceToken = {
  id: string;
  user_id: string;
  app_id: string | null;
  device_id: string;
  platform: "android" | "ios" | string;
  firebase_app_id: string | null;
  firebase_project_id: string | null;
  app_identifier: string | null;
  fcm_token: string;
  app_version: string | null;
  os_version: string | null;
  locale: string | null;
  status: string;
  last_seen_at: string;
  store_platform: Platform | string | null;
  store_account_name: string | null;
  product_app_id: string | null;
  package_name: string | null;
  bundle_id: string | null;
  device_type: string | null;
  device_model: string | null;
  device_manufacturer: string | null;
  created_at: string;
  updated_at: string;
};

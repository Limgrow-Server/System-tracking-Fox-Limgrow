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
  supabase_user_id: string | null;
  supabase_user_email: string | null;
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
  environment: string;
  raw_receipt: unknown;
  verified_at: string;
  created_at: string;
};

export type CredentialPayload = {
  id?: string;
  ids?: string[];
  credentialRef?: string;
  secretType?: string;
  secretFormat?: "json" | "p8";
  secretFile?: File | null;
  storeProfileId?: string | null;
  storePlatform?: "google_play" | "apple_app_store" | null;
  storeAccountName?: string | null;
  platform?: "android" | "ios" | null;
  keyId?: string | null;
  issuerId?: string | null;
  clientEmail?: string | null;
  projectId?: string | null;
  linkStore?: string | null;
  avatarUrl?: string | null;
  supabaseUserId?: string | null;
  status?: "active" | "disabled";
  description?: string | null;
  secretFileName?: string | null;
  confirmationName?: string | null;
};

export type CredentialPlatform = "android" | "ios";

export type CredentialMetadata = {
  clientEmail: string | null;
  issuerId: string | null;
  keyId: string | null;
  projectId: string | null;
};

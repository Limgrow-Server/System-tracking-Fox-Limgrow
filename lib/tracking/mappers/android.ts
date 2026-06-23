import { enumValue, iso } from "@/lib/tracking/mappers/shared";
import type {
  CredentialSecretMetadata,
  StoreMapping,
} from "@/lib/tracking/types";

import type { AndroidCredential, AndroidStoreMapping, AndroidStoreProfile } from "@prisma/client";

export type AndroidStoreMappingRecord = AndroidStoreMapping;
export type AndroidCredentialRecord = AndroidCredential & {
  storeProfile?: Pick<AndroidStoreProfile, "supabaseUserId"> | null;
};

export function androidStoreMappingToTracking(mapping: AndroidStoreMappingRecord): StoreMapping {
  return {
    id: mapping.id,
    store_profile_id: mapping.storeProfileId,
    store_platform: "google_play",
    store_account_name: mapping.storeAccountName,
    app_id: mapping.appId,
    app_name: mapping.appName,
    app_icon_url: mapping.appIconUrl,
    app_link: mapping.appLink,
    platform: "android",
    package_name: mapping.packageName,
    bundle_id: null,
    status: enumValue(mapping.status),
    created_at: mapping.createdAt.toISOString(),
    updated_at: mapping.updatedAt.toISOString(),
  };
}

export function androidCredentialToMetadata(credential: AndroidCredentialRecord): CredentialSecretMetadata {
  return {
    id: credential.id,
    store_profile_id: credential.storeProfileId,
    credential_ref: credential.credentialRef,
    credential_purpose: null,
    secret_type: null,
    secret_format: null,
    vault_secret_id: credential.vaultSecretId,
    vault_secret_name: credential.vaultSecretName,
    vault_secret_version: credential.vaultSecretVersion,
    store_platform: "google_play",
    store_account_name: credential.storeAccountName,
    link_store: credential.linkStore,
    avatar_url: credential.avatarUrl,
    platform: "android",
    key_id: credential.privateKeyId,
    issuer_id: null,
    client_email: credential.clientEmail,
    project_id: credential.projectId,
    status: enumValue(credential.status) as CredentialSecretMetadata["status"],
    description: credential.description,
    last_used_at: iso(credential.lastUsedAt),
    supabase_user_id: credential.storeProfile?.supabaseUserId ?? null,
    supabase_user_email: null,
    created_at: credential.createdAt.toISOString(),
    updated_at: credential.updatedAt.toISOString(),
  };
}

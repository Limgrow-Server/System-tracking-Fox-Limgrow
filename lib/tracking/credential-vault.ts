import type {
  CredentialSecretMetadata,
  Platform,
  StoreMapping,
} from "@/lib/tracking/types";

export type MobilePlatform = "android" | "ios";
export type SecretType = NonNullable<CredentialSecretMetadata["secret_type"]>;
export type CredentialPurpose = NonNullable<CredentialSecretMetadata["credential_purpose"]>;

export type VaultCredentialOption = {
  id: string;
  ref: string;
  purpose: CredentialPurpose | null;
  secretType: SecretType | null;
  platform: MobilePlatform;
  storePlatform: Platform;
  storeAccountName: string | null;
  linkStore: string | null;
  avatarUrl: string | null;
  keyId: string | null;
  issuerId: string | null;
  clientEmail: string | null;
  projectId: string | null;
  description: string | null;
  status: CredentialSecretMetadata["status"];
  label: string;
};

export const SECRET_TYPE_LABELS: Record<SecretType, string> = {
  firebase_service_account: "Firebase Admin service account JSON",
  apple_asc_p8: "Apple ASC .p8",
  apple_iap_p8: "Apple IAP .p8",
};

export function defaultSecretFormatForType(secretType: SecretType) {
  if (secretType.includes("p8")) return "p8" as const;
  return "json" as const;
}

export function storePlatformForMobilePlatform(
  platform: MobilePlatform,
): Platform {
  return platform === "android" ? "google_play" : "apple_app_store";
}

export function secretTypeSupportsPlatform(
  secretType: SecretType,
  platform: MobilePlatform,
) {
  if (secretType === "apple_asc_p8" || secretType === "apple_iap_p8") {
    return platform === "ios";
  }
  return secretType === "firebase_service_account" && platform === "ios";
}

export function defaultPlatformForSecretType(
  secretType: SecretType,
  fallback: MobilePlatform = "ios",
) {
  if (secretType === "apple_asc_p8" || secretType === "apple_iap_p8") {
    return "ios";
  }
  return fallback === "android" ? "ios" : fallback;
}

function credentialPrimaryLabel(credential: CredentialSecretMetadata) {
  if (credential.secret_type === "apple_asc_p8" || credential.secret_type === "apple_iap_p8") {
    return credential.key_id ?? credential.credential_ref;
  }

  return credential.project_id ?? credential.store_account_name ?? credential.credential_ref;
}

export function credentialVaultOptions(
  credentials: CredentialSecretMetadata[],
): VaultCredentialOption[] {
  return credentials.map((credential) => {
    const platform =
      credential.platform ??
      (credential.store_platform === "apple_app_store" ? "ios" : "android");
    const primaryLabel = credentialPrimaryLabel(credential);
    const secretTypeLabel = credential.secret_type
      ? SECRET_TYPE_LABELS[credential.secret_type]
      : "Android service account JSON";

    return {
      id: credential.id,
      ref: credential.credential_ref,
      purpose: credential.credential_purpose,
      secretType: credential.secret_type,
      platform,
      storePlatform:
        credential.store_platform ?? storePlatformForMobilePlatform(platform),
      storeAccountName: credential.store_account_name,
      linkStore: credential.link_store,
      avatarUrl: credential.avatar_url,
      keyId: credential.key_id,
      issuerId: credential.issuer_id,
      clientEmail: credential.client_email,
      projectId: credential.project_id,
      description: credential.description,
      status: credential.status,
      label: `${primaryLabel} / ${secretTypeLabel}`,
    };
  });
}

export function credentialOptionsForPurpose(
  credentials: CredentialSecretMetadata[],
  platform: MobilePlatform,
  secretTypes: SecretType[],
) {
  const allowed = new Set(secretTypes);

  return credentialVaultOptions(credentials).filter((credential) => {
    return (
      credential.status === "active" &&
      credential.platform === platform &&
      credential.secretType !== null &&
      allowed.has(credential.secretType)
    );
  });
}

export function mappingCredentialRefs(mapping: StoreMapping): VaultCredentialOption[] {
  void mapping;
  return [];
}

export function credentialUsageCounts(mappings: StoreMapping[]) {
  return mappings.reduce<Record<string, number>>((counts, mapping) => {
    for (const credential of mappingCredentialRefs(mapping)) {
      counts[credential.ref] = (counts[credential.ref] ?? 0) + 1;
    }
    return counts;
  }, {});
}

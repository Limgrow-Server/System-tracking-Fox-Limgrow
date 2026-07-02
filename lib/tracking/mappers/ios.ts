import { enumValue, iso } from "@/lib/tracking/mappers/shared";
import type {
  CredentialSecretMetadata,
  IosIapTransactionSummary,
  StoreMapping,
} from "@/lib/tracking/types";

import type { IosCredential, IosIapTransaction, IosStoreMapping } from "@prisma/client";

export type IosStoreMappingRecord = IosStoreMapping & {
  storeProfile?: { storeAccountName: string } | null;
};
export type IosCredentialRecord = IosCredential;

export function iosStoreMappingToTracking(mapping: IosStoreMappingRecord): StoreMapping {
  return {
    id: mapping.id,
    store_profile_id: mapping.storeProfileId,
    store_platform: "apple_app_store",
    store_account_name: mapping.storeProfile?.storeAccountName ?? mapping.storeAccountName,
    app_id: mapping.appId,
    app_name: mapping.appName,
    app_icon_url: mapping.appIconUrl,
    app_link: mapping.appLink,
    platform: "ios",
    package_name: null,
    bundle_id: mapping.bundleId,
    status: enumValue(mapping.status),
    created_at: mapping.createdAt.toISOString(),
    updated_at: mapping.updatedAt.toISOString(),
  };
}

export function iosCredentialToMetadata(credential: IosCredentialRecord): CredentialSecretMetadata {
  return {
    id: credential.id,
    store_profile_id: credential.storeProfileId,
    credential_ref: credential.credentialRef,
    credential_purpose: enumValue(credential.credentialPurpose) as CredentialSecretMetadata["credential_purpose"],
    secret_type: enumValue(credential.secretType) as CredentialSecretMetadata["secret_type"],
    secret_format: enumValue(credential.secretFormat) as CredentialSecretMetadata["secret_format"],
    vault_secret_id: credential.vaultSecretId,
    vault_secret_name: credential.vaultSecretName,
    vault_secret_version: credential.vaultSecretVersion,
    store_platform: "apple_app_store",
    store_account_name: credential.storeAccountName,
    link_store: credential.linkStore,
    avatar_url: credential.avatarUrl,
    platform: "ios",
    key_id: credential.keyId,
    issuer_id: credential.issuerId,
    client_email: credential.clientEmail,
    project_id: credential.projectId,
    status: enumValue(credential.status) as CredentialSecretMetadata["status"],
    description: credential.description,
    last_used_at: iso(credential.lastUsedAt),
    created_at: credential.createdAt.toISOString(),
    updated_at: credential.updatedAt.toISOString(),
  };
}

export function iosIapTransactionToSummary(transaction: IosIapTransaction): IosIapTransactionSummary {
  return {
    id: transaction.id,
    transaction_id: transaction.transactionId,
    original_transaction_id: transaction.originalTransactionId,
    product_id: transaction.productId,
    user_id: transaction.userId,
    bundle_id: transaction.bundleId,
    purchase_date: iso(transaction.purchaseDate),
    expires_date: iso(transaction.expiresDate),
    state: transaction.state,
    revenue_micros: transaction.revenueMicros?.toString() ?? null,
    price_milliunits: transaction.priceMilliunits?.toString() ?? null,
    currency: transaction.currency,
    is_trial: transaction.isTrial,
    offer_discount_type: transaction.offerDiscountType,
    offer_period: transaction.offerPeriod,
    billing_plan_type: transaction.billingPlanType,
    transaction_reason: transaction.transactionReason,
    storefront: transaction.storefront,
    revocation_date: iso(transaction.revocationDate),
    environment: transaction.environment,
    raw_receipt: transaction.rawReceipt,
    verified_at: transaction.verifiedAt.toISOString(),
    created_at: transaction.createdAt.toISOString(),
  };
}

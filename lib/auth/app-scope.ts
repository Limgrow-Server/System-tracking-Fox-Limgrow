import type { ConsoleSession } from "@/lib/auth/rbac";
import type { IapAppCard, ReviewAppCard } from "@/lib/tracking/page-data";
import type {
  CredentialSecretMetadata,
  DeviceToken,
  NotificationJob,
  NotificationSchedule,
  StoreMapping,
} from "@/lib/tracking/types";

type ScopeRecord = Partial<{
  app_id: string | null;
  app_mapping_id: string | null;
  app_name: string | null;
  appId: string | null;
  appName: string | null;
  bundle_id: string | null;
  bundleId: string | null;
  credential_ref: string | null;
  credentialRef: string | null;
  id: string | null;
  identifier: string | null;
  mappingId: string | null;
  package_name: string | null;
  packageName: string | null;
  product_app_id: string | null;
  store_account_name: string | null;
  store_profile_id: string | null;
  storeAccountName: string | null;
  storeMappingId: string | null;
  storeProfileId: string | null;
}>;

type ScopeFields = {
  appKeys: string[];
  storeKeys: string[];
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values: unknown[]) {
  return Array.from(
    new Set(values.map(clean).filter(Boolean)),
  );
}

function scopeSet(values: string[] | null | undefined) {
  return new Set((values ?? []).map(clean).filter(Boolean));
}

function hasOverlap(keys: string[], values: Set<string>) {
  return keys.some((key) => values.has(key));
}

export function hasAllAppAccess(session: ConsoleSession) {
  return session.role === "Admin";
}

export function storeMappingScopeFields(mapping: StoreMapping): ScopeFields {
  return {
    appKeys: unique([
      mapping.id,
      mapping.app_id,
      mapping.app_name,
      mapping.package_name,
      mapping.bundle_id,
    ]),
    storeKeys: unique([
      mapping.store_profile_id,
      mapping.store_account_name,
    ]),
  };
}

function scopeFieldsFromRecord(record: ScopeRecord): ScopeFields {
  return {
    appKeys: unique([
      record.app_mapping_id,
      record.storeMappingId,
      record.mappingId,
      record.id,
      record.app_id,
      record.appId,
      record.product_app_id,
      record.app_name,
      record.appName,
      record.package_name,
      record.packageName,
      record.bundle_id,
      record.bundleId,
      record.identifier,
    ]),
    storeKeys: unique([
      record.store_profile_id,
      record.storeProfileId,
      record.store_account_name,
      record.storeAccountName,
    ]),
  };
}

export function canAccessScopeFields(session: ConsoleSession, fields: ScopeFields) {
  if (hasAllAppAccess(session)) return true;

  const appScope = scopeSet(session.appScope);
  const storeScope = scopeSet(session.storeScope);

  return hasOverlap(fields.appKeys, appScope) || hasOverlap(fields.storeKeys, storeScope);
}

export function canAccessStoreMapping(session: ConsoleSession, mapping: StoreMapping) {
  return canAccessScopeFields(session, storeMappingScopeFields(mapping));
}

export function canAccessScopedRecord(session: ConsoleSession, record: ScopeRecord) {
  return canAccessScopeFields(session, scopeFieldsFromRecord(record));
}

export function recordMatchesStoreMapping(
  record: ScopeRecord,
  mapping: StoreMapping,
) {
  const recordFields = scopeFieldsFromRecord(record);
  const mappingFields = storeMappingScopeFields(mapping);
  const mappingAppKeys = new Set(mappingFields.appKeys);
  const mappingStoreKeys = new Set(mappingFields.storeKeys);

  return (
    hasOverlap(recordFields.appKeys, mappingAppKeys) ||
    hasOverlap(recordFields.storeKeys, mappingStoreKeys)
  );
}

export function canAccessRecordViaStoreMappings(
  session: ConsoleSession,
  record: ScopeRecord,
  mappings: StoreMapping[],
) {
  return mappings.some(
    (mapping) =>
      recordMatchesStoreMapping(record, mapping) &&
      canAccessStoreMapping(session, mapping),
  );
}

export function filterStoreMappingsForSession(
  session: ConsoleSession,
  mappings: StoreMapping[],
) {
  return hasAllAppAccess(session)
    ? mappings
    : mappings.filter((mapping) => canAccessStoreMapping(session, mapping));
}

export function filterScopedRecordsForSession<T extends ScopeRecord>(
  session: ConsoleSession,
  rows: T[],
) {
  return hasAllAppAccess(session)
    ? rows
    : rows.filter((row) => canAccessScopedRecord(session, row));
}

export function scopedCredentialSecrets(
  session: ConsoleSession,
  credentials: CredentialSecretMetadata[],
  storeMappings: StoreMapping[],
) {
  if (hasAllAppAccess(session)) return credentials;

  const scopedStores = new Set(
    storeMappings.flatMap((mapping) =>
      storeMappingScopeFields(mapping).storeKeys,
    ),
  );

  return credentials.filter((credential) =>
    hasOverlap(scopeFieldsFromRecord(credential).storeKeys, scopedStores),
  );
}

export function scopedNotificationEvents<T extends { job_id: string | null; device_id: string | null }>(
  events: T[],
  jobs: NotificationJob[],
  deviceTokens: DeviceToken[],
) {
  const jobIds = new Set(jobs.map((job) => job.id));
  const deviceIds = new Set(deviceTokens.map((device) => device.device_id));

  return events.filter(
    (event) =>
      (event.job_id && jobIds.has(event.job_id)) ||
      (event.device_id && deviceIds.has(event.device_id)),
  );
}

export function canAccessIapApp(session: ConsoleSession, app: IapAppCard) {
  return canAccessScopedRecord(session, app);
}

export function canAccessReviewApp(session: ConsoleSession, app: ReviewAppCard) {
  return canAccessScopedRecord(session, app);
}

export function notificationRecordFromPayload(payload: Record<string, unknown>): ScopeRecord {
  return {
    app_id: clean(payload.appId) || clean(payload.productAppId) || null,
    app_mapping_id: clean(payload.appMappingId) || clean(payload.mappingId) || null,
    app_name: clean(payload.appName) || null,
    bundle_id: clean(payload.bundleId) || null,
    credential_ref: clean(payload.credentialRef) || null,
    package_name: clean(payload.packageName) || null,
    store_account_name: clean(payload.storeAccountName) || null,
    store_profile_id: clean(payload.storeProfileId) || null,
  };
}

export function scopedNotificationSchedules(
  session: ConsoleSession,
  schedules: NotificationSchedule[],
) {
  return filterScopedRecordsForSession(session, schedules);
}

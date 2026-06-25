export type StoreMappingPayload = {
  id?: string;
  storeAccountName?: string;
  storeProfileId?: string | null;
  appId?: string | null;
  appName?: string;
  appIconUrl?: string | null;
  appLink?: string | null;
  platform?: "android" | "ios";
  packageName?: string | null;
  bundleId?: string | null;
  status?: string | null;
};

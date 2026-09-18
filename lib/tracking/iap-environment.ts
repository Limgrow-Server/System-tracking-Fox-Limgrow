export type IapPlatform = "android" | "ios";

const TEST_ENVIRONMENT_APP_IDS: Record<IapPlatform, ReadonlySet<string>> = {
  android: new Set(["la000", "la004"]),
  ios: new Set(["li000"]),
};

export function normalizeIapAppId(value: string | null | undefined) {
  return (
    value
      ?.trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "") ?? ""
  );
}

export function supportsIapTestEnvironment(
  platform: IapPlatform,
  appId: string | null | undefined,
) {
  return TEST_ENVIRONMENT_APP_IDS[platform].has(normalizeIapAppId(appId));
}

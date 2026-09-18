export type AppConfigPlatform = "android" | "ios";

export type AppConfigOption = {
  appId: string;
  appName: string;
  iconUrl: string | null;
  key: string;
  mappingId: string;
  platform: AppConfigPlatform;
  status: string;
};

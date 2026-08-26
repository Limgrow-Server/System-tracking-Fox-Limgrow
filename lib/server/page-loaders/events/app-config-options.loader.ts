import "server-only";

import { getAndroidStoreMappingDtos } from "@/lib/server/services/store-mappings/android-store-mapping.service";
import { getIosStoreMappingDtos } from "@/lib/server/services/store-mappings/ios-store-mapping.service";
import type { AppConfigOption } from "@/lib/tracking/app-config";
import type { StoreMapping } from "@/lib/tracking/types";

function eventAppId(mapping: StoreMapping) {
  return mapping.package_name ?? mapping.bundle_id ?? mapping.app_id;
}

function toOption(mapping: StoreMapping): AppConfigOption | null {
  const appId = eventAppId(mapping)?.trim();
  if (!appId || mapping.status.toLowerCase() === "archived") return null;

  return {
    appId,
    appName: mapping.app_name,
    iconUrl: mapping.app_icon_url,
    key: `${mapping.platform}:${appId}`,
    mappingId: mapping.id,
    platform: mapping.platform,
    status: mapping.status,
  };
}

export async function getAppConfigOptions(): Promise<AppConfigOption[]> {
  const [androidMappings, iosMappings] = await Promise.all([
    getAndroidStoreMappingDtos({ take: 500 }),
    getIosStoreMappingDtos({ take: 500 }),
  ]);
  const options = [...androidMappings, ...iosMappings]
    .map(toOption)
    .filter((option): option is AppConfigOption => option !== null)
    .sort((left, right) =>
      left.appName.localeCompare(right.appName, "vi", { sensitivity: "base" }),
    );

  return Array.from(
    new Map(options.map((option) => [option.key, option])).values(),
  );
}

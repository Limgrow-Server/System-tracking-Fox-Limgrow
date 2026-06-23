import "server-only";

import { getAndroidCredentialConfigs } from "@/lib/server/services/credentials/android-credential.service";
import { getAndroidStoreMappingDtos } from "@/lib/server/services/store-mappings/android-store-mapping.service";
import type { StoreMappingPageData } from "@/lib/tracking/page-data";

export async function getAndroidStoreMappingPageData(): Promise<StoreMappingPageData> {
  const [storeMappings, credentialConfigs] = await Promise.all([
    getAndroidStoreMappingDtos({ take: 200 }),
    getAndroidCredentialConfigs(),
  ]);

  return {
    credentialSecrets: credentialConfigs.credentials,
    storeMappings,
  };
}

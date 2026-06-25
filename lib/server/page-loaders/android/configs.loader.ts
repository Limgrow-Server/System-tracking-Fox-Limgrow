import "server-only";

import { getAndroidCredentialConfigs } from "@/lib/server/services/credentials/android-credential.service";
import type { ConfigsPageData } from "@/lib/tracking/page-data";

export async function getAndroidConfigsPageData(): Promise<ConfigsPageData> {
  const credentialConfigs = await getAndroidCredentialConfigs();

  return {
    credentialSecrets: credentialConfigs.credentials,
  };
}

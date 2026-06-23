import "server-only";

import { getIosCredentialConfigs } from "@/lib/server/services/credentials/ios-credential.service";
import type { ConfigsPageData } from "@/lib/tracking/page-data";

export async function getIosConfigsPageData(): Promise<ConfigsPageData> {
  const credentialConfigs = await getIosCredentialConfigs();

  return {
    credentialSecrets: credentialConfigs.credentials,
    supabaseAuthUsers: [],
  };
}

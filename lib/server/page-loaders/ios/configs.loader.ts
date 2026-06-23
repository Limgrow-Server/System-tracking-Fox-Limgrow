import "server-only";

import { getIosCredentialConfigs } from "@/lib/server/services/credentials/ios-credential.service";
import { getSupabaseAuthUsersForStoreLink } from "@/lib/server/services/credentials/store-auth.service";
import type { ConfigsPageData } from "@/lib/tracking/page-data";

export async function getIosConfigsPageData(): Promise<ConfigsPageData> {
  const [credentialConfigs, supabaseAuthUsers] = await Promise.all([
    getIosCredentialConfigs(),
    getSupabaseAuthUsersForStoreLink(),
  ]);

  return {
    credentialSecrets: credentialConfigs.credentials,
    supabaseAuthUsers,
  };
}

import "server-only";

import { getAndroidCredentialConfigs } from "@/lib/server/services/credentials/android-credential.service";
import { getSupabaseAuthUsersForStoreLink } from "@/lib/server/services/credentials/store-auth.service";
import type { ConfigsPageData } from "@/lib/tracking/page-data";

export async function getAndroidConfigsPageData(): Promise<ConfigsPageData> {
  const [credentialConfigs, supabaseAuthUsers] = await Promise.all([
    getAndroidCredentialConfigs(),
    getSupabaseAuthUsersForStoreLink(),
  ]);

  return {
    credentialSecrets: credentialConfigs.credentials,
    supabaseAuthUsers,
  };
}

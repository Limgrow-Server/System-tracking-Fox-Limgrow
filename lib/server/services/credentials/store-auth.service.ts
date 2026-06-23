import "server-only";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseAuthUser } from "@/lib/tracking/page-data";

/**
 * Fetch all Supabase Auth users and return them as a simple list.
 * Used by the config UI to populate the account-linking dropdown.
 */
export async function getSupabaseAuthUsersForStoreLink(): Promise<SupabaseAuthUser[]> {
  const supabase = createAdminClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 500 });
    if (error || !data?.users) return [];

    return data.users
      .filter((user) => user.email)
      .map((user) => ({
        id: user.id,
        email: user.email!,
      }));
  } catch {
    return [];
  }
}

/**
 * Get the list of Supabase user IDs that are already linked to an Android store profile.
 * This is used to filter the dropdown to only show unlinked accounts.
 */
export async function getLinkedAndroidStoreUserIds(): Promise<Set<string>> {
  const profiles = await prisma.androidStoreProfile.findMany({
    where: { supabaseUserId: { not: null } },
    select: { supabaseUserId: true },
  });

  return new Set(
    profiles
      .map((profile) => profile.supabaseUserId)
      .filter((id): id is string => id !== null)
  );
}

/**
 * Link or unlink a Supabase Auth user to an Android store profile.
 */
export async function updateStoreProfileAuthLink(
  storeProfileId: string,
  supabaseUserId: string | null
) {
  return prisma.androidStoreProfile.update({
    where: { id: storeProfileId },
    data: { supabaseUserId },
  });
}

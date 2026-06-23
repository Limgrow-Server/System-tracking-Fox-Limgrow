import "server-only";

import { prisma } from "@/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseAuthUser } from "@/lib/tracking/page-data";

type AuthUserRow = {
  email: string | null;
  id: string;
};

async function getSupabaseAuthUsersFromDatabase(limit = 500): Promise<SupabaseAuthUser[]> {
  try {
    const rows = await prisma.$queryRaw<AuthUserRow[]>`
      SELECT id::text AS id, email
      FROM auth.users
      WHERE email IS NOT NULL
      ORDER BY email ASC
      LIMIT ${limit}
    `;

    return rows.map((user) => ({
      id: user.id,
      email: user.email!,
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch all Supabase Auth users and return them as a simple list.
 * Used by the config UI to populate the account-linking dropdown.
 */
export async function getSupabaseAuthUsersForStoreLink(): Promise<SupabaseAuthUser[]> {
  const supabase = createAdminClient();
  if (!supabase) {
    return getSupabaseAuthUsersFromDatabase();
  }

  try {
    const { data, error } = await supabase.auth.admin.listUsers({ perPage: 500 });
    if (error || !data?.users?.length) {
      return getSupabaseAuthUsersFromDatabase();
    }

    return data.users
      .filter((user) => user.email)
      .map((user) => ({
        id: user.id,
        email: user.email!,
      }));
  } catch {
    return getSupabaseAuthUsersFromDatabase();
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

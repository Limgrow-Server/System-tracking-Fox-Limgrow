import { createAdminClient } from "@/lib/supabase/admin";
import type { TeamMember } from "@/lib/tracking/types";

export async function syncConsoleAuthMetadata(authUserId: string | null, member: TeamMember) {
  const supabase = createAdminClient();
  if (!supabase || !authUserId) return null;

  const { error } = await supabase.auth.admin.updateUserById(authUserId, {
    app_metadata: {
      role: member.role,
      staff_role: member.role,
      console_role: member.role,
      console_status: member.status,
      team_member_id: member.id,
      global_access: member.global_access,
      app_scope: member.app_scope ?? [],
      store_scope: member.store_scope ?? [],
    },
  });

  return error?.message ?? null;
}

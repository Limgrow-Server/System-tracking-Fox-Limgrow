import "server-only";

import { syncConsoleAuthMetadata } from "@/lib/auth/auth-metadata";
import { isStaffRole } from "@/lib/auth/rbac";
import {
  cleanText,
  normalizeEmail,
  prismaRoleToStaffRole,
  prismaStatusToTeamMemberStatus,
  teamMemberToTracking,
} from "@/lib/auth/team-members";
import { badRequest, ApiError } from "@/lib/server/api/errors";
import {
  getTeamMemberByAuthUserOrEmail,
  markTeamMemberLogin,
} from "@/lib/server/repositories/auth/team-member.repository";
import { createClient } from "@/lib/supabase/server";

export type LoginPayload = {
  email?: string;
  password?: string;
};

function unauthorized(message = "Invalid email or password.") {
  return new ApiError(message, 401);
}

export async function loginConsoleUser(payload: LoginPayload) {
  const email = normalizeEmail(payload.email);
  const password = cleanText(payload.password);

  if (!email || !password) {
    throw badRequest("Email and password are required.");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user?.id || !data.user.email) {
    throw unauthorized();
  }

  const authEmail = normalizeEmail(data.user.email);
  const member = await getTeamMemberByAuthUserOrEmail({
    authUserId: data.user.id,
    email: authEmail,
  });

  const role = member ? prismaRoleToStaffRole[member.role] : null;
  const status = member ? prismaStatusToTeamMemberStatus[member.status] : null;
  const isLinkedToDifferentAuthUser = Boolean(member?.authUserId && member.authUserId !== data.user.id);

  if (!member || isLinkedToDifferentAuthUser || status !== "active" || !isStaffRole(role)) {
    await supabase.auth.signOut({ scope: "local" });
    throw unauthorized("Account is not active or does not have console access.");
  }

  const linkedMember = await markTeamMemberLogin({
    authUserId: data.user.id,
    id: member.id,
    now: new Date(),
  });
  const linkedMemberDto = teamMemberToTracking(linkedMember);

  await syncConsoleAuthMetadata(linkedMemberDto.auth_user_id, linkedMemberDto);
  await supabase.auth.refreshSession();

  return {
    user: {
      authUserId: data.user.id,
      memberId: linkedMember.id,
      email: linkedMember.email,
      name: linkedMember.name,
      role,
    },
    message: "Signed in.",
  };
}

export async function logoutConsoleUser() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut({ scope: "local" });

  if (error) {
    throw new ApiError(error.message, 500);
  }

  return { message: "Signed out." };
}

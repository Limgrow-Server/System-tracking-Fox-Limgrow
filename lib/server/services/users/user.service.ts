import "server-only";

import { Prisma } from "@prisma/client";

import { syncConsoleAuthMetadata } from "@/lib/auth/auth-metadata";
import type { ConsoleSession } from "@/lib/auth/rbac";
import {
  cleanText,
  normalizeEmail,
  staffRoleToPrismaRole,
  teamMemberStatusToPrismaStatus,
  teamMemberToTracking,
} from "@/lib/auth/team-members";
import { badRequest, conflict } from "@/lib/server/api/errors";
import {
  createTeamMember,
  deleteTeamMember,
  getTeamMembers,
  updateTeamMember,
} from "@/lib/server/repositories/auth/team-member.repository";
import { createAdminClient } from "@/lib/supabase/admin";
import type { StaffRole, TeamMember } from "@/lib/tracking/types";

export type UserPayload = {
  id?: string;
  name?: string;
  email?: string;
  role?: StaffRole;
  status?: TeamMember["status"];
  appScope?: string[];
  storeScope?: string[];
  globalAccess?: boolean;
};

const roles = new Set<StaffRole>(["Admin", "Dev", "Marketing"]);
const statuses = new Set<TeamMember["status"]>(["active", "invited", "suspended", "disabled"]);

function arrayScope(value: unknown) {
  return Array.isArray(value) ? value.map(cleanText).filter(Boolean) : [];
}

function isPrismaUniqueError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function inviteAuthUser(email: string, name: string, request: Request) {
  const supabase = createAdminClient();
  if (!supabase) {
    return {
      authUserId: null,
      warning: "User row was saved, but SUPABASE_SERVICE_ROLE_KEY is not configured so no Auth invite was sent.",
    };
  }

  const origin = new URL(request.url).origin;
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    data: { name },
    redirectTo: `${origin}/auth/callback?next=/dashboard`,
  });

  return {
    authUserId: data?.user?.id ?? null,
    warning: error?.message ?? null,
  };
}

export async function getConsoleUsers() {
  const users = await getTeamMembers();
  return { users: users.map(teamMemberToTracking) };
}

export async function createConsoleUser(payload: UserPayload, admin: ConsoleSession, request: Request) {
  const name = cleanText(payload.name);
  const email = normalizeEmail(payload.email);
  const role = payload.role ?? "Marketing";
  const status = payload.status ?? "active";

  if (!name || !email || !roles.has(role) || !statuses.has(status)) {
    throw badRequest("Invalid user payload.");
  }

  const invite = await inviteAuthUser(email, name, request);

  try {
    const user = await createTeamMember({
      authUserId: invite.authUserId,
      name,
      email,
      role: staffRoleToPrismaRole[role],
      status: teamMemberStatusToPrismaStatus[status],
      globalAccess: payload.globalAccess ?? role === "Admin",
      appScope: arrayScope(payload.appScope),
      storeScope: arrayScope(payload.storeScope),
      createdBy: admin.email,
      invitedAt: new Date(),
    });
    const dto = teamMemberToTracking(user);
    const metadataWarning = await syncConsoleAuthMetadata(dto.auth_user_id, dto);
    const message = invite.warning
      ? `User ${email} created. ${invite.warning}`
      : metadataWarning
        ? `User ${email} created and invited. Metadata sync warning: ${metadataWarning}`
        : `User ${email} created and invited.`;

    return {
      user: dto,
      message,
    };
  } catch (error) {
    if (isPrismaUniqueError(error)) {
      throw conflict("A user with this email already exists.");
    }

    throw error;
  }
}

export async function updateConsoleUser(payload: UserPayload) {
  const id = cleanText(payload.id);

  if (!id) {
    throw badRequest("User id is required.");
  }

  const data: Prisma.TeamMemberUpdateInput = {};
  if (payload.name !== undefined) data.name = cleanText(payload.name);
  if (payload.role !== undefined && roles.has(payload.role)) data.role = staffRoleToPrismaRole[payload.role];
  if (payload.status !== undefined && statuses.has(payload.status)) {
    data.status = teamMemberStatusToPrismaStatus[payload.status];
  }
  if (payload.globalAccess !== undefined) data.globalAccess = Boolean(payload.globalAccess);
  if (Array.isArray(payload.appScope)) data.appScope = arrayScope(payload.appScope);
  if (Array.isArray(payload.storeScope)) data.storeScope = arrayScope(payload.storeScope);

  const user = await updateTeamMember(id, data);
  const dto = teamMemberToTracking(user);
  await syncConsoleAuthMetadata(dto.auth_user_id, dto);

  return { user: dto, message: "User updated." };
}

export async function deleteConsoleUser(payload: UserPayload, admin: ConsoleSession) {
  const id = cleanText(payload.id);

  if (!id) {
    throw badRequest("User id is required.");
  }

  if (id === admin.memberId) {
    throw badRequest("You cannot delete your own console user.");
  }

  const user = await deleteTeamMember(id);
  const dto = teamMemberToTracking(user);

  return { deleted: dto.id, message: "User deleted." };
}

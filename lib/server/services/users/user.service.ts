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
import { ApiError, badRequest, conflict } from "@/lib/server/api/errors";
import {
  createTeamMember,
  deleteTeamMember,
  getTeamMembers,
  getTeamMembersPage,
  updateTeamMember,
} from "@/lib/server/repositories/auth/team-member.repository";
import { paginatedResult, type PaginationQuery } from "@/lib/server/api/pagination";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeScopeKey, normalizeScopeList } from "@/lib/tracking/identity";
import type { StaffRole, TeamMember } from "@/lib/tracking/types";

export type UserPayload = {
  id?: string;
  name?: string;
  email?: string;
  password?: string;
  role?: StaffRole;
  status?: TeamMember["status"];
  appScope?: string[];
  storeScope?: string[];
  globalAccess?: boolean;
};

const roles = new Set<StaffRole>(["Admin", "Dev", "Marketing"]);
const statuses = new Set<TeamMember["status"]>(["active", "invited", "suspended", "disabled"]);

function arrayScope(value: unknown) {
  return normalizeScopeList(value);
}

function accessForRole(role: StaffRole, payload: UserPayload) {
  if (role === "Admin") {
    return {
      appScope: [],
      globalAccess: true,
      storeScope: [],
    };
  }

  return {
    appScope: arrayScope(payload.appScope),
    globalAccess: false,
    storeScope: arrayScope(payload.storeScope),
  };
}

function isPrismaUniqueError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function passwordValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function isDuplicateAuthUserError(errorMessage: string) {
  const normalized = errorMessage.toLowerCase();
  return normalized.includes("already") || normalized.includes("registered");
}

async function createVerifiedAuthUser(email: string, name: string, password: string) {
  const supabase = createAdminClient();
  if (!supabase) {
    throw new ApiError(
      "SUPABASE_SERVICE_ROLE_KEY is required to create Supabase Auth users.",
      500,
    );
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: name,
      name,
    },
    app_metadata: {
      account_type: "console",
    },
  });

  if (error || !data.user?.id) {
    const message = error?.message ?? "Supabase Auth user could not be created.";
    if (isDuplicateAuthUserError(message)) {
      throw conflict("A Supabase Auth user with this email already exists.");
    }

    throw new ApiError(message, error?.status ?? 500);
  }

  return {
    authUserId: data.user.id,
    supabase,
  };
}

async function deleteAuthUserBestEffort(input: Awaited<ReturnType<typeof createVerifiedAuthUser>>) {
  const { error } = await input.supabase.auth.admin.deleteUser(input.authUserId);
  if (error) {
    console.error(
      "Failed to rollback Supabase Auth user after team member create failed.",
      error,
    );
  }
}

export async function getConsoleUsers() {
  const users = await getTeamMembers();
  return { users: users.map(teamMemberToTracking) };
}

export async function getConsoleUsersPage(
  options: PaginationQuery & {
    appScopeKey?: string;
    role?: StaffRole;
    search?: string;
    storeScopeKey?: string;
  },
) {
  const [users, total] = await getTeamMembersPage({
    appScopeKey: normalizeScopeKey(options.appScopeKey),
    role: options.role ? staffRoleToPrismaRole[options.role] : undefined,
    search: options.search,
    skip: options.skip,
    storeScopeKey: normalizeScopeKey(options.storeScopeKey),
    take: options.take,
  });

  return paginatedResult(users.map(teamMemberToTracking), total, options);
}

export async function createConsoleUser(payload: UserPayload, admin: ConsoleSession) {
  const name = cleanText(payload.name);
  const email = normalizeEmail(payload.email);
  const password = passwordValue(payload.password);
  const role = payload.role ?? "Marketing";

  if (!name || !email || !password || !roles.has(role)) {
    throw badRequest("Invalid user payload.");
  }

  if (password.length < 6) {
    throw badRequest("Password must contain at least 6 characters.");
  }

  const authUser = await createVerifiedAuthUser(email, name, password);
  const access = accessForRole(role, payload);

  try {
    const user = await createTeamMember({
      authUserId: authUser.authUserId,
      name,
      email,
      role: staffRoleToPrismaRole[role],
      status: teamMemberStatusToPrismaStatus.active,
      globalAccess: access.globalAccess,
      appScope: access.appScope,
      storeScope: access.storeScope,
      createdBy: admin.email,
      invitedAt: null,
    });
    const dto = teamMemberToTracking(user);
    const metadataWarning = await syncConsoleAuthMetadata(dto.auth_user_id, dto);
    const message = metadataWarning
      ? `User ${email} created. Metadata sync warning: ${metadataWarning}`
      : `User ${email} created.`;

    return {
      user: dto,
      message,
    };
  } catch (error) {
    await deleteAuthUserBestEffort(authUser);

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
  if (payload.role !== undefined && roles.has(payload.role)) {
    const access = accessForRole(payload.role, payload);
    data.role = staffRoleToPrismaRole[payload.role];
    data.globalAccess = access.globalAccess;
    data.appScope = access.appScope;
    data.storeScope = access.storeScope;
  }
  if (payload.status !== undefined && statuses.has(payload.status)) {
    data.status = teamMemberStatusToPrismaStatus[payload.status];
  }
  if (payload.role === undefined) {
    if (Array.isArray(payload.appScope)) data.appScope = arrayScope(payload.appScope);
    if (Array.isArray(payload.storeScope)) data.storeScope = arrayScope(payload.storeScope);
  }

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

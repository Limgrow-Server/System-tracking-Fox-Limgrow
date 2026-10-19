import "server-only";

import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";

import type { ConsoleSession } from "@/lib/auth/rbac";
import {
  cleanText,
  normalizeEmail,
  staffRoleToPrismaRole,
  teamMemberStatusToPrismaStatus,
  teamMemberToTracking,
} from "@/lib/auth/team-members";
import { badRequest, conflict } from "@/lib/server/api/errors";
import { prisma } from "@/lib/prisma";
import {
  createTeamMember,
  deleteTeamMember,
  getTeamMembers,
  getTeamMembersPage,
  updateTeamMember,
} from "@/lib/server/repositories/auth/team-member.repository";
import { paginatedResult, type PaginationQuery } from "@/lib/server/api/pagination";
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

async function createVerifiedAuthUser(password: string) {
  return {
    authUserId: randomUUID(),
    passwordHash: await hash(password, 12),
  };
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

  const authUser = await createVerifiedAuthUser(password);
  const access = accessForRole(role, payload);

  try {
    const user = await createTeamMember({
      authUserId: authUser.authUserId,
      passwordHash: authUser.passwordHash,
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

    return {
      user: dto,
      message: `User ${email} created.`,
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
  const password = passwordValue(payload.password);
  if (password) {
    if (password.length < 8) throw badRequest("Password must contain at least 8 characters.");
    data.passwordHash = await hash(password, 12);
  }

  const user = await updateTeamMember(id, data);
  const dto = teamMemberToTracking(user);
  if (password) {
    await prisma.consoleSession.updateMany({
      where: { memberId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

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

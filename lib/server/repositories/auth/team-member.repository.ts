import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { searchTextVariants } from "@/lib/search";

export function getTeamMembers(options?: { take?: number }) {
  return prisma.teamMember.findMany({
    orderBy: { createdAt: "desc" },
    ...(options?.take ? { take: options.take } : {}),
  });
}

type TeamMemberPageOptions = {
  appScopeKey?: string;
  role?: Prisma.TeamMemberWhereInput["role"];
  search?: string;
  skip: number;
  storeScopeKey?: string;
  take: number;
};

function teamMemberPageWhere(
  options: TeamMemberPageOptions,
): Prisma.TeamMemberWhereInput {
  const where: Prisma.TeamMemberWhereInput = {};
  const search = options.search?.trim();

  if (options.role) {
    where.role = options.role;
  }

  if (search) {
    where.OR = searchTextVariants(search).flatMap((variant) => {
      const contains = { contains: variant, mode: "insensitive" as const };

      return [
        { name: contains },
        { email: contains },
      ];
    });
  }

  if (options.appScopeKey || options.storeScopeKey) {
    const scopeFilter: Prisma.TeamMemberWhereInput = {
      OR: [
        { globalAccess: true },
        ...(options.appScopeKey
          ? [{ appScope: { has: options.appScopeKey } }]
          : []),
        ...(options.storeScopeKey
          ? [{ storeScope: { has: options.storeScopeKey } }]
          : []),
      ],
    };

    where.AND = [...(Array.isArray(where.AND) ? where.AND : []), scopeFilter];
  }

  return where;
}

export function getTeamMembersPage(options: TeamMemberPageOptions) {
  const where = teamMemberPageWhere(options);

  return prisma.$transaction([
    prisma.teamMember.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: options.skip,
      take: options.take,
    }),
    prisma.teamMember.count({ where }),
  ]);
}

export function getTeamMemberByAuthUserId(authUserId: string) {
  return prisma.teamMember.findUnique({
    where: { authUserId },
  });
}

export function getTeamMemberByEmail(email: string) {
  return prisma.teamMember.findUnique({
    where: { email },
  });
}

export async function getTeamMemberByAuthUserOrEmail(input: {
  authUserId: string;
  email: string;
}) {
  const memberByAuthId = await getTeamMemberByAuthUserId(input.authUserId);
  return memberByAuthId ?? getTeamMemberByEmail(input.email);
}

export function linkTeamMemberAuthUser(id: string, authUserId: string) {
  return prisma.teamMember.update({
    where: { id },
    data: { authUserId },
  });
}

export function markTeamMemberLogin(input: {
  authUserId: string;
  id: string;
  now: Date;
}) {
  return prisma.teamMember.update({
    where: { id: input.id },
    data: {
      authUserId: input.authUserId,
      lastActiveAt: input.now,
      lastLoginAt: input.now,
    },
  });
}

export function createTeamMember(data: Prisma.TeamMemberUncheckedCreateInput) {
  return prisma.teamMember.create({ data });
}

export function updateTeamMember(id: string, data: Prisma.TeamMemberUpdateInput) {
  return prisma.teamMember.update({
    where: { id },
    data,
  });
}

export function deleteTeamMember(id: string) {
  return prisma.teamMember.delete({
    where: { id },
  });
}

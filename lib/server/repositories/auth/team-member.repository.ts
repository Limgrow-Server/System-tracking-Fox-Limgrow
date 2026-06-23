import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function getTeamMembers(options?: { take?: number }) {
  return prisma.teamMember.findMany({
    orderBy: { createdAt: "desc" },
    ...(options?.take ? { take: options.take } : {}),
  });
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

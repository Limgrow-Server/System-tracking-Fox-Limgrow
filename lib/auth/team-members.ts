import {
  StaffRole as PrismaStaffRole,
  TeamMemberStatus as PrismaTeamMemberStatus,
  type TeamMember as PrismaTeamMember,
} from "@prisma/client";

import type { StaffRole, TeamMember } from "@/lib/tracking/types";

export const staffRoleToPrismaRole: Record<StaffRole, PrismaStaffRole> = {
  Admin: PrismaStaffRole.ADMIN,
  Dev: PrismaStaffRole.DEV,
  Marketing: PrismaStaffRole.MARKETING,
};

export const prismaRoleToStaffRole: Record<PrismaStaffRole, StaffRole> = {
  [PrismaStaffRole.ADMIN]: "Admin",
  [PrismaStaffRole.DEV]: "Dev",
  [PrismaStaffRole.MARKETING]: "Marketing",
};

export const teamMemberStatusToPrismaStatus: Record<TeamMember["status"], PrismaTeamMemberStatus> = {
  active: PrismaTeamMemberStatus.ACTIVE,
  invited: PrismaTeamMemberStatus.INVITED,
  suspended: PrismaTeamMemberStatus.SUSPENDED,
  disabled: PrismaTeamMemberStatus.DISABLED,
};

export const prismaStatusToTeamMemberStatus: Record<PrismaTeamMemberStatus, TeamMember["status"]> = {
  [PrismaTeamMemberStatus.ACTIVE]: "active",
  [PrismaTeamMemberStatus.INVITED]: "invited",
  [PrismaTeamMemberStatus.SUSPENDED]: "suspended",
  [PrismaTeamMemberStatus.DISABLED]: "disabled",
};

export function normalizeEmail(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function iso(value: Date | null | undefined) {
  return value ? value.toISOString() : null;
}

export function teamMemberToTracking(member: PrismaTeamMember): TeamMember {
  return {
    id: member.id,
    auth_user_id: member.authUserId,
    name: member.name,
    email: member.email,
    role: prismaRoleToStaffRole[member.role],
    status: prismaStatusToTeamMemberStatus[member.status],
    global_access: member.globalAccess,
    app_scope: member.appScope,
    store_scope: member.storeScope,
    invited_at: iso(member.invitedAt),
    last_login_at: iso(member.lastLoginAt),
    last_active_at: iso(member.lastActiveAt),
    created_at: member.createdAt.toISOString(),
    updated_at: member.updatedAt.toISOString(),
  };
}

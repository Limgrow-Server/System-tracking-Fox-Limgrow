import type { StaffRole, TeamMember } from "@/lib/tracking/types";

export type AuthStatus = "confirmed" | "invited" | "unconfirmed" | "disabled";

export type ManagedAccount = {
  id: string;
  name: string;
  email: string;
  authUserId: string | null;
  role: StaffRole;
  consoleStatus: TeamMember["status"] | null;
  authStatus: AuthStatus;
  createdAt: string;
  isPreview?: boolean;
};

export type AccountPatch = Partial<
  Pick<ManagedAccount, "authStatus" | "consoleStatus" | "email" | "name" | "role">
>;

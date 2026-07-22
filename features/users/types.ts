import type { StaffRole, StoreMapping, TeamMember } from "@/lib/tracking/types";

export type AuthStatus = "confirmed" | "invited" | "unconfirmed" | "disabled";

export type ManagedAppOption = StoreMapping;

export type ManagedAccount = {
  id: string;
  name: string;
  email: string;
  authUserId: string | null;
  role: StaffRole;
  globalAccess: boolean;
  appScope: string[];
  storeScope: string[];
  consoleStatus: TeamMember["status"] | null;
  authStatus: AuthStatus;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  createdAt: string;
  isPreview?: boolean;
};

export type AccountPatch = Partial<
  Pick<
    ManagedAccount,
    | "appScope"
    | "authStatus"
    | "consoleStatus"
    | "email"
    | "globalAccess"
    | "name"
    | "role"
    | "storeScope"
  >
>;

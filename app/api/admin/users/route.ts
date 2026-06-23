export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export {
  handleAdminUsersDelete as DELETE,
  handleAdminUsersGet as GET,
  handleAdminUsersPatch as PATCH,
  handleAdminUsersPost as POST,
} from "@/lib/server/api/admin-users.handler";

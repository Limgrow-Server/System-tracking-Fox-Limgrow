export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export {
  handleAdminCredentialsDelete as DELETE,
  handleAdminCredentialsGet as GET,
  handleAdminCredentialsPatch as PATCH,
  handleAdminCredentialsPost as POST,
} from "@/lib/server/api/admin-credentials.handler";

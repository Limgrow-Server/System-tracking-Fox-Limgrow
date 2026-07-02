export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export {
  handleAdminCredentialSecretOtpGet as GET,
  handleAdminCredentialSecretOtpPost as POST,
} from "@/lib/server/api/admin-credential-secret-otp.handler";

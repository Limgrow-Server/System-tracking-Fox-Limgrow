export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export {
  handleAdminStoreMappingsDelete as DELETE,
  handleAdminStoreMappingsGet as GET,
  handleAdminStoreMappingsPatch as PATCH,
  handleAdminStoreMappingsPost as POST,
} from "@/lib/server/api/admin-store-mappings.handler";

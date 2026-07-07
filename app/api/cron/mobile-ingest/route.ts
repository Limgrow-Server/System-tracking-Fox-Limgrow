export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export {
  handleMobileIngestCronGet as GET,
  handleMobileIngestCronPost as POST,
} from "@/lib/server/api/mobile-ingest-cron.handler";

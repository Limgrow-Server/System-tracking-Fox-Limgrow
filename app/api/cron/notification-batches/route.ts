export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export {
  handleNotificationBatchCronGet as GET,
  handleNotificationBatchCronPost as POST,
} from "@/lib/server/api/notification-batch-cron.handler";

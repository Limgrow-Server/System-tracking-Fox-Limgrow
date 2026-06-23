export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export {
  handleAdminNotificationSchedulesDelete as DELETE,
  handleAdminNotificationSchedulesPatch as PATCH,
  handleAdminNotificationSchedulesPost as POST,
} from "@/lib/server/api/admin-notifications.handler";

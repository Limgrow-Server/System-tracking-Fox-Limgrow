export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  handleMobileNotificationEventPost,
  handleMobileOptions,
} from "@/lib/server/api/mobile.handler";

export const OPTIONS = handleMobileOptions;
export const POST = handleMobileNotificationEventPost;

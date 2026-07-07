export const dynamic = "force-dynamic";
export const runtime = "nodejs";

import {
  handleMobileDeviceTokenPost,
  handleMobileOptions,
} from "@/lib/server/api/mobile.handler";

export const OPTIONS = handleMobileOptions;

export function POST(request: Request) {
  return handleMobileDeviceTokenPost(request, "ios");
}

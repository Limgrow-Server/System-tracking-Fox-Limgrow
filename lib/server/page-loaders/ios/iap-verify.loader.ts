import "server-only";

import { getIosIapDtos, type IosIapDto } from "@/lib/server/services/iap/ios-iap.service";

export type { IosIapDto };

export async function getIosIapPageData(): Promise<IosIapDto[]> {
  return getIosIapDtos();
}

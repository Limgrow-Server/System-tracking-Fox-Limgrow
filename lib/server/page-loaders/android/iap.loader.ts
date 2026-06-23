import "server-only";

import {
  getAndroidIapDtos,
  type IapAndroidDto,
} from "@/lib/server/services/iap/android-iap.service";

export type { IapAndroidDto };

export async function getAndroidIapPageData(): Promise<IapAndroidDto[]> {
  return getAndroidIapDtos();
}

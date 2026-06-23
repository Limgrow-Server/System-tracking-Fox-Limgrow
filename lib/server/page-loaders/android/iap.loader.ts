import "server-only";

import {
  getAndroidIapDtos,
  getAndroidStoreProfileSummaries,
  type IapAndroidDto,
} from "@/lib/server/services/iap/android-iap.service";
import type { AndroidIapPageData } from "@/lib/tracking/page-data";

export type { IapAndroidDto };

export async function getAndroidIapPageData(): Promise<AndroidIapPageData> {
  const [storeProfiles, transactions] = await Promise.all([
    getAndroidStoreProfileSummaries(),
    getAndroidIapDtos(),
  ]);

  return { storeProfiles, transactions };
}

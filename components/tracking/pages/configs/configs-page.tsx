"use client";

import { CredentialConfigs } from "@/components/tracking/pages/configs/credential-configs";
import type { ConfigsPageData } from "@/lib/tracking/page-data";

export type ConfigsPlatform = "android" | "ios";

export function ConfigsPage({ data, platform }: { data: ConfigsPageData; platform: ConfigsPlatform }) {
  return (
    <div className="space-y-6">
      <section id="credentials">
        <CredentialConfigs data={data} platformFilter={platform} />
      </section>
    </div>
  );
}

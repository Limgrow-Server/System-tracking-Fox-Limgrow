# Supabase Edge Functions Config Guide

Tai lieu nay la source of truth de AI/agent khac biet cach lay runtime config cho Supabase Edge Functions trong repo nay.

## Muc tieu

Edge Functions can lay config/credential can thiet cho 3 nhom viec:

- Ban notification: Firebase Admin service account.
- Tracking IAP Android: Google Play service account.
- Tracking IAP iOS: Apple IAP `.p8`, `keyId`, `issuerId`, `bundleId`.

Khong doc credential tu file trong Edge Function. Credential duoc upload qua console, luu plaintext trong Supabase Vault, va app table chi giu metadata + `vault_secret_id`.

## File can dung

Common runtime config nam o:

```text
supabase/functions/_shared/edge-config.ts
```

Repo nay dung `npm:@supabase/supabase-js@2` trong Edge common. Khong doi ve `jsr:@supabase/supabase-js@2` neu khong can thiet, vi moi truong deploy hien tai da gap `403 Forbidden` khi bundler tai package tu `jsr.io`.

Import trong Edge Function:

```ts
import {
  createAdminClient,
  getAppleIapConfig,
  getFirebaseAdminConfig,
  getGooglePlayIapConfig,
} from "../_shared/edge-config.ts";
```

## Database source hien tai

Dung schema hien tai, khong dung cac bang cu:

- Android mapping: `android_store_mappings`
- iOS mapping: `ios_store_mappings`
- Android credential: `android_credentials`
- iOS credential: `ios_credentials`
- Store profile: `android_store_profiles`, `ios_store_profiles`
- Plain secret: `vault.decrypted_secrets`, doc qua RPC `public.system_tracking_get_vault_secret(uuid)`

Can tranh dung cac bang/field legacy trong Edge Functions:

- `integration_configs`
- `store_credential_secrets`
- `encrypted_secret_payload`
- `KEY_ENCRYPTION_SECRET` decrypt flow cu

## Credential purpose mapping

Common resolve credential theo `credential_purpose`:

| Use case | Function | Platform | credential_purpose | Secret type |
| --- | --- | --- | --- | --- |
| Ban noti | `getFirebaseAdminConfig` | android/ios | `firebase_admin` | `firebase_service_account` |
| Google IAP | `getGooglePlayIapConfig` | android | `google_play` | `google_play_service_account` |
| Apple IAP | `getAppleIapConfig` | ios | `iap` | `apple_iap_p8` |

## Lookup flow

Common resolve theo thu tu:

1. Tim app mapping active.
2. Lay `store_profile_id` tu mapping.
3. Tim credential active theo `store_profile_id + credential_purpose`.
4. Neu co `credentialRef`, uu tien credential ref do.
5. Lay plaintext secret tu Vault bang RPC `system_tracking_get_vault_secret`.
6. Parse JSON service account hoac `.p8` thanh config runtime.

Input lookup co the gom:

```ts
{
  platform?: "android" | "ios";
  appId?: string; // recommended stable app id from App Mapping
  packageName?: string;
  bundleId?: string;
  appName?: string; // display name fallback only
  productAppId?: string; // legacy alias, treated like appId when appId is missing
  storeAccountName?: string;
  storeProfileId?: string;
  credentialRef?: string; // override truc tiep credential can dung
}
```

Khuyen nghi:

- Notification/device-token: truyen `appId` tu App Mapping. Mobile token API se luu FCM token theo `app_id`.
- Android IAP: truyen `packageName`.
- iOS IAP: truyen `bundleId`.
- Neu can dung key cu the: truyen them `credentialRef`.

## Tao Supabase admin client

Trong Edge Function:

```ts
const supabase = createAdminClient();
```

`createAdminClient()` doc secret theo thu tu:

1. `SUPABASE_SECRET_KEYS.default`
2. `SUPABASE_SERVICE_ROLE_KEY`
3. `NEXT_PUBLIC_SUPABASE_SECRET_KEY`

Hosted Supabase Edge Functions co `SUPABASE_URL` va secret keys tu project secrets/default secrets. Local serve co the dung `.env` hoac `--env-file`.

## Lay Firebase Admin config

Dung khi can ban notification qua Firebase Cloud Messaging.

```ts
import {
  createAdminClient,
  getFirebaseAdminConfig,
} from "../_shared/edge-config.ts";

const supabase = createAdminClient();

const config = await getFirebaseAdminConfig(supabase, {
  platform: "android",
  packageName: "com.example.app",
});

const serviceAccount = config.firebaseAdmin.serviceAccount;
const projectId = config.firebaseAdmin.projectId;
const clientEmail = config.firebaseAdmin.clientEmail;
const credentialRef = config.firebaseAdmin.credential.credentialRef;
```

Voi iOS app dang dung Firebase/FCM:

```ts
const config = await getFirebaseAdminConfig(supabase, {
  platform: "ios",
  bundleId: "com.example.ios",
});
```

Khong return `serviceAccount` ve client. Chi dung trong Edge Function de tao OAuth token/call FCM.

Repo da co Edge Function san:

```text
supabase/functions/send-notification/index.ts
```

Function nay:

- Goi `getFirebaseAdminConfig()` de tu lay Firebase Admin service account theo app mapping.
- Gui FCM HTTP v1 theo topic `${topicBase}-${topicCode}`.
- Hoac gui toi tung `device_id` bang cach resolve `device_tokens.device_id -> fcm_token`.
- Ghi lich su vao `notification_jobs` va `notification_events`.
- Yeu cau Supabase JWT hop le va user phai la Admin trong `team_members`.

Function dispatcher:

```text
supabase/functions/dispatch-notifications/index.ts
```

Dispatcher doc `notification_schedules`, tim row `status = active` va `next_run_at <= now()`, goi chung sender logic, sau do cap nhat `last_run_at`, `last_status`, `last_error`, `next_run_at`. Function nay dung cho Supabase Cron va cung co the run thu tu UI.

Next.js console goi qua proxy:

```text
POST /api/admin/notifications/send
```

UI nam o:

```text
/notifications
components/tracking/pages/notifications-page.tsx
```

## Lay Google Play IAP config

Dung cho Android Publisher API.

```ts
import {
  createAdminClient,
  getGooglePlayIapConfig,
} from "../_shared/edge-config.ts";

const supabase = createAdminClient();

const config = await getGooglePlayIapConfig(supabase, {
  packageName: "com.example.app",
});

const serviceAccount = config.googlePlay.serviceAccount;
const packageName = config.googlePlay.packageName;
const credentialRef = config.googlePlay.credential.credentialRef;
```

Neu app co nhieu credential hoac can override:

```ts
const config = await getGooglePlayIapConfig(supabase, {
  packageName: "com.example.app",
  credentialRef: "android.my-store.google-play",
});
```

`verify-android` hien da dung common nay.

## Lay Apple IAP config

Dung cho App Store Server API.

```ts
import {
  createAdminClient,
  getAppleIapConfig,
} from "../_shared/edge-config.ts";

const supabase = createAdminClient();

const config = await getAppleIapConfig(supabase, {
  bundleId: "com.example.ios",
});

const privateKey = config.appleIap.privateKey;
const keyId = config.appleIap.keyId;
const issuerId = config.appleIap.issuerId;
const bundleId = config.appleIap.bundleId;
const credentialRef = config.appleIap.credential.credentialRef;
```

Neu can override credential:

```ts
const config = await getAppleIapConfig(supabase, {
  bundleId: "com.example.ios",
  credentialRef: "ios.my-store.apple-iap",
});
```

`verify-ios` hien da dung common nay.

## Vi du tao Edge Function moi

Skeleton:

```ts
import {
  corsHeaders,
  createAdminClient,
  getFirebaseAdminConfig,
  jsonResponse,
} from "../_shared/edge-config.ts";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, error: "method_not_allowed" }, 405);
  }

  try {
    const payload = await request.json();
    const supabase = createAdminClient();

    const config = await getFirebaseAdminConfig(supabase, {
      platform: payload.platform,
      packageName: payload.packageName,
      bundleId: payload.bundleId,
      credentialRef: payload.credentialRef,
    });

    // Use config.firebaseAdmin.serviceAccount inside this function only.
    // Do not return serviceAccount/privateKey/secretText/secretPayload.

    return jsonResponse({
      ok: true,
      app: config.app,
      credentialRef: config.firebaseAdmin.credential.credentialRef,
    });
  } catch (error) {
    return jsonResponse(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown edge function error",
      },
      500
    );
  }
});
```

## Security rules

- Never return these fields to mobile/client: `secretText`, `secretPayload`, `serviceAccount`, `privateKey`.
- Use `createAdminClient()` only inside Edge Functions/server code.
- Do not expose service-role or secret keys to browser/mobile app.
- RPC `system_tracking_get_vault_secret` must stay executable by `service_role` only.
- Keep `verify_jwt = true` unless there is an explicit alternative auth design.
- If mobile app does not use Supabase Auth, add an app-level server-to-server secret/auth flow before making the function public.

## Required migration/RPC

Migration:

```text
prisma/migrations/20260619110000_edge_config_vault_rpc/migration.sql
```

It creates:

```sql
public.system_tracking_get_vault_secret(secret_id uuid)
```

Expected privilege:

```text
service_role: execute true
authenticated: execute false
anon: execute false
```

Quick check:

```bash
node - <<'NODE'
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
(async () => {
  const rows = await prisma.$queryRaw`
    select
      has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_can_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
      has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'system_tracking_get_vault_secret'
  `;
  console.log(rows);
})().finally(() => prisma.$disconnect());
NODE
```

## Deploy Edge Functions

Existing functions:

```text
supabase/functions/dispatch-notifications/index.ts
supabase/functions/device-token-android/index.ts
supabase/functions/device-token-ios/index.ts
supabase/functions/notification-event/index.ts
supabase/functions/send-notification/index.ts
supabase/functions/verify-android/index.ts
supabase/functions/verify-ios/index.ts
```

Deploy:

```bash
supabase functions deploy dispatch-notifications --project-ref <project-ref>
supabase functions deploy device-token-android --project-ref <project-ref>
supabase functions deploy device-token-ios --project-ref <project-ref>
supabase functions deploy notification-event --project-ref <project-ref>
supabase functions deploy send-notification --project-ref <project-ref>
supabase functions deploy verify-android --project-ref <project-ref>
supabase functions deploy verify-ios --project-ref <project-ref>
```

Replace `<project-ref>` with the real project ref and do not type the angle brackets. For URL `https://abcd1234.supabase.co`, use `--project-ref abcd1234`.

Current `supabase/config.toml` has:

```toml
verify_jwt = true
```

That means caller must send a valid Supabase JWT unless the auth design is changed intentionally.

`device-token-android`, `device-token-ios`, `notification-event`, and `dispatch-notifications`
are intentionally `verify_jwt = false` in `supabase/config.toml`; they perform their own API-key or dispatch-secret validation.

## Mobile FCM token and open tracking

Register/refresh a token with the platform endpoint:

```json
{
  "appId": "LA-009",
  "platform": "android",
  "packageName": "com.example.app",
  "deviceId": "stable-device-id",
  "fcmToken": "<fcm-token>",
  "locale": "en-US",
  "appVersion": "1.0.0",
  "osVersion": "Android 15"
}
```

The Edge Function normalizes `appId`, package name, bundle id, and locale before saving. The stored
`device_tokens.locale` is used by `send-notification` to choose the matching localized notification row per FCM token.

Every sent FCM data payload includes:

```json
{
  "notificationId": "<job-id>",
  "notificationJobId": "<job-id>",
  "notificationAppId": "LA-009",
  "notificationPlatform": "android",
  "notificationLocale": "en"
}
```

When mobile receives, displays, or opens a push, call `notification-event`:

```json
{
  "eventType": "opened",
  "notificationJobId": "<job-id-from-fcm-data>",
  "appId": "LA-009",
  "platform": "android",
  "packageName": "com.example.app",
  "deviceId": "stable-device-id",
  "fcmToken": "<optional-fcm-token>",
  "locale": "en-US"
}
```

Accepted `eventType` values include `received`, `impression`, and `opened` plus common aliases such as
`notification_received`, `displayed`, and `tap`. History reads these rows from `notification_events`.

FCM token expiry is detected during send. If Firebase returns an unregistered/invalid-token error, the sender marks the matching
`device_tokens` row as `invalid`, so it is removed from active target counts and future sends.

## Notification schedules and cron

UI `/notifications` writes schedules to:

```text
notification_schedules
```

Delivery history:

```text
notification_jobs
notification_events
```

Device targeting uses:

```text
device_tokens.device_id
```

Recommended scheduler setup:

```sql
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
```

Create the same random secret in:

- Edge Function secret: `NOTIFICATION_DISPATCH_SECRET`
- Supabase Vault secret name: `system_tracking_notification_dispatch_secret`

Then schedule dispatcher:

```sql
select cron.schedule(
  'system-tracking-notification-dispatcher',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://<project-ref>.supabase.co/functions/v1/dispatch-notifications',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'x-dispatch-secret', (
        select decrypted_secret::text
        from vault.decrypted_secrets
        where name = 'system_tracking_notification_dispatch_secret'
        limit 1
      )
    ),
    body := jsonb_build_object('source', 'pg_cron'),
    timeout_milliseconds := 30000
  ) as request_id;
  $$
);
```

The current project has this cron installed as `system-tracking-notification-dispatcher`.

## Troubleshooting

`Missing SUPABASE_URL or service-role secret`

- Hosted: check Edge Function project secrets/default secrets.
- Local: use `supabase functions serve --env-file .env` or create `supabase/functions/.env`.

`No active android google_play credential found`

- Check app mapping exists and is `active`.
- Check credential exists for same `store_profile_id`.
- Check credential `credential_purpose = google_play` and `status = active`.

`No active ios iap credential found`

- Check iOS mapping by `bundle_id`.
- Check Apple IAP credential is `apple_iap_p8`, purpose `iap`, status `active`.

`Vault secret was not found or could not be decrypted`

- Check credential has `vault_secret_id`.
- Check Vault extension is enabled.
- Check RPC migration was applied.
- Check function uses service-role/secret key, not publishable/anon key.

`packageName is required` or `bundleId is required`

- For Android IAP, pass `packageName`.
- For Apple IAP, pass `bundleId`.
- Prefer `appId`. If using app name only, make sure mapping can still be found by `appName`/legacy `productAppId`.

## Notes for future AI agents

- Prefer extending `supabase/functions/_shared/edge-config.ts` over duplicating DB/Vault lookup logic.
- Do not reintroduce `integration_configs` or `store_credential_secrets` in Edge Functions.
- If adding a new credential purpose, update Prisma enum, upload service mapping, this common file, and this doc together.
- Run at least:

```bash
npm run lint
npx prisma migrate status --schema prisma
```

If changing migration/schema, also run:

```bash
npm run prisma:validate
npm run prisma:migrate:deploy
```

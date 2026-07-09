# System Tracking Feature Sequence Flows

Cap nhat: 2026-07-08  
Muc tieu: tai lieu sequence flow cho cac chuc nang dang co trong System Tracking. Tai lieu nay bam theo source hien tai: Next.js dashboard/route handlers xu ly console va worker, Supabase Postgres la runtime database, Supabase Vault giu secret, Supabase Edge Functions chu yeu nhan request mobile hoac verify IAP.

## Muc luc

| Muc | Flow |
|---|---|
| 1 | Tong quan runtime |
| 2 | Dang nhap va RBAC |
| 3 | User, role va app assignment |
| 4 | Store mapping va credential config |
| 5 | Xem secret bang OTP |
| 6 | Mobile register FCM token |
| 7 | Mobile notification event |
| 8 | Notification overview/detail |
| 9 | Send notification theo queue |
| 10 | Scheduled notification |
| 11 | Pause/resume notification job |
| 12 | IAP Android verify |
| 13 | IAP iOS verify |
| 14 | Apple App Store Server Notification webhook |
| 15 | IAP 2-hour GA4 event |
| 16 | Review fetch manual/scheduled |
| 17 | Reply review |
| 18 | Background jobs widget |
| 19 | BigQuery platform target |

## 1. Tong quan runtime

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Admin/Dev/Marketing
  participant UI as Next.js Console UI
  participant API as Next.js Route Handlers
  participant Prisma as Prisma Client
  participant DB as Supabase Postgres
  participant Vault as Supabase Vault
  participant Edge as Supabase Edge Functions
  participant Worker as PM2 cron worker
  participant Provider as Firebase/Apple/Google APIs
  participant Mobile as Mobile Apps

  Admin->>UI: Login, view dashboard, run actions
  UI->>API: Fetch data or submit action
  API->>Prisma: Query/update app data
  Prisma->>DB: Read/write runtime tables
  API->>Vault: Load secret only when provider action requires it
  API->>Provider: Send FCM, verify IAP, reply review
  Mobile->>Edge: Device token, IAP verify, notification event
  Edge->>API: Proxy mobile ingest where configured
  Edge->>DB: Direct verify/write for IAP Edge functions
  Worker->>API: Call cron routes
  API->>DB: Claim queue rows with lock/retry
```

Rule runtime hien tai:

| Thanh phan | Vai tro |
|---|---|
| Next.js route handlers | Xu ly console API, queue worker endpoint, notification send, review fetch, IAP admin API |
| Supabase Postgres | Source of truth cho mapping, token, notification, IAP, review, background jobs |
| Supabase Vault | Giu plaintext credential; app table chi luu metadata va `vault_secret_id` |
| Supabase Edge Functions | Nhan request mobile, verify IAP mobile, webhook Apple, proxy mot so endpoint ve Next server |
| PM2 `npm start` | Chay Next server va cac loop cron trong `scripts/review-fetch-cron.ts` |
| Provider APIs | FCM, Google Play Developer API, App Store Server API, App Store Connect API, GA4 Measurement Protocol |

## 2. Dang nhap va RBAC

```mermaid
sequenceDiagram
  autonumber
  actor User as Console User
  participant Login as /login
  participant AuthAPI as /api/auth/login
  participant SupaAuth as Supabase Auth
  participant Team as team_members
  participant Console as Console Layout
  participant Guard as requireConsoleApiSession

  User->>Login: Nhap email/password
  Login->>AuthAPI: POST credentials
  AuthAPI->>SupaAuth: Sign in
  SupaAuth-->>AuthAPI: Session/user
  AuthAPI->>Team: Find team member by email
  Team-->>AuthAPI: role + managed apps
  AuthAPI-->>Login: Set session cookie
  User->>Console: Open protected page
  Console->>Guard: Validate session + role
  Guard->>Team: Load role and assignments
  Team-->>Guard: Admin/Dev/Marketing + managed app scope
```

Role rule:

| Role | Quyen chinh |
|---|---|
| Admin | Xem config, app mapping, user management, send notification, assign app |
| Dev | Xem va van hanh cac module duoc phep, tuy route |
| Marketing | Xem overview/history/schedules/review theo app duoc assign, khong send notification |

## 3. User, role va app assignment

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Admin
  participant UI as Users page
  participant API as /api/admin/users
  participant Team as team_members
  participant Android as android_store_mappings
  participant IOS as ios_store_mappings
  participant Authz as Page/API authorization

  Admin->>UI: Open user list
  UI->>API: GET users
  API->>Team: Load users + assigned app ids
  API->>Android: Load Android app metadata/avatar
  API->>IOS: Load iOS app metadata/avatar
  API-->>UI: User rows + managed apps
  Admin->>UI: Edit role or assign apps
  UI->>API: PATCH team member
  API->>Team: Update role + managed app scopes
  Team-->>API: Saved
  API-->>UI: Updated row
  Authz->>Team: Later requests filter by managed app scope
```

## 4. Store mapping va credential config

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Admin/Dev
  participant MappingUI as Store Mapping UI
  participant MappingAPI as /api/admin/store-mappings
  participant Profile as *_store_profiles
  participant Mapping as *_store_mappings
  participant ConfigUI as Config UI
  participant CredAPI as /api/admin/credentials
  participant Vault as Supabase Vault
  participant Cred as *_credentials

  Admin->>MappingUI: Create/update app mapping
  MappingUI->>MappingAPI: POST/PATCH platform fields
  MappingAPI->>Profile: Upsert store profile
  MappingAPI->>Mapping: Upsert app mapping by package/bundle/app id
  MappingAPI-->>MappingUI: Mapping saved
  Admin->>ConfigUI: Upload JSON/.p8 or paste config
  ConfigUI->>CredAPI: POST credential metadata + secret file
  CredAPI->>CredAPI: Validate secret shape
  CredAPI->>Vault: Create/update secret
  CredAPI->>Cred: Upsert credential metadata + vault_secret_id
  CredAPI-->>ConfigUI: Credential saved
```

Plain secret khong duoc luu vao app tables. Cac table credential chi giu `credential_ref`, metadata va `vault_secret_id`.

## 5. Xem secret bang OTP

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Admin
  participant UI as Config UI
  participant OTP as /api/admin/credentials/otp
  participant Mail as SMTP/Gmail
  participant Session as Server session/cache
  participant CredAPI as /api/admin/credentials
  participant Vault as Supabase Vault

  Admin->>UI: Click reveal secret
  UI->>OTP: Request OTP
  OTP->>Mail: Send OTP to configured admin email
  Mail-->>Admin: OTP code
  Admin->>UI: Enter OTP
  UI->>OTP: Verify OTP
  OTP->>Session: Grant reveal window for 1 hour
  Admin->>UI: View secret
  UI->>CredAPI: GET/PATCH credential with reveal allowed
  CredAPI->>Session: Check reveal window
  CredAPI->>Vault: Read secret
  Vault-->>CredAPI: Plain secret
  CredAPI-->>UI: Secret value or masked state
```

## 6. Mobile register FCM token

```mermaid
sequenceDiagram
  autonumber
  participant App as Mobile App
  participant Edge as Supabase Edge device-token-*
  participant API as Next /api/mobile/device-token-*
  participant Queue as mobile_ingest_events
  participant Spool as .runtime/mobile-ingest-events.jsonl
  participant Worker as PM2 mobile-ingest loop
  participant Mapping as store mappings
  participant Tokens as device_tokens

  App->>Edge: POST token + appId + packageName/bundleId + deviceId + deviceType
  Edge->>API: Forward request to tracking server
  API->>API: Check publishable/api key
  API->>Queue: Insert/upsert mobile ingest event
  alt DB pool busy
    API->>Spool: Write event to local spool
  end
  API-->>App: ok queued/processed response
  Worker->>API: POST /api/cron/mobile-ingest
  API->>Spool: Drain spooled events
  API->>Queue: Claim queued events with lock
  API->>Mapping: Resolve app by platform + package/bundle/app id
  API->>Tokens: Upsert token hash, status, metadata
  API->>Queue: Mark processed/retrying/failed
```

Quan trong:

| Diem | Y nghia |
|---|---|
| `app_id`, `product_app_id` | Duoc normalize de tranh lech `LA-019`, `la019`, `la-019` |
| `device_id + platform + app` | Dung de replace token moi cho cung device/app |
| Duplicate recent event | Bi dedupe trong cooldown de giam ghi DB |
| Spool file | Bao ve DB khi pool dang nghen |

## 7. Mobile notification event

```mermaid
sequenceDiagram
  autonumber
  participant App as Mobile App
  participant Edge as Supabase Edge notification-event
  participant API as Next /api/mobile/notification-event
  participant Queue as mobile_ingest_events
  participant Worker as mobile-ingest worker
  participant Tokens as device_tokens
  participant Events as notification_events
  participant History as Notification history UI

  App->>Edge: POST received/open/action/failed event
  Edge->>API: Forward event
  API->>Queue: Enqueue notification event ingest
  API-->>App: ok
  Worker->>Queue: Claim event
  Worker->>Tokens: Resolve token/device/app context
  Worker->>Events: Insert notification event or update final token state
  Events-->>History: Reflected in history/detail pages
```

Mot FCM token chi nen co mot final state trong mot send job: `sent`, `opened`, hoac `failed`. Khi app open, history doi trang thai token do thay vi tao duplicate row cho cung token.

## 8. Notification overview/detail

```mermaid
sequenceDiagram
  autonumber
  actor User as Console User
  participant UI as Notification Overview UI
  participant API as /api/admin/notifications/overview-apps
  participant Scope as RBAC managed app scope
  participant Tokens as device_tokens
  participant Mapping as store mappings
  participant Detail as /notifications/overview/[appId]

  User->>UI: Open overview
  UI->>API: GET paginated app token counts
  API->>Scope: Require role and managed app filter
  API->>Tokens: Count active tokens grouped by app/platform
  API->>Mapping: Join app name/avatar/package/bundle
  API-->>UI: Page of app counts only
  User->>Detail: Click app
  Detail->>API: GET token detail for selected app only
  API->>Tokens: Paginated token list + device metadata
  API-->>Detail: Token rows
```

Design rule: overview chi load so lieu tong hop. List token chi load khi user mo detail app de tranh query qua nang.

## 9. Send notification theo queue

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Admin
  participant UI as Notification Send UI
  participant SendAPI as /api/admin/notifications/send
  participant Tokens as device_tokens
  participant Job as notification_jobs
  participant Batch as notification_job_batches
  participant BG as background_jobs
  participant Worker as /api/cron/notification-batches
  participant Sender as local-notification-sender
  participant Vault as Supabase Vault
  participant FCM as Firebase Cloud Messaging
  participant History as History UI

  Admin->>UI: Select app + compose message
  UI->>SendAPI: POST send request
  SendAPI->>Tokens: Resolve target count/device ids for selected app
  SendAPI->>Job: Create notification job queued
  SendAPI->>BG: Create background job
  SendAPI-->>UI: queued + job id
  Worker->>Job: Claim queued/materializing job
  Worker->>Batch: Materialize target ids into batches
  Worker->>Batch: Claim ready batch
  Worker->>Vault: Resolve Firebase credential
  Worker->>FCM: Send HTTP v1 messages
  FCM-->>Sender: message id or error
  Sender->>Batch: Update sent/failed counters
  Sender->>Job: Update progress/status processing/sent/failed/paused
  Sender->>BG: Update progress and result url
  History->>Job: Poll/realtime read job status
```

Hien tai `supabase/functions/send-notification` va `dispatch-notifications` khong xu ly gui nua. Gui notification chay tren Next server/PM2 worker de giam tai Edge Function va de kiem soat DB pool tot hon.

## 10. Scheduled notification

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Admin
  participant UI as Schedules UI
  participant API as /api/admin/notifications/schedules
  participant Schedule as notification_schedules
  participant Worker as notification batch cron
  participant Dispatch as notification-dispatcher
  participant Job as notification_jobs
  participant Batch as notification_job_batches
  participant FCM as Firebase Cloud Messaging

  Admin->>UI: Create schedule
  UI->>API: POST schedule payload
  API->>Schedule: Save schedule + target config
  API-->>UI: Schedule created
  Worker->>Dispatch: Check due schedules
  Dispatch->>Schedule: Claim due schedule
  Dispatch->>Job: Create notification job from schedule
  Dispatch->>Schedule: Update next_run/status
  Worker->>Batch: Materialize and send batches
  Worker->>FCM: Send messages
  Worker->>Job: Update final status
```

## 11. Pause/resume notification job

```mermaid
sequenceDiagram
  autonumber
  actor Admin as Admin
  participant Widget as Background jobs widget
  participant History as Notification History UI
  participant API as /api/admin/background-jobs or history-jobs PATCH
  participant Job as notification_jobs
  participant Batch as notification_job_batches
  participant Worker as notification queue worker
  participant BG as background_jobs

  Admin->>Widget: Click pause/resume running notification
  Widget->>API: PATCH pause/resume sourceJobId
  API->>Job: Set job status paused or processing/queued
  API->>Batch: Keep existing pending/processing state safe
  API->>BG: Update background job status
  Worker->>Job: Skip paused jobs/batches
  Admin->>History: Pause from history row
  History->>API: PATCH job status
  API->>Job: Pause/resume job for any visible job
  API-->>History: Updated status
```

Pause chi ngan worker claim tiep batch moi. Batch dang gui co the hoan tat roi moi dung han.

## 12. IAP Android verify

```mermaid
sequenceDiagram
  autonumber
  participant App as Android App / Play Billing
  participant Edge as Supabase Edge verify-android
  participant Config as edge-config.ts
  participant Mapping as android_store_mappings
  participant Cred as android_credentials
  participant Vault as Supabase Vault RPC
  participant Play as Google Play Developer API
  participant Tx as Android IAP tables
  participant UI as IAP detail UI

  App->>Edge: POST packageName + productId + purchaseToken + environment
  Edge->>Config: getGooglePlayIapConfig
  Config->>Mapping: Resolve active mapping by packageName/app
  Config->>Cred: Resolve google_play credential
  Config->>Vault: Read service account JSON
  Edge->>Play: Verify product/subscription purchase
  Play-->>Edge: Purchase state, expiry, acknowledgement
  Edge->>Play: Acknowledge if needed
  Edge->>Tx: Upsert transaction/entitlement state
  Edge-->>App: active/premium/noAds/expiry result
  UI->>Tx: Read transaction list and detail
```

## 13. IAP iOS verify

```mermaid
sequenceDiagram
  autonumber
  participant App as iOS App / StoreKit
  participant Edge as Supabase Edge verify-ios
  participant Config as edge-config.ts
  participant Mapping as ios_store_mappings
  participant Cred as ios_credentials
  participant Vault as Supabase Vault RPC
  participant Apple as App Store Server API
  participant Tx as ios_iap_transactions
  participant Check as ios_iap_two_hour_checks
  participant UI as IAP detail UI

  App->>Edge: POST bundleId + transactionId/originalTransactionId + appInstanceId optional
  Edge->>Config: getAppleIapConfig
  Config->>Mapping: Resolve active mapping by bundleId/app
  Config->>Cred: Resolve Apple IAP credential
  Config->>Vault: Read Apple .p8
  Edge->>Apple: Get transaction/subscription status
  Apple-->>Edge: Signed transaction/renewal state
  Edge->>Tx: Upsert transaction with revenue/currency/state
  Edge->>Check: Reserve 2-hour GA4 check when eligible
  Edge-->>App: entitlement state
  UI->>Tx: Read live transaction detail
```

`appInstanceId` nen gui len tu mobile de backend co the ban Measurement Protocol ve dung Firebase app instance. Flow cu van optional de khong lam hong app chua update.

## 14. Apple App Store Server Notification webhook

```mermaid
sequenceDiagram
  autonumber
  participant Apple as Apple App Store Server Notifications
  participant Hook as /api/webhooks/apple/app-store-server-notifications
  participant Service as ios-iap-notification.service
  participant Mapping as ios_store_mappings
  participant Tx as ios_iap_transactions
  participant Events as ios_iap_notification_events
  participant Check as ios_iap_two_hour_checks
  participant UI as IAP detail UI

  Apple->>Hook: POST signedPayload
  Hook->>Service: Decode and verify notification payload
  Service->>Mapping: Resolve by bundleId/appleAppId/environment
  Service->>Events: Reserve notification uuid idempotently
  Service->>Tx: Upsert transaction/renewal/refund/cancel/revoke state
  Service->>Check: Update 2-hour evidence when renewal disabled/cancel signal exists
  Service->>Events: Mark processed/ignored/failed
  UI->>Events: Show webhook events in app detail
  UI->>Tx: Show latest transaction state
```

Event Apple can cap nhat state:

| Notification | Y nghia trong app |
|---|---|
| `DID_CHANGE_RENEWAL_STATUS` | Cap nhat renew enabled/disabled |
| `DID_RENEW`, `DID_RECOVER`, `INTERACTIVE_RENEWAL` | Gia han hoac recover subscription |
| `DID_FAIL_TO_RENEW` | Billing issue/grace/retry |
| `CANCEL`, `REFUND`, `REVOKE` | Thu hoi/refund/cancel entitlement neu du evidence |

## 15. IAP 2-hour GA4 Event

Chi tiết đầy đủ của flow này nằm trong [ios-iap-two-hour-ga4-flow.md](./ios-iap-two-hour-ga4-flow.md).

```mermaid
sequenceDiagram
  autonumber
  actor User as User
  participant Mobile as Mobile App
  participant Server as Server
  participant DB as Database
  participant Worker as 2-hour Worker
  participant Firebase as Firebase / GA4

  User->>Mobile: Mua gói / bắt đầu free trial
  Mobile->>Server: POST verify-ios payload
  Server->>Server: Verify Apple transaction và decode receipt
  Server->>DB: Lưu transaction + schedule check_at = purchase_date + 2 giờ
  Worker->>Server: POST /api/cron/iap-ga4-two-hour
  Server->>DB: Claim check đến hạn, load transaction/events/mapping
  Server->>Server: Quyết định renewed và chọn value/currency
  alt renewed = true
    Server->>Firebase: POST purchase_2hour + purchase
    Note over Server,Firebase: value/currency lấy từ ios_iap_transactions
    Firebase-->>Server: HTTP 204 accepted or error
  else renewed = false
    Server->>DB: Không gửi GA4, mark skipped trong raw_context
  end
  Server->>DB: Mark sent/retrying/failed + raw_context
```

Revenue rule:

| Decision | Events | `value` gửi lên GA4 | `currency` |
|---|---|---|---|
| User không hủy sau 2 giờ | `purchase_2hour`, `purchase` | Revenue từ `revenue_micros`, fallback `price_milliunits` | Currency của transaction |
| User hủy/disable renew trong 2 giờ | Không gửi GA4, mark skipped | n/a | n/a |
| Thiếu giá nhưng vẫn `renewed=true` | Gửi `0` | `0` | Currency nếu có hoặc `USD` fallback |

## 16. Review fetch manual/scheduled

```mermaid
sequenceDiagram
  autonumber
  actor User as Admin/Dev
  participant UI as Comments Schedule/Review UI
  participant RunAPI as /api/review-fetch-runs
  participant ScheduleAPI as /api/review-fetch-schedules
  participant Runs as review_fetch_runs
  participant BG as background_jobs
  participant Worker as /api/cron/review-fetch
  participant Service as review-fetch service
  participant Vault as Supabase Vault
  participant Provider as App Store Connect / Google Play Reviews API
  participant Reviews as review tables

  User->>UI: Run fetch now or create schedule
  UI->>RunAPI: POST manual fetch
  RunAPI->>Runs: Create fetch run
  RunAPI->>BG: Create background job
  UI->>ScheduleAPI: POST/PATCH schedule
  ScheduleAPI->>Runs: Materialize due runs later
  Worker->>Service: Claim due/manual/stale runs
  Service->>Vault: Load Apple/Google credential
  Service->>Provider: Fetch reviews by app/store
  Provider-->>Service: Reviews/replies/page cursor
  Service->>Reviews: Upsert reviews and reply state
  Service->>Runs: Update completed/failed/retrying
  Service->>BG: Update progress/result url
```

## 17. Reply review

```mermaid
sequenceDiagram
  autonumber
  actor User as Support/Growth
  participant UI as Reply UI
  participant API as /api/review-replies
  participant Templates as reply templates
  participant Reviews as review tables
  participant Vault as Supabase Vault
  participant Provider as App Store Connect / Google Play Reviews API
  participant Audit as review reply audit

  User->>UI: Open reviews needing reply
  UI->>Templates: Load templates if needed
  User->>UI: Draft/edit reply
  UI->>API: POST reply request
  API->>Reviews: Validate review/app/store state
  API->>Vault: Load provider credential
  API->>Provider: Publish reply/update response
  Provider-->>API: Success or provider error
  API->>Audit: Save published/failed status
  API-->>UI: Updated reply state
```

Rule hien tai: reply can di qua UI/API va co audit status. Khong de provider credential lo ra client.

## 18. Background jobs widget

```mermaid
sequenceDiagram
  autonumber
  actor User as Console User
  participant Widget as Background jobs widget
  participant API as /api/admin/background-jobs
  participant BG as background_jobs
  participant Source as Source job table
  participant Router as Next router

  Widget->>API: GET active/recent jobs
  API->>BG: Load jobs visible to user/admin
  API-->>Widget: Running/completed/failed/paused jobs + result_url
  User->>Widget: Click job row
  alt Job has result_url
    Widget->>Router: Navigate to history/detail page
    API->>BG: Optionally dismiss/read completed job
  else Toggle collapse
    Widget->>Widget: Expand/collapse only from header control
  end
  User->>Widget: Pause/resume notification job
  Widget->>API: PATCH action pause/resume
  API->>Source: Update notification job state
  API->>BG: Update background job state
```

Job result url mapping:

| Job type | Result page |
|---|---|
| `NOTIFICATION_SEND` | `/notifications/history/[jobId]` |
| Review fetch | Review/comment detail or schedule page |
| IAP 2-hour check | IAP app detail when applicable |

## 19. BigQuery platform target

BigQuery chua phai runtime source of truth trong source hien tai. Neu trien khai theo tai lieu platform mau, flow nen la mirror/ops layer, khong thay the Supabase lock queue.

```mermaid
sequenceDiagram
  autonumber
  participant Runtime as Next/Supabase runtime
  participant DB as Supabase Postgres
  participant Exporter as Export/sync worker
  participant BQRaw as BigQuery raw tables
  participant BQMart as BigQuery mart_product
  participant Ops as BigQuery ops_* tables
  participant Importer as Supabase importer
  participant Jobs as Supabase runtime jobs
  participant Provider as Provider APIs

  Runtime->>DB: Write operational events/state
  Exporter->>DB: Read append-only events and latest dimensions
  Exporter->>BQRaw: Append raw snapshots/events
  BQRaw->>BQMart: Build marts/views for reporting
  Ops->>Importer: Pending approved ops actions
  Importer->>Jobs: Copy to Supabase job table with idempotency
  Jobs->>Provider: Runtime worker executes with lock/retry
  Jobs->>DB: Save result/status
  Exporter->>BQMart: Sync provider_action_results
```

Nguyen tac khi them BigQuery:

| Rule | Ly do |
|---|---|
| BigQuery khong luu raw secret | Secret that nam trong Supabase Vault |
| BigQuery khong giu runtime lock | Postgres/queue can transaction, lock, retry |
| Ops action tu BigQuery phai import vao Supabase job | Tranh BigQuery thanh job runner |
| Dashboard co the doc BigQuery mart | Giam load truc tiep len Postgres production |

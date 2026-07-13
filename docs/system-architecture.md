# Mobile Tracking System Architecture

Tai lieu nay mo ta thiet ke hien tai cua System Tracking: Next.js dashboard, Supabase Postgres, Supabase Vault, va Supabase Edge Functions cho notification token + IAP verification.

## Runtime Overview

```mermaid
flowchart LR
  Admin[Admin / Dev / Marketing] --> UI[Next.js Dashboard]
  UI --> Proxy[Next.js Proxy RBAC]
  UI --> Routes[Next.js Route Handlers]
  Routes --> Prisma[Prisma Client]
  Prisma --> DB[(Supabase Postgres)]
  Routes --> Vault[Supabase Vault]
  Mobile[Android / iOS Apps] --> Edge[Supabase Edge Functions]
  Edge --> DB
  Edge --> VaultRpc[Vault RPC]
  Edge --> Google[Google Play Android Publisher API]
  Edge --> Apple[App Store Server API]
  Edge --> FCM[Firebase Cloud Messaging]
```

## Core Modules

| Module | Route / Function | Database source | Role |
| --- | --- | --- | --- |
| Login/RBAC | `/login`, `/api/auth/*` | `team_members` + Supabase Auth | Admin, Dev, Marketing |
| Users | `/users`, `/api/admin/users` | `team_members` | Admin |
| Android App Mapping | `/store-mapping/android` | `android_store_profiles`, `android_store_mappings` | Admin, Dev |
| iOS App Mapping | `/store-mapping/ios` | `ios_store_profiles`, `ios_store_mappings` | Admin, Dev |
| Android Credential Config | `/configs/android` | `android_credentials` + Vault | Admin, Dev |
| iOS Credential Config | `/configs/ios` | `ios_credentials` + Vault | Admin, Dev |
| Device Token API | `device-token-android`, `device-token-ios` | `device_tokens`, store mappings | Supabase JWT caller |
| Android IAP Verification | `verify-android` | `android_credentials` + Vault + `iap_transactions` | Supabase JWT caller |
| iOS IAP Verification | `verify-ios` | `ios_credentials` + Vault + `ios_iap_transactions` | Supabase JWT caller |

Do not use legacy tables in new runtime code:

- `integration_configs`
- `store_credential_secrets`
- `encrypted_secret_payload`

## Current Store Mapping Model

Mappings are split by platform and linked to store profiles.

```mermaid
erDiagram
  android_store_profiles ||--o{ android_store_mappings : owns
  android_store_profiles ||--o{ android_credentials : owns
  ios_store_profiles ||--o{ ios_store_mappings : owns
  ios_store_profiles ||--o{ ios_credentials : owns

  android_store_profiles {
    uuid id
    text store_account_name
    text link_store
    text avatar_url
    mapping_status status
  }

  android_store_mappings {
    uuid id
    uuid store_profile_id
    text store_account_name
    text app_name
    text package_name
    mapping_status status
  }

  ios_store_profiles {
    uuid id
    text store_account_name
    text link_store
    text avatar_url
    text issuer_id
    mapping_status status
  }

  ios_store_mappings {
    uuid id
    uuid store_profile_id
    text store_account_name
    text app_name
    text bundle_id
    mapping_status status
  }
```

## Credential And Vault Model

Credential rows keep metadata only. Plaintext secret is stored in Supabase Vault.

```mermaid
erDiagram
  android_store_profiles ||--o{ android_credentials : has
  ios_store_profiles ||--o{ ios_credentials : has

  android_credentials {
    uuid id
    uuid store_profile_id
    text credential_ref
    android_secret_type secret_type
    credential_purpose credential_purpose
    uuid vault_secret_id
    text store_account_name
    text private_key_id
    text client_email
    text project_id
    credential_status status
  }

  ios_credentials {
    uuid id
    uuid store_profile_id
    text credential_ref
    ios_secret_type secret_type
    credential_purpose credential_purpose
    uuid vault_secret_id
    text store_account_name
    text key_id
    text issuer_id
    text client_email
    text project_id
    credential_status status
  }
```

Credential purpose mapping:

| Use case | Platform | `credential_purpose` | Secret type |
| --- | --- | --- | --- |
| Firebase notification | Android/iOS | `firebase_admin` | `firebase_service_account` |
| Google Play IAP | Android | `google_play` | `google_play_service_account` |
| Apple IAP | iOS | `iap` | `apple_iap_p8` |
| App Store review/API | iOS | `review` | `apple_asc_p8` |

Vault read path for Edge Functions:

```text
public.system_tracking_get_vault_secret(secret_id uuid)
```

This RPC must be executable by `service_role` only. Do not grant it to `anon` or `authenticated`.

## Store Mapping CRUD

```mermaid
sequenceDiagram
  actor Admin
  participant UI as Store Mapping UI
  participant API as /api/admin/store-mappings
  participant Profile as *_store_profiles
  participant Mapping as *_store_mappings

  Admin->>UI: Create or edit mapping
  UI->>API: POST/PATCH mapping fields
  API->>API: Require Admin/Dev session
  API->>Profile: Upsert store profile by store_account_name
  API->>Mapping: Upsert platform mapping
  Mapping-->>API: Saved row
  API-->>UI: JSON ok + message
```

## Credential Upload

```mermaid
sequenceDiagram
  actor Dev
  participant UI as Credential Config UI
  participant API as /api/admin/credentials
  participant Profile as *_store_profiles
  participant Vault as Supabase Vault
  participant Cred as *_credentials

  Dev->>UI: Upload service account JSON or Apple .p8
  UI->>API: multipart/form-data with metadata + secretFile
  API->>API: Validate secret shape
  API->>Profile: Upsert store profile
  API->>Vault: create_secret or update_secret
  API->>Cred: Upsert credential metadata + vault_secret_id
  Cred-->>API: Saved metadata
  API-->>UI: Success message
```

Plaintext secret must never be stored in app tables.

## Edge Config Common

All Edge Functions should use:

```text
system-tracking-server/supabase-legacy/functions/_shared/edge-config.ts
```

Main helpers:

- `createAdminClient()`
- `resolveMobileAppConfig()`
- `getFirebaseAdminConfig()`
- `getGooglePlayIapConfig()`
- `getAppleIapConfig()`

Detailed usage is documented in [edge-functions-config-guide.md](edge-functions-config-guide.md).

## Device Token API

Device token registration is split by platform:

- `device-token-android`: accepts Android FCM token with `packageName` or app name.
- `device-token-ios`: accepts iOS FCM token with `bundleId` or app name.

```mermaid
sequenceDiagram
  participant App as Mobile App
  participant Edge as device-token-*
  participant Mapping as platform store mappings
  participant Tokens as device_tokens
  participant Events as notification_events

  App->>Edge: register / heartbeat / unregister / mark_invalid
  Edge->>Mapping: Resolve active mapping by packageName/bundleId/appName
  Edge->>Tokens: Upsert token_hash + app metadata
  Edge->>Events: Write invalid token event when requested
```

## IAP Verification

```mermaid
sequenceDiagram
  participant App as Mobile App
  participant IOS as verify-ios
  participant Config as edge-config.ts
  participant Vault as Vault RPC
  participant Apple as App Store Server API
  participant Tx as ios_iap_transactions

  App->>IOS: bundleId/transactionId
  IOS->>Config: getAppleIapConfig
  Config->>Vault: Read Apple IAP .p8
  IOS->>Apple: GET transaction info
  IOS->>Tx: Upsert transaction
```

## Per-User Supabase Setup

This repo is intended to be pushed as reusable source code. Each user must create and configure their own Supabase project.

Per user setup:

1. Create a new Supabase project.
2. Enable Supabase Vault.
3. Copy `.env.example` to `.env`.
4. Fill their own `NEXT_PUBLIC_SUPABASE_URL`, publishable key, `DATABASE_URL`, and `DIRECT_URL`.
5. Run Prisma migrations.
6. Create the first Supabase Auth user matching seeded `admin@limgrow.com`, or update the seed/migration for their own admin email before first deploy.
7. Deploy Edge Functions to their own project ref.

Do not commit real project refs, DB passwords, publishable keys, service-role keys, or `.env` files.

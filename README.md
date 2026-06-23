# System Tracking

Console nội bộ để Admin quản lý Supabase Auth/RBAC, Android/iOS App Mapping và Android/iOS Credential Config. Secret credential không lưu plaintext trong bảng app; payload được lưu trong Supabase Vault, còn DB app chỉ giữ metadata và Vault pointer.

Tài liệu nguồn của hệ thống là [docs/SRS.md](docs/SRS.md). Trước khi thay đổi code hoặc schema, đọc SRS trước.

## Yêu cầu

- Node.js 20+
- npm
- Một Supabase project mới hoặc project trống để deploy schema
- Quyền Owner/Admin trên Supabase project để lấy API keys, DB connection string và tạo Auth user

## 1. Cài dependencies

```powershell
npm install
```

## 2. Tạo Supabase project mới

1. Vào [Supabase Dashboard](https://supabase.com/dashboard).
2. Tạo project mới.
3. Lưu lại database password đã đặt lúc tạo project. Password này dùng trong `DATABASE_URL` và `DIRECT_URL`.
4. Bật Supabase Vault trong `Database` -> `Extensions` nếu project chưa bật sẵn. Credential upload và Edge Functions cần Vault để đọc secret runtime.
5. Chờ project provision xong trước khi chạy Prisma migration.

## 3. Lấy Supabase URL và API keys

Vào Supabase Dashboard của project mới:

1. Ở `Project Overview` chọn copy `Project URL` và copy vào `NEXT_PUBLIC_SUPABASE_URL`.
2. Mở `Project Settings` -> `API` hoặc `API Keys`.
3. Copy `Publishable key` vào `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Lưu ý bảo mật:

- Chỉ các biến bắt đầu bằng `NEXT_PUBLIC_` mới được phép dùng ở browser.
- Không commit `.env`; repo chỉ commit `.env.example`.

`SUPABASE_SERVICE_ROLE_KEY` là biến optional. Chỉ cấu hình biến này nếu muốn `/users` gửi invite qua Supabase Auth Admin API và sync `app_metadata` cho Auth user.

## 4. Lấy connection string cho Prisma

Trong Supabase Dashboard, bấm nút `Connect` của project.

### DATABASE_URL

Dùng cho Prisma runtime trong app.

Khuyến nghị cho setup mặc định:

- Chọn Supavisor `Session pooler`.
- Port phải là `5432`.
- URL thường có dạng:

```env
DATABASE_URL="postgresql://postgres.<project-ref>:<db-password>@<region>.pooler.supabase.com:5432/postgres?sslmode=require"
```

Nếu môi trường của bạn hỗ trợ IPv6 hoặc project có IPv4 add-on, có thể dùng direct connection:

```env
DATABASE_URL="postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
```

### DIRECT_URL

Dùng cho Prisma migration.

Ưu tiên direct connection nếu máy chạy migration truy cập được:

```env
DIRECT_URL="postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
```

Nếu mạng không truy cập được direct connection, dùng lại Supavisor `Session pooler` port `5432`.

Không dùng Transaction pooler port `6543` cho migration trong repo này. Transaction pooling không phù hợp với nhiều thao tác Prisma migration/prepared statement nếu chưa cấu hình riêng.

## 5. Tạo file .env

Copy file mẫu:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Điền đủ các biến:

```env
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<publishable-key>"

DATABASE_URL="postgresql://postgres.<project-ref>:<db-password>@<region>.pooler.supabase.com:5432/postgres?sslmode=require"
DIRECT_URL="postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
```

## 6. Prisma schema và migration

Repo dùng Prisma multi-file schema:

```text
prisma/
- schema.prisma
- models/
  - shared.prisma
  - auth.prisma
  - android.prisma
  - ios.prisma
- migrations/
```

`prisma.config.ts` trỏ Prisma CLI vào folder `prisma` và migration path `prisma/migrations`. Không đổi về `prisma/schema.prisma` trong script CLI, vì repo cần load cả các file trong `prisma/models`.

Các script Prisma có sẵn:

```powershell
npm run prisma:format
npm run prisma:validate
npm run prisma:generate
npm run prisma:migrate:dev
npm run prisma:migrate:deploy
npm run prisma:studio
```

### Deploy schema lên Supabase mới

Chạy theo thứ tự:

```powershell
npm run prisma:validate
npm run prisma:migrate:deploy
npm run prisma:generate
```

Kiểm tra trạng thái migration:

```powershell
npx prisma migrate status --schema prisma
```

Mở Prisma Studio nếu cần xem dữ liệu:

```powershell
npm run prisma:studio
```

### Khi phát triển migration mới

Dùng `migrate dev` khi đang phát triển schema:

```powershell
npm run prisma:migrate:dev -- --name ten_migration_mo_ta
npm run prisma:generate
```

Không dùng `prisma db push` cho Supabase shared/staging/production của repo này, vì `db push` bỏ qua migration history.

## 7. Deploy Supabase Edge Functions

Repo có 7 Edge Functions:

```text
dispatch-notifications
device-token-android
device-token-ios
notification-event
send-notification
verify-android
verify-ios
```

Mỗi người dùng tự deploy vào Supabase project của họ. Lấy project ref từ URL:

```text
https://<project-ref>.supabase.co
```

Ví dụ URL `https://abcd1234.supabase.co` thì project ref là `abcd1234`. Không gõ dấu `< >` trong terminal.

Login Supabase CLI bằng account có quyền Owner/Admin trên project:

```bash
supabase login
supabase projects list
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

`send-notification`, `verify-android`, và `verify-ios` dùng Supabase JWT; riêng `send-notification` còn check user hiện tại phải là Admin trong `team_members`.
`device-token-android`, `device-token-ios`, và `notification-event` có `verify_jwt = false` nhưng tự check publishable key hoặc key cấu hình trong Function secrets.
`dispatch-notifications` cũng có `verify_jwt = false` nhưng tự check Admin JWT hoặc header `x-dispatch-secret`, dùng cho Supabase Cron.

Chi tiết cách Edge Functions lấy Firebase/Google/Apple config nằm ở [docs/edge-functions-config-guide.md](docs/edge-functions-config-guide.md).

Sau khi deploy `send-notification` và `dispatch-notifications`, login console bằng Admin và vào `/notifications` để:

- Generate nội dung notification.
- Gửi ngay tới topic hoặc danh sách `device_id`.
- Lưu lịch `once`, `daily`, `monthly`.
- Xem delivery logs thành công/thất bại.

Mobile app nên gọi:

- `device-token-android` hoặc `device-token-ios` khi lấy/refresh FCM token. Gửi `appId`, `fcmToken`, `deviceId`, `locale` hoặc `languageCode`.
- `notification-event` khi nhận/hiển thị/mở notification. FCM data từ hệ thống đã có `notificationJobId`; mobile gửi lại id này để history đếm received, impressions và open count.

Để lịch tự chạy, bật `pg_cron`, `pg_net`, lưu secret `NOTIFICATION_DISPATCH_SECRET` trong Edge Function secrets và Vault secret tên `system_tracking_notification_dispatch_secret`, rồi tạo cron gọi `dispatch-notifications` mỗi phút. Chi tiết nằm trong [docs/edge-functions-config-guide.md](docs/edge-functions-config-guide.md).

## 8. Bootstrap tài khoản Admin đầu tiên

Migration `20260616080000_init_console_auth` seed sẵn một console profile trong bảng `team_members`:

```text
email: admin@limgrow.com
role: Admin
status: active
```

Đây chỉ là profile RBAC trong app DB, chưa phải tài khoản đăng nhập Supabase Auth. Bạn phải tạo Auth user cùng email trong Supabase Authentication.

### Tạo Auth user bằng Supabase Dashboard

1. Vào Supabase Dashboard -> `Authentication` -> `Users`.
2. Chọn `Add user` hoặc `Create user`.
3. Email: `admin@limgrow.com`.
4. Đặt password mạnh.
5. Bật xác nhận email/auto-confirm nếu dashboard có lựa chọn này.
6. Lưu user.

Sau đó login app bằng:

```text
email: admin@limgrow.com
password: <password vừa đặt>
```

Lần login đầu tiên, app sẽ:

1. Gọi Supabase Auth `signInWithPassword`.
2. Tìm `team_members` theo `auth_user_id` hoặc email.
3. Kiểm tra `status = active`.
4. Link `team_members.auth_user_id` với Supabase Auth user id.
5. Sync Supabase Auth `app_metadata` nếu `SUPABASE_SERVICE_ROLE_KEY` đã được cấu hình.

Nếu login báo account không active hoặc không có console access, kiểm tra:

```sql
select id, auth_user_id, email, role, status
from public.team_members
where email = 'admin@limgrow.com';
```

Email trong `auth.users` và `team_members` phải trùng nhau.

### Tạo user tiếp theo trong app

Sau khi admin đầu tiên login được:

1. Vào `/users`.
2. Tạo user mới.
3. Nếu `SUPABASE_SERVICE_ROLE_KEY` đã được cấu hình, app sẽ gọi Supabase Auth Admin API `inviteUserByEmail`.
4. User mới nhận invite link, set session qua `/auth/callback`, rồi đăng nhập console theo role/status trong `team_members`.

Nếu không cấu hình `SUPABASE_SERVICE_ROLE_KEY`, app vẫn có thể lưu row `team_members`, nhưng không gửi được Auth invite.

## 9. Chạy app local

```powershell
npm run dev
```

Mở:

```text
http://localhost:3000
```

Route chính:

- `/login`: đăng nhập Supabase Auth.
- `/dashboard`: landing sau login.
- `/store-mapping/android`: Android App Mapping.
- `/store-mapping/ios`: iOS App Mapping.
- `/configs/android`: Android Credential Config.
- `/configs/ios`: iOS Credential Config.
- `/users`: quản lý console users.

## 10. Build và kiểm tra

```powershell
npm run prisma:validate
npm run prisma:migrate:deploy
npx tsc --noEmit
npm run lint
npm run build
```

Ghi chú: `next build` có thể cần network nếu Next/font phải tải Google Fonts.

## 11. Troubleshooting

### Prisma báo thiếu column sau khi đổi schema

Chạy migration:

```powershell
npm run prisma:migrate:deploy
npm run prisma:generate
```

Sau đó restart `npm run dev`.

### Prisma generate lỗi EPERM trên Windows

Thường do Next dev server hoặc process Node đang giữ file Prisma query engine.

1. Dừng `npm run dev`.
2. Dừng các process Node liên quan nếu còn treo.
3. Chạy lại:

```powershell
npm run prisma:generate
```

### Không connect được database

Kiểm tra:

- `DATABASE_URL` và `DIRECT_URL` là Postgres connection string, không phải `NEXT_PUBLIC_SUPABASE_URL`.
- Password trong URL là database password, không phải Supabase account password.
- URL có `?sslmode=require`.
- Nếu direct connection không vào được do IPv6, dùng Supavisor Session pooler port `5432`.
- Restart dev server sau khi đổi `.env`.

### Upload credential lỗi Vault

Credential Config hiện lưu secret payload trong Supabase Vault thông qua các function/table schema `vault`. Thông thường không cần thao tác thủ công trong setup. Nếu upload hoặc xem credential báo thiếu Vault schema/function, kiểm tra trong SQL Editor:

```sql
select *
from vault.decrypted_secrets
order by created_at desc
limit 1;
```

Nếu không có schema/function `vault`, bật Vault trong `Database` -> `Extensions` rồi thử lại.

### Login thành công ở Supabase nhưng bị app từ chối

Supabase Auth chỉ xác thực danh tính. App còn kiểm tra RBAC trong `team_members`.

Kiểm tra:

- Auth user email có trùng `team_members.email` không.
- `team_members.status` phải là `active`.
- `team_members.role` phải là role hợp lệ: `Admin`, `Dev`, `Marketing`.
- Route vận hành thật hiện yêu cầu `Admin`.

## 12. Tài liệu tham khảo

- [Supabase Prisma guide](https://supabase.com/docs/guides/database/prisma)
- [Supabase database connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase Auth users](https://supabase.com/docs/guides/auth/users)
- [Supabase Auth user management](https://supabase.com/docs/guides/auth/managing-user-data)
- [Supabase Vault](https://supabase.com/docs/guides/database/vault)
- [System SRS](docs/SRS.md)

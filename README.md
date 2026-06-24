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

Repo dùng 2 file env local:

- `.env`: local/default development.
- `.env.production`: production deploy/migration.

Cả 2 file đều bị ignore bởi git. Chỉ commit `.env.example`.

Copy file mẫu cho local/default:

```powershell
Copy-Item .env.example .env
```

macOS/Linux:

```bash
cp .env.example .env
```

Nếu cần chuẩn bị production local file:

```bash
cp .env.example .env.production
```

Điền đủ các biến cho đúng môi trường trong từng file:

```env
NEXT_PUBLIC_SUPABASE_URL="https://<project-ref>.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="<publishable-key>"

DATABASE_URL="postgresql://postgres.<project-ref>:<db-password>@<region>.pooler.supabase.com:5432/postgres?sslmode=require"
DIRECT_URL="postgresql://postgres:<db-password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require"
```

Không đặt production credentials trong `.env`; để production credentials trong `.env.production` hoặc secret store của nền tảng deploy.

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
npm run prisma:migrate:dev                 # dùng .env
npm run prisma:migrate:deploy              # dùng .env
npm run prisma:migrate:deploy:production   # dùng .env.production
npm run prisma:migrate:status              # dùng .env
npm run prisma:migrate:status:production   # dùng .env.production
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
npm run prisma:migrate:status
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

### Deploy migration lên production

Sau khi migration đã được commit trong `prisma/migrations`, điền production database URLs vào `.env.production`, rồi chạy:

```powershell
npm run prisma:migrate:status:production
npm run prisma:migrate:deploy:production
```

Không chạy `prisma:migrate:dev` với `.env.production`.

### Flow develop -> production cho migration/Supabase/Git

Nguồn chuẩn của schema app là Git:

- Prisma schema nằm trong `prisma/schema.prisma` và `prisma/models/*.prisma`.
- Migration nằm trong `prisma/migrations/<timestamp>_<name>/migration.sql`.
- Mỗi Supabase database tự có bảng `_prisma_migrations` để ghi migration nào đã chạy.
- Không copy bảng `_prisma_migrations` giữa local/staging/production.
- Không tạo migration app schema trong `supabase/migrations` nếu repo vẫn dùng Prisma làm nguồn chính.

Flow khi phát triển:

```bash
git fetch origin
git checkout -b feature/<slug> origin/main

npm install
npm run prisma:migrate:status
```

Trước khi đổi schema, kiểm tra `.env` đang trỏ tới Supabase project development/local, không phải production. Sau đó sửa model Prisma và tạo migration:

```bash
npm run prisma:migrate:dev -- --name ten_migration_mo_ta
npm run prisma:generate
npm run prisma:migrate:status
```

Review file SQL vừa sinh trong `prisma/migrations/.../migration.sql` trước khi commit. Nếu migration chạm tới bảng trong schema exposed như `public`, cần kiểm tra RLS, policy, grant, function privilege và dữ liệu backfill. Với thay đổi destructive như drop column/table hoặc đổi kiểu dữ liệu, cần có plan backfill/rollback rõ ràng trước khi merge.

Commit những file liên quan:

```bash
git status --short
git add prisma/schema.prisma prisma/models prisma/migrations
git add README.md docs supabase/functions supabase/config.toml
git commit -m "feat(scope): describe schema change"
```

Chỉ `git add` các file thật sự đổi. Không commit `.env`, `.env.production`, database dump, secret, hay dữ liệu từ bảng `_prisma_migrations`.

Trước khi push/PR:

```bash
npm run prisma:validate
npm run check
git push origin feature/<slug>
```

Trong PR, reviewer cần nhìn migration SQL như một phần của code review. Nếu migration đã được apply ở shared DB hoặc production, không sửa/xóa/rename migration cũ nữa; tạo migration mới để sửa tiếp.

Sau khi PR được merge vào branch deploy production, chạy production migration bằng `.env.production`:

```bash
npm run prisma:migrate:status:production
npm run prisma:migrate:deploy:production
npm run prisma:migrate:status:production
```

Sau database migration, deploy Edge Functions vào đúng Supabase project production nếu có thay đổi trong `supabase/functions` hoặc `supabase/config.toml`.

## 7. Deploy Supabase Edge Functions

Repo có các Edge Functions sau:

```text
device-token-android
device-token-ios
dispatch-notifications
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
supabase functions deploy device-token-android --project-ref <project-ref>
supabase functions deploy device-token-ios --project-ref <project-ref>
supabase functions deploy dispatch-notifications --project-ref <project-ref>
supabase functions deploy notification-event --project-ref <project-ref>
supabase functions deploy send-notification --project-ref <project-ref>
supabase functions deploy verify-android --project-ref <project-ref>
supabase functions deploy verify-ios --project-ref <project-ref>
```

`supabase/config.toml` đang bật `verify_jwt = true`, nên caller phải gửi Supabase JWT hợp lệ. Nếu mobile app không dùng Supabase Auth, cần thiết kế thêm app-level/server-to-server auth trước khi mở public.

Chi tiết cách Edge Functions lấy Firebase/Google/Apple config nằm ở [docs/edge-functions-config-guide.md](docs/edge-functions-config-guide.md).

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

## 10. Build, kiểm tra và Git workflow

Chạy một lệnh tổng trước khi commit/push:

```powershell
npm run check
```

`npm run check` sẽ chạy lần lượt:

```powershell
npm run lint --if-present
npm run typecheck --if-present
npm run test --if-present
npm run build
```

Repo cũng có các lệnh riêng khi cần debug từng bước:

```powershell
npm run prisma:validate
npm run prisma:migrate:deploy
npm run lint
npm run build
```

Ghi chú: `next build` có thể cần network nếu Next/font phải tải Google Fonts.

### Commit và branch

Repo dùng Husky để tự kiểm tra trước commit/push:

- `pre-commit`: kiểm tra branch name và chạy `lint-staged`.
- `commit-msg`: kiểm tra commit message bằng Commitlint.

`git push` không tự chạy full build để tránh trùng với GitHub Action và làm push chậm. Trước khi push, chạy thủ công:

```bash
npm run check
```

Commit message bắt buộc theo format:

```bash
<type>(<scope>): <message>
```

Ví dụ:

```bash
feat(notification): add fcm token registration
fix(mapping): update app id validation
chore(ci): add quality workflow
```

Branch nên dùng một trong các prefix:

```bash
feature/<slug>
fix/<slug>
hotfix/<slug>
release/<slug>
chore/<slug>
docs/<slug>
refactor/<slug>
test/<slug>
codex/<slug>
```

Chi tiết đầy đủ nằm ở [COMMIT_RULE.md](COMMIT_RULE.md).

### Push code mẫu

```bash
git fetch origin
git checkout feature/your-branch
git pull --rebase origin feature/your-branch

npm run check

git add .
git commit -m "feat(scope): short message"
git push origin feature/your-branch
```

### Staging trước khi merge main

Flow PR khuyến nghị:

```text
feature/* -> staging -> main
```

Khi cần đồng bộ `staging` theo `main` mới nhất:

```bash
git fetch origin main
git branch -f staging origin/main
git push --force-with-lease origin staging:staging
```

### GitHub Action quality

Workflow CI nằm ở [.github/workflows/ci.yml](.github/workflows/ci.yml). Workflow tên `CI`, job required check tên `quality`, chạy trên pull request và push vào các branch chính, rồi chạy:

```bash
npm ci
npm run check
```

Nếu GitHub branch protection đang yêu cầu check `quality`, tên required check phải trùng với job `quality`.

SonarCloud hiện đang bật `Automatic Analysis`, nên workflow không chạy manual Sonar scan mặc định để tránh lỗi phân tích trùng:

```text
You are running CI analysis while Automatic Analysis is enabled
```

Nếu muốn chuyển sang manual scan trong GitHub Action:

1. Tắt `Automatic Analysis` trong SonarCloud project.
2. Tạo GitHub repository variable:

```text
ENABLE_SONAR_SCAN=true
```

3. Tạo secret:

```text
SONAR_TOKEN
```

### Discord webhook cho CI

GitHub Action có thể bắn kết quả pass/fail qua Discord. Tạo secret trong GitHub:

```text
Settings -> Secrets and variables -> Actions -> New repository secret
```

Tên secret:

```text
DISCORD_WEBHOOK_URL
```

Giá trị là Discord webhook URL của channel cần nhận thông báo. Nếu secret chưa được cấu hình, workflow vẫn chạy và chỉ bỏ qua bước gửi Discord.

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

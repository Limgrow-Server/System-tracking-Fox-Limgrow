# Commit and Branch Rules

Repo này dùng Husky để chặn commit/push sai chuẩn.

## Local check

Chạy trước khi commit hoặc push:

```bash
npm run check
```

Lệnh này chạy lần lượt:

```bash
npm run lint --if-present
npm run typecheck --if-present
npm run test --if-present
npm run build
```

## Branch name

Các branch được chấp nhận:

```bash
main
staging
production
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

Ví dụ:

```bash
feature/notification
fix/app-mapping
codex/notification-ui
```

## Commit message

Commit bắt buộc theo format:

```bash
<type>(<scope>): <message>
```

Type được phép:

```bash
feat
fix
docs
style
refactor
perf
test
build
ci
chore
revert
```

Ví dụ hợp lệ:

```bash
feat(notification): add fcm token registration
fix(mapping): update app id validation
chore(husky): add commit hooks
```

## Hooks

- `pre-commit`: kiểm tra branch name và chạy `lint-staged`.
- `commit-msg`: kiểm tra commit message bằng Commitlint.

Repo không chạy full build ở `git push` để tránh trùng với GitHub Action. Trước khi push, chạy thủ công:

```bash
npm run check
```

## GitHub Action

Workflow CI nằm ở:

```bash
.github/workflows/ci.yml
```

Workflow tên `CI`, job tên `quality`. Nếu GitHub branch protection đang yêu cầu status check, chọn đúng check `quality`.

Workflow chạy:

```bash
npm ci
npm run check
```

SonarCloud dùng host mặc định:

```text
https://sonarcloud.io
```

Secret bắt buộc:

```bash
SONAR_TOKEN
```

## Discord notification

Để GitHub Action bắn thông báo pass/fail qua Discord, thêm repository secret:

```bash
DISCORD_WEBHOOK_URL
```

Vị trí:

```text
GitHub repo -> Settings -> Secrets and variables -> Actions -> New repository secret
```

Nếu chưa có secret này, workflow vẫn chạy bình thường và bỏ qua bước gửi Discord.

## Push code mẫu

```bash
git fetch origin
git checkout feature/your-branch
git pull --rebase origin feature/your-branch

npm run check

git add .
git commit -m "feat(scope): short message"
git push origin feature/your-branch
```

## Staging flow

PR flow khuyến nghị:

```text
feature/* -> staging -> main
```

Khi cần reset `staging` theo `main` mới nhất:

```bash
git fetch origin main
git branch -f staging origin/main
git push --force-with-lease origin staging:staging
```

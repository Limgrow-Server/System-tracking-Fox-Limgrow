# Commit and Branch Rules

Repo này dùng Husky để chặn commit/push sai chuẩn.

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
- `pre-push`: chạy đủ bộ check:

```bash
npm run lint --if-present
npm run typecheck --if-present
npm run test --if-present
npm run build
```

# Step 6: Final Verification And Release Checklist

## Goal
Verify the full multi-user login migration end to end before considering the work complete.

## Context
Steps 1 through 5 should have implemented Worker auth, user-isolated sync, frontend login/register, legacy migration, settings cleanup, documentation, and deployment.

This step does not introduce new features. It verifies correctness, isolation, migration safety, and documentation accuracy.

## Files To Inspect
- `README.md`
- `types.ts`
- `constants.ts`
- `contexts/AppContext.tsx`
- `services/db.ts`
- `services/d1Sync.ts`
- `services/imageService.ts`
- `components/OnboardingView.tsx`
- `components/SettingsView.tsx`
- `components/CloudSyncButton.tsx`
- `cloudflareworker/worker.js`
- `cloudflareworker/wrangler.toml`

## Files To Change
- Only change files needed to fix verification failures.
- If a fix changes behavior, update `README.md` in the same turn.
- If a fix changes `cloudflareworker/`, deploy the Worker again.

## Implementation Details
Run the verification in this order.

1. Static and build checks
   - Confirm TypeScript compile succeeds.
   - Confirm no frontend references require normal users to enter `AUTH_TOKEN`.
   - Confirm fixed endpoint is exactly `https://sync.sssr.edu.kg`.

2. Worker public and auth checks
   - `/health` works without auth.
   - `/auth/register` rejects wrong invite code.
   - `/auth/register` creates a new user with correct invite code.
   - Duplicate username returns `409`.
   - `/auth/login` rejects wrong password.
   - `/auth/login` returns a valid session for correct password.
   - `/auth/me` accepts valid session.
   - `/auth/me` rejects fake token.
   - `/auth/logout` revokes session.

3. Guest/local mode checks
   - Fresh app can create a ledger without login.
   - Guest can add, edit, delete, and undo transactions.
   - Guest does not attempt D1 sync.
   - JSON export/import works.
   - WebDAV backup still works if configured.

4. Authenticated sync checks
   - Register/login as account A.
   - Create ledger, categories, transactions, and at least one image attachment.
   - Confirm automatic or manual sync succeeds.
   - Reload app and confirm data remains.
   - Use a second device/browser profile for the same account and confirm data pulls correctly.

5. Isolation checks
   - Register/login as account B.
   - Account B must not see account A data.
   - Account B can create records with IDs that overlap account A without conflict.
   - Account B cannot fetch account A images by guessed key.
   - Direct API calls with account B token and account A-like query params must still return only B data.

6. Legacy migration checks
   - Simulate old local data with old `syncEndpoint`, `syncToken`, and `syncUserId`.
   - Log in with a new account.
   - Confirm current local data remains visible.
   - Confirm old cloud data can be pulled through the migration path if available.
   - Confirm merged data syncs through the new session path.
   - Confirm repeated migration does not duplicate or erase records.

7. Logout and expired-session checks
   - Logout does not delete local data.
   - Expired or revoked session returns app to guest/local mode.
   - Manual sync is disabled or clearly unavailable while logged out.

8. Documentation checks
   - README reflects implemented behavior.
   - README still documents local-only use.
   - README documents fixed endpoint and required Worker secrets.

## Acceptance Criteria
- `npm run build` passes.
- Worker is deployed if Worker code changed.
- Two different accounts can use the same Worker concurrently with complete data isolation.
- Same account can sync across devices.
- Guest mode remains functional.
- Old local data migration does not lose records.
- No normal-user UI path asks for Worker address, `AUTH_TOKEN`, or manual `userId`.
- README matches the actual shipped behavior.

## Commands
Run:

```bash
npm run build
git status --short
```

If Worker changed:

```bash
npx wrangler deploy --config cloudflareworker/wrangler.toml
```

Suggested API smoke tests, replacing placeholders:

```bash
curl -i https://sync.sssr.edu.kg/health
curl -i -X POST https://sync.sssr.edu.kg/auth/login \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"<user>\",\"password\":\"<password>\"}"
curl -i https://sync.sssr.edu.kg/auth/me \
  -H "Authorization: Bearer <session-token>"
```

## Do Not
- Do not skip isolation tests.
- Do not treat frontend UI success as proof of server-side data isolation.
- Do not delete production data to test migration. Use test accounts and backups.
- Do not deploy undocumented behavior changes.
- Do not finish with uncommitted accidental generated files unless they are intentional.

## Final Handoff

### 最终修改文件
- `cloudflareworker/wrangler.toml`
  - 补齐当前生产 Worker 正在使用的 `DB` D1 绑定和 `SYNC_KV` KV 绑定，避免后续使用本地 Wrangler 配置部署时丢失同步绑定。
- `components/Layout.tsx`
  - 修复删除撤销 toast 的触发条件：当上一条删除的撤销 toast 已自动关闭但用户未撤销时，再次删除账目仍会重新显示撤销入口。
- `README.md`
  - 补充当前账目删除后的撤销行为说明，保持行为变更与文档一致。
- `docs/auth-migration-plan/06-final-verification.md`
  - 追加本 Final Handoff。

### 完整通过的验收项
- 静态构建通过：TypeScript 编译、Vite 生产构建、PWA service worker 生成均成功。
- 前端固定同步端点确认仍为 `https://sync.sssr.edu.kg`。
- 普通前端 UI 未要求用户输入 Worker 地址、`AUTH_TOKEN` 或手动 `userId`：
  - Onboarding 仅提供创建本地账本、登录、注册、恢复数据和本地使用。
  - Settings > 云同步与备份在未登录时仅显示登录/注册面板、本地模式说明和 WebDAV 配置。
  - 登录后才显示手动同步、连接测试和同步间隔设置。
- Guest/local mode 本地验收通过：
  - 使用全新本地 origin 创建本地账本成功。
  - 未登录同步按钮显示“本地模式：数据仅保存在本机”。
  - 未登录新增账目成功，写入本地 IndexedDB 流程可用。
  - 删除账目后出现“已删除，撤回？”toast，点击撤销后账目恢复。
  - 未登录云同步 UI 不提供手动同步入口。
- JSON 备份路径部分通过：
  - 设置页 JSON 导出入口存在，代码路径使用 `exportToJson(state, ...)`。
  - 首次使用恢复页支持选择 `.json` 并调用 `readJsonFile` + `importData`。
  - in-app browser 不支持下载事件，因此没有用浏览器实际保存导出文件。
- WebDAV 路径部分通过：
  - WebDAV URL、账号、密码、手动备份/恢复和自动备份控件仍保留。
  - 无可用 WebDAV 凭据，未进行真实连接和备份上传。
- README 一致性检查通过：
  - README 记录固定端点、登录/注册、session-token 同步、每用户隔离、guest/local mode、legacy migration、必要绑定和 secrets。
  - README 仍记录本地使用和 WebDAV 备份。
  - README 不把旧 `AUTH_TOKEN + userId` 作为普通同步路径。

### 做过的最小修复
- 补齐 `cloudflareworker/wrangler.toml`：
  - `DB` -> D1 database `personal` / `a0513a4b-fb86-42e2-9d72-b4a229cdf618`
  - `SYNC_KV` -> KV namespace `sync-version` / `b1ed3bb607844ede98a9f76040fac97e`
- 修复撤销 toast 再次触发：
  - `Layout` 现在根据最新一条账目删除操作重新显示 toast，而不是只依赖 `canUndo` 从 false 到 true 的变化。
- 同步更新 README，记录删除后可撤销且后续删除会重新显示撤销入口。

### 未能验证的项目及原因
- 生产 Worker 正确邀请码注册、重复用户名 409、正确密码登录、有效 session `/auth/me`、logout 撤销 session：
  - 未能验证。
  - 原因：`npx wrangler deploy --config cloudflareworker/wrangler.toml` 仍因缺少 `CLOUDFLARE_API_TOKEN` 失败，生产 Worker 未部署当前 auth 版本。
  - Cloudflare API 查询显示当前 Worker 绑定包含 `DB`、`SYNC_KV`、`IMAGES_BUCKET`、`AUTH_TOKEN`，但没有 `REGISTRATION_INVITE_CODE` secret。
  - 线上 smoke test 显示 `/auth/register` 和 `/auth/login` 仍返回旧版 `Unauthorized` 文本，不是当前代码中的 auth JSON 响应，说明生产路由仍是旧 Worker 行为。
- 同账号跨设备同步：
  - 未能验证。
  - 原因：生产 Worker auth 路由未部署，无法创建或登录测试账号。
- 账号 A / 账号 B 多用户隔离：
  - 未能进行真实账号验收。
  - 源码审查通过：普通 `/sync/*`、`/upload/image`、`/image/:key` 都从 session 推导 `user_id`，D1 v2 表使用 `(user_id, id)` 主键，R2 普通图片路径为 `users/<user_id>/<key>`。
  - 仍需要部署后使用两个真实测试账号做 API 和浏览器双端验证。
- 图片上传、下载、删除的线上隔离：
  - 未能进行真实 R2 验收。
  - 源码审查通过：前端使用 session token，Worker 普通图片接口按 session user 写入/读取/删除 `users/<user_id>/...`。
  - 仍需部署后用账号 A/B 验证 B 无法读取 A 的 guessed key。
- Legacy cloud migration：
  - 未能真实拉取旧云端数据。
  - 原因：没有可用的 legacy `AUTH_TOKEN + syncUserId` 测试数据，且生产 Worker 未部署当前 legacy/auth 分离版本。
  - 源码审查通过：旧字段会规范化到 `legacySync*`，登录接管时尝试 `/legacy/sync/pull?user_id=...&since=0`，成功推送后记录 migrated user id，避免重复迁移。

### Worker 最终部署状态
- 已按 AGENTS.md 执行：

```bash
npx wrangler deploy --config cloudflareworker/wrangler.toml
```

- 结果：失败，未完成上传。
- 错误原因：非交互环境缺少 `CLOUDFLARE_API_TOKEN`，Wrangler 无法获取 auth token。
- 当前生产 Worker 状态：
  - `/health` 返回 `200 ok`。
  - `/auth/register`、`/auth/login` 仍表现为旧版 `Unauthorized`，当前 auth 代码未发布到生产。
  - `REGISTRATION_INVITE_CODE` secret 未配置，部署后也必须先设置该 secret，注册才能成功。

### `npm run build` 结果
- 命令：

```bash
npm run build
```

- 结果：通过。
- 输出要点：
  - `tsc && vite build` 成功。
  - `2623 modules transformed`。
  - `✓ built in 6.80s`。
  - PWA `generateSW` 成功，生成 `dist/sw.js` 和 `dist/workbox-1d305bb8.js`。

### `git status --short` 结果

```text
 M README.md
 M cloudflareworker/worker.js
 M cloudflareworker/wrangler.toml
 M components/AddView.tsx
 M components/CloudSyncButton.tsx
 M components/Layout.tsx
 M components/OnboardingView.tsx
 M components/SettingsView.tsx
 M constants.ts
 M contexts/AppContext.tsx
 M services/d1Sync.ts
 M services/db.ts
 M services/imageService.ts
 M services/settingsUtils.ts
 M types.ts
?? components/AuthPanel.tsx
?? docs/
?? services/auth.ts
```

### 剩余风险和后续建议
- 必须从带有 `CLOUDFLARE_API_TOKEN` 的环境重新执行：

```bash
npx wrangler secret put REGISTRATION_INVITE_CODE --config cloudflareworker/wrangler.toml
npx wrangler deploy --config cloudflareworker/wrangler.toml
```

- 部署后需要重新执行完整线上 Step 6：
  - wrong invite -> 403
  - correct invite -> 201
  - duplicate username -> 409
  - wrong password -> 401
  - correct login -> session
  - `/auth/me` valid/fake token
  - logout 后 token 失效
  - 账号 A/B D1 和 R2 隔离
  - 同账号第二浏览器/设备拉取
  - legacy migration 使用真实旧数据或专门测试 D1 数据集验证幂等。
- 当前生产 Worker 未发布 auth 迁移代码，因此不能把云端多用户登录改造视为已生产验收完成。

# Personal Ledger PWA

> 当前版本：7.6.0。本版本新增买卖本卡密类目与密钥库存管理：卡密买入逐个录入密钥，卖出可自动选择最早未售密钥或按买入批次选择，已售密钥不会重复可售；同步、Cloudflare D1 和 CSV 导入导出保留卡密与已售状态；买卖本数量和手续费率改用底部小键盘输入，并支持 iOS 主屏快捷操作自定义。

Personal Ledger PWA 是一个以本地优先为核心的个人记账应用，支持离线使用、PWA 安装、多账本管理、统计分析、图片附件、WebDAV 备份，以及基于 Cloudflare Worker + D1 + KV + R2 的可选云同步能力。

## 项目简介

这个项目不是单纯的网页记账页面，而是一套可运行在浏览器、PWA 和原生壳中的个人财务记录系统：

- 前端基于 React + Vite 构建
- 本地数据默认存储在 IndexedDB 中，离线可用
- 可选接入 WebDAV 做文件备份
- 可选登录固定 Cloudflare 同步服务作为同步后端
- 可通过 Capacitor 封装为 Android / iOS 应用

如果不配置任何云端能力，它也可以作为纯本地记账本使用。

## 核心功能

- 多账本管理，账本类型分为记账本和买卖本
- 新建账本使用全屏创建页，账本类型通过左右滑块切换，并按浅色 / 深色主题展示对应说明和示意图
- 记账本保持原有收入 / 支出记录、预算和分类分组能力
- 买卖本使用单一类目，录入时选择买入 / 卖出；买入增加类目库存，卖出先选择类目，再从有剩余的买入批次中分配卖出数量
- 买卖本类目可选择普通物品或卡密类型；普通物品沿用批次数量，卡密类目买入时逐个录入密钥，卖出时默认自动列出最早未售出的密钥，也可以通过卖出数量行右侧下拉列表切换为按买入批次选择，并提供复制按钮，复制全部后会弹窗提示已复制
- 买卖本类目可配置买入手续费率和卖出手续费率；卖出时默认带出类目卖出手续费率，也可以为本次卖出单独修改
- 收入 / 支出记录
- 首页账目列表支持按全部、收入、支出筛选；记账本顶部周期汇总显示收入、支出和结余，买卖本显示卖出、买入和已实现利润
- 底部添加按钮支持长按快捷展开两个入口，并带有弹性上浮动画：记账本为添加支出 / 添加收入，买卖本为添加买入 / 添加卖出
- iOS 主屏长按图标的快捷操作可在“设置 > 个性化 > 快捷方式”中自定义，最多 4 个；每个入口绑定一个账本和收入 / 支出或买入 / 卖出动作，点击后只打开对应录入页，不改变正常打开 App 时的当前账本
- iOS/PWA 全局禁止非输入区域长按唤起系统复制菜单，避免按钮、导航和普通界面文字被误选中；输入框、文本域和可编辑区域仍保留正常编辑能力
- 添加 / 修改账目时可直接点击日期并选择日期，编辑时默认带出原账目日期
- 金额小键盘支持加减乘除表达式输入，长按减号可切换为 ÷，长按加号可切换为 ×
- 自定义分类与分类分组
- 分类管理仅作用于当前账本；需要管理其他账本时先切换到账本本身
- 分类管理支持稳定拖动排序，拖动提示位于卡片下方，拖动过程中列表不抖动，分类顺序调整会直接写回本地数据
- 周 / 月 / 年统计视图
- 饼图、柱状图、折线图分析
- 买卖本统计页会显示日均利润、日均收益率、单笔最高利润和利润最高天/月；收益率按已实现利润 / 已卖出批次成本计算
- 统计页支持点击分类或分类组，打开该项下的具体记录明细
- 分类明细页点击记录可编辑，长按记录可跳回首页定位该记录
- 预算展示与进度追踪
- 搜索、批量编辑、批量删除、撤回删除
- 搜索筛选支持按“有图/无图”查找图片账目，并可切换当前账本或全部账本范围
- 操作历史记录记账、分类、账本与排序等关键操作
- JSON / CSV 导入导出；买卖本卡密字段会随 CSV 明文导出和导入
- 首次启动引导与数据恢复
- 账目图片附件
- WebDAV 手动备份与定时备份
- Cloudflare Worker + D1 + KV + R2 云同步
- PWA 安装与离线访问
- Capacitor 原生能力接入
  - 键盘适配
  - 震动反馈
  - 文件导出
  - 系统分享
  - Deep Link 打开新增记账页

## 技术栈

### 前端

- React 18
- TypeScript
- Vite 5
- Tailwind CSS
- Recharts
- Lucide React

### 本地数据与离线层

- Dexie
- IndexedDB
- vite-plugin-pwa
- Workbox

### 移动端封装

- Capacitor
- Android 原生工程
- iOS 原生工程

### 云端能力

- Cloudflare Worker
- Cloudflare D1
- Cloudflare KV
- Cloudflare R2
- WebDAV

## 目录结构

```text
.
├─ components/          UI 视图与交互组件
├─ contexts/            全局状态与业务流程入口
├─ services/            数据库、同步、WebDAV、图片等服务
├─ android/             Capacitor Android 工程
├─ ios/                 Capacitor iOS 工程
├─ cloudflareworker/    Cloudflare Worker 后端与 Wrangler 配置
├─ capacitor.config.ts  Capacitor 配置
├─ vite.config.ts       Vite 与 PWA 配置
└─ README.md
```

## 实现原理

### 1. 本地优先数据模型

应用的核心操作首先写入本地 IndexedDB，因此即使离线也能完成记账、查看、编辑与统计。新增、修改、删除和批量编辑账目时，会先等待 IndexedDB 写入成功，再更新界面并提示成功，避免出现“界面看起来保存了，但重开后丢失”的情况。

账目、账本、分类、分组和可云端同步的设置变更都会写入本地 `syncQueue` 待同步队列。网络不可用、Worker 超时、登录会话失效或云端同步失败时，本地变更仍保留在 IndexedDB，下次启动、恢复联网、重新登录或回到前台后继续尝试同步。

本地数据库主要表包括：

- `transactions`
- `ledgers`
- `categories`
- `categoryGroups`
- `settings`
- `operationLogs`
- `backupLogs`
- `images`
- `pending_uploads`
- `syncQueue`

账本通过 `ledgerType` 区分类型：旧数据和现有云端账本缺少该字段时会自动按 `accounting` 记账本处理；新建买卖本时使用 `trading`。买卖本仍复用交易表，买入映射为 `expense`、卖出映射为 `income`，并额外保存 `tradeAction`、`tradeQuantity`、`tradeGrossAmount`、`tradeFeeRate`、`tradeFeeAmount`、`tradeAllocations`、`tradeKeys` 与 `tradeKeyAllocations`。其中 `tradeGrossAmount` 保存单价乘数量后的交易总额，`tradeAllocations` 保存卖出记录消耗的买入批次和数量，`tradeKeys` 保存卡密类目买入的密钥，`tradeKeyAllocations` 保存卡密卖出时实际交付的密钥。分类表通过 `type: "trade"` 表示买卖本类目，并保存 `tradeItemType`、`buyFeeRate` 与 `sellFeeRate`；旧买卖本类目缺少 `tradeItemType` 时按普通物品处理。

### 2. 本地旧数据迁移

项目保留了从旧版 `localStorage` 数据结构迁移到 IndexedDB 的逻辑。首次启动时如果检测到旧数据，会自动迁移到新结构中。

当前版本还会在主库为空时检查旧 IndexedDB 库名，例如 `FinanceDB_v8`、`FinanceDB_v7` 等，并将账本、分类、分组、账目、设置、日志和图片缓存迁移到当前库。数据库结构检查失败时不会自动清空本地数据库；只有用户在设置中明确执行“退出并清空本地数据”才会删除本地库。

### 3. Cloudflare 云同步

可选同步后端位于：

```text
cloudflareworker/worker.js
```

普通用户同步流程大致如下：

- 前端同步地址固定为 `https://sync.sssr.edu.kg`
- 用户通过用户名、密码登录；新账号需要邀请码注册
- 登录后前端通过 `Authorization: Bearer <session-token>` 调用 Worker 的普通同步与图片接口
- 前端普通用户不再填写 Worker 地址、旧版全局同步密钥或手动 `userId`
- session token 存在本地 IndexedDB 的 `settings.authSession` 中，应用启动时先恢复本地会话，随后在后台调用 `/auth/me` 校验；无效或过期 session 会清除并回到本地模式
- 注册邀请码保存在 D1 `invite_codes` 表中，每个邀请码使用后会写入 `used_at` 与 `used_by_user_id`，不能再次注册
- Worker 从 D1 `sessions` / `users` 推导当前 `user_id`，普通同步、版本探测、图片上传、图片读取和图片删除都不再信任前端传入的 `user_id`
- Worker 将结构化数据写入 D1 的 `ledgers_v2`、`categories_v2`、`groups_v2`、`transactions_v2`、`settings_v2` 表，用户拥有的数据以 `(user_id, id)` 作为逻辑唯一键
- `ledgers_v2.ledger_type` 保存 `accounting` / `trading`；Worker 初始化时会补齐该列，并把旧行、空值和现有云端账本回填为 `accounting`
- `categories_v2` 保存买卖本类目的 `trade_item_type`、`buy_fee_rate`、`sell_fee_rate`；`transactions_v2` 保存买卖记录的 `trade_action`、`trade_quantity`、`trade_gross_amount`、`trade_fee_rate`、`trade_fee_amount`、`trade_allocations`，卡密类目还会保存 `trade_keys` 与 `trade_key_allocations`
- 每张同步表都有两个时间字段：`updated_at` 是客户端本地修改时间，用于实体冲突判断；`server_updated_at` 是 Worker 写入时生成的服务端单调版本，用于 `/sync/pull?since=` 的跨设备增量游标
- `/sync/version` 优先返回当前用户已发布的同步版本，缺失时才回退扫描各表 `server_updated_at` 最大值；`/sync/pull?since=` 只按 `server_updated_at > since` 拉取账本、分类、分组、账目和设置
- 自动 D1 同步和“立即同步”都默认只按本地 `syncQueue` 上传本轮变化实体：编辑一条账目只读取并上传这一条账目，新建账本只上传该账本和自动创建的默认分类，修改设置只上传可同步设置
- 首次账号接管、迁移恢复和内部修复流程才会上传账本、分类、分组、账目做全量对账；设置只有本地设置队列存在时才上传，避免旧设备覆盖新设备设置
- 增量同步只会阻塞上传本轮变化账目实际引用的待同步图片，历史遗留图片待上传队列不会拖慢一条普通账目编辑
- 应用启动后会在后台轻量请求固定同步服务的 `/time` 接口检测本机系统时间；若与服务器时间相差约 2 分钟以上，会弹窗提醒用户开启自动时间或手动校准，避免多设备冲突判断受错误本机时间影响
- 冲突策略是实体级 last-write-wins：`updated_at` 较新的实体胜出；同一毫秒时删除优先，非删除的同时间戳写入不会覆盖服务端已有行
- 图片二进制存储在 R2，普通上传写入 `users/<user_id>/<imageKey>`，交易记录中只保存附件 key

同步成功并完成云端拉取合并后，客户端才会按 Worker 返回的 `accepted` / `superseded` 结果清理本轮已确认上传的本地待同步队列；如果同步期间同一实体再次变化，新的队列项会保留到下一轮。同步失败不会删除队列项，也不会回滚本地数据。

可随账号同步的设置仅限用户偏好和备份偏好，例如主题、交互反馈、预算、分类备注、搜索/导出偏好、同步轮询间隔、WebDAV 配置和 iOS 主屏快捷方式配置。登录态、`authMode`、`lastSyncVersion`、Cloudflare 管理 API 配置、旧版同步凭据、调试和运行状态只保留在本地。

这种设计将交易数据与图片对象分离，便于同步和缓存管理。

### 4. WebDAV 文件备份

WebDAV 方案更偏向文件式备份，不承担实时账目级增量同步，主要保存：

- `ledgers.json`：账本信息
- `settings.json`：设置、分类、分组
- 按账本和年份拆分的交易 CSV 文件

实现中使用了 ETag 乐观锁和重试逻辑，用来降低并发覆盖风险。

在 iOS 原生壳中，WebDAV 备份会优先走 Capacitor 的原生 HTTP 通道，因此可以直接填写坚果云官方 WebDAV 地址而不依赖浏览器跨域能力。当前 Cloudflare 登录同步 Worker 只提供账号、D1/KV 同步和 R2 图片接口，不再提供旧版同步或用量统计兼容接口。

`备份提醒天数` 支持设置为 `0` 来彻底关闭提醒；应用会在读取本地设置和合并云端设置时保留这个关闭状态，避免旧的同步配置把提醒重新打开。

### 5. 图片附件流程

- 新增图片时先写入本地缓存
- 待同步图片进入待上传队列
- 有网络且配置同步后再上传到 R2
- 账目只记录图片 key
- 展示时按需拉取并缓存图片

### 6. PWA 与原生壳

Web 端支持安装为 PWA，并缓存静态资源。移动端通过 Capacitor 提供键盘适配、震动反馈、文件导出、分享和 Deep Link 能力。iOS 原生壳会把设置中的快捷方式写入动态 Home Screen Quick Actions；快捷入口使用 `personalledger://add?ledgerId=...&type=...` 打开指定账本的录入页，但不会写入 `lastLedgerId` 或切换正常启动账本。iOS/PWA 界面对按钮、导航、卡片和普通文本禁用 WebKit 长按复制菜单与文本选中，减少长按添加等手势被系统复制行为打断；输入框、文本域和可编辑区域仍可正常编辑。

### 7. 账目录入交互

新增 / 修改账目页的金额输入不是简单的纯数字键盘，而是在前端对输入表达式进行解析：

- 支持 + - * / 四则运算
- 按先乘除、后加减的顺序计算结果
- 提交前会校验非法表达式与除数为 0 的情况
- 日期输入使用原生 input[type=date]，编辑现有账目时会绑定当前账目日期作为默认值
- 买卖本的买入数量、卡密卖出数量和卖出手续费率输入会复用底部小键盘，不唤起系统输入法；点击单价区域可切回单价输入

买卖本录入在同一个页面内切换为买入 / 卖出模式：买入时选择类目、输入单价和数量后，系统先计算交易总额 = 单价 × 数量，再按类目的买入手续费率计算最终金额。普通物品类目继续按买入批次记录库存；卡密类目会按买入数量列出同等数量的密钥输入框，保存时把密钥写入 `tradeKeys`，同一类目内不允许重复卡密。卖出时先选择要卖出的类目，类目选择弹层可通过取消按钮或点击空白处关闭；新建卖出且尚未选择类目时取消会直接退出录入页，回到点击添加前的界面。普通物品卖出页面只显示仍有剩余的买入批次，用户可以在多个批次上分别填写本次卖出数量；卡密卖出页面输入数量后默认自动按最早未售库存列出对应密钥，也可以通过卖出数量行右侧下拉列表切换为按买入批次选择，并在每个批次上指定本次取出的卡密数量。按批次选择时，卖出数量会按已选卡密数量实时回写，直接修改卖出数量也会按可售顺序自动补齐批次。已列出的卡密会显示对应买入日期、买入记录和单个成本，不展示内部交易编号；卡密卖出页提供单个复制和复制全部按钮，复制全部成功后会弹窗提示“已复制全部卡密”。卖出记录会保存指向买入批次的 `tradeAllocations`；卡密卖出还会保存 `tradeKeyAllocations`，后续同步、CSV 导入导出和利润计算都能保留“卖出哪一批、哪几个密钥”的关系，已卖出的密钥不会再次进入可售列表。卖出手续费率默认使用类目的卖出手续费率，但可以在本次卖出页面单独修改，卖出最终金额为交易总额扣除本次手续费。买卖本首页列表会突出买入数量和卖出数量；卖出记录下方显示卖出金额与利润，买入记录下方显示买入金额和每批买入的已实现卖出利润。买入记录没有对应卖出时利润显示 0，已全部卖出的买入记录会淡化显示。记账本列表仍保持原收入 / 支出金额展示。买卖本首页的利润为当前周期卖出净收入减去对应买入批次的成本，没有卖出时显示 0；旧卖出记录没有 `tradeAllocations` 时继续按同类目历史买入记录的时间顺序匹配成本。

## 本地开发

### 环境要求

- Node.js 20 或更高版本
- npm

### 安装依赖

```bash
npm install
```

### 启动开发环境

```bash
npm run dev
```

默认本地地址：

```text
http://localhost:3000
```

### 构建生产资源

```bash
npm run build
```

构建产物输出到：

```text
dist/
```

## 部署方式

### 方案一：仅部署前端静态站点

如果只需要本地记账或 PWA 版本，可以把 `dist/` 部署到任意静态托管平台，例如：

- Cloudflare Pages
- EdgeOne Pages
- Nginx
- GitHub Pages

典型流程：

```bash
npm install
npm run build
```

然后发布 `dist/` 即可。

### 方案二：部署 Cloudflare 同步后端

普通用户不需要在应用内配置同步地址。当前前端固定连接：

```text
https://sync.sssr.edu.kg
```

如果需要自托管同等能力，需要部署 `cloudflareworker/` 目录中的 Worker，并让固定域名或等价路由指向该 Worker。

Worker 名称：

```text
personal-ledger-sync
```

当前 Wrangler 配置文件：

```text
cloudflareworker/wrangler.toml
```

需要的绑定和 secret：

- `DB`：Cloudflare D1 数据库
- `SYNC_KV`：Cloudflare KV 命名空间
- `IMAGES_BUCKET`：Cloudflare R2 Bucket

当前同步 Worker 不再需要旧版全局同步密钥。普通同步、图片上传、图片读取和图片删除全部使用登录 session token 鉴权。

首次部署或补充邀请码时，先把邀请码表和初始邀请码写入 D1：

```bash
npx wrangler d1 execute personal --remote --file cloudflareworker/invite-codes.sql --config cloudflareworker/wrangler.toml
```

然后部署 Worker：

```bash
npx wrangler deploy --config cloudflareworker/wrangler.toml
```

Worker 登录与账号隔离同步接口：

- `POST /auth/register` 使用 `username`、`password`、`inviteCode` 创建受邀账号。
- `POST /auth/login` 创建 D1-backed session，并只在响应中返回一次原始 session token。
- `POST /auth/logout` 撤销当前 session token。
- `GET /auth/me` 返回当前登录用户。
- 注册要求邀请码存在于 D1 `invite_codes` 表、未使用且未禁用；注册成功后该邀请码会被标记为已使用。
- 密码只保存为带用户独立 salt 的 PBKDF2-SHA-256 哈希，迭代次数为 100000。
- session token 默认 30 天过期，D1 只保存 `sha256(token)`。
- 普通 `/sync/version`、`/sync/pull`、`/sync/push`、`/upload/image`、`/image/:key` 必须使用 `Authorization: Bearer <session-token>`。
- `GET /time` 是公开轻量接口，仅返回 Worker 当前 `serverTime`，用于客户端后台系统时间误差检测，不访问 D1/KV/R2。
- 普通同步接口会忽略 URL 中的 `user_id` 参数，实际用户只来自 session。
- 新的账号隔离 D1 表为 `*_v2`，账本、分类、分组、交易均使用 `PRIMARY KEY (user_id, id)`，设置表使用 `user_id` 主键。
- Worker 会在每个运行实例的首次请求时为旧 D1 表自动补齐 `server_updated_at` 列和 `(user_id, server_updated_at)` 索引，并把历史行回填到当前服务端时间，避免旧客户端游标漏拉历史数据；后续同步请求复用初始化结果，减少固定 D1 开销。
- `/sync/push` 返回每条实体的 `accepted` 和 `superseded` 结果；前端只在 push 成功、pull 合并完成后清理这些被确认的队列项。
- 普通 R2 图片对象写入 `users/<user_id>/<imageKey>`，读取和删除也只访问当前 session 用户作用域内的对象。

部署完成后，普通用户在应用内通过“设置 > 云同步与备份”登录或注册账号即可启用同步；前端固定使用：

```text
https://sync.sssr.edu.kg
```

应用不会要求普通用户输入 Worker 地址、旧版全局同步密钥或 `userId`。登录获得的 session token 只保存在本地 IndexedDB 设置中，D1 同步和图片接口会自动使用该 token。未登录时应用保持本地模式，所有账目继续保存在当前设备的 IndexedDB 中，不会尝试 D1 同步。

当前生产数据已从旧 D1 表和 R2 根路径迁移到账号 `3226991989` 对应的内部用户 `user_3226991989`：

- 账本：`ledgers_v2`
- 分类：`categories_v2`
- 分类组：`groups_v2`
- 账目：`transactions_v2`
- 软件设置：`settings_v2`
- 图片附件：`users/user_3226991989/<imageKey>`
- 同步版本：`SYNC_KV` 中的 `version:user_3226991989`

登录后的账号接管流程：

- 客户端会先使用当前账号 session 执行一次 `since=0` 全量拉取。
- 如果账号云端已有数据，优先把云端账本、分类、分类组、账目、设置合并到本地，不再尝试旧版云端接口。
- 如果账号云端为空而本地已有数据，客户端会把本地账本、分类、分类组、账目和本地缓存图片加入同步队列，并作为该账号的初始云端数据推送。
- WebDAV 地址、账号、“密码 / 应用密钥”和 iOS 主屏快捷方式配置会随账号设置同步，登录同一账号后可直接使用 WebDAV 备份配置和快捷入口配置。
- 同步到云端的设置会剔除本地 auth/session、旧同步凭据和 Cloudflare API 配置；WebDAV 密码会写入账号云设置，便于跨设备使用。
- 操作日志、备份日志、本地图片缓存、待上传队列只保留在本地，不作为账号业务数据写入 D1。

### 方案三：只使用 WebDAV 备份

如果不想使用 D1 + KV + R2 同步，也可以只使用 WebDAV。

有两种方式：

- 直接填写 WebDAV 服务地址
- 浏览器/PWA 端如果受跨域限制，需要使用支持浏览器访问的 WebDAV 服务或另行部署专用代理；当前登录同步 Worker 不再提供 WebDAV 代理路由

需要配置：

- WebDAV 地址
- 用户名
- 密码
- WebDAV 手动备份界面会显示上次自动备份时间；手动备份不会覆盖这个自动备份时间。

## Android 与 iOS 打包

### 将 Web 资源同步到原生工程

```bash
npm run build
npx cap sync
```

### Android

```bash
npx cap open android
```

仓库中也包含 GitHub Actions 工作流，可用于生成 APK 构建产物。

### iOS

```bash
npx cap open ios
```

仓库中也包含 iOS 打包工作流，可生成测试用 IPA 产物。正式签名与分发仍需你自己的 Apple 签名配置。

iOS 版在 WebDAV 备份时会使用原生 HTTP 请求，不走 WebView 的浏览器网络限制；如果目标是坚果云，可以在 App 内直接填写官方 WebDAV 地址。

如果你在 Windows 上使用 GitHub Actions 云端打包，可以直接运行根目录脚本：

```bat
build-ios-github.cmd
```

前置条件：

- 已安装 GitHub CLI：`winget install --id GitHub.cli -e`
- 已完成登录：`gh auth login`
- 需要打包的代码已经推送到远端分支

脚本启动后会显示 1 搭建并下载、2 下载已有构建、3 退出 三个选项。

脚本会自动：
- 启动后先询问是“搭建并下载”还是“下载已有构建”
- 选择 `3` 时，会立即退出脚本
- 选择“搭建并下载”时，会列出远端分支并按编号选择
- 选择“下载已有构建”时，会列出 GitHub 上最近成功的 iOS 构建记录，并显示构建时间、分支和运行 ID
- 下载成功后，会优先从 GitHub 远端项目的 `package.json` 读取版本号命名文件，例如 `7.4.4` 会保存为 `builds/ios/7.4.4.ipa`；如果读取失败，则回退为 `builds/ios/run-<运行ID>.ipa`

## 使用说明

### 首次使用

首次启动时，用户可以：

- 创建新账本
- 登录或注册账号以启用固定服务的云同步
- 暂不登录，本地使用
- 从本地 JSON 备份恢复
- 登录账号后从 Cloudflare D1 + KV 恢复

### 账目操作

- 账目新增、编辑、删除优先写入本地 IndexedDB。
- 删除账目或批量删除账目后会显示撤销提示；提示关闭后，再次删除会重新显示撤销入口。

### 建议的备份策略

- 纯本地使用：定期导出 JSON 或 CSV
- 使用 WebDAV：开启自动备份
- 使用云同步：仍建议保留本地导出作为额外容灾手段

## 安全说明

- 不要在前端跟踪文件中写死 session token、账号密码或注册邀请码
- 普通用户界面不提供 Worker 地址或手动 `userId` 输入入口
- WebDAV 账号密码由用户运行时填写，并会随登录账号设置同步到 D1
- Cloudflare API 配置不会作为账号云设置同步
- Worker 不再提供旧版 `/legacy/*` 同步接口或 `/usage` 用量统计接口
- 若要公网部署 Worker，应额外加强来源限制、密钥管理和访问控制

## 许可证

当前仓库未包含 License 文件。如果要公开分发或接收外部贡献，建议补充明确的开源许可证。

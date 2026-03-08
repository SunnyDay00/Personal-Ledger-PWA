# Personal Ledger PWA

Personal Ledger PWA 是一个以本地优先为核心的个人记账应用，支持离线使用、PWA 安装、多账本管理、统计分析、图片附件、WebDAV 备份，以及基于 Cloudflare Worker + D1 + KV + R2 的可选云同步能力。

## 项目简介

这个项目不是单纯的网页记账页面，而是一套可运行在浏览器、PWA 和原生壳中的个人财务记录系统：

- 前端基于 React + Vite 构建
- 本地数据默认存储在 IndexedDB 中，离线可用
- 可选接入 WebDAV 做文件备份
- 可选接入 Cloudflare Worker 作为同步后端
- 可通过 Capacitor 封装为 Android / iOS 应用

如果不配置任何云端能力，它也可以作为纯本地记账本使用。

## 核心功能

- 多账本管理
- 收入 / 支出记录
- 添加 / 修改账目时可直接点击日期并选择日期，编辑时默认带出原账目日期
- 金额小键盘支持加减乘除表达式输入，长按减号可切换为 ÷，长按加号可切换为 ×
- 自定义分类与分类分组
- 分类管理支持稳定拖动排序，拖动提示位于卡片下方，拖动过程中列表不抖动，分类顺序调整会直接写回本地数据
- 周 / 月 / 年统计视图
- 饼图、柱状图、折线图分析
- 预算展示与进度追踪
- 搜索、批量编辑、批量删除、撤回删除
- 操作历史记录记账、分类、账本与排序等关键操作
- JSON / CSV 导入导出
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

应用的核心操作首先写入本地 IndexedDB，因此即使离线也能完成记账、查看、编辑与统计。

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

### 2. 本地旧数据迁移

项目保留了从旧版 `localStorage` 数据结构迁移到 IndexedDB 的逻辑。首次启动时如果检测到旧数据，会自动迁移到新结构中。

### 3. Cloudflare 云同步

可选同步后端位于：

```text
cloudflareworker/worker.js
```

同步流程大致如下：

- 前端通过 `Authorization: Bearer AUTH_TOKEN` 调用 Worker
- Worker 将结构化数据写入 D1
- KV 维护每个用户的同步版本号
- 客户端比较版本号后执行 push / pull 同步
- 图片二进制存储在 R2，交易记录中只保存附件 key

这种设计将交易数据与图片对象分离，便于同步和缓存管理。

### 4. WebDAV 文件备份

WebDAV 方案更偏向文件式备份，主要保存：

- `ledgers.json`：账本信息
- `settings.json`：设置、分类、分组
- 按账本和年份拆分的交易 CSV 文件

实现中使用了 ETag 乐观锁和重试逻辑，用来降低并发覆盖风险。

如果浏览器无法直接访问某些 WebDAV 服务（例如坚果云），当前 Cloudflare Worker 还提供了一个可选的 `/webdav/*` 代理路由。该路由会将 `GET`、`PUT`、`DELETE`、`PROPFIND` 请求转发到坚果云 WebDAV，并透传 `Authorization`、`Depth`、`If-Match` 等备份所需请求头。

### 5. 图片附件流程

- 新增图片时先写入本地缓存
- 待同步图片进入待上传队列
- 有网络且配置同步后再上传到 R2
- 账目只记录图片 key
- 展示时按需拉取并缓存图片

### 6. PWA 与原生壳

Web 端支持安装为 PWA，并缓存静态资源。移动端通过 Capacitor 提供键盘适配、震动反馈、文件导出、分享和 Deep Link 能力。

### 7. 账目录入交互

新增 / 修改账目页的金额输入不是简单的纯数字键盘，而是在前端对输入表达式进行解析：

- 支持 + - * / 四则运算
- 按先乘除、后加减的顺序计算结果
- 提交前会校验非法表达式与除数为 0 的情况
- 日期输入使用原生 input[type=date]，编辑现有账目时会绑定当前账目日期作为默认值

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

如果需要 D1 + KV + R2 同步，需要部署 `cloudflareworker/` 目录中的 Worker。

Worker 名称：

```text
personal-ledger-sync
```

当前 Wrangler 配置文件：

```text
cloudflareworker/wrangler.toml
```

需要的绑定：

- `DB`：Cloudflare D1 数据库
- `SYNC_KV`：Cloudflare KV 命名空间
- `IMAGES_BUCKET`：Cloudflare R2 Bucket
- `AUTH_TOKEN`：Worker 密钥

部署命令：

```bash
npx wrangler secret put AUTH_TOKEN --config cloudflareworker/wrangler.toml
npx wrangler deploy --config cloudflareworker/wrangler.toml
```

部署完成后，在应用内配置：

- Worker 地址
- `AUTH_TOKEN`
- 多设备共用的稳定 `userId`

如果你还需要给坚果云 WebDAV 备份做浏览器侧中转，可以直接复用同一个 Worker。部署完成后，将应用里的 WebDAV 地址改为：

```text
https://<你的-worker-域名>/webdav
```

此时用户名和密码仍填写你的坚果云 WebDAV 账号信息，Worker 会把备份请求中转到 `https://dav.jianguoyun.com/dav`。

### 方案三：只使用 WebDAV 备份

如果不想使用 D1 + KV + R2 同步，也可以只使用 WebDAV。

有两种方式：

- 直接填写 WebDAV 服务地址
- 如果浏览器无法直连坚果云，则先部署上面的 Worker，再填写 `https://<你的-worker-域名>/webdav`

需要配置：

- WebDAV 地址
- 用户名
- 密码

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

## 使用说明

### 首次使用

首次启动时，用户可以：

- 创建新账本
- 从本地 JSON 备份恢复
- 从 Cloudflare D1 + KV 恢复

### 建议的备份策略

- 纯本地使用：定期导出 JSON 或 CSV
- 使用 WebDAV：开启自动备份
- 使用云同步：仍建议保留本地导出作为额外容灾手段

## 安全说明

- 不要在前端跟踪文件中写死 `AUTH_TOKEN`
- WebDAV 账号密码由用户运行时自行填写
- Cloudflare 统计接口使用的 API 凭据应保持为用户自行管理
- 若要公网部署 Worker，应额外加强来源限制、密钥管理和访问控制

## 许可证

当前仓库未包含 License 文件。如果要公开分发或接收外部贡献，建议补充明确的开源许可证。
# 放弃挣扎吧 ADHD

一个面向个人使用的任务管理工具，用来管理任务目标、待办项、DDL、优先级和进度记录。

当前版本包含 Web 版和本机后台服务脚本。Web 主线已接入 Supabase 邮箱 Magic Link 登录和用户级数据隔离；本地 SQLite 提醒脚本保留为 legacy/local mode。

## 功能概览

- 任务管理：新建、编辑、查看任务目标。
- 待办项：新增、编辑、完成、删除待办项。
- 任务状态：`进行中`、`未开始`、`已完成`、`挂起`。
- 优先级：`P0`、`P1`、`P2`、`P3`，重要性从高到低。
- DDL：支持设置和编辑截止时间。
- 任务排序：优先按优先级排序，再按 DDL 排序，挂起任务靠后。
- 进度记录：追加式记录任务推进情况。
- 左侧任务栏：按状态文件夹分组，并支持折叠展开。
- 专注模式：聚焦当前下一条待办。
- 邮箱登录：通过 Supabase Magic Link 登录，不同用户的数据隔离保存。
- macOS 本机服务：
  - Web 服务持久化运行。
  - legacy SQLite DDL 提醒服务。

## 技术栈

- Next.js 15
- React 19
- TypeScript
- Supabase Auth
- Supabase Postgres / REST API
- lucide-react
- macOS launchd

## 目录结构

```text
.
├── src/
│   ├── app/
│   │   ├── api/              # Next.js REST API
│   │   ├── auth/             # Supabase 邮箱登录回调
│   │   ├── globals.css       # 全局样式
│   │   └── page.tsx          # 主任务管理界面
│   └── lib/
│       ├── auth.ts           # 登录态与用户同步
│       ├── db.ts             # Supabase 数据访问层
│       ├── app-paths.ts      # legacy 本地 SQLite 路径工具
│       └── supabase/         # Supabase client/server/proxy
├── scripts/
│   ├── reminder.mjs          # legacy SQLite DDL 提醒检查
│   ├── reminder-service.mjs  # macOS 提醒服务安装/卸载
│   └── web-service.mjs       # macOS Web 服务持久化
├── supabase/
│   └── migrations/           # Supabase 表结构迁移 SQL
├── data/                     # legacy SQLite 数据目录
└── package.json
```

## 环境要求

- Node.js 22 或更高版本
- npm
- Supabase 项目
- macOS 可选：用于本机 Web 服务持久化和系统通知提醒

## 环境变量

复制或参考 `.env.example`，在项目根目录创建 `.env.local`：

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxx

SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sb_secret_xxx
```

说明：

- `NEXT_PUBLIC_SUPABASE_URL`：Supabase 项目 URL。
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`：前端可用的 publishable / anon key。
- `SUPABASE_URL`：服务端访问 Supabase 的项目 URL，不要写成 `/rest/v1/` endpoint。
- `SUPABASE_SERVICE_ROLE_KEY`：服务端写入数据库使用的 Secret / service_role key，不能提交到 Git。

如果看到类似错误：

```text
Supabase 未配置：请在 .env.local 中设置 SUPABASE_URL 和 SUPABASE_SERVICE_ROLE_KEY
```

说明服务端环境变量缺失或没有被 Next.js 读取。

如果看到类似错误：

```text
Supabase RLS 阻止写入
```

优先检查 `SUPABASE_SERVICE_ROLE_KEY` 是否是真正的 Secret/service_role key，而不是 publishable key。

## Supabase 数据库初始化

在 Supabase SQL Editor 中执行迁移：

```text
supabase/migrations/20260707_email_login_user_scope.sql
```

该迁移会创建或补充：

- `app_users`
- `tasks.user_id`
- `todo_items.user_id`
- `progress_records.user_id`
- 相关索引

如果已有历史任务数据，迁移文件末尾保留了按邮箱归属历史任务的 SQL 注释示例，需要先替换成自己的邮箱再执行。

## 本地开发

安装依赖：

```bash
npm install
```

启动开发服务：

```bash
npm run dev
```

访问：

```text
http://localhost:3000
```

首次进入页面时，需要输入邮箱并点击邮件中的 Magic Link 完成登录。

## 构建与生产运行

构建：

```bash
npm run build
```

生产启动：

```bash
npm run start
```

默认访问：

```text
http://localhost:3000
```

## macOS Web 服务持久化

如果希望本机 Web 服务不依赖当前终端，可以安装 launchd 服务：

```bash
npm run web:install
```

查看状态：

```bash
npm run web:status
```

重启服务：

```bash
npm run web:restart
```

卸载服务：

```bash
npm run web:uninstall
```

服务信息：

```text
Label: com.abandon-struggle-adhd.web
Plist: ~/Library/LaunchAgents/com.abandon-struggle-adhd.web.plist
URL: http://localhost:3000
Logs: ~/Library/Application Support/AbandonStruggleADHD/logs/
```

注意：代码修改后需要重新执行 `npm run web:install`，它会先运行 `npm run build`，再安装/更新生产服务。

## legacy SQLite 与本机 DDL 提醒

项目曾经是本地 SQLite 版本，因此仍保留了本机提醒脚本。

当前提醒脚本读取的数据库路径为：

```text
~/Library/Application Support/AbandonStruggleADHD/tasks.db
```

如果新路径没有数据库，脚本会尝试从旧路径复制：

```text
data/tasks.db
```

可通过环境变量覆盖：

```bash
TASKS_DB_PATH=/path/to/tasks.db npm run reminders:test
```

提醒规则：

- `priority = 'P0'`
- `status != '已完成'`
- 有 `deadline_at`
- 距离 DDL 大于 0 且小于等于 3 小时

提醒文案：

```text
亲爱的～快来看看 【任务目标】 这个任务，距离ddl不足 n 个小时了哟～
```

命令：

```bash
npm run reminders:test      # 只打印，不发送系统通知
npm run reminders:run       # 手动运行一次，macOS 下发送系统通知
npm run reminders:install   # 安装每小时提醒服务
npm run reminders:status    # 查看提醒服务状态
npm run reminders:uninstall # 卸载提醒服务
```

提醒服务信息：

```text
Label: com.abandon-struggle-adhd.reminder
Plist: ~/Library/LaunchAgents/com.abandon-struggle-adhd.reminder.plist
Logs: ~/Library/Application Support/AbandonStruggleADHD/logs/
```

重要说明：当前 Web 主线的数据访问层是 Supabase，legacy 提醒脚本仍读本地 SQLite。若要让云端任务也支持提醒，需要后续改造为云端定时任务或让提醒脚本读取 Supabase。

## API 概览

当前 API 需要登录态，用户只能访问自己的任务数据。

```text
GET    /api/auth/me
POST   /api/auth/login
POST   /api/auth/logout

GET    /api/tasks
POST   /api/tasks
GET    /api/tasks/:id
PATCH  /api/tasks/:id
POST   /api/tasks/:id/todos
POST   /api/tasks/:id/progress
PATCH  /api/todos/:id
```

## 常见问题

### 1. 页面一直要求登录

检查 Supabase Auth 是否启用邮箱登录，并确认 `.env.local` 中的 Supabase 配置正确。

### 2. 收不到 Magic Link 邮件

检查 Supabase Auth 邮件设置、邮箱垃圾箱，以及是否触发了发送频率限制。页面内有 60 秒重发冷却。

### 3. API 返回“请先用邮箱登录”

说明当前浏览器没有有效 Supabase session。重新发送登录链接并从同一浏览器打开邮件链接。

### 4. 本机服务为什么停止

如果使用 `npm run dev`，服务依赖当前终端。要长期运行，使用：

```bash
npm run web:install
```

### 5. 任务提醒为什么没有触发

当前提醒脚本读取的是 legacy SQLite，不读取 Supabase。先用以下命令确认是否有符合条件的本地任务：

```bash
npm run reminders:test
```

## 后续路线

- 将 legacy SQLite 提醒改造为 Supabase 数据源，或迁移到云端定时任务。
- 增加移动端或小程序入口，并接入正式 HTTPS API 域名。
- 补充任务编辑历史的云端模型。
- 增加任务搜索、筛选和日期视图。
- 完善 Supabase RLS 策略，减少对 service_role 的依赖面。
- 增加自动化测试和端到端验证。

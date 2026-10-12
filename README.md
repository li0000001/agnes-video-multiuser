# Agnes Video Multiuser（多用户 Agnes 视频中转平台）

基于 Cloudflare Pages + Pages Functions + D1 + R2 实现的多用户版 Agnes 视频生成中转平台。

## 功能特性

- 多用户登录注册，用户间数据完全隔离
- 独立 API Key 池（可增删改查、禁用/启用），互不干扰
- 支持文生视频、图生视频、首尾帧等官方所有生成方式（参数透传 + 模型自动路由）
- 任务异步生成，后台定时轮询
- 视频转存 R2，支持在线播放与下载（短时 Presigned URL）
- 管理员后台：用户管理、全量任务管理、已生成视频管理（删除视频文件释放空间）、系统概览

## 技术栈

- Cloudflare Pages Functions（TypeScript）
- Cloudflare D1（SQLite）
- Cloudflare R2（对象存储）
- Web Crypto API（AES-GCM 密钥加密）

## 快速部署

### 1. 安装 Wrangler

```bash
npm i -g wrangler
```

### 2. 克隆或进入项目

```bash
cd D:\work\Agents-cf\agnes-video-multiuser
```

### 3. 创建 D1

```bash
wrangler d1 create agnes_video_db
```

复制返回的 `database_id` 填入 `wrangler.jsonc`。

### 4. 创建 R2

```bash
wrangler r2 bucket create agnes-video-r2
```

### 5. 设置 Secrets

生成 `ENC_KEY`（32字节 hex）

```bash
node -e "require('crypto').randomBytes(32).toString('hex')"
```

设置：

```bash
wrangler secret put ENC_KEY
```

### 6. 应用数据库结构

```bash
wrangler d1 execute agnes_video_db --remote --file=./schema.sql
```

或本地预览时先 `--local`。

### 7. 本地预览

```bash
wrangler pages dev ./public --d1=DB=agnes_video_db --r2=R2=agnes-video-r2
```

访问 http://localhost:8788

### 8. 设置第一个管理员

注册账号后本地/线上执行：

```bash
wrangler d1 execute agnes_video_db --remote --command="UPDATE users SET role='admin' WHERE email='your@email.com'"
```

### 9. 配置外部 Cron

使用 cron-job.org 每 2 分钟触发：

```
GET https://你的Pages域名/api/cron/poll
```

### 10. 部署到 Cloudflare Pages

```bash
wrangler pages deploy ./public
```

## 说明

- Agnes Key 加密存储，仅在调用 Agnes API 时解密
- 播放/下载均需登录且校验归属，使用短时 R2 Presigned URL
- 管理员后台仅 `role=admin` 可访问
- “仅删除视频文件”不会删除任务记录，任务历史保留
- 参数透传确保支持 Agnes 官方最新参数组合

# Agnes API 出口中继（relay）

把平台对 `apihub.agnes-ai.com` 的调用转发到本服务，出口 IP 从 **Cloudflare 共享 IP** 换成 **Render 的 IP**，绕开 1015（CF 共享 IP 限流）。无状态、零依赖（仅 Node 内置模块）、不存储任何密钥。

## 部署到 Render 免费层（约 3 分钟）

1. 注册 [render.com](https://dashboard.render.com/register)（GitHub 登录即可；免费层通常无需绑卡，以官网为准）
2. Dashboard → **New +** → **Web Service** → Connect 你的 GitHub 仓库 `li0000001/agnes-video-multiuser`
3. 配置（关键三项）：
   - **Root Directory**：`relay`（单仓库多服务）
   - **Build Command**：留空
   - **Start Command**：`node server.js`
   - **Instance Type**：选 **Free**（512MB，约 750 小时/月；15 分钟无请求会休眠，冷启动约 30~90 秒）
4. **Environment** 添加一条：`RELAY_SECRET` = 一串随机长密码（与下面 Pages 侧保持一致）
5. Create Web Service → 等部署完成 → 访问 `https://xxxx.onrender.com/health` 应返回 `{"ok":true,...}`

## 平台侧启用（Cloudflare Pages）

在 Cloudflare Pages → Settings → Environment variables 添加（Production）：

- `RELAY_URL` = `https://xxxx.onrender.com`
- `RELAY_SECRET` = 与 Render 相同的密钥

保存后对最新部署点 **Retry deployment**（Pages 环境变量在下次部署生效）。

未设置 `RELAY_URL` 时一切照旧直连（功能开关，随时可回退）。

## 防休眠（推荐）

Render 免费实例 15 分钟无请求会休眠。在 cron-job.org 再加一个任务：

- 间隔 10 分钟，`GET https://xxxx.onrender.com/health`（只需 200，无参数）

## 本地测试

```bash
RELAY_SECRET=test123 PORT=8081 node server.js
# 另开终端：
curl http://127.0.0.1:8081/health
curl -X POST http://127.0.0.1:8081/fwd \
  -H 'x-relay-secret: test123' -H 'content-type: application/json' \
  -d '{"url":"https://apihub.agnes-ai.com/v1/models","method":"GET","headers":{}}'
# 期望 status=401 + {"error":{"message":"Invalid token..."}}（说明已到达 Agnes 源站）
```

## 安全约束

- 仅接受 `x-relay-secret` 与 `RELAY_SECRET` 完全一致的请求（403 否决）
- 仅转发到 `https://apihub.agnes-ai.com/*`（防开放代理滥用）
- 请求体上限 2MB、响应体上限 8MB；Agnes Key 由调用方随请求传入，中继不落盘

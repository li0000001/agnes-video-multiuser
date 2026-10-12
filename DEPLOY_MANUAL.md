# Agnes Video Multiuser - 手动部署教程（Cloudflare 网页控制台版）

本教程指导你**不使用命令行（Wrangler CLI）**，只通过网页操作完成 `agnes-video-multiuser` 项目的部署。

项目包含：Cloudflare Pages（前端 + Pages Functions 后端）、Cloudflare D1（数据库）、Cloudflare R2（视频存储）。

---

## 0. 重要：为什么不能用「直接上传」

Cloudflare 官方文档（[Pages Functions Get started](https://developers.cloudflare.com/pages/functions/get-started/)）明确说明：

> **Direct Upload from the Cloudflare dashboard is currently not supported with Functions.**
> （Cloudflare 仪表盘的「直接上传文件」目前**不支持** Pages Functions。）

本项目的后端（登录、创建任务、密钥池、视频播放、管理员后台、Cron 轮询）全部实现在 `functions/` 目录中。如果用「Upload assets / 直接上传」部署：

- 静态页面会被上传（但如果你传的是整个项目文件夹，根路径 `/` 会 404，因为首页在 `public/index.html`）
- **`functions/` 里的所有接口都不会生效**，全站功能瘫痪

因此，纯网页部署的正确方式是：**把项目推到 GitHub，再在 Cloudflare 用「Connect to Git（连接 Git）」部署**。Cloudflare 会自动识别仓库根目录的 `functions/` 并编译部署。

> 如果你之前用「Upload assets」创建过 `agnes-video-multiuser` 项目，请先在该项目页面 **Settings → Delete project** 删除它（或直接用新项目名重新走下面流程）。

---

## 1. 前提条件

- 一个 [Cloudflare](https://dash.cloudflare.com/) 账号（免费版即可满足使用需求）
- 一个 [GitHub](https://github.com/) 账号（用于网页上传代码，纯网页操作即可）
- 本地项目文件夹：`D:\work\Agents-cf\agnes-video-multiuser\`
- 本地安装有 Node.js（仅第 7 步生成加密密钥时用到一条命令）
- 一个有效的 Agnes API Key（测试生成时使用）

---

## 2. 步骤一：创建 R2 存储桶

R2 用于存储生成完成的视频文件，并配合 Presigned URL 实现按用户鉴权的在线播放。

1. 打开 [Cloudflare R2 控制台](https://dash.cloudflare.com/?to=/:account/r2)
2. 点击右上角 **「Create bucket（创建存储桶）」**
3. `Bucket name` 填入：`agnes-video-r2`
4. `Location` 保持默认
5. 点击 **「Create bucket（创建）」**

> 免费版 R2 有一定的存储和读取额度，个人使用一般够用。

---

## 3. 步骤二：创建 D1 数据库

D1 用于存储用户、密钥池、任务等所有数据。

1. 打开 [Cloudflare D1 控制台](https://dash.cloudflare.com/?to=/:account/workers/d1)
2. 点击 **「Create database（创建数据库）」**
3. `Database name` 填入：`agnes_video_db`
4. 点击 **「Create database（创建）」**
5. 创建完成后进入详情页，记下顶部的 **`Database ID`**（后面绑定时会用到）

---

## 4. 步骤三：导入数据库表结构（schema.sql）

把 `schema.sql` 里的所有表结构导入到 D1。

1. 回到 [D1 数据库列表](https://dash.cloudflare.com/?to=/:account/workers/d1)，点击 `agnes_video_db`
2. 切换到顶部 **「Console（控制台）」** 标签页
3. 打开本地文件 `D:\work\Agents-cf\agnes-video-multiuser\schema.sql`
4. **全选（Ctrl+A）复制（Ctrl+C）** 整个文件内容，粘贴到 SQL 输入框
5. 点击 **「Execute（执行）」**
6. 执行成功会显示 `OK` / 多条 `Executed`

验证（可选）：切换到 **「Explorer」** 标签，能看到 `users`、`sessions`、`api_keys`、`tasks`、`audit_logs` 这 5 张表。

---

## 5. 步骤四：把项目上传到 GitHub（网页操作）

这一步用 GitHub 网页界面上传整个项目，不需要 git 命令。

1. 登录 [GitHub](https://github.com/)，点击右上角 **「+」→ New repository（新建仓库）**
2. `Repository name` 填入：`agnes-video-multiuser`
3. 选择 **Private（私有）**（推荐，避免代码公开）
4. **不要**勾选 "Add a README file"（保持空仓库）
5. 点击 **「Create repository」**
6. 在新仓库页面点击 **「uploading an existing file（上传已有文件）」** 链接（或顶部 **Code → Add file → Upload files**）
7. 打开本地文件夹 `D:\work\Agents-cf\agnes-video-multiuser\`，把**文件夹的所有内容**拖拽到网页上传区域

   需要上传的顶层内容（直接是这些文件和文件夹，不要多包一层 `agnes-video-multiuser/` 目录）：

   ```text
   ├── functions/          ← 必须上传（后端接口）
   ├── public/             ← 必须上传（前端页面）
   ├── wrangler.jsonc
   ├── schema.sql
   ├── README.md
   └── DEPLOY_MANUAL.md
   ```

   > **关键检查**：上传完成后，仓库根目录下必须能直接看到 `functions` 和 `public` 两个文件夹。如果它们被包在 `agnes-video-multiuser/` 这一层里，说明多传了一级目录，需要调整。

8. 拖拽完成、文件列表确认无误后，点击 **「Commit changes（提交更改）」**

---

## 6. 步骤五：在 Cloudflare 用 Git 集成创建 Pages 项目

1. 打开 [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers)
2. 点击 **「Create（创建）」→「Pages」→「Connect to Git（连接 Git）」**
3. 首次使用会要求授权 GitHub：点击 **「Connect GitHub」**，按提示授权 Cloudflare 访问你的 GitHub 账号（可只授权刚创建的仓库）
4. 授权完成后，选择仓库：`agnes-video-multiuser`
5. 点击 **「Begin setup（开始设置）」**
6. `Project name` 确认为：`agnes-video-multiuser`（最终域名会是 `https://agnes-video-multiuser.pages.dev`）
7. **Build configuration（构建配置）** 关键三项：
   - `Framework preset（框架预设）`：**None**
   - `Build command（构建命令）`：**留空**（本项目无需构建）
   - `Build output directory（构建输出目录）`：填入 `public`
8. 其余选项保持默认，点击 **「Save and Deploy（保存并部署）」**
9. 等待 1～2 分钟，构建完成后点击部署记录，复制顶部显示的 **Pages 域名**，例如：
   ```text
   https://agnes-video-multiuser.pages.dev
   ```

> Cloudflare 会自动检测仓库根目录的 `functions/` 目录并编译为后端接口。这正是「直接上传」做不到、必须走 Git 集成的原因。

验证：浏览器访问该域名，应能打开「视频生成」首页（而不是 404）。此时接口还没配置绑定，会报错，属正常现象，继续往下走。

---

## 7. 步骤六：配置 Pages 环境变量（Secrets）

添加 `ENC_KEY` 加密密钥，用于加密存储在 D1 中的 Agnes API Key。

### 7.1 生成 ENC_KEY

本地打开终端（PowerShell 或 cmd），执行：

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

输出类似：

```text
a3f7e9028b43d620904f8532aa0e7764c92b58e430b9a43f920d782f66d821ab
```

**完整复制这串 64 个字符**，妥善保存。

### 7.2 添加 Secret 到 Pages

1. 进入 Pages 项目 `agnes-video-multiuser` → **「Settings（设置）」→「Environment variables（环境变量）」**
2. 点击 **「Add variables（添加变量）」→「Add secret（添加机密）」**
3. `Variable name` 填：`ENC_KEY`
4. `Value` 粘贴刚才生成的 64 位 HEX 字符
5. 点击 **「Save（保存）」**

> 路径若不同：Workers & Pages → 选择项目 → Settings → Environment variables。

---

## 8. 步骤七：绑定 D1 和 R2 到 Pages

1. Pages 项目 → **「Settings（设置）」→ 左侧「Bindings（绑定）」**
2. 点击 **「Add（添加）」→「D1 database」**
   - `Variable name` 填：`DB`（**必须与代码中 `env.DB` 一致**）
   - `D1 database` 选择：`agnes_video_db`
   - 保存
3. 再次点击 **「Add」→「R2 bucket」**
   - `Variable name` 填：`R2`（**必须与代码中 `env.R2` 一致**）
   - `R2 bucket` 选择：`agnes-video-r2`
   - 保存
4. 绑定保存后会自动触发重新部署，等待部署完成

---

## 9. 步骤八：设置第一个管理员账号

1. 打开你的 Pages 域名（如 `https://agnes-video-multiuser.pages.dev`）
2. 点击顶部 **「注册」**，用你的邮箱注册一个账号（密码至少 6 位）
3. 注册成功后**先不要登录**，回到 Cloudflare 控制台
4. 打开 [D1 Console](https://dash.cloudflare.com/?to=/:account/workers/d1)，进入 `agnes_video_db` → **「Console」** 标签
5. 粘贴以下命令（换成你刚注册的邮箱）：

```sql
UPDATE users SET role='admin' WHERE email='your@email.com';
```

6. 点击 **「Execute（执行）」**，显示 `1 row affected` 即成功
7. 回到网站用该账号登录，顶部导航会出现 **「管理员后台」**，说明管理员设置成功

---

## 10. 步骤九：配置外部 Cron（定时轮询）

本项目没有内置定时触发器（Pages 免费版无 Cron Triggers），需用免费第三方 Cron 定时调用轮询接口。

推荐 [cron-job.org](https://cron-job.org/zh)：

1. 打开并注册/登录
2. 点击 **「Cron 作业」→「创建 cron 作业」**
3. `标题`：`Agnes Video Poll`
4. `URL 地址`：
   ```text
   https://agnes-video-multiuser.pages.dev/api/cron/poll
   ```
5. `执行计划`：选 **每 2 分钟**（或 `*/2 * * * *`）
6. `HTTP 方法`：**GET**
7. 点击 **「创建 cron 作业」**，状态显示 `活动` 即生效

> 验证：点击作业旁的「执行一次」，应返回 `{"ok":true}`。

---

## 11. 步骤十：测试部署是否成功

### 11.1 登录注册

访问 Pages 域名 → 注册普通用户 → 正常登录进入首页。

### 11.2 添加 API Key

顶部 **「密钥池」** → 填写备注和 Agnes API Key → **「添加密钥」** → 列表出现脱敏密钥，状态 `active`。

### 11.3 创建视频任务（文生视频）

首页提示词填入：

```text
一条小金鱼在蓝色水族箱里缓慢游动，阳光透过水面形成柔和光斑，高清写实
```

时长 `5`、画幅 `16:9`、尺寸 `720P` → **「提交生成」** → 跳转「我的任务」。

状态变化：`pending` →（1～2 分钟后 Cron 轮询）`processing` → `done`。

### 11.4 在线播放

任务 `done` 后，点「播放」进入详情页，视频可播放、可拖动进度条；也可点「下载」获取 MP4。

### 11.5 管理员后台

管理员账号登录 → 顶部「管理员后台」→ 概览有统计数据 →「已生成视频管理」可播放、可删除视频文件。

全部通过即部署成功。

---

## 12. 排查：HTTP 404 问题

如果你在执行本教程前遇到过「找不到 agnes-video-multiuser.pages.dev 的网页 / HTTP ERROR 404」，原因与处理：

| 情况 | 现象 | 处理 |
|---|---|---|
| **用「Upload assets」直接上传了整个文件夹**（最常见，也是本次问题的原因） | 根路径 404；访问 `/public/index.html` 可能能看到页面 | 这种方式不支持 Functions，**必须**按本教程步骤五改用 Git 集成重新部署；建议先删除旧项目 |
| **上传时多包/少包了一层目录** | 首页 404，或文件结构不对 | 检查 GitHub 仓库根目录是否直接能看到 `functions/` 和 `public/`，`public/index.html` 是否存在 |
| **项目名与域名不符** | 打开的域名根本不是你的项目 | 到 Pages 项目 Deployments 页面查看实际的 Production 域名，以那里显示的为准 |
| **部署仍在进行/构建失败** | 404 或 Build failed | 到项目 Deployments 查看构建日志，确认 Build output directory 为 `public`、无构建报错 |
| **接口 404 但首页正常** | 页面能开，登录/任务接口 404 | 确认 `functions/` 已上传到仓库根目录，且走的是 Git 集成部署（而非直接上传） |

其他常见问题：

| 问题 | 解决方案 |
|---|---|
| **添加 Key 报错 `未配置 ENC_KEY`** | Settings → Environment variables，确认 `ENC_KEY` 以 **Secret（机密）** 形式添加 |
| **任务一直停在 `pending`** | 检查 cron-job.org 任务状态为「活动」，手动「执行一次」确认返回 `{"ok":true}` |
| **数据库表不存在** | 回到 D1 Console 重新粘贴完整 `schema.sql` 执行 |
| **绑定后接口报错** | 确认绑定变量名是 `DB` 和 `R2`（区分大小写），保存后等待自动重部署完成 |
| **注册后看不到「管理员后台」** | 执行步骤八的 UPDATE 后**重新登录**（会话中的角色不会自动刷新） |
| **视频播放链接打不开** | Presigned URL 有效期默认 900 秒，刷新任务详情页重新获取 |

---

## 13. 后续更新代码

代码更新时：

1. 修改本地文件
2. 到 GitHub 仓库页面 **Add file → Upload files**，拖入修改过的文件覆盖（或直接在网页编辑器 Edit）
3. 提交后，Cloudflare 会**自动重新构建部署**（通常 1 分钟内完成）

无需其他操作，D1 数据、R2 数据、Secrets、绑定都不会丢失。

---

## 14. 注意事项

- **ENC_KEY 请妥善保存**：丢失后已加密的 Agnes Key 无法解密，只能删除旧 Key 重新添加。
- **仓库建议保持 Private（私有）**：虽然 ENC_KEY 不在仓库里（在 Cloudflare Secrets 中），但代码和表结构不宜公开。
- **Cron 需保持活跃**：cron-job.org 免费作业长期有效。
- **视频存储清理**：管理员后台「仅删除视频文件」只删 R2 对象，任务记录保留，建议定期清理。
- **安全隔离**：播放/下载链接为短时 Presigned URL（15 分钟），强制校验用户归属，各用户数据完全隔离。
- **管理员账号**：只保留必要的管理员账号。

---

## 15. 备选：命令行快速部署（可选）

如果后续愿意用命令行，部署会简化很多，可作为 Git 集成之外的备选：

```powershell
# 在 D:\work\Agents-cf\agnes-video-multiuser 目录下执行
npx wrangler pages deploy ./public
```

Wrangler 会自动打包根目录的 `functions/`。Secrets 和绑定仍需在网页控制台配置（本教程步骤六、七不变）。

---

## 16. 部署完成

至此，整个项目已通过网页方式部署完成。你现在可以正常使用文生视频、图生视频、首尾帧等 Agnes 官方支持的所有生成方式了。

# 悠行 · 旅游行程规划

输入越少越好、输出越准越好的旅游行程规划应用。想好了去哪 → 帮你排行程；还没想好 → 帮你选地方、对比、再出行程。支持方案版本管理与并排对比。

- 产品文档：`docs/PRD.md`　数据契约：`docs/schema.md` / `docs/schema.json`
- 前端：纯静态（`index.html` / `styles.css` / `js/`），真实数据在 `data/`
- 生成：默认 **DeepSeek**（`deepseek-chat`，OpenAI 兼容），可切回 Claude；均经服务端安全代理调用

## 双运行模式

| 模式 | 何时 | 生成方式 |
| --- | --- | --- |
| **DEMO** | 纯静态打开（无 `/api`） | 本地规则引擎，离线可跑，零配置 |
| **生产（live）** | 部署到 Vercel（有 `/api/generate`） | AI 实时生成（默认 DeepSeek），经安全后端代理 |

前端启动时探测 `/api/generate`：可用走 live，否则自动回落 DEMO。

## 🔐 Key 安全（核心）

**API key 绝不进浏览器。** 任何下发到前端的 key 都能被用户在开发者工具里看到、盗用——所以本项目采用后端代理：

```
浏览器 → /api/generate（服务端持 key）→ DeepSeek / Claude
         key 只存 Vercel 环境变量，永不下发
```

端点三层防滥用（避免 key 被人刷爆额度）：

1. **访问码**：请求需带 `x-access-code`，与服务端 `ACCESS_CODE` 比对（timing-safe）。
2. **域名锁**：`Origin` 必须在 `ALLOWED_ORIGIN` 白名单内。
3. **IP 限流**：每 IP 每分钟上限 `RATE_LIMIT_PER_MIN`（默认 15）。

外加：请求体大小上限（200KB）、`freeText` ≤ 500 字、服务端输出 schema 校验、缺 key/访问码一律拒绝（安全默认）。

> 限流为进程内基线，适合中小流量。需要跨实例硬性限流时，把 `api/generate.js` 的 `RL` Map 换成 **Vercel KV / Upstash Redis** 的共享计数即可。

## 部署到 Vercel

1. 推送本仓库，在 Vercel **Import Project**（零配置，自动识别静态站点 + `api/` Serverless Function）。
2. 在 **Settings → Environment Variables** 配置（见 `.env.example`）：
   - `DEEPSEEK_API_KEY`（必填，机密；在 platform.deepseek.com 创建）
   - `ACCESS_CODE`（必填，分享给授权用户）
   - `ALLOWED_ORIGIN`（建议设为正式域名，如 `https://your-app.vercel.app`）
   - 可选：`LLM_PROVIDER`（默认 `deepseek`，改 `anthropic` 则改填 `ANTHROPIC_API_KEY`）、`LLM_MODEL`、`RATE_LIMIT_PER_MIN`
3. Deploy。打开站点，首次生成会提示输入访问码（存浏览器本地，不上传）。

## 本地开发

```bash
# 纯静态 DEMO（无需 key、无需后端）
python3 -m http.server 8099   # 打开 http://localhost:8099

# 带后端的 live 调试
npm i -g vercel && vercel dev  # 读取本地 .env，提供 /api/generate
```

## 安全须知

- `.env` / 真实 key 绝不入 git（仅提交 `.env.example`）。
- `config.js` 仅用于本地覆盖 `API_BASE`，**不含机密**。
- 多人共用同一访问码时，`ACCESS_CODE` 视同口令，注意分享范围；可定期轮换。

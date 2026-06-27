# CLAUDE.md — 项目记忆 / 结构化存档

> 本文件是 Claude Code 每次会话读取的持久记忆。记录"悠行"旅游行程规划应用的现状、架构与约定。
> **快照版本**：`290a987`（已上线可用）｜**线上地址**：https://happyforfun.vercel.app

---

## 1. 这是什么

"悠行（YouXing）"——旅游行程规划 Web 应用。核心理念：**输入越少越好、输出越准越好**。
- 想好了去哪 → 直接排详细行程；还没想好 → 帮你选地方、对比、再出行程。
- **当前状态**：已部署 Vercel 生产环境，接 **DeepSeek** 实时生成，端到端跑通 ✅。

## 2. 架构（双运行模式）

| 模式 | 触发 | 生成方式 |
| --- | --- | --- |
| **DEMO** | 纯静态打开（无 `/api`，如 `python -m http.server`） | 本地规则引擎 `js/generate.js`，离线零配置 |
| **生产 live** | 部署 Vercel（有 `/api/generate`） | 经安全后端代理调 DeepSeek/Claude |

前端启动 `Generator.probe()` 探测 `/api/generate`：通 → live；否则回落 DEMO。

```
浏览器(静态前端) → /api/generate(Vercel Serverless, 持 key) → DeepSeek / Claude
```

## 3. 文件地图

| 路径 | 作用 |
| --- | --- |
| `index.html` / `styles.css` | 纯静态前端结构与样式（零依赖、零构建） |
| `js/data.js` | 载入 `data/*.json`，文件缺失时用内联兜底数据 |
| `js/generate.js` | 分支判断 + **本地规则引擎(DEMO)** + 后端调用 + 访问码 + 轻量校验 |
| `js/app.js` | 交互/渲染 + **方案版本管理** + **焦点态(setFocus)** |
| `api/generate.js` | **安全后端代理**：供应商抽象 + 三层防滥用 + 输出 schema 校验 + 每分支输出 JSON 骨架 |
| `data/{japan,thailand,france}.json` | 目的地内容库（运营真实数据，每条带 source） |
| `data/holidays.json` | 中国+三国 2026 节假日（逐年维护） |
| `docs/PRD.md` | 产品需求文档（最权威；§12 生产与安全架构） |
| `docs/schema.md` / `docs/schema.json` | 数据契约（人读 / 机读） |
| `config.example.js` | 可选本地覆盖 `API_BASE`，**不含机密** |
| `.env.example` | 服务端环境变量模板（机密，绝不入 git） |
| `vercel.json` | Vercel 部署配置（函数 maxDuration、安全响应头） |

## 4. 产品逻辑（已锁定）

- **双向匹配 + 零必填 + 渐进式精确**：给时间→推地点；给地点→给最佳时间+各时段体验；都给→行程；都不给→兜底推荐。
- **输入端**（全可选）：出发地 / 节假日感知日期选择器 / 四粒度目的地(国家·区域·玩法·留空) / 快捷标签 / 一句话描述(优先级最高,≤500字) / 节奏 / 同行人。
- **输出端**（单屏渐进）：目的地推荐 →(多选)对比 → 最佳时间/各时段体验 → 详细行程(6 大模块：路线/按天/景点/美食/预约/季节)。
- **方案版本模型**：主按钮=更新当前版(一步撤销)；「＋生成新方案」=新版本标签；顶部版本 tab 切换；勾选 2-3 版本并排对比（支持同地不同时间）。
- **焦点态(UI 主次)**：以"大小/折叠"分主次 + 稳定外框。`input`/`output`(输入折叠成窄侧栏:＋与展开符号)/`edit`(展开+输出主灰弱化)/`compare`(只突出差异行)。
- **边界兜底 G1–G10**：详见 `docs/PRD.md` §0.1（空输入季节、freeText 定向推荐、候选不足、时机警示、AI 降级、输入校验、节假日缺年、共享 key、对比边界、注入防护）。

## 5. 安全模型（核心约束，勿破坏）

- **API key 绝不进前端**：只存 Vercel 环境变量，浏览器只调 `/api/generate`。提交前务必 `grep` 确认前端无 key。
- **端点三层防滥用**：①访问码 `x-access-code` vs `ACCESS_CODE`(timing-safe) ②域名锁 `ALLOWED_ORIGIN` ③IP 限流 `RATE_LIMIT_PER_MIN`(默认15)。
- 加固：体≤200KB、freeText≤500、输出 schema 校验+重试1次、缺 key/访问码→503(安全默认)。
- 限流是进程内基线；跨实例硬限流需换 Vercel KV/Upstash（`api/generate.js` 的 `RL` Map）。

## 6. 供应商切换（可插拔）

`api/generate.js` 的 `PROVIDERS` 抽象，由环境变量 `LLM_PROVIDER` 选择：
- **deepseek**（默认）：`DEEPSEEK_API_KEY`，OpenAI 兼容 `chat/completions` + `json_object` 模式，模型 `deepseek-chat`，temperature 0.4。
- **anthropic**：`ANTHROPIC_API_KEY`，模型 `claude-opus-4-8`。
- 关键：`buildPrompt` 为每个分支(trip/recommend/besttime/compare)附**精确 JSON 骨架**——这是让真实模型输出符合 schema 的关键（缺它会 502 schema 错误）。

## 7. 环境变量（Vercel Settings）

必填：`DEEPSEEK_API_KEY`(或切 anthropic 用 `ANTHROPIC_API_KEY`+`LLM_PROVIDER=anthropic`)、`ACCESS_CODE`。
可选：`ALLOWED_ORIGIN`(域名锁)、`LLM_MODEL`、`RATE_LIMIT_PER_MIN`。详见 `.env.example`。

## 8. 运行与测试

```bash
python3 -m http.server 8099          # DEMO 模式（无 key、无后端）
vercel dev                            # 带后端 live 调试（读本地 .env）
```
测试用 Playwright(playwright-core + /opt/pw-browsers/chromium) 驱动，脚本在 scratchpad（非仓库内、易失）。已验证套件：后端安全单测 11、live 路径 3、DEMO 核心 4 + 版本 9。**改后端/前端逻辑后应回归这些路径。**

## 9. 部署 / 分支

- 部署：Vercel 零配置（静态 + `api/`）。**生产分支 = `main`**；推 `main` 即自动重新部署。
- 开发分支：`claude/travel-planner-product-planning-b6plk1`。当前做法：在开发分支提交 → fast-forward 同步到 `main` 触发部署。

## 10. 约定

- 纯静态、**零运行时依赖**、零构建；`package.json` 仅测试用且已 gitignore。
- 机密绝不入库：`.env` / `config.js` 已 gitignore；只提交 `.env.example`。
- 所有内容数据带 `source`，禁止编造。
- 提交信息结尾带 Co-Authored-By 与 Claude-Session 行。
- 文案不要写死具体供应商名（用"AI"），供应商可切换。

## 11. 已知限制 / 待办（优化方向）

- 数据仅日/泰/法各 1 个 hero 城市、各 5 景点（P4：扩城市/国家/数据丰富度）。
- 限流为进程内基线（多实例需 KV）。
- 节假日数据 2026 单年，需每年更新。
- v2 预留维度：主题 `themes` / 预算 `budget`（Schema 已留字段，前端未渲染）。
- 之前砍掉的"景点视频推荐(B站/YouTube)"功能可再议。

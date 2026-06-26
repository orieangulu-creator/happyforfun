# 行程数据结构说明（Schema）

> 配套机器可读版本：`docs/schema.json`（JSON Schema Draft 2020-12）
> 本文档用带注释的示例解释两类数据结构，供运营 / AI生成 / UI / 测试 各 agent 对齐。

共有两类核心结构：

1. **目的地内容库 `DestinationLibrary`** —— 运营 agent 填真实数据用。
2. **生成行程结果 `TripResult`** —— 用户提交需求后展示给用户的最终行程。

公共约定：

- 所有内容条目都带 `source` 字段（信息来源），不得编造。
- 枚举取值见 PRD 第 10 节。
- 标注 `(v2)` 的字段：v1 可选/留空，前端不渲染、AI 不读取，仅为未来预留。

---

## 1. 目的地内容库 `DestinationLibrary`

运营 agent 为每个国家产出一份此结构的 JSON。v1 必交：`japan` / `thailand` / `france`。

### 1.1 带注释示例

```jsonc
{
  "country": "japan",                 // 枚举: japan | thailand | france (v1)
  "countryNameZh": "日本",            // 中文展示名
  "updatedAt": "2026-06-26",          // 数据更新日期 (YYYY-MM-DD)

  "attractions": [                    // 景点列表
    {
      "id": "jp-fushimi-inari",       // 唯一标识 (国家前缀-名称)
      "name": "伏见稻荷大社",         // 景点名
      "region": "京都",              // 所在城市/区域
      "summary": "千本鸟居，神社代表景点。", // 简介
      "suggestedDurationMin": 90,     // 建议游玩时长(分钟)
      "tags": ["history", "photography"], // (v2 主题对齐, v1 可选) 主题标签
      "source": "https://example.com/fushimi" // 信息来源 (必填)
    }
  ],

  "foods": [                          // 美食列表
    {
      "id": "jp-ramen",
      "name": "一兰拉面",
      "type": "ramen",                // 美食类型 (自由文本: ramen/sushi/...)
      "region": "全国",
      "reason": "经典连锁，口味稳定。", // 推荐理由
      "tags": ["food"],               // (v2 对齐, 可选)
      "source": "https://example.com/ichiran"
    }
  ],

  "reservations": [                   // 需提前预约的项目
    {
      "id": "jp-teamlab",
      "name": "teamLab Planets 数字美术馆",
      "region": "东京",
      "method": "官网在线购票",        // 预约方式
      "leadTime": "建议提前1-2周",     // 建议提前时长
      "note": "热门时段易售罄。",       // 备注 (可选)
      "source": "https://example.com/teamlab"
    }
  ],

  "seasonalTips": [                   // 季节建议 (建议覆盖四季)
    {
      "season": "spring",            // 枚举: spring|summer|autumn|winter
      "tip": "3-4月樱花季，建议带薄外套，赏樱景点需早到。",
      "source": "https://example.com/japan-spring"
    }
  ],

  "budgetNotes": null                 // (v2) 预算相关备注, v1 留空
}
```

### 1.2 字段速查

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `country` | enum | 是 | `japan`/`thailand`/`france` |
| `countryNameZh` | string | 是 | 中文名 |
| `updatedAt` | string(date) | 是 | 更新日期 |
| `attractions[]` | array | 是 | 景点，每条带 `source` |
| `foods[]` | array | 是 | 美食，每条带 `source` |
| `reservations[]` | array | 是 | 需预约项，每条带 `source` |
| `seasonalTips[]` | array | 是 | 季节建议，每条带 `source`，建议覆盖四季 |
| `*.tags` | string[] | 否 (v2) | 主题标签，对齐 v2 主题维度 |
| `budgetNotes` | string\|null | 否 (v2) | 预算备注 |

---

## 2. 生成行程结果 `TripResult`

用户提交需求后，AI 生成 agent 输出此结构（纯 JSON，无多余文字），UI 据此渲染结果区 6 大模块。

### 2.1 带注释示例

```jsonc
{
  "meta": {                           // 本次行程的输入回显与元信息
    "origin": "上海",
    "destinationCountry": "japan",
    "destinationNameZh": "日本",
    "days": 5,
    "season": "spring",
    "pace": "intense",               // 节奏: intense|balanced|relaxed
    "companion": "friends",          // 同行人: solo|couple|family_kids|elderly|friends
    "customNote": "想多体验当地小吃", // 用户自由文字 (可空)
    "themes": [],                    // (v2) 主题, v1 空数组
    "budget": null,                  // (v2) 预算, v1 null
    "generatedBy": "claude-opus-4-8",
    "generatedAt": "2026-06-26T10:00:00Z"
  },

  // 模块1: 最佳出行路线
  "route": {
    "summary": "上海 → 大阪，飞行约2.5小时，关西机场入境。",
    "segments": [                     // 路线分段
      {
        "mode": "flight",            // 交通方式: flight/train/bus/...
        "from": "上海浦东",
        "to": "大阪关西",
        "detail": "直飞约2.5小时，建议早班机。",
        "source": "https://example.com/route"
      }
    ],
    "tips": "关西机场到市区可乘 HARUKA 特急。",
    "source": "https://example.com/route-overview"
  },

  // 模块2: 按天行程安排 (体现节奏强度: intense 活动多, relaxed 活动少)
  "dailyPlan": [
    {
      "day": 1,                       // 第几天 (1-based)
      "title": "抵达大阪 · 道顿堀美食巡礼",
      "intensity": "intense",         // 当天密度标记, 对齐顶层 pace
      "activities": [                 // 模块3 景点/活动 (内联在每日)
        {
          "id": "jp-dotonbori",       // 若来自内容库则复用其 id
          "name": "道顿堀",
          "timeSlot": "傍晚",          // 时间段 (上午/下午/傍晚/晚上 等)
          "durationMin": 120,
          "summary": "大阪地标商业街。",
          "source": "https://example.com/dotonbori"
        }
      ],
      "meals": [                      // 模块4 美食 (内联在每日)
        {
          "id": "jp-takoyaki",
          "name": "章鱼烧",
          "slot": "dinner",           // breakfast|lunch|dinner|snack
          "reason": "大阪必吃小吃。",
          "source": "https://example.com/takoyaki"
        }
      ],
      "reservationRefs": ["jp-teamlab"], // 当天涉及的预约项 id, 详情见顶层 reservations
      "notes": "晚上逛街，节奏紧凑。"     // 当天备注 (可选)
    }
  ],

  // 模块5: 需提前预约项目 (整个行程汇总)
  "reservations": [
    {
      "id": "jp-teamlab",
      "name": "teamLab Planets",
      "day": 2,                       // 关联第几天 (可选)
      "method": "官网在线购票",
      "leadTime": "提前1-2周",
      "source": "https://example.com/teamlab"
    }
  ],

  // 模块6: 季节相关建议
  "seasonalTips": [
    {
      "season": "spring",
      "tip": "樱花季，带薄外套，赏樱早到。",
      "source": "https://example.com/japan-spring"
    }
  ],

  "warnings": []                      // 生成提示/注意事项 (可选, 如素材不足说明)
}
```

### 2.2 字段速查

| 字段 | 类型 | 必填 | 对应模块 / 说明 |
| --- | --- | --- | --- |
| `meta` | object | 是 | 输入回显 + 元信息 |
| `meta.pace` | enum | 是 | 节奏强度 |
| `meta.companion` | enum | 是 | 同行人结构 |
| `meta.themes` | string[] | 否 (v2) | v1 空数组 |
| `meta.budget` | enum\|null | 否 (v2) | v1 null |
| `route` | object | 是 | 模块1 路线，含 `source` |
| `dailyPlan[]` | array | 是 | 模块2 按天，长度=`days` |
| `dailyPlan[].intensity` | enum | 是 | 当天密度，渲染节奏差异 |
| `dailyPlan[].activities[]` | array | 是 | 模块3 景点，每条带 `source` |
| `dailyPlan[].meals[]` | array | 是 | 模块4 美食，每条带 `source` |
| `reservations[]` | array | 是 | 模块5 预约，每条带 `source` |
| `seasonalTips[]` | array | 是 | 模块6 季节建议，每条带 `source` |
| `warnings[]` | string[] | 否 | 生成提示 |

### 2.3 节奏强度与活动密度对照

| `pace` / `intensity` | 每日 `activities` 建议数量 |
| --- | --- |
| `intense`（特种兵） | 4–6 项 |
| `balanced`（均衡） | 2–4 项 |
| `relaxed`（悠闲） | 1–2 项，含留白 |

---

## 3. 数据契约要点（汇总）

- 每条内容（景点/美食/预约/季节/路线分段）**必须有 `source`**。
- AI 生成应优先复用内容库条目并透传其 `source`；库外补充也必须给出真实 `source`，禁止编造。
- `dailyPlan` 长度应等于 `meta.days`。
- v2 字段（`themes`/`budget`/`tags`/`budgetNotes`）v1 保持空/默认，不影响功能。

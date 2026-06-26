# 行程数据结构说明（Schema · v2）

> 文档版本：v2.0（双向匹配版）
> 配套机器可读版本：`docs/schema.json`（JSON Schema Draft 2020-12，本文与之严格一致）
> 本文用带注释示例 + 字段速查解释全部数据结构，供运营 / AI生成 / UI / 测试 各 agent 对齐。

## v2 核心原则（数据契约的灵魂）

- **双向匹配**：用户固定哪一头，系统补全另一头。给时间→补地点；给地点→补最佳时间与各时段体验；都给→出详细行程；都不给→兜底推荐。
- **输入模糊 / 输出精确**：`UserInput` 全部字段可选（零必填），输出端（推荐/对比/行程）补全精确性。
- **渐进式精确**：一屏内分阶段陆续展示 `推荐 →(多选)对比 → 最佳时间/各时段体验 → 详细行程`。
- **自由文字优先级最高**：`UserInput.freeText` 可覆盖任何其他字段。

## 结构总览

| 结构 | 用途 | 谁产出 |
| --- | --- | --- |
| `UserInput` | 用户查询输入模型（全可选，体现双向） | UI 收集 |
| `DestinationLibrary` | 目的地内容库（含 v2 新字段） | 运营 |
| `HolidayCalendar` | 逐年节假日数据集（**需每年更新**） | 运营 |
| `DestinationRecommendation` | 目的地候选推荐结果 | AI 生成 |
| `DestinationComparison` | 对比视图（含差异高亮） | AI 生成 |
| `BestTimeOverview` | 最佳时间 + 各时段体验（行程前的过渡阶段） | AI 生成 / 内容库直出 |
| `TripResult` | 详细行程（6 大模块 + 天数弹性） | AI 生成 |

公共约定：

- 所有内容条目都带 `source`（信息来源），不得编造。
- 枚举取值见 PRD「术语与枚举一览」。
- 标注 `(v2 预留)` 的字段：v1 可选/留空，前端不渲染、AI 不读取，仅为未来预留。
- `moodTag`（快捷标签/玩法标签）是“自由文字的一键填充”，不是结构化维度；在 `UserInput` 与 `DestinationLibrary` 中用**同一套取值**以实现玩法型模糊匹配。建议值：`relax`（想放松）/ `explore`（想玩透）/ `food`（想吃好吃的）/ `scenery`（想看风景）/ `island`（海岛）/ `snow`（雪山）/ `hotspring`（温泉）/ `slow`（慢城）/ `culture`（文化）/ `shopping`（购物），可扩展。

---

## 1. 用户输入 `UserInput`（全部可选）

UI 收集用户查询。**零必填**：任何字段都可不填，系统据已有信息走对应分支。

### 1.1 带注释示例

```jsonc
{
  // 出发地: 可选, 记忆上次。影响出发地节假日高亮与交通估算。
  "origin": "上海",

  // 时间 = 节假日感知日期选择器结果。可选; 留空走兜底推荐。
  "dateRange": {
    "start": "2026-10-01",            // 开始日期 (可只给 days)
    "end": "2026-10-07",              // 结束日期
    "days": 7,                        // 天数, 由 start/end 推导
    "anchoredHolidayId": "cn-2026-national-day" // 若一键选中某段法定假期则记录
  },

  // 目的地: 可选, 四种粒度
  "destination": {
    "granularity": "playstyle",       // country | region | playstyle | none
    "country": null,                  // granularity=country 时填 (japan/thailand/france)
    "regionText": "",                 // granularity=region 时填, 如 东南亚 / 欧洲
    "playstyleTags": ["island", "hotspring"] // granularity=playstyle 时填模糊玩法
  },

  // 快捷标签(心情/目的): 自由文字的一键填充, 喂给推荐引擎。可空。
  "moodTags": ["relax", "food"],

  // 一句话自由描述: 主入口, 优先级最高, 可覆盖任何其他字段。可空。
  "freeText": "想找个海边发呆几天, 带爸妈别太累",

  // 节奏: 可选; 不选→balanced (moodTags 含 relax 则默认 relaxed)
  "pace": null,

  // 同行人: 可选; 不选→通用
  "companion": "elderly",

  "themes": [],                        // (v2 预留) v1 不传入
  "budget": null                       // (v2 预留) v1 不传入
}
```

> 双向匹配速记：
> - 只给 `dateRange` → 走 `DestinationRecommendation`（按时间+标签推荐地点）。
> - 只给 `destination`（country）→ 走 `BestTimeOverview`，再 `TripResult`。
> - 同时给 `dateRange` + `destination`(country) → 直接 `TripResult`。
> - 都不给 → `DestinationRecommendation` 且 `isFallback=true`（当前季节适合放松的热门地）。

### 1.2 字段速查

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `origin` | string | 否 | 出发地，记忆上次 |
| `dateRange` | object | 否 | 时间+天数一次确定；可整体留空 |
| `dateRange.anchoredHolidayId` | string | 否 | 关联所选法定假期 id |
| `destination.granularity` | enum | 否 | `country`/`region`/`playstyle`/`none` |
| `destination.country` | enum\|null | 否 | 精确国家时填 |
| `destination.regionText` | string | 否 | 模糊地理区域文本 |
| `destination.playstyleTags` | moodTag[] | 否 | 模糊玩法 |
| `moodTags` | moodTag[] | 否 | 快捷标签 |
| `freeText` | string | 否 | 一句话描述，**优先级最高** |
| `pace` | enum\|null | 否 | 不选默认 balanced |
| `companion` | enum\|null | 否 | 不选走通用 |
| `themes` | theme[] | 否 (v2) | v1 不传入 |
| `budget` | enum\|null | 否 (v2) | v1 不传入 |

---

## 2. 目的地内容库 `DestinationLibrary`

运营 agent 为每个国家产出一份。v1 必交：`japan` / `thailand` / `france`。**每条内容强制带 `source`**。v2 新增 4 个字段支持双向匹配与推荐：`bestSeasons` / `moodTags` / `idealDuration` / `signatureExperiencesByPeriod`。

### 2.1 带注释示例

```jsonc
{
  "country": "japan",
  "countryNameZh": "日本",
  "updatedAt": "2026-06-26",

  // [v2 新增] 最佳季节 (双向匹配: 给地点→给最佳时间)
  "bestSeasons": [
    { "season": "spring", "reason": "3-4月樱花季, 全国赏樱。", "source": "https://example.com/jp-spring" },
    { "season": "autumn", "reason": "11月红叶, 京都最盛。", "source": "https://example.com/jp-autumn" }
  ],

  // [v2 新增] 适合的心情/玩法标签 (玩法型模糊匹配的桥梁, 与 UserInput 同一套取值)
  "moodTags": ["culture", "food", "hotspring", "scenery", "shopping"],

  // [v2 新增] 黄金时长 (天)
  "idealDuration": {
    "minDays": 5, "maxDays": 8,
    "note": "5天玩透单一区域(如关西), 8天可关东+关西。",
    "source": "https://example.com/jp-duration"
  },

  // [v2 新增] 各时段核心体验 (双向匹配: 给地点→给各时段核心体验)
  "signatureExperiencesByPeriod": [
    { "period": "spring", "season": "spring", "experiences": ["赏樱", "夜樱点灯"], "source": "https://example.com/jp-sakura" },
    { "period": "7-8月",  "season": "summer", "experiences": ["夏日祭典", "花火大会"], "source": "https://example.com/jp-natsu" },
    { "period": "autumn", "season": "autumn", "experiences": ["红叶狩", "京都枫景"], "source": "https://example.com/jp-momiji" },
    { "period": "winter", "season": "winter", "experiences": ["雪景温泉", "滑雪"], "source": "https://example.com/jp-onsen" }
  ],

  "attractions": [
    {
      "id": "jp-fushimi-inari",
      "name": "伏见稻荷大社",
      "region": "京都",
      "summary": "千本鸟居, 神社代表景点。",
      "suggestedDurationMin": 90,
      "moodTags": ["culture", "scenery"], // (可选) 助力匹配
      "tags": ["history", "photography"],  // (v2 预留) 主题标签
      "source": "https://example.com/fushimi"
    }
  ],

  "foods": [
    { "id": "jp-ramen", "name": "一兰拉面", "type": "ramen", "region": "全国",
      "reason": "经典连锁, 口味稳定。", "tags": ["food"], "source": "https://example.com/ichiran" }
  ],

  "reservations": [
    { "id": "jp-teamlab", "name": "teamLab Planets 数字美术馆", "region": "东京",
      "method": "官网在线购票", "leadTime": "建议提前1-2周", "note": "热门时段易售罄。",
      "source": "https://example.com/teamlab" }
  ],

  "seasonalTips": [
    { "season": "spring", "tip": "3-4月樱花季, 带薄外套, 赏樱景点需早到。", "source": "https://example.com/japan-spring" }
  ],

  "budgetNotes": null                  // (v2 预留) v1 留空
}
```

### 2.2 字段速查

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `country` / `countryNameZh` / `updatedAt` | - | 是 | 基本信息 |
| `bestSeasons[]` | array | 是 (v2新增) | 最佳季节，每条带 `source` |
| `moodTags` | moodTag[] | 是 (v2新增) | 适合的玩法/心情标签 |
| `idealDuration` | object | 是 (v2新增) | `minDays`/`maxDays`/`source` |
| `signatureExperiencesByPeriod[]` | array | 是 (v2新增) | 各时段核心体验，每条带 `source` |
| `attractions[]` | array | 是 | 景点，每条带 `source`；可选 `moodTags` |
| `foods[]` | array | 是 | 美食，每条带 `source` |
| `reservations[]` | array | 是 | 需预约项，每条带 `source` |
| `seasonalTips[]` | array | 是 | 季节建议，每条带 `source` |
| `*.tags` / `budgetNotes` | - | 否 (v2) | 主题标签 / 预算备注，留空 |

---

## 3. 节假日数据集 `HolidayCalendar`（⚠️ 需每年更新）

> **重要：这是逐年维护的数据。** 各国法定节假日与中国调休安排由政府逐年公布，运营须**每年滚动更新**本数据集。每个 `(region, year)` 一份。覆盖年份：2026（如已公布则含 2027）。地区：中国 `china`（出发地常驻高亮）+ 日本 `japan` / 泰国 `thailand` / 法国 `france`（目的地条件高亮）。每条带 `source`。

### 3.1 带注释示例（中国 · 2026）

```jsonc
{
  "region": "china",                  // china | japan | thailand | france
  "year": 2026,                       // 逐年维护
  "lastReviewed": "2026-06-26",       // 本年度数据最近核对日期
  "holidays": [
    {
      "id": "cn-2026-national-day",
      "nameZh": "国庆节",
      "start": "2026-10-01",          // 含调休后实际放假首日
      "end": "2026-10-07",
      "type": "statutory_holiday",    // statutory_holiday | festival | both
      "makeupWorkdays": ["2026-09-27", "2026-10-10"], // 调休补班日 (china)
      "bridgeHint": "请2天年假(10/8-10/9)可与周末连成更长假期。", // 拼假/调休提示
      "source": "https://www.gov.cn/example-2026"
    }
  ]
}
```

### 3.2 带注释示例（目的地 · 日本 2026）

```jsonc
{
  "region": "japan",
  "year": 2026,
  "lastReviewed": "2026-06-26",
  "holidays": [
    {
      "id": "jp-2026-golden-week",
      "nameZh": "黄金周",
      "nameLocal": "ゴールデンウィーク",
      "start": "2026-04-29",
      "end": "2026-05-06",
      "type": "both",                 // 既是法定放假, 也有节庆氛围
      "destinationImpact": {          // 目的地侧双向提示
        "highlight": "both",          // festival | closure_crowd_price | both
        "note": "🎉各地祭典活动多; ⚠️景点人多、酒店涨价、部分设施调整开放。"
      },
      "source": "https://example.com/jp-gw-2026"
    }
  ]
}
```

### 3.3 字段速查

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `region` | enum | 是 | `china`/`japan`/`thailand`/`france` |
| `year` | int | 是 | 年份，**逐年维护** |
| `lastReviewed` | date | 否 | 最近核对日期 |
| `holidays[].id` | string | 是 | 唯一标识 |
| `holidays[].nameZh` | string | 是 | 中文名 |
| `holidays[].start` / `end` | date | 是 | 假期起止（含调休后实际放假） |
| `holidays[].type` | enum | 否 | `statutory_holiday`/`festival`/`both` |
| `holidays[].makeupWorkdays[]` | date[] | 否 | 调休补班日（主要 china） |
| `holidays[].bridgeHint` | string | 否 | 拼假/调休提示（主要 china 出发地） |
| `holidays[].destinationImpact` | object | 否 | 目的地双向提示 🎉/⚠️ |
| `holidays[].source` | string | 是 | 来源 |

---

## 4. 目的地推荐 `DestinationRecommendation`

目的地未定/模糊时输出 3–5 个候选；时间与目的地都未给时 `isFallback=true`（推荐当前季节适合放松的热门地）。

### 4.1 带注释示例

```jsonc
{
  "isFallback": false,                // true=兜底推荐
  "basis": "基于你选的国庆7天假期 + 想放松/想吃标签",
  "candidates": [                     // 3-5 个
    {
      "id": "japan",
      "nameZh": "日本",
      "country": "japan",             // 对应内容库国家则填, 否则 null
      "matchReason": "10月秋高气爽, 红叶初现; 美食丰富契合“想吃”。",
      "bestVisitTime": "10月下旬-11月(红叶季)",
      "suggestedDays": 6,
      "costTier": "high",             // low | medium | high
      "transport": {
        "origin": "上海", "destinationNameZh": "日本(大阪)",
        "directFlight": true, "flightHours": 2.5,
        "note": "直飞约2.5小时。", "source": "https://example.com/route"
      },
      "moodTags": ["food", "culture", "scenery"],
      "source": "https://example.com/jp-oct"
    }
  ]
}
```

### 4.2 字段速查

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `isFallback` | boolean | 是 | 是否兜底推荐 |
| `basis` | string | 否 | 推荐依据摘要 |
| `candidates[]` | array(1-5) | 是 | 候选列表 |
| `candidates[].matchReason` | string | 是 | 匹配理由（贴合时间/标签） |
| `candidates[].bestVisitTime` | string | 是 | 最佳到访时间 |
| `candidates[].suggestedDays` | int | 是 | 建议天数 |
| `candidates[].costTier` | enum | 是 | 大致花费档 |
| `candidates[].transport` | object\|null | 否 | 从出发地交通（origin 已知时给） |

---

## 5. 对比视图 `DestinationComparison`

用户从推荐里多选 2–3 个还在纠结的候选，并排呈现 + 高亮差异 + 决策摘要。对比维度：与所选时间契合度（结合当地节假日）/ 建议天数 vs 假期 / 花费档 / 累不累 / 特色侧重 / 出发地交通。

### 5.1 带注释示例

```jsonc
{
  "items": [                          // 2-3 个
    {
      "id": "japan", "nameZh": "日本",
      "cells": {
        "timeFit": "国庆契合好, 但叠加日本无大假, 人潮主要来自国内游客。",
        "daysVsHoliday": "建议6天, 7天假期刚好且留1天缓冲。",
        "costTier": "高",
        "fatigue": "均衡, 城市间移动适中。",
        "highlights": "美食 + 文化古都 + 初秋红叶。",
        "transport": "上海直飞2.5h。"
      }
    },
    {
      "id": "thailand", "nameZh": "泰国",
      "cells": {
        "timeFit": "10月泰国仍属雨季尾声, 偶有阵雨。",
        "daysVsHoliday": "建议5天, 7天假期宽松。",
        "costTier": "中",
        "fatigue": "悠闲, 海岛节奏慢。",
        "highlights": "海岛 + 按摩 + 泰餐。",
        "transport": "上海直飞约4.5h。"
      }
    }
  ],
  "dimensions": [                     // 维度定义 + 差异高亮
    { "key": "timeFit",       "labelZh": "与所选时间契合度", "highlightDiff": true },
    { "key": "daysVsHoliday", "labelZh": "建议天数 vs 假期", "highlightDiff": false },
    { "key": "costTier",      "labelZh": "花费档",          "highlightDiff": true },
    { "key": "fatigue",       "labelZh": "累不累(节奏)",     "highlightDiff": true },
    { "key": "highlights",    "labelZh": "特色侧重",         "highlightDiff": true },
    { "key": "transport",     "labelZh": "出发地交通",       "highlightDiff": false }
  ],
  "decisionSummary": "想吃想看古都选日本(花费高些); 想纯放松发呆选泰国(更省更慢, 但10月有阵雨)。"
}
```

### 5.2 字段速查

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `items[]` | array(2-3) | 是 | 参与对比的候选 |
| `items[].cells` | object | 是 | 各维度取值，key 取自 `dimensions[].key` |
| `dimensions[]` | array | 是 | 维度定义 |
| `dimensions[].key` | enum | 是 | `timeFit`/`daysVsHoliday`/`costTier`/`fatigue`/`highlights`/`transport` |
| `dimensions[].highlightDiff` | boolean | 是 | 该维度差异是否高亮 |
| `decisionSummary` | string | 否 | “为什么选 A 不选 B” |

---

## 6. 最佳时间概览 `BestTimeOverview`

目的地已定时，详细行程**之前**先展示：【最佳旅游时间 + 各时段核心体验】。内容主要来自该国 `DestinationLibrary` 的 `bestSeasons` 与 `signatureExperiencesByPeriod`。

### 6.1 带注释示例

```jsonc
{
  "destinationNameZh": "日本",
  "country": "japan",
  "bestSeasons": [
    { "season": "spring", "reason": "樱花季, 全国赏樱。", "source": "https://example.com/jp-spring" },
    { "season": "autumn", "reason": "红叶季, 京都最盛。", "source": "https://example.com/jp-autumn" }
  ],
  "periods": [
    { "period": "spring", "experiences": ["赏樱", "夜樱点灯"], "source": "https://example.com/jp-sakura" },
    { "period": "summer", "experiences": ["夏日祭典", "花火大会"], "source": "https://example.com/jp-natsu" },
    { "period": "autumn", "experiences": ["红叶狩"], "source": "https://example.com/jp-momiji" },
    { "period": "winter", "experiences": ["雪景温泉", "滑雪"], "source": "https://example.com/jp-onsen" }
  ]
}
```

---

## 7. 详细行程 `TripResult`

AI 生成 agent 输出（纯 JSON，无多余文字），UI 据此渲染固定 **6 大模块**。v2 新增：每日 `dayType`（核心天/可选延展天）+ 顶层 `flexibility`（天数弹性汇总），便于按实际假期裁剪。

### 7.1 带注释示例

```jsonc
{
  "meta": {
    "origin": "上海",                 // 可空
    "destinationCountry": "japan",
    "destinationNameZh": "日本",
    "days": 5,
    "dateRange": { "start": "2026-10-01", "end": "2026-10-05", "days": 5 }, // 可空
    "season": "autumn",              // 可空(由 dateRange 推导)
    "pace": "balanced",              // 未给时取默认 balanced
    "companion": "friends",          // 可空→通用
    "moodTags": ["food", "culture"],
    "freeText": "想多体验当地小吃",   // 可空
    "themes": [],                    // (v2 预留) v1 空数组
    "budget": null,                  // (v2 预留) v1 null
    "generatedBy": "claude-opus-4-8",
    "generatedAt": "2026-06-26T10:00:00Z"
  },

  // 模块1: 最佳出行路线
  "route": {
    "summary": "上海 → 大阪, 飞行约2.5小时, 关西机场入境。",
    "segments": [
      { "mode": "flight", "from": "上海浦东", "to": "大阪关西",
        "detail": "直飞约2.5小时, 建议早班机。", "source": "https://example.com/route" }
    ],
    "tips": "关西机场到市区可乘 HARUKA 特急。",
    "source": "https://example.com/route-overview"
  },

  // 模块2: 按天安排 (含节奏 intensity + 天数弹性 dayType)
  "dailyPlan": [
    {
      "day": 1,
      "title": "抵达大阪 · 道顿堀美食巡礼",
      "intensity": "balanced",       // 当天密度, 对齐顶层 pace
      "dayType": "core",             // core=核心天 | optional=可选延展天
      "activities": [                // 模块3 景点
        { "id": "jp-dotonbori", "name": "道顿堀", "timeSlot": "傍晚", "durationMin": 120,
          "summary": "大阪地标商业街。", "source": "https://example.com/dotonbori" }
      ],
      "meals": [                     // 模块4 美食
        { "id": "jp-takoyaki", "name": "章鱼烧", "slot": "dinner",
          "reason": "大阪必吃小吃。", "source": "https://example.com/takoyaki" }
      ],
      "reservationRefs": ["jp-teamlab"], // 当天预约项 id
      "notes": "晚上逛街。"
    },
    {
      "day": 5, "title": "奈良延展 · 喂鹿一日游",
      "intensity": "relaxed", "dayType": "optional", // 假期短可砍掉这天
      "activities": [
        { "name": "奈良公园", "timeSlot": "上午", "summary": "近距离喂鹿。",
          "source": "https://example.com/nara" }
      ],
      "meals": []
    }
  ],

  // 模块5: 需提前预约项目 (整程汇总)
  "reservations": [
    { "id": "jp-teamlab", "name": "teamLab Planets", "day": 2,
      "method": "官网在线购票", "leadTime": "提前1-2周", "source": "https://example.com/teamlab" }
  ],

  // 模块6: 季节相关建议
  "seasonalTips": [
    { "season": "autumn", "tip": "10月渐凉, 带薄外套。", "source": "https://example.com/japan-autumn" }
  ],

  // [v2 新增] 天数弹性汇总
  "flexibility": {
    "coreDays": 4,                   // 核心天 (假期短也保留)
    "optionalDays": 1,               // 可选延展天
    "note": "假期只有4天可去掉第5天的奈良延展。"
  },

  "warnings": []                     // 生成提示 (可选, 如目的地放假闭馆提醒)
}
```

### 7.2 字段速查

| 字段 | 类型 | 必填 | 对应模块 / 说明 |
| --- | --- | --- | --- |
| `meta` | object | 是 | 输入回显 + 元信息 |
| `meta.pace` | enum | 是 | 节奏（未给取默认 balanced） |
| `meta.companion` | enum\|null | 否 | 同行人，可空 |
| `meta.dateRange` / `season` / `origin` | - | 否 | 可空 |
| `meta.themes` / `budget` | - | 否 (v2) | v1 空 |
| `route` | object | 是 | 模块1 路线，含 `source` |
| `dailyPlan[]` | array | 是 | 模块2 按天 |
| `dailyPlan[].intensity` | enum | 是 | 当天密度 |
| `dailyPlan[].dayType` | enum | 是 (v2新增) | `core`/`optional` 天数弹性 |
| `dailyPlan[].activities[]` | array | 是 | 模块3 景点，每条带 `source` |
| `dailyPlan[].meals[]` | array | 是 | 模块4 美食，每条带 `source` |
| `reservations[]` | array | 是 | 模块5 预约，每条带 `source` |
| `seasonalTips[]` | array | 是 | 模块6 季节建议，每条带 `source` |
| `flexibility` | object | 否 (v2新增) | 天数弹性汇总 |
| `warnings[]` | string[] | 否 | 生成提示 |

### 7.3 节奏强度与活动密度对照

| `pace` / `intensity` | 每日 `activities` 建议数量 |
| --- | --- |
| `intense`（特种兵） | 4–6 项 |
| `balanced`（均衡，默认） | 2–4 项 |
| `relaxed`（悠闲） | 1–2 项，含留白 |

---

## 8. 数据契约要点（汇总）

- 每条内容（景点/美食/预约/季节/路线分段/最佳季节/各时段体验/节假日）**必须有 `source`**，禁止编造。
- `UserInput` **零必填**，所有字段可选；双向匹配靠“用户给了哪一头”决定走哪个输出结构。
- `moodTag` 在 `UserInput` 与 `DestinationLibrary` 用**同一套取值**，是玩法型模糊匹配的桥梁。
- `HolidayCalendar` **逐年维护**（含 `year`、含调休 `makeupWorkdays`），**需每年更新**。
- `TripResult.dailyPlan[].dayType` 区分核心天/可选延展天，配合 `flexibility` 实现按假期裁剪。
- AI 生成应优先复用内容库条目并透传其 `source`；库外补充也必须给出真实 `source`。
- `dailyPlan` 长度应等于 `meta.days`（= 核心天 + 已采用的延展天）。
- v2 预留字段（`themes`/`budget`/`tags`/`budgetNotes`）v1 保持空/默认，不影响功能。

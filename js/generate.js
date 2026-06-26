// generate.js —— 分支判断 + 本地规则引擎(DEMO) + Claude API 通路 + 轻量 schema 校验。
(function () {
  const SLOTS = ["上午", "下午", "傍晚", "晚上"];
  const COST = { thailand: "low", japan: "medium", france: "high" };
  const FLIGHT = { japan: { h: 4, direct: true }, thailand: { h: 4.5, direct: true }, france: { h: 12, direct: true } };
  const SEASON_ZH = { spring: "春季", summer: "夏季", autumn: "秋季", winter: "冬季" };

  function seasonFromDate(s) {
    if (!s) return null;
    const m = new Date(s + "T00:00:00").getMonth() + 1;
    if (m >= 3 && m <= 5) return "spring";
    if (m >= 6 && m <= 8) return "summer";
    if (m >= 9 && m <= 11) return "autumn";
    return "winter";
  }
  // G1: 无日期时当前季节由浏览器日期推导（默认北半球）
  function currentSeason() {
    const m = new Date().getMonth() + 1;
    if (m >= 3 && m <= 5) return "spring";
    if (m >= 6 && m <= 8) return "summer";
    if (m >= 9 && m <= 11) return "autumn";
    return "winter";
  }

  function hasDate(input) { return !!(input.dateRange && (input.dateRange.start || input.dateRange.days)); }
  function moodSignals(input) {
    const s = new Set(input.moodTags || []);
    (input.destination && input.destination.playstyleTags || []).forEach(t => s.add(t));
    return s;
  }
  function hasSignal(input) {
    return !!((input.freeText && input.freeText.trim()) || (input.moodTags && input.moodTags.length)
      || hasDate(input)
      || (input.destination && (input.destination.regionText || (input.destination.playstyleTags || []).length)));
  }
  function defaultPace(input) {
    if (input.pace) return input.pace;
    return (input.moodTags || []).includes("relax") ? "relaxed" : "balanced";
  }

  // —— 分支判断（PRD 9.3） ——
  function decideBranch(input) {
    const d = input.destination || {};
    const isCountry = d.granularity === "country" && d.country;
    if (isCountry) return hasDate(input) ? { type: "trip" } : { type: "besttime" };
    return { type: "recommend", isFallback: !hasSignal(input) };
  }

  function transportFor(country, origin) {
    if (!origin) return null; // G1: 无 origin → null，UI 显示占位
    const f = FLIGHT[country];
    return { origin, destinationNameZh: DATA.libraries[country].countryNameZh,
      directFlight: f ? f.direct : null, flightHours: f ? f.h : null,
      note: f ? `${origin}出发约 ${f.h} 小时${f.direct ? "，有直飞" : ""}` : "", source: "交通时长估算" };
  }

  // ================= 本地规则引擎(DEMO) =================
  function buildRecommendation(input) {
    const signals = moodSignals(input);
    const cands = Object.values(DATA.libraries).map(lib => {
      const strong = lib.moodTags.some(t => signals.has(t));
      const days = (input.dateRange && input.dateRange.days) || lib.idealDuration.minDays;
      const best = lib.bestSeasons.map(b => SEASON_ZH[b.season]).join("、");
      return {
        id: lib.country, nameZh: lib.countryNameZh, country: lib.country,
        matchLevel: strong ? "strong" : "related",
        matchReason: strong ? `契合你的「${[...signals].join("/")}」偏好` : `${lib.countryNameZh}经典之选`,
        bestVisitTime: `最佳季节：${best}`,
        suggestedDays: Math.min(days, lib.idealDuration.maxDays) || lib.idealDuration.minDays,
        costTier: COST[lib.country] || "medium",
        transport: transportFor(lib.country, input.origin),
        moodTags: lib.moodTags, source: lib.bestSeasons[0] ? lib.bestSeasons[0].source : "内容库"
      };
    }).sort((a, b) => (a.matchLevel === "strong" ? -1 : 1) - (b.matchLevel === "strong" ? -1 : 1));

    const branch = decideBranch(input);
    let basis, coverageNote = null;
    if (branch.isFallback) {
      basis = `你什么都没填，先按当前季节(${SEASON_ZH[currentSeason()]})推荐适合放松的热门目的地`;
    } else {
      basis = "基于你提供的偏好/时间做定向推荐";
    }
    const d = input.destination || {};
    const anyStrong = cands.some(c => c.matchLevel === "strong");
    if ((d.granularity === "region" || d.granularity === "playstyle") && !anyStrong) {
      coverageNote = "v1 暂仅覆盖日本/泰国/法国，以下为当前可规划的相关目的地";
    }
    return { isFallback: branch.isFallback, basis, coverageNote, candidates: cands.slice(0, 5) };
  }

  function buildComparison(ids, input) {
    const libs = ids.map(id => DATA.libraries[id]).filter(Boolean);
    const items = libs.map(lib => {
      const days = (input.dateRange && input.dateRange.days) || lib.idealDuration.minDays;
      const fit = (input.dateRange && input.dateRange.days)
        ? (lib.idealDuration.minDays <= days && days <= lib.idealDuration.maxDays ? "刚好" : days < lib.idealDuration.minDays ? "偏紧" : "可放慢")
        : "—";
      return { id: lib.country, nameZh: lib.countryNameZh, cells: {
        timeFit: `最佳：${lib.bestSeasons.map(b => SEASON_ZH[b.season]).join("、")}`,
        daysVsHoliday: `建议 ${lib.idealDuration.minDays}-${lib.idealDuration.maxDays} 天（${fit}）`,
        costTier: { low: "经济", medium: "适中", high: "偏高" }[COST[lib.country]] || "适中",
        fatigue: lib.moodTags.includes("relax") || lib.moodTags.includes("island") ? "轻松" : "适中",
        highlights: lib.moodTags.join("、"),
        transport: input.origin ? (transportFor(lib.country, input.origin).note) : "填出发地后估算"
      }};
    });
    const keys = ["timeFit", "daysVsHoliday", "costTier", "fatigue", "highlights", "transport"];
    const labels = { timeFit: "时间契合", daysVsHoliday: "天数 vs 假期", costTier: "花费档", fatigue: "累不累", highlights: "特色", transport: "交通" };
    const dimensions = keys.map(k => {
      const vals = items.map(it => it.cells[k]);
      return { key: k, labelZh: labels[k], highlightDiff: new Set(vals).size > 1 };
    });
    const decisionSummary = items.length
      ? `想轻松省钱偏向「${items.reduce((a, b) => (COST[a.id] <= COST[b.id] ? a : b)).nameZh}」，想文化深度可选「${items[0].nameZh}」。`
      : "";
    return { items, dimensions, decisionSummary };
  }

  function buildBestTime(country) {
    const lib = DATA.libraries[country];
    return {
      destinationNameZh: lib.countryNameZh, country,
      bestSeasons: lib.bestSeasons.map(b => ({ season: b.season, reason: b.reason, source: b.source })),
      periods: lib.signatureExperiencesByPeriod.map(p => ({ period: p.period, experiences: p.experiences, source: p.source }))
    };
  }

  function buildTrip(country, input) {
    const lib = DATA.libraries[country];
    const pace = defaultPace(input);
    const perDay = pace === "intense" ? 5 : pace === "relaxed" ? 2 : 3;
    const reqDays = input.dateRange && input.dateRange.days;
    const days = Math.max(1, Math.min(reqDays || lib.idealDuration.minDays, lib.idealDuration.maxDays + 2));
    const season = (input.dateRange && seasonFromDate(input.dateRange.start)) || null;
    const city = (lib.attractions[0] && lib.attractions[0].region) || lib.countryNameZh;

    const optionalDays = Math.max(0, days - lib.idealDuration.minDays);
    const coreDays = days - optionalDays;

    const dailyPlan = [];
    let ai = 0, fi = 0;
    for (let d = 1; d <= days; d++) {
      const acts = [];
      for (let k = 0; k < perDay; k++) {
        const a = lib.attractions[ai % lib.attractions.length]; ai++;
        acts.push({ id: a.id, name: a.name, timeSlot: SLOTS[Math.min(k, SLOTS.length - 1)],
          durationMin: a.suggestedDurationMin || 90, summary: a.summary, source: a.source });
      }
      const lunch = lib.foods[fi % lib.foods.length]; fi++;
      const dinner = lib.foods[fi % lib.foods.length]; fi++;
      dailyPlan.push({
        day: d, title: `${city} · 第 ${d} 天`,
        intensity: pace, dayType: d <= coreDays ? "core" : "optional",
        activities: acts,
        meals: [
          { id: lunch.id, name: lunch.name, slot: "lunch", reason: lunch.reason, source: lunch.source },
          { id: dinner.id, name: dinner.name, slot: "dinner", reason: dinner.reason, source: dinner.source }
        ],
        reservationRefs: d === 1 ? lib.reservations.map(r => r.id) : []
      });
    }

    const tips = (season ? lib.seasonalTips.filter(t => t.season === season) : lib.seasonalTips);
    const tipsOut = (tips.length ? tips : lib.seasonalTips).slice(0, 3)
      .map(t => ({ season: t.season, tip: t.tip, source: t.source }));

    // G4: 时机警示
    let timingWarning = null;
    if (season && input.dateRange && input.dateRange.start) {
      const bestSet = new Set(lib.bestSeasons.map(b => b.season));
      if (!bestSet.has(season)) {
        timingWarning = `你选的${SEASON_ZH[season]}不在${lib.countryNameZh}最佳季节内（最佳：${lib.bestSeasons.map(b => SEASON_ZH[b.season]).join("、")}），行程照常生成，仅供提醒。`;
      }
    }

    return {
      meta: {
        origin: input.origin || null, destinationCountry: country, destinationNameZh: lib.countryNameZh,
        days, dateRange: input.dateRange || null, season,
        pace, companion: input.companion || null,
        moodTags: input.moodTags || [], freeText: input.freeText || "",
        themes: [], budget: null, generatedBy: "claude-opus-4-8",
        generatedAt: new Date().toISOString()
      },
      route: {
        summary: `${input.origin || "出发地"} → ${city}`,
        segments: [{ mode: "flight", from: input.origin || "出发地", to: city,
          detail: input.origin ? (transportFor(country, input.origin).note) : "建议直飞，填写出发地可估算时长",
          source: "交通估算" }],
        tips: "落地后建议购买当地交通卡/通票。", source: "交通估算"
      },
      dailyPlan,
      reservations: lib.reservations.map(r => ({ id: r.id, name: r.name, day: 1, method: r.method, leadTime: r.leadTime, source: r.source })),
      seasonalTips: tipsOut,
      flexibility: {
        coreDays, optionalDays,
        note: optionalDays > 0 ? `核心 ${coreDays} 天必玩；假期短可去掉第 ${coreDays + 1}-${days} 天的延展安排。` : "全部为核心天，已是精简行程。"
      },
      timingWarning,
      warnings: ["本结果由本地规则引擎(DEMO 模式)生成，未调用 Claude API；配置 config.js 中的 key 后将由 claude-opus-4-8 实时生成更丰富的方案。"]
    };
  }

  // ================= 轻量 schema 校验 (G5) =================
  function lightValidate(type, o) {
    const errs = [];
    const need = (cond, msg) => { if (!cond) errs.push(msg); };
    if (!o || typeof o !== "object") return { ok: false, errors: ["结果不是对象"] };
    if (type === "recommend") {
      need(typeof o.isFallback === "boolean", "缺 isFallback");
      need(Array.isArray(o.candidates) && o.candidates.length >= 1, "candidates 至少 1 个");
      (o.candidates || []).forEach((c, i) => need(c.id && c.nameZh && c.matchLevel && c.bestVisitTime && c.suggestedDays != null && c.costTier, `候选${i}字段不全`));
    } else if (type === "besttime") {
      need(o.destinationNameZh, "缺 destinationNameZh");
      need(Array.isArray(o.bestSeasons) && Array.isArray(o.periods), "缺 bestSeasons/periods");
    } else if (type === "compare") {
      need(Array.isArray(o.items) && o.items.length >= 2 && o.items.length <= 3, "items 需 2-3 个");
      need(Array.isArray(o.dimensions) && o.dimensions.length, "缺 dimensions");
    } else if (type === "trip") {
      need(o.meta && o.meta.destinationCountry && o.meta.days && o.meta.pace, "meta 字段不全");
      need(o.route && Array.isArray(o.route.segments), "缺 route");
      need(Array.isArray(o.dailyPlan) && o.dailyPlan.length, "缺 dailyPlan");
      (o.dailyPlan || []).forEach((d, i) => need(d.day && d.title && d.intensity && d.dayType && Array.isArray(d.activities), `第${i + 1}天字段不全`));
      need(Array.isArray(o.reservations) && Array.isArray(o.seasonalTips), "缺 reservations/seasonalTips");
    }
    return { ok: errs.length === 0, errors: errs };
  }

  // ================= Claude API 通路 =================
  // ================= 后端代理通路（生产：key 仅存服务端，前端不持 key）=================
  const API_BASE = () => (window.APP_CONFIG && window.APP_CONFIG.API_BASE) || "/api/generate";
  const CODE_KEY = "hf_access_code";
  let LIVE = false;

  // 启动探测：后端可用 → 走 Claude；否则本地 DEMO 规则引擎（纯静态打开时即此态）
  async function probe() {
    try { const r = await fetch(API_BASE(), { method: "GET", cache: "no-store" }); LIVE = r.ok; }
    catch (e) { LIVE = false; }
    return LIVE;
  }
  function isLive() { return LIVE; }

  function getAccessCode(force) {
    let c = "";
    try { c = localStorage.getItem(CODE_KEY) || ""; } catch (e) {}
    if (force || !c) {
      c = (window.prompt("请输入访问码以使用 Claude 实时生成：", "") || "").trim();
      try { if (c) localStorage.setItem(CODE_KEY, c); } catch (e) {}
    }
    return c;
  }

  // 调后端：附访问码；401 自动重新输码重试一次。前端不接触 key。
  async function callBackend(input, branch) {
    let code = getAccessCode(false);
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch(API_BASE(), {
        method: "POST",
        headers: { "content-type": "application/json", "x-access-code": code },
        body: JSON.stringify({ userInput: input, branch, libraryData: DATA.libraries, holidayData: DATA.holidays })
      });
      if (r.status === 401) {
        try { localStorage.removeItem(CODE_KEY); } catch (e) {}
        code = getAccessCode(true);
        if (!code) { const e = new Error("需要访问码"); e.code = 401; throw e; }
        continue;
      }
      if (r.status === 429) { const e = new Error("请求过于频繁"); e.code = 429; throw e; }
      if (!r.ok) { const e = new Error("服务端错误 " + r.status); e.code = r.status; throw e; }
      return await r.json();
    }
    const e = new Error("访问码错误"); e.code = 401; throw e;
  }

  // ================= 对外主入口 =================
  // 返回 { branch, type, data, mode, warnings }
  async function generate(input, opts) {
    opts = opts || {};
    const branch = opts.forceBranch || decideBranch(input);
    const type = branch.type;
    const mock = () => {
      if (type === "recommend") return buildRecommendation(input);
      if (type === "besttime") return buildBestTime(input.destination.country);
      if (type === "trip") return buildTrip(input.destination.country, input);
      if (type === "compare") return buildComparison(opts.compareIds, input);
    };

    if (!LIVE) return { branch, type, data: mock(), mode: "demo", warnings: [] };

    try {
      const out = await callBackend(input, branch); // 后端已做 schema 校验与重试
      return { branch, type, data: out.data, mode: "live", warnings: [] };
    } catch (e) {
      const why = e.code === 429 ? "请求过于频繁，已回落本地演示，请稍后重试。"
        : e.code === 401 ? "未通过访问码，已回落本地演示。"
        : "后端调用失败（" + (e && e.message) + "），已回落本地演示。";
      return { branch, type, data: mock(), mode: "demo-fallback", warnings: [why] };
    }
  }

  window.Generator = { generate, decideBranch, buildComparison, lightValidate, seasonFromDate, currentSeason, isLive, probe };
})();

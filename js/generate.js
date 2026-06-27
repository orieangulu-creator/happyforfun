// generate.js —— 分支判断 + 本地规则引擎(DEMO) + Claude API 通路 + 轻量 schema 校验。
(function () {
  const SLOTS = ["上午", "下午", "傍晚", "晚上"];
  const COST = { thailand: "low", japan: "medium", france: "high" };
  const FLIGHT = { japan: { h: 4, direct: true }, thailand: { h: 4.5, direct: true }, france: { h: 12, direct: true } };
  const SEASON_ZH = { spring: "春季", summer: "夏季", autumn: "秋季", winter: "冬季" };
  const MOOD_ZH = { relax: "想放松", explore: "想玩透", food: "美食", scenery: "风景", culture: "文化", shopping: "购物", hotspring: "温泉", island: "海岛", snow: "雪山", slow: "慢城" };
  const moodZh = x => MOOD_ZH[x] || x;
  // 未知国家(主要是欧洲)的兜底估算
  const costOf = c => COST[c] || "high";
  const flightOf = c => FLIGHT[c] || { h: 11, direct: false };
  const regionOf = c => { const m = (DATA.manifest || []).find(x => x.id === c); return m ? m.region : ""; };
  const MAX_DAYS_PER_CITY = 3; // 一城上限 3 天 2 晚
  // 转场日：城市/国家切换当天，给公共交通 + 自驾租车两套方案（含大致耗时与出发建议）
  function transferOptions(from, to, crossBorder) {
    const pub = crossBorder ? "3-5" : "2-4", drv = crossBorder ? "5-8" : "2-4";
    return {
      from, to, crossBorder,
      note: "转场日：建议上午出发、在途约半天，午后抵达办入住后轻松游览",
      options: [
        { mode: "public", label: "公共交通", detail: `${crossBorder ? "高铁 / 廉价航空" : "城际火车 / 大巴"} 约 ${pub} 小时（含值机·安检·换乘）；点对点车票或廉航联程更省心`, source: "交通估算" },
        { mode: "drive", label: "自驾租车", detail: `租车自驾约 ${drv} 小时，沿途可随停${crossBorder ? "；跨国需确认租车公司允许跨境、通行证(Vignette/ETC)与异地还车费" : "，机动灵活但需自驾精力"}`, source: "交通估算" }
      ]
    };
  }

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
    if (d.granularity === "multi") return { type: "combo" };
    const isCountry = d.granularity === "country" && d.country;
    if (isCountry) return hasDate(input) ? { type: "trip" } : { type: "besttime" };
    return { type: "recommend", isFallback: !hasSignal(input) };
  }

  // ===== 多国：城市总数随天数封顶（用户明确要求可覆盖）=====
  function cityCapForDays(days) {
    if (days <= 5) return 2;
    if (days <= 9) return 3;
    if (days <= 15) return 4;
    return 4 + Math.ceil((days - 15) / 4);
  }
  function suggestDaysForCountries(n) { return n <= 1 ? 5 : n === 2 ? 7 : n === 3 ? 10 : 13; }

  // 邻接贪心：把国家排成减少折返的一条链（优先从锚点/连接最多者起步）
  function orderByAdjacency(ids, adj) {
    if (ids.length <= 2) return ids.slice();
    const set = new Set(ids);
    const deg = id => (adj[id] || []).filter(x => set.has(x)).length;
    let start = ids.slice().sort((a, b) => deg(b) - deg(a))[0];
    const order = [start]; const left = new Set(ids); left.delete(start);
    while (left.size) {
      const last = order[order.length - 1];
      const nb = (adj[last] || []).filter(x => left.has(x));
      let next = nb[0];
      if (!next) next = [...left].sort((a, b) => deg(b) - deg(a))[0]; // 断链则取剩余里连接最多者
      order.push(next); left.delete(next);
    }
    return order;
  }

  // 多国组合推荐（DEMO 打分）
  function buildCombo(input) {
    const m = (input.destination && input.destination.multi) || {};
    const region = m.region || "欧洲";
    const want = m.countryCount || { min: 2, max: 3 };
    const must = (m.mustInclude || []).filter(c => DATA.libraries[c]);
    const exclude = new Set(m.exclude || []);
    const prefer = new Set([].concat(m.preferTags || [], input.moodTags || []));
    const geo = DATA.geo || {}, adj = geo.adjacency || {}, combos = geo.combos || [], cost = geo.costTier || {};
    const season = input.dateRange ? seasonFromDate(input.dateRange.start) : null;
    const anchor = must[0] || null;

    const inRegion = (DATA.manifest || [])
      .filter(x => x.region === region || region.includes(x.region) || x.region.includes(region))
      .map(x => x.id).filter(id => DATA.libraries[id]);

    function score(id) {
      const lib = DATA.libraries[id]; let s = 0;
      if (anchor && anchor !== id) { const nb = adj[anchor] || []; const i = nb.indexOf(id); s += i >= 0 ? 0.25 * (1 - i / Math.max(1, nb.length)) : 0; }
      else s += 0.12;
      s += 0.20 * Math.min(1, lib.attractions.length / 6);
      if (season) s += 0.15 * (lib.bestSeasons.some(b => b.season === season) ? 1 : 0.3); else s += 0.10;
      const ct = cost[id] || "high"; s += 0.10 * (ct === "low" ? 1 : ct === "medium" ? 0.6 : 0.3);
      if (anchor) s += 0.30 * (combos.some(c => c.countries.includes(anchor) && c.countries.includes(id)) ? 1 : 0);
      else s += 0.15 * (combos.some(c => c.countries.includes(id)) ? 1 : 0);
      if (prefer.size && lib.moodTags.some(t => prefer.has(t))) s += 0.05;
      return Math.round(s * 100) / 100;
    }
    const companions = inRegion.filter(id => id !== anchor && !exclude.has(id) && !must.includes(id)).sort((a, b) => score(b) - score(a));
    const target = Math.max(want.min || 2, Math.min(want.max || 3, (want.max || 3)));
    const chosen = must.slice();
    for (const id of companions) { if (chosen.length >= target) break; chosen.push(id); }
    const ordered = orderByAdjacency(chosen, adj);

    function reason(id) {
      const lib = DATA.libraries[id]; const bits = [];
      if (must.includes(id)) bits.push("你指定必含");
      else if (anchor && (adj[anchor] || []).includes(id)) bits.push("与" + DATA.libraries[anchor].countryNameZh + "顺路");
      if (combos.some(c => c.countries.includes(id) && (!anchor || c.countries.includes(anchor)))) bits.push("主流攻略常见组合");
      if (season && lib.bestSeasons.some(b => b.season === season)) bits.push(SEASON_ZH[season] + "正当季");
      const ct = cost[id] || "high"; bits.push({ low: "花费经济", medium: "花费适中", high: "花费偏高" }[ct]);
      return bits.join(" · ");
    }
    const matched = combos.find(c => c.countries.length === ordered.length && c.countries.every(x => ordered.includes(x)));
    return {
      region, tripKind: "multi",
      countries: ordered.map(id => ({ country: id, nameZh: DATA.libraries[id].countryNameZh, role: must.includes(id) ? "anchor" : "companion", score: score(id), reason: reason(id) })),
      countryOrder: ordered,
      totalDaysSuggest: suggestDaysForCountries(ordered.length),
      note: matched ? ("贴近主流线路：" + matched.note) : "按顺路紧密度 + 游玩度 + 季节自动组合",
      altCombos: combos.filter(c => !anchor || c.countries.includes(anchor)).slice(0, 4)
    };
  }

  function transportFor(country, origin) {
    if (!origin) return null; // G1: 无 origin → null，UI 显示占位
    const f = flightOf(country);
    return { origin, destinationNameZh: (DATA.libraries[country] ? DATA.libraries[country].countryNameZh : country),
      directFlight: f.direct, flightHours: f.h,
      note: `${origin}出发约 ${f.h} 小时${f.direct ? "，有直飞" : "，多需中转"}`, source: "交通时长估算" };
  }

  // 多国行程（DEMO）：跨国城市铺排 + 总城市数随天数封顶 + 跨国交通 + 签证提示
  function buildMultiTrip(countryOrder, input) {
    const order = (countryOrder || []).filter(c => DATA.libraries[c]);
    if (order.length <= 1) return buildTrip(order[0] || (input.destination && input.destination.country), input);
    const pace = defaultPace(input);
    const perDay = pace === "intense" ? 5 : pace === "relaxed" ? 2 : 3;
    const season = input.dateRange ? seasonFromDate(input.dateRange.start) : null;
    const reqDays = (input.dateRange && input.dateRange.days) || suggestDaysForCountries(order.length);
    const ck = (a, lib) => String(a.region || lib.countryNameZh).split(/[\/／]/)[0].trim();

    const perCountry = order.map(country => {
      const lib = DATA.libraries[country]; const names = [];
      lib.attractions.forEach(a => { const c = ck(a, lib); if (!names.includes(c)) names.push(c); });
      return names.map(c => ({ city: c, country, attractions: lib.attractions.filter(a => ck(a, lib) === c), foods: lib.foods.filter(f => ck(f, lib) === c) }));
    });
    // 各国主城优先的轮转交错
    const cityList = []; let idx = 0, more = true;
    while (more) { more = false; perCountry.forEach(list => { if (list[idx]) { cityList.push(list[idx]); more = true; } }); idx++; }
    const maxCities = Math.min(cityList.length, Math.max(order.length, cityCapForDays(reqDays)));
    const use = cityList.slice(0, maxCities);
    const cappedCities = cityList.length > use.length;
    const dayCap = use.length * MAX_DAYS_PER_CITY;
    const days = Math.max(use.length, Math.min(reqDays, dayCap));

    const alloc = []; let leftCities = use.length, leftDays = days;
    for (const c of use) { if (leftDays <= 0) break; const dd = Math.max(1, Math.min(MAX_DAYS_PER_CITY, leftDays, Math.ceil(leftDays / leftCities))); alloc.push(Object.assign({}, c, { days: dd })); leftDays -= dd; leftCities--; }

    const allResv = order.flatMap(c => DATA.libraries[c].reservations.map(r => r.id)).slice(0, 4);
    const dailyPlan = []; let dayNo = 0;
    let prevCity = null, prevCountry = null;
    alloc.forEach((al, ci) => {
      const acts0 = al.attractions.length ? al.attractions : DATA.libraries[al.country].attractions;
      const foods = al.foods.length ? al.foods : DATA.libraries[al.country].foods;
      let ai = 0, fi = 0;
      for (let d = 1; d <= al.days; d++) {
        dayNo++;
        const isTransfer = ci > 0 && d === 1;             // 进入新城市的首日 = 转场日
        const cnt = isTransfer ? Math.min(2, perDay) : perDay;
        const slots = isTransfer ? ["下午", "晚上"] : SLOTS;  // 转场日上午在途，下午起安排
        const acts = [];
        for (let k = 0; k < cnt; k++) { const a = acts0[ai % acts0.length]; ai++; acts.push({ id: a.id, name: a.name, timeSlot: slots[Math.min(k, slots.length - 1)], durationMin: a.suggestedDurationMin || 90, summary: a.summary, source: a.source }); }
        const lunch = foods[fi % foods.length]; fi++; const dinner = foods[fi % foods.length]; fi++;
        const day = { day: dayNo, title: `${DATA.libraries[al.country].countryNameZh} · ${al.city} 第 ${d} 天` + (isTransfer ? "（转场日）" : ""), country: al.country, intensity: pace, dayType: ci === 0 ? "core" : "optional",
          activities: acts, meals: [{ id: lunch.id, name: lunch.name, slot: "lunch", reason: lunch.reason, source: lunch.source }, { id: dinner.id, name: dinner.name, slot: "dinner", reason: dinner.reason, source: dinner.source }],
          reservationRefs: dayNo === 1 ? allResv : [] };
        if (isTransfer) day.transfer = transferOptions(prevCity, al.city, al.country !== prevCountry);
        dailyPlan.push(day);
      }
      prevCity = al.city; prevCountry = al.country;
    });
    const realDays = dailyPlan.length;
    const coreDays = (alloc[0] ? alloc[0].days : realDays);
    const seq = alloc.map(a => ({ city: a.city, country: a.country }));
    const segs = [{ mode: "flight", from: input.origin || "出发地", to: seq[0].city, detail: input.origin ? transportFor(seq[0].country, input.origin).note : "建议直飞首站", source: "交通估算" }];
    for (let i = 1; i < seq.length; i++) { const cross = seq[i].country !== seq[i - 1].country; segs.push({ mode: cross ? "flight/train" : "train", from: seq[i - 1].city, to: seq[i].city, detail: cross ? "跨国：高铁或廉价航空" : "同国火车 / 大巴", crossBorder: cross, source: "交通估算" }); }

    const lib0 = DATA.libraries[order[0]];
    const tips = (season ? lib0.seasonalTips.filter(t => t.season === season) : lib0.seasonalTips);
    const tipsOut = (tips.length ? tips : lib0.seasonalTips).slice(0, 3).map(t => ({ season: t.season, tip: t.tip, source: t.source }));
    const NON_SCHENGEN = new Set(["unitedkingdom"]);
    const regionNotes = [];
    if (order.some(c => regionOf(c) === "欧洲")) {
      const hasNon = order.some(c => NON_SCHENGEN.has(c));
      regionNotes.push({ note: "欧洲多属申根区，区内可凭一国签证自由通行" + (hasNon ? "；本行程含英国(非申根)，需单独签证与边检。" : "；本行程国家若均属申根，办一次申根签即可。"), source: "签证常识" });
    }
    const resvOut = order.flatMap(c => DATA.libraries[c].reservations.map(r => ({ id: r.id, name: DATA.libraries[c].countryNameZh + " · " + r.name, day: 1, method: r.method, leadTime: r.leadTime, source: r.source }))).slice(0, 6);

    return {
      meta: { origin: input.origin || null, destinationCountry: order[0], destinationCountries: order, tripKind: "multi", countryOrder: order,
        destinationNameZh: order.map(c => DATA.libraries[c].countryNameZh).join(" · "),
        days: realDays, dateRange: input.dateRange || null, season, pace, companion: input.companion || null, moodTags: input.moodTags || [], freeText: input.freeText || "", themes: [], budget: null, generatedBy: "claude-opus-4-8", generatedAt: new Date().toISOString() },
      route: { summary: [input.origin || "出发地"].concat(seq.map(s => s.city)).join(" → "), segments: segs, tips: "跨国段预留半天交通；多国建议买点对点车票或廉航联程。", source: "交通估算" },
      dailyPlan, reservations: resvOut, seasonalTips: tipsOut,
      flexibility: { coreDays, optionalDays: realDays - coreDays, note: (cappedCities ? `已按"总天数→城市上限(${use.length}城)"铺排；` : "") + "想更深可加天数，或在描述里指定某城/某国停留更久。" },
      regionNotes, timingWarning: null,
      warnings: ["本结果由本地规则引擎(DEMO 模式)生成；接入后端 AI 后将实时生成更丰富的多国方案。"]
    };
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
        costTier: costOf(lib.country),
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
    // 模糊区域：把该区域的国家排前面
    if (d.granularity === "region" && d.regionText) {
      const rt = d.regionText;
      const hit = c => { const r = regionOf(c.id); return r && (r.includes(rt) || rt.includes(r)) ? 0 : 1; };
      cands.sort((a, b) => hit(a) - hit(b));
    }
    const anyStrong = cands.some(c => c.matchLevel === "strong");
    if ((d.granularity === "region" || d.granularity === "playstyle") && !anyStrong) {
      coverageNote = "以下为当前内容库可规划的相关目的地（数据持续扩充中）";
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
        highlights: lib.moodTags.map(moodZh).join("、"),
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
    const season = (input.dateRange && seasonFromDate(input.dateRange.start)) || null;

    // 城市分组（按出现顺序）；region 形如「东京/浅草」时取斜杠前的主城，避免把同城子区当多城
    const cityKey = a => String(a.region || lib.countryNameZh).split(/[\/／]/)[0].trim();
    const cities = [];
    lib.attractions.forEach(a => { const c = cityKey(a); if (!cities.includes(c)) cities.push(c); });
    const attrByCity = {}; cities.forEach(c => (attrByCity[c] = []));
    lib.attractions.forEach(a => { (attrByCity[cityKey(a)] || attrByCity[cities[0]]).push(a); });

    // 城市停留规则：每城 2-3 天，上限 MAX_DAYS_PER_CITY；总上限 = 城市数 × 上限
    const reqDays = (input.dateRange && input.dateRange.days) || null;
    const totalCap = cities.length * MAX_DAYS_PER_CITY;
    let days = Math.max(1, Math.min(reqDays || lib.idealDuration.minDays, totalCap));
    const cappedByCity = !!(reqDays && reqDays > totalCap);

    // 均衡分配每城天数（≤上限）
    const alloc = []; let leftCities = cities.length, leftDays = days;
    for (const c of cities) {
      if (leftDays <= 0) break;
      const dd = Math.max(1, Math.min(MAX_DAYS_PER_CITY, leftDays, Math.ceil(leftDays / leftCities)));
      alloc.push({ city: c, days: dd }); leftDays -= dd; leftCities--;
    }
    const usedCities = alloc.map(a => a.city);

    // 逐日生成（第一座城市为核心，其余为可选延展城市）
    const dailyPlan = []; let dayNo = 0, prevCity = null;
    alloc.forEach((al, ci) => {
      const acts0 = attrByCity[al.city].length ? attrByCity[al.city] : lib.attractions;
      const cityFoods = lib.foods.filter(f => String(f.region || "").split(/[\/／]/)[0].trim() === al.city);
      const foods = cityFoods.length ? cityFoods : lib.foods;
      let ai = 0, fi = 0;
      for (let dd = 1; dd <= al.days; dd++) {
        dayNo++;
        const isTransfer = ci > 0 && dd === 1;             // 换城首日 = 转场日
        const cnt = isTransfer ? Math.min(2, perDay) : perDay;
        const slots = isTransfer ? ["下午", "晚上"] : SLOTS;
        const acts = [];
        for (let k = 0; k < cnt; k++) {
          const a = acts0[ai % acts0.length]; ai++;
          acts.push({ id: a.id, name: a.name, timeSlot: slots[Math.min(k, slots.length - 1)],
            durationMin: a.suggestedDurationMin || 90, summary: a.summary, source: a.source });
        }
        const lunch = foods[fi % foods.length]; fi++;
        const dinner = foods[fi % foods.length]; fi++;
        const day = {
          day: dayNo, title: `${al.city} · 第 ${dd} 天` + (isTransfer ? "（转场日）" : ""),
          intensity: pace, dayType: ci === 0 ? "core" : "optional",
          activities: acts,
          meals: [
            { id: lunch.id, name: lunch.name, slot: "lunch", reason: lunch.reason, source: lunch.source },
            { id: dinner.id, name: dinner.name, slot: "dinner", reason: dinner.reason, source: dinner.source }
          ],
          reservationRefs: dayNo === 1 ? lib.reservations.map(r => r.id) : []
        };
        if (isTransfer) day.transfer = transferOptions(prevCity, al.city, false); // 同国转场
        dailyPlan.push(day);
      }
      prevCity = al.city;
    });
    const realDays = dailyPlan.length;
    const coreDays = alloc.length ? alloc[0].days : realDays;
    const optionalDays = realDays - coreDays;

    const tips = (season ? lib.seasonalTips.filter(t => t.season === season) : lib.seasonalTips);
    const tipsOut = (tips.length ? tips : lib.seasonalTips).slice(0, 3).map(t => ({ season: t.season, tip: t.tip, source: t.source }));

    let timingWarning = null;
    if (season && input.dateRange && input.dateRange.start) {
      const bestSet = new Set(lib.bestSeasons.map(b => b.season));
      if (!bestSet.has(season)) {
        timingWarning = `你选的${SEASON_ZH[season]}不在${lib.countryNameZh}最佳季节内（最佳：${lib.bestSeasons.map(b => SEASON_ZH[b.season]).join("、")}），行程照常生成，仅供提醒。`;
      }
    }

    const firstCity = usedCities[0] || lib.countryNameZh;
    const segments = [{ mode: "flight", from: input.origin || "出发地", to: firstCity,
      detail: input.origin ? transportFor(country, input.origin).note : "建议直飞，填写出发地可估算时长", source: "交通估算" }];
    for (let i = 1; i < usedCities.length; i++) segments.push({ mode: "train", from: usedCities[i - 1], to: usedCities[i], detail: "城市间建议火车 / 大巴", source: "交通估算" });

    const flexNote = (cappedByCity ? `已按「每城 ≤${MAX_DAYS_PER_CITY} 天」铺排 ${usedCities.length} 座城市；想玩更久可增加城市或在文字里说明。` : "")
      + (optionalDays > 0 ? `第一座城市 ${coreDays} 天为核心，时间紧可只玩首城。` : "已是精简安排。");

    return {
      meta: {
        origin: input.origin || null, destinationCountry: country, destinationNameZh: lib.countryNameZh,
        days: realDays, dateRange: input.dateRange || null, season,
        pace, companion: input.companion || null,
        moodTags: input.moodTags || [], freeText: input.freeText || "",
        themes: [], budget: null, generatedBy: "claude-opus-4-8", generatedAt: new Date().toISOString()
      },
      route: {
        summary: [input.origin || "出发地"].concat(usedCities).join(" → "),
        segments, tips: "落地后建议购买当地交通卡 / 通票；多城之间预留半天交通。", source: "交通估算"
      },
      dailyPlan,
      reservations: lib.reservations.map(r => ({ id: r.id, name: r.name, day: 1, method: r.method, leadTime: r.leadTime, source: r.source })),
      seasonalTips: tipsOut,
      flexibility: { coreDays, optionalDays, note: flexNote },
      timingWarning,
      warnings: ["本结果由本地规则引擎(DEMO 模式)生成；接入后端 AI 后将实时生成更丰富的方案。"]
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
    } else if (type === "trip" || type === "multitrip") {
      need(o.meta && o.meta.destinationCountry && o.meta.days && o.meta.pace, "meta 字段不全");
      need(o.route && Array.isArray(o.route.segments), "缺 route");
      need(Array.isArray(o.dailyPlan) && o.dailyPlan.length, "缺 dailyPlan");
      (o.dailyPlan || []).forEach((d, i) => need(d.day && d.title && d.intensity && d.dayType && Array.isArray(d.activities), `第${i + 1}天字段不全`));
      need(Array.isArray(o.reservations) && Array.isArray(o.seasonalTips), "缺 reservations/seasonalTips");
    } else if (type === "combo") {
      need(Array.isArray(o.countries) && o.countries.length >= 2, "combo 国家需 ≥2");
      need(Array.isArray(o.countryOrder) && o.countryOrder.length >= 2, "缺 countryOrder");
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

  async function getAccessCode(force) {
    let c = "";
    try { c = localStorage.getItem(CODE_KEY) || ""; } catch (e) {}
    if (force || !c) {
      const ask = window.AccessCodePrompt
        ? window.AccessCodePrompt("输入访问码即可使用 AI 实时生成。", !!force)
        : Promise.resolve(window.prompt("请输入访问码以使用 AI 实时生成：", "") || "");
      c = ((await ask) || "").trim();
      try { if (c) localStorage.setItem(CODE_KEY, c); } catch (e) {}
    }
    return c;
  }

  // 调后端：附访问码；401 自动重新输码重试一次。前端不接触 key。
  async function callBackend(input, branch) {
    let code = await getAccessCode(false);
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await fetch(API_BASE(), {
        method: "POST",
        headers: { "content-type": "application/json", "x-access-code": code },
        body: JSON.stringify({ userInput: input, branch, libraryData: DATA.libraries, holidayData: DATA.holidays, geoData: DATA.geo })
      });
      if (r.status === 401) {
        try { localStorage.removeItem(CODE_KEY); } catch (e) {}
        code = await getAccessCode(true);
        if (!code) { const e = new Error("需要访问码"); e.code = 401; throw e; }
        continue;
      }
      if (r.status === 429) { const e = new Error("请求过于频繁"); e.code = 429; throw e; }
      if (!r.ok) {
        let detail = "";
        try { const j = await r.json(); detail = j.message || j.error || ""; } catch (e2) {}
        const e = new Error(detail ? (r.status + " " + detail) : ("服务端错误 " + r.status));
        e.code = r.status; throw e;
      }
      return await r.json();
    }
    const e = new Error("访问码错误"); e.code = 401; throw e;
  }

  // ================= 对外主入口 =================
  // 返回 { branch, type, data, mode, warnings }
  async function generate(input, opts) {
    opts = opts || {};
    const branch = opts.forceBranch || decideBranch(input);
    // 把下钻参数并入 branch，确保 live 后端也拿到（否则 AI 会自行重选国家/对比项）
    if (opts.countryOrder) branch.countryOrder = opts.countryOrder;
    if (opts.compareIds) branch.compareIds = opts.compareIds;
    const type = branch.type;
    const mock = () => {
      if (type === "recommend") return buildRecommendation(input);
      if (type === "besttime") return buildBestTime(input.destination.country);
      if (type === "trip") return buildTrip(input.destination.country, input);
      if (type === "compare") return buildComparison(opts.compareIds, input);
      if (type === "combo") return buildCombo(input);
      if (type === "multitrip") return buildMultiTrip(opts.countryOrder, input);
    };

    if (!LIVE) return { branch, type, data: mock(), mode: "demo", warnings: [] };

    try {
      const out = await callBackend(input, branch); // 后端已做 schema 校验与重试
      return { branch, type, data: out.data, mode: "live", warnings: [] };
    } catch (e) {
      try { console.warn("[generate] live failed:", e && e.message); } catch (e2) {}
      const why = e.code === 429 ? "请求有点频繁，先用本地方案给你顶上，稍等片刻再试更佳。"
        : e.code === 401 ? "访问码未通过，已用本地方案兜底；可刷新后重新输入访问码。"
        : "AI 生成暂时不太顺（" + (e && e.message ? String(e.message).slice(0, 100) : "未知原因") + "），已用本地方案兜底，可重试一次。";
      return { branch, type, data: mock(), mode: "demo-fallback", warnings: [why] };
    }
  }

  window.Generator = { generate, decideBranch, buildComparison, lightValidate, seasonFromDate, currentSeason, isLive, probe };
})();

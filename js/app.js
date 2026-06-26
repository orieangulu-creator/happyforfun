// app.js —— 交互控制与渲染（输入区 + 单屏渐进输出）
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const COST_ZH = { low: "经济", medium: "适中", high: "偏高" };

  const MOODS = [
    ["relax", "🏝️想放松"], ["explore", "🔥想玩透"], ["food", "🍜美食"], ["scenery", "📷风景"],
    ["culture", "🏛️文化"], ["shopping", "🛍️购物"], ["hotspring", "♨️温泉"], ["island", "🏖️海岛"],
    ["snow", "❄️雪山"], ["slow", "🐌慢城"]
  ];
  const PLAYSTYLES = [["island", "海岛"], ["snow", "雪山"], ["hotspring", "温泉"], ["slow", "慢城"], ["scenery", "风景"]];

  const state = { gran: "country", mood: new Set(), playstyle: new Set(), compare: new Set(), lastRecommend: null };

  // ---------- 初始化 ----------
  async function init() {
    await DATA.load();
    setModeBadge();
    renderChips($("moodChips"), MOODS, state.mood);
    renderChips($("destPlaystyle"), PLAYSTYLES, state.playstyle);
    renderHolidayChips();
    wireGranularity();
    wireMisc();
    $("generateBtn").addEventListener("click", onGenerate);
  }

  function setModeBadge() {
    const b = $("modeBadge");
    if (Generator.isLive()) { b.textContent = "Claude 实时生成"; b.className = "mode-badge live"; }
    else { b.textContent = "DEMO · 本地规则引擎" + (DATA.usingFallback ? "（内联数据）" : ""); b.className = "mode-badge demo"; }
  }

  function renderChips(container, list, set) {
    container.innerHTML = "";
    list.forEach(([val, label]) => {
      const el = document.createElement("span");
      el.className = "chip"; el.textContent = label; el.dataset.val = val;
      el.addEventListener("click", () => { el.classList.toggle("on"); el.classList.contains("on") ? set.add(val) : set.delete(val); });
      container.appendChild(el);
    });
  }

  function renderHolidayChips() {
    const cn = (DATA.holidays || []).find(h => h.region === "china");
    const box = $("holidayChips");
    if (!cn) return;
    cn.holidays.forEach(h => {
      const el = document.createElement("span");
      el.className = "chip"; el.textContent = "🇨🇳 " + h.nameZh;
      el.title = h.bridgeHint || "";
      el.addEventListener("click", () => {
        $("dateStart").value = h.start; $("dateEnd").value = h.end;
        $("dateHint").textContent = h.bridgeHint ? ("💡 " + h.bridgeHint) : "";
        updateDestHolidayHint();
      });
      box.appendChild(el);
    });
  }

  function wireGranularity() {
    $("granSeg").querySelectorAll(".seg-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        $("granSeg").querySelectorAll(".seg-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        state.gran = btn.dataset.gran;
        ["destCountry", "destRegion", "destPlaystyle", "destNone"].forEach(id => $(id).classList.add("hidden"));
        ({ country: "destCountry", region: "destRegion", playstyle: "destPlaystyle", none: "destNone" })[state.gran]
          && $(({ country: "destCountry", region: "destRegion", playstyle: "destPlaystyle", none: "destNone" })[state.gran]).classList.remove("hidden");
        updateDestHolidayHint();
      });
    });
  }

  function wireMisc() {
    $("freeText").addEventListener("input", e => $("ftCount").textContent = e.target.value.length);
    $("destCountry").addEventListener("change", updateDestHolidayHint);
    ["dateStart", "dateEnd"].forEach(id => $(id).addEventListener("change", updateDestHolidayHint));
  }

  // G7: 选了目的地国家 + 有日期 → 显示该国节假日影响；无数据则降级（不报错）
  function updateDestHolidayHint() {
    const hint = $("destHolidayHint"); hint.textContent = "";
    if (state.gran !== "country") return;
    const country = $("destCountry").value; const start = $("dateStart").value, end = $("dateEnd").value || start;
    if (!country || !start) return;
    const cal = (DATA.holidays || []).find(h => h.region === country);
    if (!cal) { hint.textContent = "（该目的地该年节假日数据暂未收录）"; return; }
    const overlap = cal.holidays.filter(h => !(h.end < start || h.start > end));
    if (!overlap.length) return;
    hint.innerHTML = overlap.map(h => {
      const imp = h.destinationImpact;
      const icon = imp && imp.highlight === "festival" ? "🎉" : imp && imp.highlight === "closure_crowd_price" ? "⚠️" : "🎉⚠️";
      return `${icon} ${esc(h.nameZh)}：${esc(imp ? imp.note : "当地假期")}`;
    }).join("<br/>");
  }

  // ---------- 收集输入 ----------
  function gatherInput() {
    const start = $("dateStart").value, end = $("dateEnd").value;
    let dateRange;
    if (start || end) {
      const s = start || end, e = end || start;
      const days = Math.max(1, Math.round((new Date(e) - new Date(s)) / 86400000) + 1);
      dateRange = { start: s, end: e, days };
    }
    let destination;
    if (state.gran === "country") destination = { granularity: "country", country: $("destCountry").value || null };
    else if (state.gran === "region") destination = { granularity: "region", regionText: $("destRegion").value.trim() };
    else if (state.gran === "playstyle") destination = { granularity: "playstyle", playstyleTags: [...state.playstyle] };
    else destination = { granularity: "none" };

    const input = { destination };
    if ($("origin").value.trim()) input.origin = $("origin").value.trim();
    if (dateRange) input.dateRange = dateRange;
    if (state.mood.size) input.moodTags = [...state.mood];
    if ($("freeText").value.trim()) input.freeText = $("freeText").value.trim();
    if ($("pace").value) input.pace = $("pace").value;
    if ($("companion").value) input.companion = $("companion").value;
    return input;
  }

  // G6: 输入校验
  function validateInput(input) {
    if (input.dateRange && input.dateRange.start && input.dateRange.end && input.dateRange.end < input.dateRange.start)
      return "结束日期不能早于开始日期";
    return null;
  }

  // ---------- 主流程 ----------
  function clearStages(from) {
    const order = ["stageRecommend", "stageCompare", "stageBestTime", "stageTrip"];
    const idx = order.indexOf(from);
    order.slice(idx).forEach(id => { $(id).innerHTML = ""; $(id).classList.add("hidden"); });
  }
  function showLoading(text) { $("placeholder").classList.add("hidden"); $("loadingText").textContent = text || "生成中…"; $("loading").classList.remove("hidden"); }
  function hideLoading() { $("loading").classList.add("hidden"); }

  async function onGenerate() {
    const input = gatherInput();
    const err = validateInput(input);
    $("inputError").textContent = err || "";
    if (err) return;

    clearStages("stageRecommend");
    state.compare.clear();
    showLoading("正在为你规划…");
    $("generateBtn").disabled = true;
    try {
      const res = await Generator.generate(input);
      state.lastInput = input;
      hideLoading();
      if (res.type === "recommend") { state.lastRecommend = res.data; renderRecommend(res); }
      else if (res.type === "besttime") renderBestTime(res, input.destination.country);
      else if (res.type === "trip") renderTrip(res);
    } catch (e) {
      hideLoading();
      $("inputError").textContent = "生成出错：" + e.message;
    } finally { $("generateBtn").disabled = false; }
  }

  // ---------- 渲染：目的地推荐 ----------
  function renderRecommend(res) {
    const d = res.data, box = $("stageRecommend");
    let html = `<div class="stage-head"><span class="step">阶段 ①</span><h3>目的地推荐</h3></div>`;
    html += `<p class="stage-sub">${esc(d.basis || "")}</p>`;
    if (d.isFallback) html += `<div class="fallback-note">🧭 你还没给具体信息，这是兜底推荐。填点偏好/时间会更准。</div>`;
    if (d.coverageNote) html += `<div class="coverage-note">⚠️ ${esc(d.coverageNote)}</div>`;
    if (res.warnings && res.warnings.length) html += `<div class="coverage-note">${esc(res.warnings.join(" / "))}</div>`;
    html += `<div class="cand-grid">`;
    d.candidates.forEach(c => {
      const t = c.transport;
      const transportTxt = t ? esc(t.note || `约${t.flightHours}小时`) : "填出发地后估算";
      html += `<div class="cand-card" data-id="${esc(c.id)}">
        <div class="cand-title">${esc(c.nameZh)} <span class="badge ${c.matchLevel}">${c.matchLevel === "strong" ? "强匹配" : "相关"}</span></div>
        <div class="cand-reason">${esc(c.matchReason)}</div>
        <div class="cand-meta">
          <span>🗓️ ${esc(c.bestVisitTime)}</span><span>⏱️ 建议 ${c.suggestedDays} 天</span>
          <span>💰 ${COST_ZH[c.costTier] || c.costTier}</span><span>✈️ ${transportTxt}</span>
        </div>
        <div class="cand-actions">
          <button class="btn-primary pick" data-id="${esc(c.id)}" ${c.country ? "" : "disabled"} style="flex:1">看它的行程 →</button>
          <button class="btn-ghost cmp" data-id="${esc(c.id)}" ${c.country ? "" : "disabled"}>加入对比</button>
        </div>
      </div>`;
    });
    html += `</div><div id="cmpBar" style="margin-top:14px"></div>`;
    box.innerHTML = html; box.classList.remove("hidden");

    box.querySelectorAll(".pick").forEach(b => b.addEventListener("click", () => pickDestination(b.dataset.id)));
    box.querySelectorAll(".cmp").forEach(b => b.addEventListener("click", () => toggleCompare(b)));
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // G9: 对比选择边界
  function toggleCompare(btn) {
    const id = btn.dataset.id;
    if (state.compare.has(id)) { state.compare.delete(id); btn.textContent = "加入对比"; btn.classList.remove("active"); }
    else {
      if (state.compare.size >= 3) { alert("最多对比 3 个目的地"); return; }
      state.compare.add(id); btn.textContent = "已加入 ✓"; btn.classList.add("active");
    }
    renderCmpBar();
  }
  function renderCmpBar() {
    const bar = $("cmpBar"); const n = state.compare.size;
    if (n === 0) { bar.innerHTML = ""; return; }
    if (n === 1) { bar.innerHTML = `<span class="hint">已选 1 个；再选 1-2 个可对比，或直接「看它的行程」。</span>`; return; }
    bar.innerHTML = `<button class="btn-primary" id="doCompare" style="width:auto;padding:10px 20px">对比所选 ${n} 个 →</button>`;
    $("doCompare").addEventListener("click", doCompare);
  }
  async function doCompare() {
    showLoading("生成对比…");
    const res = await Generator.generate(state.lastInput, { forceBranch: { type: "compare" }, compareIds: [...state.compare] });
    hideLoading();
    renderCompare(res.data);
  }

  // ---------- 渲染：对比 ----------
  function renderCompare(c) {
    const box = $("stageCompare");
    let html = `<div class="stage-head"><span class="step">阶段 ②</span><h3>方案对比</h3></div>
      <p class="stage-sub">⚡ 标记的行是差异显著项</p><table class="cmp-table"><thead><tr><th>维度</th>`;
    c.items.forEach(it => html += `<th>${esc(it.nameZh)}</th>`);
    html += `</tr></thead><tbody>`;
    c.dimensions.forEach(dim => {
      html += `<tr class="${dim.highlightDiff ? "diff" : ""}"><th>${esc(dim.labelZh)}</th>`;
      c.items.forEach(it => html += `<td>${esc(it.cells[dim.key] || "—")}</td>`);
      html += `</tr>`;
    });
    html += `</tbody></table>`;
    if (c.decisionSummary) html += `<div class="decision">💡 ${esc(c.decisionSummary)}</div>`;
    html += `<div style="margin-top:12px;display:flex;gap:8px">`;
    c.items.forEach(it => html += `<button class="btn-ghost pick2" data-id="${esc(it.id)}">选「${esc(it.nameZh)}」→</button>`);
    html += `</div>`;
    box.innerHTML = html; box.classList.remove("hidden");
    box.querySelectorAll(".pick2").forEach(b => b.addEventListener("click", () => pickDestination(b.dataset.id)));
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- 选定目的地 → 最佳时间 ----------
  async function pickDestination(country) {
    if (!DATA.libraries[country]) return;
    const input = Object.assign({}, state.lastInput, { destination: { granularity: "country", country } });
    state.lastInput = input;
    document.querySelectorAll(".cand-card").forEach(c => c.classList.toggle("picked", c.dataset.id === country));
    clearStages("stageBestTime");
    showLoading("查最佳时间…");
    const res = await Generator.generate(input, { forceBranch: { type: "besttime" } });
    hideLoading();
    renderBestTime(res, country);
  }

  // ---------- 渲染：最佳时间 + 各时段体验 ----------
  function renderBestTime(res, country) {
    const b = res.data, box = $("stageBestTime");
    let html = `<div class="stage-head"><span class="step">阶段 ③</span><h3>${esc(b.destinationNameZh)} · 最佳时间</h3></div>`;
    html += `<div class="season-row">`;
    b.bestSeasons.forEach(s => html += `<span class="season-pill"><b>${({ spring: "春", summer: "夏", autumn: "秋", winter: "冬" })[s.season]}</b> ${esc(s.reason)}</span>`);
    html += `</div><div class="period-grid">`;
    b.periods.forEach(p => html += `<div class="period-card"><h4>${esc(p.period)}</h4><div class="exp">${p.experiences.map(esc).join(" · ")}</div></div>`);
    html += `</div><div style="margin-top:14px"><button class="btn-primary" id="genTrip" style="width:auto;padding:10px 22px">生成详细行程 →</button></div>`;
    box.innerHTML = html; box.classList.remove("hidden");
    $("genTrip").addEventListener("click", async () => {
      clearStages("stageTrip");
      showLoading("排详细行程…");
      const input = Object.assign({}, state.lastInput, { destination: { granularity: "country", country } });
      const r = await Generator.generate(input, { forceBranch: { type: "trip" } });
      hideLoading(); renderTrip(r);
    });
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- 渲染：详细行程（6 大模块） ----------
  function renderTrip(res) {
    const t = res.data, m = t.meta, box = $("stageTrip");
    const paceZh = { intense: "特种兵", balanced: "均衡", relaxed: "悠闲" };
    let html = `<div class="stage-head"><span class="step">阶段 ④</span><h3>${esc(m.destinationNameZh)} · ${m.days} 天行程</h3></div>`;
    html += `<div class="trip-meta">
      <span class="tag pace-${m.pace}">节奏：${paceZh[m.pace] || m.pace}</span>
      ${m.companion ? `<span class="tag">同行：${esc(m.companion)}</span>` : ""}
      ${(m.moodTags || []).map(x => `<span class="tag">#${esc(x)}</span>`).join("")}
      ${m.season ? `<span class="tag">${({ spring: "春", summer: "夏", autumn: "秋", winter: "冬" })[m.season]}季出行</span>` : ""}
    </div>`;
    if (res.mode && res.mode.indexOf("demo") === 0) html += `<div class="demo-trip-note">⚙️ ${esc((t.warnings || []).join(" "))}</div>`;
    if (res.warnings && res.warnings.length) html += `<div class="timing-warn">${esc(res.warnings.join(" "))}</div>`;
    if (t.timingWarning) html += `<div class="timing-warn">⚠️ ${esc(t.timingWarning)}</div>`;

    // 模块1 路线
    html += `<div class="module"><h4>🚄 1. 最佳出行路线</h4><div>${esc(t.route.summary)}</div>`;
    t.route.segments.forEach(s => html += `<div class="route-seg">· [${esc(s.mode)}] ${esc(s.from)} → ${esc(s.to)}：${esc(s.detail)} <span class="source">（${esc(s.source)}）</span></div>`);
    if (t.route.tips) html += `<div class="route-seg">💡 ${esc(t.route.tips)}</div>`;
    html += `</div>`;

    // 模块2/3/4 按天（含景点、美食）
    html += `<div class="module"><h4>🗓️ 2. 按天安排（含景点 · 美食）</h4>`;
    t.dailyPlan.forEach(d => {
      html += `<div class="day"><div class="day-head"><span class="day-num">${d.day}</span>
        <span class="day-title">${esc(d.title)}</span>
        <span class="day-type ${d.dayType}">${d.dayType === "core" ? "核心天" : "可选延展"}</span></div>`;
      d.activities.forEach(a => html += `<div class="slot"><span class="when">${esc(a.timeSlot || "")}</span>${esc(a.name)} — ${esc(a.summary)} <span class="source">（${esc(a.source)}）</span></div>`);
      if (d.meals && d.meals.length) html += `<div class="meals-line">🍽️ ${d.meals.map(me => esc(me.name) + (me.reason ? "（" + esc(me.reason) + "）" : "")).join("　·　")}</div>`;
      html += `</div>`;
    });
    if (t.flexibility) html += `<div class="flex-note">🔧 弹性：核心 ${t.flexibility.coreDays} 天 / 可选 ${t.flexibility.optionalDays} 天。${esc(t.flexibility.note || "")}</div>`;
    html += `</div>`;

    // 模块5 预约
    html += `<div class="module"><h4>📌 5. 需提前预约</h4>`;
    if (t.reservations.length) t.reservations.forEach(r => html += `<div class="resv-item"><b>${esc(r.name)}</b>：${esc(r.method)}，${esc(r.leadTime)} <span class="source">（${esc(r.source)}）</span></div>`);
    else html += `<div class="resv-item">本行程无需特别预约。</div>`;
    html += `</div>`;

    // 模块6 季节建议
    html += `<div class="module"><h4>🌤️ 6. 季节建议</h4>`;
    t.seasonalTips.forEach(s => html += `<div class="tip-item">· ${esc(s.tip)} <span class="source">（${esc(s.source)}）</span></div>`);
    html += `</div>`;

    box.innerHTML = html; box.classList.remove("hidden");
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

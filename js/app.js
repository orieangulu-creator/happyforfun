// app.js —— 交互控制与渲染（输入区 + 单屏渐进输出 + 方案版本管理）
(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const clone = o => JSON.parse(JSON.stringify(o));
  const COST = { thailand: "low", japan: "medium", france: "high" };
  const COST_ZH = { low: "经济", medium: "适中", high: "偏高" };
  const PACE_ZH = { intense: "特种兵", balanced: "均衡", relaxed: "悠闲" };
  const COMP_ZH = { solo: "独自", couple: "情侣/蜜月", family_kids: "亲子带娃", elderly: "长辈同行", friends: "朋友结伴" };
  const SEASON_ZH = { spring: "春", summer: "夏", autumn: "秋", winter: "冬" };

  const MOODS = [
    ["relax", "🏝️想放松"], ["explore", "🔥想玩透"], ["food", "🍜美食"], ["scenery", "📷风景"],
    ["culture", "🏛️文化"], ["shopping", "🛍️购物"], ["hotspring", "♨️温泉"], ["island", "🏖️海岛"],
    ["snow", "❄️雪山"], ["slow", "🐌慢城"]
  ];
  const PLAYSTYLES = [["island", "海岛"], ["snow", "雪山"], ["hotspring", "温泉"], ["slow", "慢城"], ["scenery", "风景"]];

  // 方案版本状态
  const state = {
    gran: "country", mood: new Set(), playstyle: new Set(),
    plans: [], activeId: null, seq: 0, vcompare: new Set()
  };
  const active = () => state.plans.find(p => p.id === state.activeId);

  // ---------- 焦点态（视觉主次）：input | output | edit | compare ----------
  const FOCUS_CLASSES = ["focus-input", "focus-output", "focus-edit", "focus-compare"];
  state.focus = "input";
  function setFocus(mode) {
    state.focus = mode;
    const b = document.body;
    FOCUS_CLASSES.forEach(c => b.classList.remove(c));
    b.classList.add("focus-" + mode);
    if (mode !== "compare") b.classList.remove("hide-same");
    // 进入 EDIT 态时把焦点拉回表单
    if (mode === "edit") { try { $("origin").focus({ preventScroll: true }); } catch (e) {} }
  }

  // 需求摘要条：用激活版本的输入生成一行摘要
  function renderSummaryBar() {
    const v = active();
    const bar = $("summaryBar"), txt = $("summaryText");
    if (!v) { bar.classList.add("hidden"); return; }
    bar.classList.remove("hidden");
    const summary = buildSummaryText(v.input);
    txt.textContent = summary;
    const rail = $("railEditBtn"); if (rail) rail.title = "展开修改 · " + summary;
  }
  function buildSummaryText(input) {
    input = input || {};
    const parts = [];
    if (input.origin) parts.push(input.origin);
    const d = input.destination || {};
    let dest = "";
    if (d.granularity === "country" && d.country) dest = DATA.libraries[d.country] ? DATA.libraries[d.country].countryNameZh : d.country;
    else if (d.granularity === "region" && d.regionText) dest = d.regionText;
    else if (d.granularity === "playstyle" && (d.playstyleTags || []).length) dest = (d.playstyleTags).join("/");
    else dest = "目的地待定";
    parts.push(dest);
    if (input.dateRange) {
      const fmt = s => (s || "").slice(5).replace("-", "/");
      parts.push(`${fmt(input.dateRange.start)}–${fmt(input.dateRange.end)}`);
    }
    if (input.pace) parts.push(PACE_ZH[input.pace] || input.pace);
    else if ((input.moodTags || []).includes("relax")) parts.push("悠闲");
    if (input.companion) parts.push(COMP_ZH[input.companion] || input.companion);
    return parts.filter(Boolean).join(" · ");
  }

  // ---------- 初始化 ----------
  async function init() {
    await DATA.load();
    await Generator.probe();
    setModeBadge();
    renderChips($("moodChips"), MOODS, state.mood);
    renderChips($("destPlaystyle"), PLAYSTYLES, state.playstyle);
    renderHolidayChips();
    wireGranularity();
    wireMisc();
    setFocus("input");
    $("generateBtn").addEventListener("click", () => onGenerate(false));
    $("newPlanBtn").addEventListener("click", () => onGenerate(true));
    $("editReqBtn").addEventListener("click", () => { renderSummaryBar(); setFocus("edit"); });
    // 折叠侧栏：展开符号 → 修改当前；＋ → 展开并引导生成新方案
    $("railEditBtn").addEventListener("click", () => setFocus("edit"));
    $("railNewBtn").addEventListener("click", () => {
      setFocus("edit");
      const b = $("newPlanBtn");
      b.classList.add("pulse"); b.scrollIntoView({ block: "nearest" });
      setTimeout(() => b.classList.remove("pulse"), 1300);
    });
  }

  function setModeBadge() {
    const b = $("modeBadge");
    if (Generator.isLive()) { b.textContent = "Claude 实时生成 · 需访问码"; b.className = "mode-badge live"; }
    else { b.textContent = "DEMO · 本地规则引擎" + (DATA.usingFallback ? "（内联数据）" : ""); b.className = "mode-badge demo"; }
  }

  function renderChips(container, list, set) {
    container.innerHTML = "";
    list.forEach(([val, label]) => {
      const el = document.createElement("span");
      el.className = "chip" + (set.has(val) ? " on" : ""); el.textContent = label; el.dataset.val = val;
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
      el.className = "chip"; el.textContent = "🇨🇳 " + h.nameZh; el.title = h.bridgeHint || "";
      el.addEventListener("click", () => {
        $("dateStart").value = h.start; $("dateEnd").value = h.end;
        $("dateHint").textContent = h.bridgeHint ? ("💡 " + h.bridgeHint) : "";
        updateDestHolidayHint();
      });
      box.appendChild(el);
    });
  }

  const GRAN_INPUT = { country: "destCountry", region: "destRegion", playstyle: "destPlaystyle", none: "destNone" };
  function wireGranularity() {
    $("granSeg").querySelectorAll(".seg-btn").forEach(btn => {
      btn.addEventListener("click", () => setGranularity(btn.dataset.gran));
    });
  }
  function setGranularity(gran) {
    state.gran = gran;
    $("granSeg").querySelectorAll(".seg-btn").forEach(b => b.classList.toggle("active", b.dataset.gran === gran));
    Object.values(GRAN_INPUT).forEach(id => $(id).classList.add("hidden"));
    $(GRAN_INPUT[gran]).classList.remove("hidden");
    updateDestHolidayHint();
  }

  function wireMisc() {
    $("freeText").addEventListener("input", e => $("ftCount").textContent = e.target.value.length);
    $("destCountry").addEventListener("change", updateDestHolidayHint);
    ["dateStart", "dateEnd"].forEach(id => $(id).addEventListener("change", updateDestHolidayHint));
  }

  // 节假日重叠提示（复用：输入区提示 + 版本对比）
  function holidayOverlap(country, start, end) {
    const cal = (DATA.holidays || []).find(h => h.region === country);
    if (!cal) return { missing: true, items: [] };
    end = end || start;
    return { missing: false, items: cal.holidays.filter(h => !(h.end < start || h.start > end)) };
  }
  // G7
  function updateDestHolidayHint() {
    const hint = $("destHolidayHint"); hint.textContent = "";
    if (state.gran !== "country") return;
    const country = $("destCountry").value, start = $("dateStart").value, end = $("dateEnd").value || start;
    if (!country || !start) return;
    const r = holidayOverlap(country, start, end);
    if (r.missing) { hint.textContent = "（该目的地该年节假日数据暂未收录）"; return; }
    if (!r.items.length) return;
    hint.innerHTML = r.items.map(h => {
      const imp = h.destinationImpact;
      const icon = imp && imp.highlight === "festival" ? "🎉" : imp && imp.highlight === "closure_crowd_price" ? "⚠️" : "🎉⚠️";
      return `${icon} ${esc(h.nameZh)}：${esc(imp ? imp.note : "当地假期")}`;
    }).join("<br/>");
  }

  // ---------- 输入收集 / 校验 / 回填 ----------
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
  function validateInput(input) {
    if (input.dateRange && input.dateRange.start && input.dateRange.end && input.dateRange.end < input.dateRange.start)
      return "结束日期不能早于开始日期";
    return null;
  }
  // 切换版本时把表单恢复成该版本的输入
  function setFormFromInput(input) {
    input = input || {};
    $("origin").value = input.origin || "";
    $("dateStart").value = input.dateRange && input.dateRange.start || "";
    $("dateEnd").value = input.dateRange && input.dateRange.end || "";
    $("freeText").value = input.freeText || ""; $("ftCount").textContent = ($("freeText").value).length;
    $("pace").value = input.pace || "";
    $("companion").value = input.companion || "";
    state.mood = new Set(input.moodTags || []);
    const d = input.destination || { granularity: "country" };
    state.playstyle = new Set(d.playstyleTags || []);
    $("destCountry").value = d.country || "";
    $("destRegion").value = d.regionText || "";
    renderChips($("moodChips"), MOODS, state.mood);
    renderChips($("destPlaystyle"), PLAYSTYLES, state.playstyle);
    setGranularity(d.granularity || "country");
  }

  function showLoading(t) { document.body.classList.add("is-loading"); $("placeholder").classList.add("hidden"); $("loadingText").textContent = t || "生成中…"; $("loading").classList.remove("hidden"); }
  function hideLoading() { document.body.classList.remove("is-loading"); $("loading").classList.add("hidden"); }
  function clearStages() {
    ["stageRecommend", "stageCompare", "stageBestTime", "stageTrip", "stageVersionCompare"]
      .forEach(id => { $(id).innerHTML = ""; $(id).classList.add("hidden"); });
  }

  // ---------- 主流程：更新当前方案 / 生成新方案 ----------
  async function onGenerate(asNew) {
    const input = gatherInput();
    const err = validateInput(input);
    $("inputError").textContent = err || "";
    if (err) return;

    let v = active();
    if (asNew || !v) {
      v = { id: "v" + (++state.seq), num: state.seq, input, result: null, picked: null, destCompare: new Set(), undo: null };
      state.plans.push(v); state.activeId = v.id;
    } else {
      v.undo = { input: clone(v.input), result: v.result ? clone(v.result) : null, picked: v.picked }; // 一步撤销
      v.input = input; v.destCompare = new Set();
    }

    showLoading(asNew ? "生成新方案…" : "更新当前方案…");
    $("generateBtn").disabled = true; $("newPlanBtn").disabled = true;
    try {
      const res = await Generator.generate(input);
      v.result = res;
      v.picked = (res.type === "besttime" || res.type === "trip") ? input.destination.country : null;
      hideLoading();
      renderResult(v);
      afterPlanChange();
    } catch (e) {
      hideLoading(); $("inputError").textContent = "生成出错：" + e.message;
    } finally { $("generateBtn").disabled = false; $("newPlanBtn").disabled = false; }
  }

  function afterPlanChange() {
    $("newPlanBtn").classList.remove("hidden");
    $("generateBtn").textContent = "更新当前方案 ↻";
    renderVersionBar();
    renderSummaryBar();
    setFocus("output"); // 出方案/更新成功 → 回到 OUTPUT 态并收起输入区
  }

  // 按当前 result 渲染（用于生成后 & 版本切换）
  function renderResult(v) {
    clearStages();
    if (!v.result) return;
    const res = v.result;
    if (res.type === "recommend") renderRecommend(res, v);
    else if (res.type === "besttime") renderBestTime(res, res.data.country);
    else if (res.type === "trip") renderTrip(res);
  }

  // ---------- 版本标签栏 ----------
  function versionLabel(v) {
    const r = v.result;
    let name = "待定";
    if (r && (r.type === "besttime" || r.type === "trip")) name = r.data.destinationNameZh || r.data.meta && r.data.meta.destinationNameZh;
    else if (r && r.type === "recommend") name = "选地中";
    else if (v.input.destination && v.input.destination.country) name = DATA.libraries[v.input.destination.country].countryNameZh;
    return `V${v.num}·${name}`;
  }
  function renderVersionBar() {
    const bar = $("versionBar");
    if (!state.plans.length) { bar.classList.add("hidden"); return; }
    bar.classList.remove("hidden");
    let html = `<span class="vb-label">方案版本：</span>`;
    state.plans.forEach(v => {
      html += `<span class="vtab ${v.id === state.activeId ? "active" : ""}" data-id="${v.id}">
        <input type="checkbox" class="vchk" data-id="${v.id}" ${state.vcompare.has(v.id) ? "checked" : ""} title="勾选以并排对比"/>
        <span class="vname" data-id="${v.id}">${esc(versionLabel(v))}</span></span>`;
    });
    const v = active();
    html += `<span class="vb-actions">
      <button class="btn-ghost" id="undoBtn" ${v && v.undo ? "" : "disabled"}>↩️ 撤销</button>
      <button class="btn-primary" id="vcmpBtn" style="padding:5px 14px" ${state.vcompare.size >= 2 ? "" : "disabled"}>并排对比 ${state.vcompare.size || ""}</button>
    </span>`;
    bar.innerHTML = html;
    bar.querySelectorAll(".vname").forEach(el => el.addEventListener("click", () => switchVersion(el.dataset.id)));
    bar.querySelectorAll(".vchk").forEach(el => el.addEventListener("change", () => toggleVcompare(el.dataset.id, el.checked)));
    $("undoBtn").addEventListener("click", undo);
    $("vcmpBtn").addEventListener("click", renderVersionCompare);
  }
  function switchVersion(id) {
    if (id === state.activeId) return;
    state.activeId = id;
    const v = active();
    setFormFromInput(v.input);
    renderResult(v);
    renderVersionBar();
    renderSummaryBar();
    setFocus("output");
  }
  function undo() {
    const v = active();
    if (!v || !v.undo) return;
    v.input = v.undo.input; v.result = v.undo.result; v.picked = v.undo.picked; v.undo = null;
    setFormFromInput(v.input);
    renderResult(v);
    renderVersionBar();
    renderSummaryBar();
    setFocus("output");
  }
  function toggleVcompare(id, on) {
    if (on) { if (state.vcompare.size >= 3) { alert("最多对比 3 个版本"); renderVersionBar(); return; } state.vcompare.add(id); }
    else state.vcompare.delete(id);
    renderVersionBar();
  }

  // ---------- 渲染：目的地推荐 ----------
  function renderRecommend(res, v) {
    const d = res.data, box = $("stageRecommend");
    let html = `<div class="stage-head"><span class="step">阶段 ①</span><h3>目的地推荐</h3></div>`;
    html += `<p class="stage-sub">${esc(d.basis || "")}</p>`;
    if (d.isFallback) html += `<div class="fallback-note">🧭 你还没给具体信息，这是兜底推荐。填点偏好/时间会更准。</div>`;
    if (d.coverageNote) html += `<div class="coverage-note">⚠️ ${esc(d.coverageNote)}</div>`;
    if (res.warnings && res.warnings.length) html += `<div class="coverage-note">${esc(res.warnings.join(" / "))}</div>`;
    html += `<div class="cand-grid">`;
    d.candidates.forEach(c => {
      const t = c.transport, transportTxt = t ? esc(t.note || `约${t.flightHours}小时`) : "填出发地后估算";
      html += `<div class="cand-card" data-id="${esc(c.id)}">
        <div class="cand-title">${esc(c.nameZh)} <span class="badge ${c.matchLevel}">${c.matchLevel === "strong" ? "强匹配" : "相关"}</span></div>
        <div class="cand-reason">${esc(c.matchReason)}</div>
        <div class="cand-meta"><span>🗓️ ${esc(c.bestVisitTime)}</span><span>⏱️ 建议 ${c.suggestedDays} 天</span>
          <span>💰 ${COST_ZH[c.costTier] || c.costTier}</span><span>✈️ ${transportTxt}</span></div>
        <div class="cand-actions">
          <button class="btn-primary pick" data-id="${esc(c.id)}" ${c.country ? "" : "disabled"} style="flex:1">看它的行程 →</button>
          <button class="btn-ghost cmp" data-id="${esc(c.id)}" ${c.country ? "" : "disabled"}>加入对比</button>
        </div></div>`;
    });
    html += `</div><div id="cmpBar" style="margin-top:14px"></div>`;
    box.innerHTML = html; box.classList.remove("hidden");
    box.querySelectorAll(".pick").forEach(b => b.addEventListener("click", () => pickDestination(b.dataset.id)));
    box.querySelectorAll(".cmp").forEach(b => {
      if (v.destCompare.has(b.dataset.id)) { b.textContent = "已加入 ✓"; b.classList.add("active"); }
      b.addEventListener("click", () => toggleDestCompare(b));
    });
    renderCmpBar();
  }

  // 选地对比（同一版本内、不同目的地）—— G9
  function toggleDestCompare(btn) {
    const v = active(), id = btn.dataset.id;
    if (v.destCompare.has(id)) { v.destCompare.delete(id); btn.textContent = "加入对比"; btn.classList.remove("active"); }
    else { if (v.destCompare.size >= 3) { alert("最多对比 3 个目的地"); return; } v.destCompare.add(id); btn.textContent = "已加入 ✓"; btn.classList.add("active"); }
    renderCmpBar();
  }
  function renderCmpBar() {
    const bar = $("cmpBar"); if (!bar) return;
    const n = active().destCompare.size;
    if (n === 0) { bar.innerHTML = ""; return; }
    if (n === 1) { bar.innerHTML = `<span class="hint">已选 1 个；再选 1-2 个可对比，或直接「看它的行程」。</span>`; return; }
    bar.innerHTML = `<button class="btn-primary" id="doCompare" style="width:auto;padding:10px 20px">对比所选 ${n} 个目的地 →</button>`;
    $("doCompare").addEventListener("click", doDestCompare);
  }
  async function doDestCompare() {
    const v = active();
    showLoading("生成对比…");
    const res = await Generator.generate(v.input, { forceBranch: { type: "compare" }, compareIds: [...v.destCompare] });
    hideLoading();
    renderDestCompare(res.data);
  }
  function renderDestCompare(c) {
    const box = $("stageCompare");
    let html = `<div class="stage-head"><span class="step">阶段 ②</span><h3>目的地对比</h3></div>
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

  // ---------- 选定目的地 → 最佳时间 → 行程（均更新当前版本 result） ----------
  async function pickDestination(country) {
    if (!DATA.libraries[country]) return;
    const v = active();
    v.input = Object.assign({}, v.input, { destination: { granularity: "country", country } });
    document.querySelectorAll(".cand-card").forEach(c => c.classList.toggle("picked", c.dataset.id === country));
    $("stageBestTime").innerHTML = ""; $("stageTrip").innerHTML = "";
    showLoading("查最佳时间…");
    const res = await Generator.generate(v.input, { forceBranch: { type: "besttime" } });
    hideLoading();
    v.result = res; v.picked = country;
    renderBestTime(res, country);
    renderVersionBar();
    renderSummaryBar();
    setFocus("output");
  }
  function renderBestTime(res, country) {
    const b = res.data, box = $("stageBestTime");
    let html = `<div class="stage-head"><span class="step">阶段 ③</span><h3>${esc(b.destinationNameZh)} · 最佳时间</h3></div><div class="season-row">`;
    b.bestSeasons.forEach(s => html += `<span class="season-pill"><b>${SEASON_ZH[s.season]}</b> ${esc(s.reason)}</span>`);
    html += `</div><div class="period-grid">`;
    b.periods.forEach(p => html += `<div class="period-card"><h4>${esc(p.period)}</h4><div class="exp">${p.experiences.map(esc).join(" · ")}</div></div>`);
    html += `</div><div style="margin-top:14px"><button class="btn-primary" id="genTrip" style="width:auto;padding:10px 22px">生成详细行程 →</button></div>`;
    box.innerHTML = html; box.classList.remove("hidden");
    $("genTrip").addEventListener("click", async () => {
      const v = active();
      $("stageTrip").innerHTML = "";
      showLoading("排详细行程…");
      const r = await Generator.generate(v.input, { forceBranch: { type: "trip" } });
      hideLoading();
      v.result = r; v.picked = country;
      renderTrip(r); renderVersionBar(); renderSummaryBar(); setFocus("output");
    });
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- 渲染：详细行程（6 大模块） ----------
  function renderTrip(res) {
    const t = res.data, m = t.meta, box = $("stageTrip");
    let html = `<div class="stage-head"><span class="step">阶段 ④</span><h3>${esc(m.destinationNameZh)} · ${m.days} 天行程</h3></div>`;
    html += `<div class="trip-meta">
      <span class="tag pace-${m.pace}">节奏：${PACE_ZH[m.pace] || m.pace}</span>
      ${m.companion ? `<span class="tag">同行：${esc(COMP_ZH[m.companion] || m.companion)}</span>` : ""}
      ${(m.moodTags || []).map(x => `<span class="tag">#${esc(x)}</span>`).join("")}
      ${m.season ? `<span class="tag">${SEASON_ZH[m.season]}季出行</span>` : ""}</div>`;
    if (res.mode && res.mode.indexOf("demo") === 0) html += `<div class="demo-trip-note">⚙️ ${esc((t.warnings || []).join(" "))}</div>`;
    if (res.warnings && res.warnings.length) html += `<div class="timing-warn">${esc(res.warnings.join(" "))}</div>`;
    if (t.timingWarning) html += `<div class="timing-warn">⚠️ ${esc(t.timingWarning)}</div>`;

    html += `<div class="module"><h4>🚄 1. 最佳出行路线</h4><div>${esc(t.route.summary)}</div>`;
    t.route.segments.forEach(s => html += `<div class="route-seg">· [${esc(s.mode)}] ${esc(s.from)} → ${esc(s.to)}：${esc(s.detail)} <span class="source">（${esc(s.source)}）</span></div>`);
    if (t.route.tips) html += `<div class="route-seg">💡 ${esc(t.route.tips)}</div>`;
    html += `</div><div class="module"><h4>🗓️ 2. 按天安排（含景点 · 美食）</h4>`;
    t.dailyPlan.forEach(d => {
      html += `<div class="day"><div class="day-head"><span class="day-num">${d.day}</span>
        <span class="day-title">${esc(d.title)}</span>
        <span class="day-type ${d.dayType}">${d.dayType === "core" ? "核心天" : "可选延展"}</span></div>`;
      d.activities.forEach(a => html += `<div class="slot"><span class="when">${esc(a.timeSlot || "")}</span>${esc(a.name)} — ${esc(a.summary)} <span class="source">（${esc(a.source)}）</span></div>`);
      if (d.meals && d.meals.length) html += `<div class="meals-line">🍽️ ${d.meals.map(me => esc(me.name) + (me.reason ? "（" + esc(me.reason) + "）" : "")).join("　·　")}</div>`;
      html += `</div>`;
    });
    if (t.flexibility) html += `<div class="flex-note">🔧 弹性：核心 ${t.flexibility.coreDays} 天 / 可选 ${t.flexibility.optionalDays} 天。${esc(t.flexibility.note || "")}</div>`;
    html += `</div><div class="module"><h4>📌 5. 需提前预约</h4>`;
    if (t.reservations.length) t.reservations.forEach(r => html += `<div class="resv-item"><b>${esc(r.name)}</b>：${esc(r.method)}，${esc(r.leadTime)} <span class="source">（${esc(r.source)}）</span></div>`);
    else html += `<div class="resv-item">本行程无需特别预约。</div>`;
    html += `</div><div class="module"><h4>🌤️ 6. 季节建议</h4>`;
    t.seasonalTips.forEach(s => html += `<div class="tip-item">· ${esc(s.tip)} <span class="source">（${esc(s.source)}）</span></div>`);
    html += `</div>`;
    box.innerHTML = html; box.classList.remove("hidden");
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  // ---------- 版本并排对比（不同目的地 / 同地不同时间，通用） ----------
  function versionSummary(v) {
    const inp = v.input || {}, dr = inp.dateRange, r = v.result;
    const country = (inp.destination && inp.destination.country) || v.picked || (r && r.data && r.data.meta && r.data.meta.destinationCountry) || null;
    const destName = country ? DATA.libraries[country].countryNameZh
      : (inp.destination && inp.destination.regionText) || ((inp.destination && inp.destination.granularity === "playstyle") ? (inp.destination.playstyleTags || []).join("/") : "未定");
    const time = dr ? `${dr.start || ""}~${dr.end || dr.start || ""}` : "未定";
    const days = (dr && dr.days) || (r && r.data && r.data.meta && r.data.meta.days) || "—";
    const pace = inp.pace || ((inp.moodTags || []).includes("relax") ? "relaxed" : "balanced");
    let holiday = "—";
    if (country && dr && dr.start) {
      const o = holidayOverlap(country, dr.start, dr.end);
      holiday = o.missing ? "数据未收录" : (o.items.length ? o.items.map(h => h.nameZh).join("、") : "无特别影响");
    }
    return {
      dest: destName || "未定", time, days: String(days),
      pace: PACE_ZH[pace] || pace,
      companion: inp.companion ? (COMP_ZH[inp.companion] || inp.companion) : "通用",
      tags: (inp.moodTags || []).join("/") || "—",
      holiday, cost: country ? COST_ZH[COST[country]] : "—"
    };
  }
  function renderVersionCompare() {
    if (state.vcompare.size < 2) return;
    const vs = state.plans.filter(p => state.vcompare.has(p.id));
    const sums = vs.map(versionSummary);
    const rows = [["dest", "目的地"], ["time", "时间"], ["days", "天数"], ["pace", "节奏"], ["companion", "同行人"], ["tags", "偏好标签"], ["holiday", "当地节假日"], ["cost", "花费档"]];
    let sameCount = 0;
    let body = "";
    rows.forEach(([k, label]) => {
      const vals = sums.map(s => s[k]);
      const diff = new Set(vals).size > 1;
      if (!diff) sameCount++;
      body += `<tr class="${diff ? "diff" : "same-row"}"><th>${label}</th>${vals.map(x => `<td>${esc(x)}</td>`).join("")}</tr>`;
    });
    let html = `<div class="stage-head"><span class="step">版本对比</span><h3>方案并排对比</h3>
        <button type="button" class="btn-ghost" id="exitCmpBtn" style="margin-left:auto;font-size:12px;padding:5px 12px">← 返回方案</button></div>
      <p class="stage-sub">⚡ 只突出差异：差异行高亮，相同行已淡化${sameCount ? "（默认折叠）" : ""}。</p>
      <table class="vcmp-table"><thead><tr><th>维度</th>`;
    vs.forEach(v => html += `<th>${esc(versionLabel(v))}</th>`);
    html += `</tr></thead><tbody>${body}</tbody></table>`;
    if (sameCount) html += `<label class="same-toggle"><input type="checkbox" id="sameToggle"/> 展开相同项（${sameCount}）</label>`;
    const box = $("stageVersionCompare");
    box.innerHTML = html; box.classList.remove("hidden");
    // 默认折叠相同行；其余 UI 弱化
    document.body.classList.add("hide-same");
    setFocus("compare");
    const tgl = $("sameToggle");
    if (tgl) tgl.addEventListener("change", () => document.body.classList.toggle("hide-same", !tgl.checked));
    $("exitCmpBtn").addEventListener("click", () => {
      box.classList.add("hidden");
      setFocus("output");
    });
    box.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  document.addEventListener("DOMContentLoaded", init);
})();

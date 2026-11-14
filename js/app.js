(() => {
  "use strict";
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const SLOTS = () => [ css("--s1"), css("--s2"), css("--s3"), css("--s4"), css("--s5"), css("--s6"), css("--s7"), css("--s8") ];
  const SEQ = [ "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b" ];
  const fmt0 = n => "฿" + Math.round(n).toLocaleString("en-US");
  const fmt2 = n => "฿" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const MONTHS = [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ];

  // ---- mutable data state (rebuilt by setData when a file is loaded) ----
  let raw = [], years = [], lastDate = new Date();
  let catSlot = {}, incomeSlot = {}, incomeCatAll = {};
  let period = { label: "All time", start: null, end: null };
  // stable category colors: rank by all-time expense within the loaded dataset, color follows entity
  const catColor = c => catSlot[ c ] < 8 ? SLOTS()[ catSlot[ c ] ] : css("--muted");
  const incomeColor = c => incomeSlot[ c ] < 8 ? SLOTS()[ incomeSlot[ c ] ] : css("--muted");

  function setData(rows, sourceLabel) {
    raw = (rows || []).filter(t => (t.type === "Income" || t.type === "Expense") && t.date);
    document.getElementById("noData").style.display = raw.length ? "none" : "block";
    raw.forEach(t => { t.d = new Date(t.date + "T00:00:00"); t.ym = t.date.slice(0, 7); });
    raw.sort((a, b) => a.d - b.d);
    const at = {};
    raw.filter(t => t.type === "Expense").forEach(t => { at[ t.category ] = (at[ t.category ] || 0) + t.amount; });
    catSlot = {};
    Object.keys(at).sort((a, b) => at[ b ] - at[ a ]).forEach((c, i) => { catSlot[ c ] = i; });
    incomeCatAll = {};
    raw.filter(t => t.type === "Income").forEach(t => { incomeCatAll[ t.category ] = (incomeCatAll[ t.category ] || 0) + t.amount; });
    incomeSlot = {};
    Object.keys(incomeCatAll).sort((a, b) => incomeCatAll[ b ] - incomeCatAll[ a ]).forEach((c, i) => { incomeSlot[ c ] = i; });
    years = [ ...new Set(raw.map(t => t.d.getFullYear())) ].sort();
    lastDate = raw.length ? raw[ raw.length - 1 ].d : new Date();
    // open on the current month (or the latest month with real data if the export is older)
    const openYm = MM.defaultMonth(raw, todayIso());
    period = openYm ? monthPeriod(openYm) : { label: "All time", start: null, end: null };
    document.getElementById("exportedAt").textContent = sourceLabel || "";
    renderStale();
    populateTrendSel();
    populateTxCat();
    buildFilters();
    renderAll();
  }

  const todayIso = () => MM.isoDate(new Date());
  function monthPeriod(ym) {
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1;
    return { label: `${MONTHS[ m ]} ${y}`, start: new Date(y, m, 1), end: new Date(y, m + 1, 0) };
  }
  // "YYYY-MM" when the period is exactly one calendar month, else null
  const periodMonth = p => p.start ? MM.singleMonth(MM.isoDate(p.start), MM.isoDate(p.end)) : null;

  // warn when the export has not been refreshed for a while
  function renderStale() {
    const el = document.getElementById("staleData");
    const s = MM.staleness(raw, todayIso());
    el.style.display = s && s.stale ? "block" : "none";
    if (s && s.stale) el.innerHTML = `Data may be out of date — the latest transaction is from <b>${s.latest}</b> (${s.days} days ago). Export a new file from the Money Manager app, then use <b>⤒ load data</b>.`;
  }

  function setPeriod(p) {
    period = p;
    txState.page = 1;
    syncFilters();
    renderAll();
  }

  // make every filter control show the active period
  function syncFilters() {
    const same = (a, b) => (a ? +a : 0) === (b ? +b : 0);
    document.querySelectorAll("#filters button.preset").forEach(b =>
      b.classList.toggle("active", same(b._period.start, period.start) && same(b._period.end, period.end)));
    const ym = periodMonth(period);
    const bounds = MM.monthBounds(raw, todayIso());
    document.getElementById("monthLabel").textContent = ym ? monthPeriod(ym).label : period.label;
    document.getElementById("monthPrev").disabled = !bounds || (ym != null && ym <= bounds.min);
    document.getElementById("monthNext").disabled = !bounds || (ym != null && ym >= bounds.max);
    if (ym) {
      document.getElementById("yearSel").value = ym.slice(0, 4);
      document.getElementById("monthSel").value = String(+ym.slice(5, 7) - 1);
    }
  }

  function buildFilters() {
    const now = new Date(); // anchor presets to today, not the latest (possibly future-dated) transaction
    const mk = (label, start, end) => ({ label, start, end });
    const som = new Date(now.getFullYear(), now.getMonth(), 1);
    const presets = [
      mk("All time", null, null),
      mk("This month", som, new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      mk("Last 3M", new Date(now.getFullYear(), now.getMonth() - 2, 1), new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      mk("Last 12M", new Date(now.getFullYear(), now.getMonth() - 11, 1), new Date(now.getFullYear(), now.getMonth() + 1, 0)),
      mk("YTD", new Date(now.getFullYear(), 0, 1), new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    ];
    const el = document.getElementById("filters");
    el.innerHTML = "";

    // year + month dropdowns
    const yearSel = document.createElement("select");
    yearSel.id = "yearSel";
    yearSel.innerHTML = '<option value="">Year</option>' + [ ...years ].reverse().map(y => `<option>${y}</option>`).join("");
    const monthSel = document.createElement("select");
    monthSel.id = "monthSel";
    monthSel.innerHTML = '<option value="">Month</option>' + MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join("");
    // custom range inputs
    const startInp = document.createElement("input");
    const endInp = document.createElement("input");
    startInp.type = endInp.type = "date";
    startInp.title = "Custom range start"; endInp.title = "Custom range end";
    if (raw.length) {
      const isoOf = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      startInp.min = endInp.min = isoOf(raw[ 0 ].d);
      startInp.max = endInp.max = isoOf(lastDate);
    }
    const resetDropdowns = () => { yearSel.value = ""; monthSel.value = ""; };
    const resetDates = () => { startInp.value = ""; endInp.value = ""; };

    // month stepper: ‹ Nov 2026 ›
    const stepper = document.createElement("span");
    stepper.className = "stepper";
    stepper.innerHTML = `<button id="monthPrev" title="Previous month" aria-label="Previous month">‹</button><span id="monthLabel" aria-live="polite"></span><button id="monthNext" title="Next month" aria-label="Next month">›</button>`;
    el.appendChild(stepper);
    const step = delta => {
      const bounds = MM.monthBounds(raw, todayIso());
      if (!bounds) return;
      const cur = periodMonth(period);
      // from a longer period the first click lands on its last month (never past the data we really have)
      const target = cur ? MM.stepMonth(cur, delta, bounds)
        : MM.stepMonth(period.end ? MM.isoDate(new Date(Math.min(period.end, Date.now()))).slice(0, 7) : (MM.defaultMonth(raw, todayIso()) || bounds.max), 0, bounds);
      resetDates();
      setPeriod(monthPeriod(target));
    };
    stepper.querySelector("#monthPrev").onclick = () => step(-1);
    stepper.querySelector("#monthNext").onclick = () => step(1);

    presets.forEach(p => {
      const b = document.createElement("button");
      b.className = "preset";
      b.textContent = p.label;
      b._period = p;
      b.onclick = () => { resetDropdowns(); resetDates(); setPeriod(p); };
      el.appendChild(b);
    });

    const onDropdown = () => {
      const y = +yearSel.value || null;
      const m = monthSel.value === "" ? null : +monthSel.value;
      if (!y && m == null) return;
      const yy = y || years[ years.length - 1 ]; // month picked without a year -> latest data year
      yearSel.value = String(yy);
      resetDates();
      if (m == null) setPeriod(mk(String(yy), new Date(yy, 0, 1), new Date(yy, 11, 31)));
      else setPeriod(mk(`${MONTHS[ m ]} ${yy}`, new Date(yy, m, 1), new Date(yy, m + 1, 0)));
    };
    yearSel.onchange = monthSel.onchange = onDropdown;
    el.appendChild(yearSel);
    el.appendChild(monthSel);

    const onCustom = () => {
      // one-sided ranges work too: missing start = from first data, missing end = to last data
      if (!startInp.value && !endInp.value) return;
      const s = startInp.value ? new Date(startInp.value + "T00:00:00") : (raw.length ? raw[ 0 ].d : null);
      const e = endInp.value ? new Date(endInp.value + "T00:00:00") : lastDate;
      if (!s || !e || s > e) return;
      resetDropdowns();
      setPeriod(mk(`${startInp.value || "start"} → ${endInp.value || "end"}`, s, e));
    };
    // change fires on picker use; input catches typed dates as soon as they are complete
    startInp.onchange = endInp.onchange = startInp.oninput = endInp.oninput = onCustom;
    const sep = document.createElement("span");
    sep.className = "sep"; sep.textContent = "range";
    el.appendChild(sep);
    el.appendChild(startInp);
    el.appendChild(endInp);
    syncFilters();
  }

  const inPeriod = t => (!period.start || (t.d >= period.start && t.d <= period.end));
  const filtered = () => raw.filter(inPeriod);

  // ---- helpers ----
  function monthKeys(list) { return [ ...new Set(list.map(t => t.ym)) ].sort(); }
  function groupBy(list, keyFn, valFn) {
    const m = {};
    list.forEach(t => { const k = keyFn(t); m[ k ] = (m[ k ] || 0) + (valFn ? valFn(t) : t.amount); });
    return m;
  }

  // ---- Chart.js global defaults ----
  function applyChartDefaults() {
    Chart.defaults.font.family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
    Chart.defaults.font.size = 11.5;
    Chart.defaults.color = css("--muted");
    Chart.defaults.borderColor = css("--grid");
    Chart.defaults.plugins.legend.labels.boxWidth = 10;
    Chart.defaults.plugins.legend.labels.boxHeight = 10;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.tooltip.backgroundColor = css("--ink");
    Chart.defaults.plugins.tooltip.titleColor = css("--page");
    Chart.defaults.plugins.tooltip.bodyColor = css("--page");
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.cornerRadius = 8;
    Chart.defaults.plugins.tooltip.displayColors = true;
    Chart.defaults.plugins.tooltip.boxWidth = 8;
    Chart.defaults.plugins.tooltip.boxHeight = 8;
  }
  const charts = {};
  function mkChart(id, cfg) {
    if (charts[ id ]) charts[ id ].destroy();
    charts[ id ] = new Chart(document.getElementById(id), cfg);
  }
  const moneyTicks = { callback: v => "฿" + (Math.abs(v) >= 1000 ? (v / 1000).toLocaleString() + "k" : v.toLocaleString()) };
  const tipMoney = { label: c => ` ${c.dataset.label ?? c.label}: ${fmt0(c.parsed.y ?? c.parsed.x ?? c.parsed)}` };

  // ---- KPI row ----
  function renderKPIs(list) {
    const inc = list.filter(t => t.type === "Income").reduce((s, t) => s + t.amount, 0);
    const exp = list.filter(t => t.type === "Expense").reduce((s, t) => s + t.amount, 0);
    const net = inc - exp;
    const rate = inc > 0 ? net / inc * 100 : null;
    const today = new Date();
    let days;
    if (period.start) days = Math.max(1, Math.round((Math.min(period.end, today, lastDate) - period.start) / 864e5) + 1);
    else days = raw.length ? Math.max(1, Math.round((Math.min(today, lastDate) - raw[ 0 ].d) / 864e5) + 1) : 1;
    const daily = exp / days;

    // previous equivalent period for deltas
    let deltas = {};
    if (period.start) {
      const len = period.end - period.start;
      const pEnd = new Date(period.start.getTime() - 864e5);
      const pStart = new Date(pEnd.getTime() - len);
      const prev = raw.filter(t => t.d >= pStart && t.d <= pEnd);
      const pInc = prev.filter(t => t.type === "Income").reduce((s, t) => s + t.amount, 0);
      const pExp = prev.filter(t => t.type === "Expense").reduce((s, t) => s + t.amount, 0);
      if (prev.length) deltas = { inc: pInc ? (inc - pInc) / pInc * 100 : null, exp: pExp ? (exp - pExp) / pExp * 100 : null };
    }
    const dHtml = (v, goodWhenDown) => {
      if (v == null || !isFinite(v)) return "";
      const up = v >= 0;
      const cls = (up !== goodWhenDown) ? "up" : "down";
      return `<div class="delta"><span class="${cls}">${up ? "▲" : "▼"} ${Math.abs(v).toFixed(0)}%</span> vs previous period</div>`;
    };
    const tiles = [
      { l: "Income", v: fmt0(inc), extra: dHtml(deltas.inc, false), color: "var(--income)" },
      { l: "Expense", v: fmt0(exp), extra: dHtml(deltas.exp, true), color: "var(--expense)" },
      { l: "Net (saved)", v: (net < 0 ? "−" : "") + fmt0(Math.abs(net)), extra: "", color: net >= 0 ? "var(--good)" : "var(--bad)" },
      { l: "Savings rate", v: rate == null ? "—" : rate.toFixed(0) + "%", extra: `<div class="delta">of income kept</div>`, color: rate != null && rate >= 0 ? "var(--good)" : "var(--bad)" },
      { l: "Avg daily spend", v: fmt0(daily), extra: `<div class="delta">over ${days} days</div>`, color: "var(--ink)" },
    ];
    document.getElementById("kpis").innerHTML = tiles.map(t =>
      `<div class="kpi"><div class="lbl">${t.l}</div><div class="val" style="color:${t.color}">${t.v}</div>${t.extra}</div>`).join("");
  }

  // ---- cash flow ----
  function renderCashflow(list) {
    const keys = monthKeys(list);
    const monthly = keys.length <= 2;
    const cap = document.getElementById("cashflowCap");
    if (monthly) {
      cap.textContent = "Daily income vs expense";
      const days = [ ...new Set(list.map(t => t.date)) ].sort();
      const inc = groupBy(list.filter(t => t.type === "Income"), t => t.date);
      const exp = groupBy(list.filter(t => t.type === "Expense"), t => t.date);
      mkChart("cashflow", {
        type: "bar",
        data: {
          labels: days.map(d => d.slice(8)), datasets: [
            { label: "Income", data: days.map(d => inc[ d ] || 0), backgroundColor: css("--income"), borderRadius: 4, borderSkipped: "start", maxBarThickness: 22 },
            { label: "Expense", data: days.map(d => exp[ d ] || 0), backgroundColor: css("--expense"), borderRadius: 4, borderSkipped: "start", maxBarThickness: 22 },
          ]
        },
        options: {
          maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
          plugins: { tooltip: { callbacks: tipMoney } },
          scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: moneyTicks } }
        }
      });
    } else {
      cap.textContent = "Monthly income vs expense, with net and a 3-month average expense trend";
      const inc = groupBy(list.filter(t => t.type === "Income"), t => t.ym);
      const exp = groupBy(list.filter(t => t.type === "Expense"), t => t.ym);
      const expArr = keys.map(k => exp[ k ] || 0);
      const roll = expArr.map((_, i) => {
        const w = expArr.slice(Math.max(0, i - 2), i + 1);
        return w.reduce((a, b) => a + b, 0) / w.length;
      });
      mkChart("cashflow", {
        type: "bar",
        data: {
          labels: keys, datasets: [
            { label: "Income", data: keys.map(k => inc[ k ] || 0), backgroundColor: css("--income"), borderRadius: 4, borderSkipped: "start", maxBarThickness: 26, order: 3 },
            { label: "Expense", data: expArr, backgroundColor: css("--expense"), borderRadius: 4, borderSkipped: "start", maxBarThickness: 26, order: 3 },
            { label: "Net", type: "line", data: keys.map(k => (inc[ k ] || 0) - (exp[ k ] || 0)), borderColor: css("--net"), backgroundColor: css("--net"), borderWidth: 2, pointRadius: keys.length > 24 ? 0 : 2.5, tension: .3, order: 1 },
            { label: "Expense 3-mo avg", type: "line", data: roll, borderColor: css("--muted"), borderDash: [ 5, 4 ], borderWidth: 1.5, pointRadius: 0, tension: .3, order: 2 },
          ]
        },
        options: {
          maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
          plugins: { tooltip: { callbacks: tipMoney } },
          scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 14 } }, y: { ticks: moneyTicks } }
        }
      });
    }
  }

  // ---- donut with subcategory drill-down ----
  let drillCat = null;
  function renderDonut(list) {
    const exp = list.filter(t => t.type === "Expense");
    const back = document.getElementById("donutBack");
    const cap = document.getElementById("donutCap");
    let labels, values, colors;
    if (drillCat) {
      back.style.display = "inline-block";
      cap.textContent = `Subcategories of ${drillCat}`;
      const g = groupBy(exp.filter(t => t.category === drillCat), t => t.subCategory || "(none)");
      const order = Object.keys(g).sort((a, b) => g[ b ] - g[ a ]);
      labels = order.slice(0, 8); values = labels.map(k => g[ k ]);
      const rest = order.slice(8).reduce((s, k) => s + g[ k ], 0);
      if (rest > 0) { labels.push("Everything else"); values.push(rest); }
      colors = labels.map((l, i) => l === "Everything else" ? css("--muted") : SLOTS()[ i ]);
    } else {
      back.style.display = "none";
      cap.textContent = "Expense by category — click a slice to drill into subcategories";
      const g = groupBy(exp, t => t.category);
      const order = Object.keys(g).sort((a, b) => g[ b ] - g[ a ]);
      labels = order.slice(0, 8); values = labels.map(k => g[ k ]);
      const rest = order.slice(8).reduce((s, k) => s + g[ k ], 0);
      if (rest > 0) { labels.push("Everything else"); values.push(rest); }
      colors = labels.map(l => l === "Everything else" ? css("--muted") : catColor(l));
    }
    const total = values.reduce((a, b) => a + b, 0);
    mkChart("donut", {
      type: "doughnut",
      data: { labels, datasets: [ { data: values, backgroundColor: colors, borderColor: css("--surface"), borderWidth: 2, hoverOffset: 6 } ] },
      options: {
        maintainAspectRatio: false, cutout: "62%",
        plugins: {
          legend: { position: "right" },
          tooltip: { callbacks: { label: c => ` ${c.label}: ${fmt0(c.parsed)} (${total ? (c.parsed / total * 100).toFixed(1) : 0}%)` } }
        },
        onClick: (e, els, chart) => {
          if (drillCat || !els.length) return;
          const l = chart.data.labels[ els[ 0 ].index ];
          if (l !== "Everything else") { drillCat = l; renderDonut(filtered()); }
        }
      }
    });
  }
  document.getElementById("donutBack").onclick = () => { drillCat = null; renderDonut(filtered()); };

  // ---- top categories horizontal bar ----
  function renderTopCat(list) {
    const g = groupBy(list.filter(t => t.type === "Expense"), t => t.category);
    const order = Object.keys(g).sort((a, b) => g[ b ] - g[ a ]).slice(0, 10);
    mkChart("topcat", {
      type: "bar",
      data: { labels: order, datasets: [ { data: order.map(k => g[ k ]), backgroundColor: order.map(catColor), borderRadius: 4, borderSkipped: "start", maxBarThickness: 18 } ] },
      options: {
        indexAxis: "y", maintainAspectRatio: false,
        // horizontal bar: the value lives on parsed.x (parsed.y is the row index)
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` ${fmt0(c.parsed.x)}` } } },
        scales: { x: { ticks: moneyTicks }, y: { grid: { display: false } } },
        onClick: (e, els, chart) => {
          if (!els.length) return;
          trendCat = chart.data.labels[ els[ 0 ].index ];
          const sel = document.getElementById("trendSel");
          if ([ ...sel.options ].some(o => o.value === trendCat)) sel.value = trendCat;
          renderCatTrend();
          document.getElementById("cattrend").scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    });
  }

  // ---- year over year (all data, emphasis on latest year) ----
  function renderYoY() {
    const exp = raw.filter(t => t.type === "Expense");
    const latest = years[ years.length - 1 ];
    const grays = [ "#c3c2b7", "#aeada4", "#989791", "#82817c", "#6d6c68", "#585753" ];
    const datasets = years.map((y, i) => {
      const g = groupBy(exp.filter(t => t.d.getFullYear() === y), t => t.d.getMonth());
      const isLatest = y === latest;
      return {
        label: String(y),
        data: MONTHS.map((_, m) => g[ m ] ?? null),
        borderColor: isLatest ? css("--net") : grays[ i % grays.length ],
        backgroundColor: isLatest ? css("--net") : css("--axis"),
        borderWidth: isLatest ? 2.5 : 1.4,
        pointRadius: isLatest ? 2.5 : 0,
        tension: .3, spanGaps: true,
      };
    });
    mkChart("yoy", {
      type: "line",
      data: { labels: MONTHS, datasets },
      options: {
        maintainAspectRatio: false, interaction: { mode: "nearest", intersect: false },
        plugins: { tooltip: { callbacks: tipMoney } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: moneyTicks } }
      }
    });
  }

  // ---- income sources stacked ----
  function renderIncomeSrc(list) {
    const inc = list.filter(t => t.type === "Income");
    const keys = monthKeys(inc);
    const cats = [ ...new Set(inc.map(t => t.category)) ].sort((a, b) => (incomeCatAll[ b ] || 0) - (incomeCatAll[ a ] || 0));
    mkChart("incomesrc", {
      type: "bar",
      data: {
        labels: keys, datasets: cats.map(c => {
          const g = groupBy(inc.filter(t => t.category === c), t => t.ym);
          return { label: c, data: keys.map(k => g[ k ] || 0), backgroundColor: incomeColor(c), borderRadius: 3, maxBarThickness: 26, borderColor: css("--surface"), borderWidth: 1 };
        })
      },
      options: {
        maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { callbacks: tipMoney } },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 12 } }, y: { stacked: true, ticks: moneyTicks } }
      }
    });
  }

  // ---- expenses stacked by category ----
  function renderExpenseStack(list) {
    const exp = list.filter(t => t.type === 'Expense');
    const keys = monthKeys(exp);
    // top 8 all-time categories keep their entity colors; the rest folds into one muted band
    const cats = Object.keys(catSlot).filter(c => catSlot[ c ] < 8);
    const datasets = cats.map(c => {
      const g = groupBy(exp.filter(t => t.category === c), t => t.ym);
      return { label: c, data: keys.map(k => g[ k ] || 0), backgroundColor: catColor(c), borderColor: css('--surface'), borderWidth: 1, maxBarThickness: 26 };
    });
    const gOther = groupBy(exp.filter(t => catSlot[ t.category ] >= 8), t => t.ym);
    if (Object.keys(gOther).length) datasets.push({ label: 'Everything else', data: keys.map(k => gOther[ k ] || 0), backgroundColor: css('--muted'), borderColor: css('--surface'), borderWidth: 1, maxBarThickness: 26 });
    mkChart('expstack', {
      type: 'bar',
      data: { labels: keys, datasets },
      options: {
        maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { tooltip: { callbacks: tipMoney } },
        scales: { x: { stacked: true, grid: { display: false }, ticks: { maxTicksLimit: 14 } }, y: { stacked: true, ticks: moneyTicks } }
      }
    });
  }

  // ---- fixed vs variable ----
  function renderFixedVar(list) {
    let exp = list.filter(t => t.type === "Expense");
    let keys = monthKeys(exp);
    const box = document.getElementById("fixedvar");
    const share = document.getElementById("fixedShare");
    if (keys.length < 3) {
      share.innerHTML = "";
      box.innerHTML = `<p class="cap">Select a period of 3+ months to estimate fixed vs variable spending.</p>`;
      return;
    }
    // long ranges drift (categories appear/disappear over years) — judge on the trailing 12 months
    if (keys.length > 12) {
      keys = keys.slice(-12);
      const set = new Set(keys);
      exp = exp.filter(t => set.has(t.ym));
    }
    const byCat = {};
    exp.forEach(t => { (byCat[ t.category ] ??= {})[ t.ym ] = (byCat[ t.category ][ t.ym ] || 0) + t.amount; });
    const fixed = [], variable = [];
    Object.entries(byCat).forEach(([ cat, months ]) => {
      const vals = keys.map(k => months[ k ] || 0);
      const present = vals.filter(v => v > 0).length;
      const nz = vals.filter(v => v > 0);
      const mean = nz.reduce((a, b) => a + b, 0) / nz.length;
      const sd = Math.sqrt(nz.reduce((s, v) => s + (v - mean) ** 2, 0) / nz.length);
      const cv = mean ? sd / mean : 0;
      const item = { cat, avg: mean };
      if (present >= keys.length * 0.5 && cv < 0.45) fixed.push(item); else variable.push(item);
    });
    fixed.sort((a, b) => b.avg - a.avg); variable.sort((a, b) => b.avg - a.avg);
    const fSum = fixed.reduce((s, i) => s + i.avg, 0);
    const vSum = variable.reduce((s, i) => s + i.avg, 0);
    const pct = fSum + vSum ? fSum / (fSum + vSum) * 100 : 0;
    share.innerHTML = `<p class="cap" style="margin-bottom:4px"><b style="color:var(--ink)">${pct.toFixed(0)}%</b> of monthly spending is committed (≈ ${fmt0(fSum)}/mo fixed vs ${fmt0(vSum)}/mo variable)</p><div class="meter"><div style="width:${pct}%"></div></div>`;
    const li = i => `<li><span>${i.cat}</span><span>≈ ${fmt0(i.avg)}/mo</span></li>`;
    box.innerHTML = `
<div><h3>Fixed / recurring</h3><ul>${fixed.slice(0, 8).map(li).join("") || "<li><span>none detected</span><span></span></li>"}</ul></div>
<div><h3>Variable</h3><ul>${variable.slice(0, 8).map(li).join("")}</ul></div>`;
  }

  // ---- heatmap ----
  function renderHeatmap(list) {
    const exp = list.filter(t => t.type === "Expense");
    const grid = document.getElementById("hmgrid");
    const cap = document.getElementById("hmCap");
    grid.innerHTML = "";
    if (!exp.length) { cap.textContent = "No expense data in period."; return; }
    let end = period.start ? new Date(Math.min(period.end, Date.now())) : new Date(Math.min(+lastDate, Date.now()));
    let start = period.start ? new Date(period.start) : new Date(raw[ 0 ].d);
    const maxDays = 371;
    if ((end - start) / 864e5 > maxDays) { start = new Date(end.getTime() - maxDays * 864e5); cap.textContent = "Daily expense intensity — showing the most recent 12 months of the period"; }
    else cap.textContent = "Daily expense intensity — darker means more spent that day";
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
    const daily = groupBy(exp, t => t.date);
    const vals = Object.values(daily);
    const max = Math.max(...vals, 1);
    const frag = document.createDocumentFragment();
    const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const key = dkey(d);
      const v = daily[ key ] || 0;
      const cell = document.createElement("div");
      cell.className = "hmcell";
      if (v > 0) {
        const idx = Math.min(SEQ.length - 1, Math.floor(Math.pow(v / max, 0.5) * SEQ.length));
        cell.style.background = SEQ[ idx ];
        cell.style.borderColor = "transparent";
      }
      cell.title = `${key} — ${fmt0(v)}`;
      frag.appendChild(cell);
    }
    grid.appendChild(frag);
    document.getElementById("hmlegend").innerHTML =
      `<span>less</span>${SEQ.map(c => `<i style="background:${c}"></i>`).join("")}<span>more</span>`;
  }

  // ---- top expenses table ----
  let sortKey = "amount", sortDir = -1;
  function renderTable(list) {
    const rows = list.filter(t => t.type === "Expense")
      .slice().sort((a, b) => b.amount - a.amount).slice(0, 20)
      .sort((a, b) => {
        const x = a[ sortKey ], y = b[ sortKey ];
        return (x > y ? 1 : x < y ? -1 : 0) * sortDir;
      });
    document.querySelector("#topTable tbody").innerHTML = rows.map(t =>
      `<tr><td>${t.date}</td><td>${t.category}</td><td>${t.subCategory || ""}</td><td>${(t.content || t.detail || "").slice(0, 60)}</td><td class="num">${fmt2(t.amount)}</td></tr>`).join("");
  }
  document.querySelectorAll("#topTable th").forEach(th => {
    th.onclick = () => {
      const k = th.dataset.k;
      if (sortKey === k) sortDir *= -1; else { sortKey = k; sortDir = k === "amount" ? -1 : 1; }
      renderTable(filtered());
    };
  });

  // ---- monthly insights ----
  function renderInsights(list) {
    const cap = document.getElementById("insightsCap");
    const ul = document.getElementById("insights");
    ul.innerHTML = "";
    const keys = monthKeys(list);
    if (!keys.length) { cap.textContent = "No data in period."; return; }
    const today = new Date();
    const curYm = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
    const refYm = keys.includes(curYm) ? curYm : keys[ keys.length - 1 ];
    const refDate = new Date(refYm + "-01T00:00:00");
    cap.textContent = refDate.toLocaleString("en-US", { month: "long", year: "numeric" });
    const monthExp = t => t.type === "Expense" && t.ym === refYm;
    const spent = raw.filter(monthExp).reduce((s, t) => s + t.amount, 0);
    const expByYm = groupBy(raw.filter(t => t.type === "Expense"), t => t.ym);
    const incByYm = groupBy(raw.filter(t => t.type === "Income"), t => t.ym);
    const priorKeys = monthKeys(raw).filter(k => k < refYm);
    const items = [];
    const money = n => `<b>${fmt0(n)}</b>`;

    // spend pace vs trailing 6-month average
    const last6 = priorKeys.slice(-6);
    const avg6 = last6.length ? last6.reduce((s, k) => s + (expByYm[ k ] || 0), 0) / last6.length : 0;
    const isCurrent = refYm === curYm;
    const dim = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0).getDate();
    const proj = isCurrent && today.getDate() < dim ? spent / today.getDate() * dim : spent;
    if (avg6 > 0) {
      const pct = (proj - avg6) / avg6 * 100;
      const cls = pct <= 0 ? "down" : "up";
      items.push(`${isCurrent ? `Spending pace: ${money(spent)} so far, on track for ~${money(proj)}` : `Total spend ${money(spent)}`} — <span class="${cls}">${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}%</span> vs your 6-month average (${fmt0(avg6)}/mo)`);
    }

    // biggest category moves vs previous month
    const prevYm = `${refDate.getFullYear()}-${String(refDate.getMonth()).padStart(2, "0")}` === `${refDate.getFullYear()}-00`
      ? `${refDate.getFullYear() - 1}-12`
      : `${refDate.getFullYear()}-${String(refDate.getMonth()).padStart(2, "0")}`;
    const gRef = groupBy(raw.filter(monthExp), t => t.category);
    const gPrev = groupBy(raw.filter(t => t.type === "Expense" && t.ym === prevYm), t => t.category);
    let up = null, down = null;
    new Set([ ...Object.keys(gRef), ...Object.keys(gPrev) ]).forEach(c => {
      const d = (gRef[ c ] || 0) - (gPrev[ c ] || 0);
      if (d >= 500 && (!up || d > up.d)) up = { c, d };
      if (d <= -500 && (!down || d < down.d)) down = { c, d };
    });
    if (up) items.push(`Biggest increase vs last month: <b>${up.c}</b> <span class="up">▲ ${fmt0(up.d)}</span>`);
    if (down) items.push(`Biggest decrease vs last month: <b>${down.c}</b> <span class="down">▼ ${fmt0(-down.d)}</span>`);

    // unusually large expenses (above p95 of trailing 12 months)
    const trail = new Set(priorKeys.slice(-12));
    const amounts = raw.filter(t => t.type === "Expense" && trail.has(t.ym)).map(t => t.amount).sort((a, b) => a - b);
    if (amounts.length >= 20) {
      const p95 = amounts[ Math.floor(amounts.length * 0.95) ];
      const big = raw.filter(monthExp).filter(t => t.amount > p95).sort((a, b) => b.amount - a.amount).slice(0, 3);
      if (big.length) items.push(`Unusually large: ${big.map(t => `<b>${t.category}${t.content ? " · " + t.content : ""}</b> (${fmt0(t.amount)})`).join(", ")}`);
    }

    // savings rate vs 12-month average
    const incM = incByYm[ refYm ] || 0;
    if (incM > 0) {
      const rate = (incM - spent) / incM * 100;
      const t12 = priorKeys.slice(-12);
      const inc12 = t12.reduce((s, k) => s + (incByYm[ k ] || 0), 0);
      const exp12 = t12.reduce((s, k) => s + (expByYm[ k ] || 0), 0);
      const avgRate = inc12 > 0 ? (inc12 - exp12) / inc12 * 100 : null;
      const cls = avgRate != null && rate >= avgRate ? "goodtxt" : "badtxt";
      items.push(`Savings rate: <span class="${cls}">${rate.toFixed(0)}%</span>${avgRate != null ? ` (12-month average ${avgRate.toFixed(0)}%)` : ""}`);
    }

    if (!items.length) items.push("Nothing notable — steady month.");
    ul.innerHTML = items.map(i => `<li>${i}</li>`).join("");
  }

  // ---- category trend explorer ----
  let trendCat = null;
  function populateTrendSel() {
    const sel = document.getElementById("trendSel");
    sel.innerHTML = "";
    Object.keys(catSlot).sort((a, b) => catSlot[ a ] - catSlot[ b ]).forEach(c => {
      const o = document.createElement("option");
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
    trendCat = sel.value || null;
  }
  document.getElementById("trendSel").onchange = e => { trendCat = e.target.value; renderCatTrend(); };
  function renderCatTrend() {
    if (!trendCat) return;
    const keys = monthKeys(raw);
    const g = groupBy(raw.filter(t => t.type === "Expense" && t.category === trendCat), t => t.ym);
    mkChart("cattrend", {
      type: "bar",
      data: { labels: keys, datasets: [ { label: trendCat, data: keys.map(k => g[ k ] || 0), backgroundColor: catColor(trendCat), borderRadius: 3, borderSkipped: "start", maxBarThickness: 14 } ] },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: tipMoney } },
        scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 12 } }, y: { beginAtZero: true, ticks: moneyTicks } }
      }
    });
  }

  // ---- weekday pattern ----
  function renderWeekday(list) {
    const exp = list.filter(t => t.type === "Expense");
    const names = [ "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun" ];
    const sums = Array(7).fill(0), counts = Array(7).fill(0);
    if (exp.length) {
      const start = period.start || raw[ 0 ].d;
      const end = new Date(Math.min(+(period.end || lastDate), Date.now()));
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) counts[ (d.getDay() + 6) % 7 ]++;
      exp.forEach(t => { if (t.d <= end) sums[ (t.d.getDay() + 6) % 7 ] += t.amount; });
    }
    const avg = sums.map((s, i) => counts[ i ] ? s / counts[ i ] : 0);
    mkChart("weekday", {
      type: "bar",
      data: { labels: names, datasets: [ { label: "Avg expense", data: avg, backgroundColor: css("--expense"), borderRadius: 4, borderSkipped: "start", maxBarThickness: 32 } ] },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: c => ` avg ${fmt0(c.parsed.y)}/day` } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: moneyTicks } }
      }
    });
  }

  // ---- cumulative savings ----
  function renderCumNet(list) {
    const keys = monthKeys(list);
    const inc = groupBy(list.filter(t => t.type === "Income"), t => t.ym);
    const exp = groupBy(list.filter(t => t.type === "Expense"), t => t.ym);
    let acc = 0;
    const data = keys.map(k => acc += (inc[ k ] || 0) - (exp[ k ] || 0));
    mkChart("cumnet", {
      type: "line",
      data: { labels: keys, datasets: [ { label: "Cumulative net", data, borderColor: css("--net"), backgroundColor: css("--net") + "30", fill: "origin", borderWidth: 2, pointRadius: 0, tension: .25 } ] },
      options: {
        maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { display: false }, tooltip: { callbacks: tipMoney } },
        scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 14 } }, y: { ticks: moneyTicks } }
      }
    });
  }

  // ---- transaction browser ----
  const txState = { q: "", type: "", cat: "", sortKey: "date", sortDir: -1, page: 1 };
  const TX_PAGE_SIZE = 20;
  function populateTxCat() {
    const sel = document.getElementById("txCat");
    sel.innerHTML = '<option value="">All categories</option>';
    [ ...new Set(raw.map(t => t.category)) ].sort((a, b) => (catSlot[ a ] ?? 99) - (catSlot[ b ] ?? 99)).forEach(c => {
      const o = document.createElement("option");
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
    txState.cat = ""; txState.q = ""; txState.type = ""; txState.page = 1;
    document.getElementById("txSearch").value = "";
    document.getElementById("txType").value = "";
  }
  function renderTxBrowser(list) {
    let rows = list;
    if (txState.type) rows = rows.filter(t => t.type === txState.type);
    if (txState.cat) rows = rows.filter(t => t.category === txState.cat);
    if (txState.q) {
      const q = txState.q.toLowerCase();
      rows = rows.filter(t => `${t.content} ${t.detail} ${t.category} ${t.subCategory}`.toLowerCase().includes(q));
    }
    const expSum = rows.reduce((s, t) => s + (t.type === "Expense" ? t.amount : 0), 0);
    const { sortKey: k, sortDir: dir } = txState;
    rows = rows.slice().sort((a, b) => (a[ k ] > b[ k ] ? 1 : a[ k ] < b[ k ] ? -1 : 0) * dir);
    const pages = Math.max(1, Math.ceil(rows.length / TX_PAGE_SIZE));
    txState.page = Math.min(Math.max(1, txState.page), pages);
    const shown = rows.slice((txState.page - 1) * TX_PAGE_SIZE, txState.page * TX_PAGE_SIZE);
    document.querySelector("#txTable tbody").innerHTML = shown.map(t =>
      `<tr><td>${t.date}</td><td>${t.type}</td><td>${t.category}</td><td>${t.subCategory || ""}</td><td>${(t.content || t.detail || "").slice(0, 60)}</td><td class="num" style="color:${t.type === "Income" ? "var(--good)" : "inherit"}">${fmt2(t.amount)}</td></tr>`).join("");
    document.getElementById("txCount").textContent =
      `${rows.length.toLocaleString()} transactions · ${fmt0(expSum)} expense total`;
    const pager = document.getElementById("txPager");
    const btn = (label, page, disabled) => `<button ${disabled ? "disabled" : ""} data-page="${page}">${label}</button>`;
    pager.innerHTML =
      btn("«", 1, txState.page === 1) +
      btn("‹ Prev", txState.page - 1, txState.page === 1) +
      `<span class="pinfo">page ${txState.page} / ${pages}</span>` +
      btn("Next ›", txState.page + 1, txState.page === pages) +
      btn("»", pages, txState.page === pages);
    pager.querySelectorAll("button[data-page]").forEach(b => {
      b.onclick = () => { txState.page = +b.dataset.page; renderTxBrowser(filtered()); };
    });
  }
  let txDebounce;
  document.getElementById("txSearch").oninput = e => {
    clearTimeout(txDebounce);
    txDebounce = setTimeout(() => { txState.q = e.target.value.trim(); txState.page = 1; renderTxBrowser(filtered()); }, 150);
  };
  document.getElementById("txType").onchange = e => { txState.type = e.target.value; txState.page = 1; renderTxBrowser(filtered()); };
  document.getElementById("txCat").onchange = e => { txState.cat = e.target.value; txState.page = 1; renderTxBrowser(filtered()); };
  document.querySelectorAll("#txTable th").forEach(th => {
    th.onclick = () => {
      const k = th.dataset.k;
      if (txState.sortKey === k) txState.sortDir *= -1;
      else { txState.sortKey = k; txState.sortDir = k === "amount" ? -1 : 1; }
      txState.page = 1;
      renderTxBrowser(filtered());
    };
  });

  // ---- side navigation ----
  const navLinks = [ ...document.querySelectorAll('#sidenav a') ];
  navLinks.forEach(a => {
    a.onclick = e => {
      e.preventDefault();
      document.querySelector(a.getAttribute('href'))?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
  });
  const navTargets = navLinks.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
  let navTick = false;
  addEventListener('scroll', () => {
    if (navTick) return;
    navTick = true;
    requestAnimationFrame(() => {
      navTick = false;
      const y = 140; // just below the sticky bar
      let current = navTargets[ 0 ];
      for (const el of navTargets) if (el.getBoundingClientRect().top <= y) current = el;
      if (innerHeight + scrollY >= document.body.scrollHeight - 4) current = navTargets[ navTargets.length - 1 ];
      navLinks.forEach((a, i) => a.classList.toggle('active', navTargets[ i ] === current));
    });
  }, { passive: true });

  // ---- theme ----
  document.getElementById("themeBtn").onclick = () => {
    const r = document.documentElement;
    const dark = r.dataset.theme === "dark" || (!r.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    r.dataset.theme = dark ? "light" : "dark";
    renderAll();
  };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!document.documentElement.dataset.theme) renderAll(); });

  // ---- render all ----
  function renderAll() {
    if (!raw.length) return;
    applyChartDefaults();
    const list = filtered();
    renderKPIs(list);
    renderInsights(list);
    renderCashflow(list);
    drillCat = null;
    renderDonut(list);
    renderTopCat(list);
    renderYoY();
    renderIncomeSrc(list);
    renderExpenseStack(list);
    renderCatTrend();
    renderWeekday(list);
    renderCumNet(list);
    renderFixedVar(list);
    renderHeatmap(list);
    renderTable(list);
    renderTxBrowser(list);
  }

  // ---- file loading: Money Manager .xls export or transactions.json (parsing lives in js/parse.js) ----
  const stripDerived = (k, v) => (k === "d" || k === "ym") ? undefined : v;
  const clearBtn = document.getElementById("clearBtn");
  const fileInput = document.getElementById("fileInput");

  async function loadFile(file) {
    try {
      const rows = MM.parseDataFile(await file.text());
      const d = new Date(), p = n => String(n).padStart(2, "0");
      const label = `data from ${file.name} — ${rows.length} rows, loaded ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      try { localStorage.setItem("mm_loaded", JSON.stringify({ label, rows }, stripDerived)); } catch (e) { /* quota/file: restrictions — keep in memory only */ }
      clearBtn.style.display = window.MM_DATA && window.MM_DATA.length ? "inline-block" : "none";
      setData(rows, label);
    } catch (err) {
      const b = document.getElementById("noData");
      b.style.display = "block";
      b.innerHTML = `Could not read <b>${file.name}</b>: ${err.message}. Expected the Money Manager Excel export (.xls) or transactions.json.`;
    }
  }

  document.getElementById("loadBtn").onclick = () => fileInput.click();
  fileInput.onchange = () => { if (fileInput.files[ 0 ]) loadFile(fileInput.files[ 0 ]); fileInput.value = ""; };
  clearBtn.onclick = () => {
    try { localStorage.removeItem("mm_loaded"); } catch (e) { }
    clearBtn.style.display = "none";
    setData(window.MM_DATA, window.MM_EXPORTED_AT ? "data exported " + window.MM_EXPORTED_AT : "");
  };
  let dragDepth = 0;
  addEventListener("dragover", e => e.preventDefault());
  addEventListener("dragenter", e => { e.preventDefault(); if (++dragDepth === 1) document.body.classList.add("dragging"); });
  addEventListener("dragleave", () => { if (--dragDepth <= 0) { dragDepth = 0; document.body.classList.remove("dragging"); } });
  addEventListener("drop", e => {
    e.preventDefault(); dragDepth = 0; document.body.classList.remove("dragging");
    if (e.dataTransfer.files[ 0 ]) loadFile(e.dataTransfer.files[ 0 ]);
  });

  // ---- startup: prefer a previously loaded file, else the embedded snapshot ----
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("mm_loaded")); } catch (e) { }
  if (saved && saved.rows && saved.rows.length) {
    clearBtn.style.display = window.MM_DATA && window.MM_DATA.length ? "inline-block" : "none";
    setData(saved.rows, saved.label);
  } else {
    setData(window.MM_DATA, window.MM_EXPORTED_AT ? "data exported " + window.MM_EXPORTED_AT : "");
  }
})();

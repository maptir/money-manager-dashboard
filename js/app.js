// Wires the dashboard together: data loading, the three tabs, and the two
// time controls (month stepper for This month, period filter for Trends +
// Transactions). The tabs themselves live in tab-*.js.
(() => {
  "use strict";
  const { MONTHS } = MM.ui;
  const S = MM.state;
  const $ = id => document.getElementById(id);

  const todayIso = () => MM.isoDate(new Date());
  const mk = (label, start, end) => ({ label, start, end });
  function monthPeriod(ym) {
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1;
    return mk(`${MONTHS[ m ]} ${y}`, new Date(y, m, 1), new Date(y, m + 1, 0));
  }
  // "YYYY-MM" when the period is exactly one calendar month, else null
  const periodMonth = p => p.start ? MM.singleMonth(MM.isoDate(p.start), MM.isoDate(p.end)) : null;
  function presets() {
    const now = new Date(); // anchor presets to today, not the latest (possibly future-dated) transaction
    const eom = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return [
      mk("All time", null, null),
      mk("This month", new Date(now.getFullYear(), now.getMonth(), 1), eom),
      mk("Last 3M", new Date(now.getFullYear(), now.getMonth() - 2, 1), eom),
      mk("Last 12M", new Date(now.getFullYear(), now.getMonth() - 11, 1), eom),
      mk("YTD", new Date(now.getFullYear(), 0, 1), eom),
    ];
  }
  const DEFAULT_PERIOD = "Last 12M";

  // ---- data ----
  function setData(rows, sourceLabel) {
    S.raw = (rows || []).filter(t => (t.type === "Income" || t.type === "Expense") && t.date);
    $("noData").style.display = S.raw.length ? "none" : "block";
    document.body.classList.toggle("nodata", !S.raw.length); // hides the empty cards (see dashboard.css)
    S.raw.forEach(t => { t.d = new Date(t.date + "T00:00:00"); t.ym = t.date.slice(0, 7); });
    S.raw.sort((a, b) => a.d - b.d);
    const at = {};
    S.raw.filter(t => t.type === "Expense").forEach(t => { at[ t.category ] = (at[ t.category ] || 0) + t.amount; });
    S.catSlot = {};
    Object.keys(at).sort((a, b) => at[ b ] - at[ a ]).forEach((c, i) => { S.catSlot[ c ] = i; });
    S.incomeCatAll = {};
    S.raw.filter(t => t.type === "Income").forEach(t => { S.incomeCatAll[ t.category ] = (S.incomeCatAll[ t.category ] || 0) + t.amount; });
    S.incomeSlot = {};
    Object.keys(S.incomeCatAll).sort((a, b) => S.incomeCatAll[ b ] - S.incomeCatAll[ a ]).forEach((c, i) => { S.incomeSlot[ c ] = i; });
    S.years = [ ...new Set(S.raw.map(t => t.d.getFullYear())) ].sort();
    S.lastDate = S.raw.length ? S.raw[ S.raw.length - 1 ].d : new Date();
    // This month opens on the current month (or the latest month with real data if the export is older)
    S.monthYm = MM.defaultMonth(S.raw, todayIso());
    S.period = presets().find(p => p.label === DEFAULT_PERIOD);
    $("exportedAt").textContent = sourceLabel || "";
    renderStale();
    MM.trends.onData();
    MM.tx.onData();
    buildFilters();
    syncMonthBar();
    render();
  }

  // warn when the export has not been refreshed for a while
  function renderStale() {
    const el = $("staleData");
    const s = MM.staleness(S.raw, todayIso());
    el.style.display = s && s.stale ? "block" : "none";
    if (s && s.stale) el.innerHTML = `Data may be out of date — the latest transaction is from <b>${s.latest}</b> (${s.days} days ago). Export a new file from the Money Manager app, then use <b>⤒ load data</b>.`;
  }

  // ---- This month: month stepper ----
  function setMonth(ym) {
    S.monthYm = ym;
    syncMonthBar();
    render();
  }
  function syncMonthBar() {
    const bounds = MM.monthBounds(S.raw, todayIso());
    const ym = S.monthYm;
    $("monthLabel").textContent = ym ? monthPeriod(ym).label : "—";
    $("monthPrev").disabled = !bounds || !ym || ym <= bounds.min;
    $("monthNext").disabled = !bounds || !ym || ym >= bounds.max;
    $("monthNow").disabled = !ym || ym === todayIso().slice(0, 7);
  }
  const stepMonth = delta => {
    const bounds = MM.monthBounds(S.raw, todayIso());
    if (bounds && S.monthYm) setMonth(MM.stepMonth(S.monthYm, delta, bounds));
  };
  $("monthPrev").onclick = () => stepMonth(-1);
  $("monthNext").onclick = () => stepMonth(1);
  $("monthNow").onclick = () => { if (S.raw.length) setMonth(todayIso().slice(0, 7)); };

  // ---- Trends + Transactions: shared period filter ----
  function setPeriod(p) {
    S.period = p;
    MM.tx.resetPage();
    syncFilters();
    render();
  }
  // make every filter control show the active period
  function syncFilters() {
    const same = (a, b) => (a ? +a : 0) === (b ? +b : 0);
    document.querySelectorAll("#filters button.preset").forEach(b =>
      b.classList.toggle("active", same(b._period.start, S.period.start) && same(b._period.end, S.period.end)));
    const ym = periodMonth(S.period);
    if (ym && $("yearSel")) {
      $("yearSel").value = ym.slice(0, 4);
      $("monthSel").value = String(+ym.slice(5, 7) - 1);
    }
  }
  function buildFilters() {
    const el = $("filters");
    el.innerHTML = "";

    // year + month dropdowns
    const yearSel = document.createElement("select");
    yearSel.id = "yearSel";
    yearSel.innerHTML = '<option value="">Year</option>' + [ ...S.years ].reverse().map(y => `<option>${y}</option>`).join("");
    const monthSel = document.createElement("select");
    monthSel.id = "monthSel";
    monthSel.innerHTML = '<option value="">Month</option>' + MONTHS.map((m, i) => `<option value="${i}">${m}</option>`).join("");
    // custom range inputs
    const startInp = document.createElement("input");
    const endInp = document.createElement("input");
    startInp.type = endInp.type = "date";
    startInp.title = "Custom range start"; endInp.title = "Custom range end";
    if (S.raw.length) {
      startInp.min = endInp.min = MM.isoDate(S.raw[ 0 ].d);
      startInp.max = endInp.max = MM.isoDate(S.lastDate);
    }
    const resetDropdowns = () => { yearSel.value = ""; monthSel.value = ""; };
    const resetDates = () => { startInp.value = ""; endInp.value = ""; };

    presets().forEach(p => {
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
      const yy = y || S.years[ S.years.length - 1 ]; // month picked without a year -> latest data year
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
      const s = startInp.value ? new Date(startInp.value + "T00:00:00") : (S.raw.length ? S.raw[ 0 ].d : null);
      const e = endInp.value ? new Date(endInp.value + "T00:00:00") : S.lastDate;
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

  const inPeriod = t => (!S.period.start || (t.d >= S.period.start && t.d <= S.period.end));
  const filtered = () => S.raw.filter(inPeriod);

  // ---- tabs ----
  const TABS = [ "month", "trends", "tx" ];
  function setTab(name, { scroll = true } = {}) {
    if (!TABS.includes(name)) name = "month";
    S.tab = name;
    TABS.forEach(t => {
      $("tab-" + t).hidden = t !== name;
      const btn = $("tabbtn-" + t);
      btn.classList.toggle("active", t === name);
      btn.setAttribute("aria-selected", t === name ? "true" : "false");
    });
    $("monthBar").hidden = name !== "month";
    $("filters").hidden = name === "month";
    try { history.replaceState(null, "", "#" + name); } catch (e) { /* some file:// setups refuse; the tab still switches */ }
    if (scroll) scrollTo(0, 0);
    render();
  }
  document.querySelectorAll("#tabs button").forEach(b => { b.onclick = () => setTab(b.dataset.tab); });
  addEventListener("hashchange", () => {
    const name = location.hash.slice(1);
    if (TABS.includes(name) && name !== S.tab) setTab(name);
  });

  // open the Transactions tab on one month, optionally narrowed to a category
  function showMonthInTx(ym, cat) {
    S.period = monthPeriod(ym);
    const startInp = document.querySelectorAll('#filters input[type="date"]');
    startInp.forEach(i => { i.value = ""; });
    syncFilters();
    MM.tx.setFilter({ cat: cat || "" });
    setTab("tx");
  }

  // ---- render: only the visible tab (charts cannot size themselves while hidden) ----
  function render() {
    if (!S.raw.length) return;
    MM.ui.applyChartDefaults();
    if (S.tab === "month") MM.month.render();
    else if (S.tab === "trends") MM.trends.render(filtered());
    else MM.tx.render(filtered());
  }

  // some chart options depend on the width (e.g. where the donut legend sits): redraw when
  // the window crosses the phone breakpoint, such as when a phone is rotated
  let narrow = innerWidth < 640;
  addEventListener("resize", () => {
    if ((innerWidth < 640) !== narrow) { narrow = !narrow; render(); }
  });

  MM.app = { filtered, monthPeriod, todayIso, setMonth, setPeriod, setTab, showMonthInTx, render };

  // ---- theme ----
  $("themeBtn").onclick = () => {
    const r = document.documentElement;
    const dark = r.dataset.theme === "dark" || (!r.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
    r.dataset.theme = dark ? "light" : "dark";
    render();
  };
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => { if (!document.documentElement.dataset.theme) render(); });

  // ---- file loading: Money Manager .xls export or transactions.json (parsing lives in js/parse.js) ----
  const stripDerived = (k, v) => (k === "d" || k === "ym") ? undefined : v;
  const clearBtn = $("clearBtn");
  const fileInput = $("fileInput");
  const hasEmbedded = () => !!(window.MM_DATA && window.MM_DATA.length);

  async function loadFile(file) {
    try {
      const rows = MM.parseDataFile(await file.text());
      const d = new Date(), p = n => String(n).padStart(2, "0");
      let label = `data from ${file.name} — ${rows.length} rows, loaded ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      try {
        localStorage.setItem("mm_loaded", JSON.stringify({ label, rows }, stripDerived));
      } catch (e) {
        // quota or storage disabled: the data still shows, but will be gone after a reload
        label += " (not saved in this browser — load it again next time)";
      }
      clearBtn.style.display = hasEmbedded() ? "inline-block" : "none";
      setData(rows, label);
    } catch (err) {
      const b = $("noData");
      b.style.display = "block";
      b.textContent = `Could not read ${file.name}: ${err.message}. Expected the Money Manager Excel export (.xls) or transactions.json.`;
    }
  }

  $("loadBtn").onclick = () => fileInput.click();
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
  S.tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : "month";
  setTab(S.tab, { scroll: false }); // nothing to draw yet; this only shows the right panel and controls
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem("mm_loaded")); } catch (e) { }
  if (saved && saved.rows && saved.rows.length) {
    clearBtn.style.display = hasEmbedded() ? "inline-block" : "none";
    setData(saved.rows, saved.label);
  } else {
    setData(window.MM_DATA, window.MM_EXPORTED_AT ? "data exported " + window.MM_EXPORTED_AT : "");
  }
})();

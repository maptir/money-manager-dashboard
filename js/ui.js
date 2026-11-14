// Shared state and drawing helpers for every tab. Loaded before the tab files.
(() => {
  "use strict";
  const MM = window.MM = window.MM || {};

  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const SLOTS = () => [ css("--s1"), css("--s2"), css("--s3"), css("--s4"), css("--s5"), css("--s6"), css("--s7"), css("--s8") ];
  const SEQ = [ "#cde2fb", "#9ec5f4", "#6da7ec", "#3987e5", "#256abf", "#184f95", "#0d366b" ];
  const fmt0 = n => "฿" + Math.round(n).toLocaleString("en-US");
  const fmt2 = n => "฿" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const MONTHS = [ "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec" ];
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" })[ c ]);

  // ---- mutable state (data is rebuilt by setData in app.js when a file is loaded) ----
  const S = MM.state = {
    raw: [], years: [], lastDate: new Date(),
    catSlot: {}, incomeSlot: {}, incomeCatAll: {},
    period: { label: "All time", start: null, end: null }, // Trends + Transactions tabs
    monthYm: null,                                          // This month tab ("YYYY-MM")
    tab: "month",
  };
  // stable category colors: rank by all-time expense within the loaded dataset, color follows entity
  const catColor = c => S.catSlot[ c ] < 8 ? SLOTS()[ S.catSlot[ c ] ] : css("--muted");
  const incomeColor = c => S.incomeSlot[ c ] < 8 ? SLOTS()[ S.incomeSlot[ c ] ] : css("--muted");

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
  // opts.prev / opts.prevLabel: compare with these rows instead of the equally long stretch before p
  function renderKPIs(list, p, elId, opts = {}) {
    const inc = list.filter(t => t.type === "Income").reduce((s, t) => s + t.amount, 0);
    const exp = list.filter(t => t.type === "Expense").reduce((s, t) => s + t.amount, 0);
    const net = inc - exp;
    const rate = inc > 0 ? net / inc * 100 : null;
    const today = new Date();
    today.setHours(0, 0, 0, 0); // whole days only: late in the evening "now" would round up to an extra day
    let days;
    if (p.start) days = Math.max(1, Math.round((Math.min(p.end, today, S.lastDate) - p.start) / 864e5) + 1);
    else days = S.raw.length ? Math.max(1, Math.round((Math.min(today, S.lastDate) - S.raw[ 0 ].d) / 864e5) + 1) : 1;
    const daily = exp / days;

    // previous equivalent period for deltas
    let deltas = {};
    if (p.start) {
      const len = p.end - p.start;
      const pEnd = new Date(p.start.getTime() - 864e5);
      const pStart = new Date(pEnd.getTime() - len);
      const prev = opts.prev || S.raw.filter(t => t.d >= pStart && t.d <= pEnd);
      const pInc = prev.filter(t => t.type === "Income").reduce((s, t) => s + t.amount, 0);
      const pExp = prev.filter(t => t.type === "Expense").reduce((s, t) => s + t.amount, 0);
      if (prev.length) deltas = { inc: pInc ? (inc - pInc) / pInc * 100 : null, exp: pExp ? (exp - pExp) / pExp * 100 : null };
    }
    const dHtml = (v, goodWhenDown) => {
      if (v == null || !isFinite(v)) return "";
      const up = v >= 0;
      const cls = (up !== goodWhenDown) ? "up" : "down";
      return `<div class="delta"><span class="${cls}">${up ? "▲" : "▼"} ${Math.abs(v).toFixed(0)}%</span> ${opts.prevLabel || "vs previous period"}</div>`;
    };
    const tiles = [
      { l: "Income", v: fmt0(inc), extra: dHtml(deltas.inc, false), color: "var(--income)" },
      { l: "Expense", v: fmt0(exp), extra: dHtml(deltas.exp, true), color: "var(--expense)" },
      { l: "Net (saved)", v: (net < 0 ? "−" : "") + fmt0(Math.abs(net)), extra: "", color: net >= 0 ? "var(--good)" : "var(--bad)" },
      { l: "Savings rate", v: rate == null ? "—" : rate.toFixed(0) + "%", extra: `<div class="delta">of income kept</div>`, color: rate != null && rate >= 0 ? "var(--good)" : "var(--bad)" },
      { l: "Avg daily spend", v: fmt0(daily), extra: `<div class="delta">over ${days} days</div>`, color: "var(--ink)" },
    ];
    document.getElementById(elId).innerHTML = tiles.map(t =>
      `<div class="kpi"><div class="lbl">${t.l}</div><div class="val" style="color:${t.color}">${t.v}</div>${t.extra}</div>`).join("");
  }


  MM.ui = { css, SLOTS, SEQ, fmt0, fmt2, MONTHS, esc, catColor, incomeColor, monthKeys, groupBy, applyChartDefaults, mkChart, moneyTicks, tipMoney, renderKPIs };
})();

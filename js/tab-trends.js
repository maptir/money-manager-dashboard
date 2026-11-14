// The Trends tab: every chart and table that follows the shared period filter.
(() => {
  "use strict";
  const { css, SLOTS, SEQ, fmt0, fmt2, MONTHS, monthKeys, groupBy, mkChart, moneyTicks, tipMoney, catColor, incomeColor, renderKPIs } = MM.ui;
  const S = MM.state;
  const filtered = () => MM.app.filtered();

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
          legend: { position: innerWidth < 640 ? "bottom" : "right" },
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
    const exp = S.raw.filter(t => t.type === "Expense");
    const latest = S.years[ S.years.length - 1 ];
    const grays = [ "#c3c2b7", "#aeada4", "#989791", "#82817c", "#6d6c68", "#585753" ];
    const datasets = S.years.map((y, i) => {
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
    const cats = [ ...new Set(inc.map(t => t.category)) ].sort((a, b) => (S.incomeCatAll[ b ] || 0) - (S.incomeCatAll[ a ] || 0));
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
    const cats = Object.keys(S.catSlot).filter(c => S.catSlot[ c ] < 8);
    const datasets = cats.map(c => {
      const g = groupBy(exp.filter(t => t.category === c), t => t.ym);
      return { label: c, data: keys.map(k => g[ k ] || 0), backgroundColor: catColor(c), borderColor: css('--surface'), borderWidth: 1, maxBarThickness: 26 };
    });
    const gOther = groupBy(exp.filter(t => S.catSlot[ t.category ] >= 8), t => t.ym);
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
    let end = S.period.start ? new Date(Math.min(S.period.end, Date.now())) : new Date(Math.min(+S.lastDate, Date.now()));
    let start = S.period.start ? new Date(S.period.start) : new Date(S.raw[ 0 ].d);
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

  // ---- category trend explorer ----
  let trendCat = null;
  function populateTrendSel() {
    const sel = document.getElementById("trendSel");
    sel.innerHTML = "";
    Object.keys(S.catSlot).sort((a, b) => S.catSlot[ a ] - S.catSlot[ b ]).forEach(c => {
      const o = document.createElement("option");
      o.value = c; o.textContent = c;
      sel.appendChild(o);
    });
    trendCat = sel.value || null;
  }
  document.getElementById("trendSel").onchange = e => { trendCat = e.target.value; renderCatTrend(); };
  function renderCatTrend() {
    if (!trendCat) return;
    const keys = monthKeys(S.raw);
    const g = groupBy(S.raw.filter(t => t.type === "Expense" && t.category === trendCat), t => t.ym);
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
      const start = S.period.start || S.raw[ 0 ].d;
      const end = new Date(Math.min(+(S.period.end || S.lastDate), Date.now()));
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

  function render(list) {
    renderKPIs(list, S.period, "kpis");
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
  }

  MM.trends = { render, onData: populateTrendSel };
})();

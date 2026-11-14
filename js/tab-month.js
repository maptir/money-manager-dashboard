// The This-month tab: one calendar month at a time (S.monthYm), measured
// against the budget and against what a typical month looks like.
// Planned (future-dated) entries are never counted as spent here.
(() => {
  "use strict";
  const { css, fmt0, fmt2, MONTHS, esc, catColor, monthKeys, groupBy, mkChart, moneyTicks, tipMoney, renderKPIs } = MM.ui;
  const S = MM.state;
  const $ = id => document.getElementById(id);
  const monthName = ym => MONTHS[ +ym.slice(5, 7) - 1 ];
  const sumExpense = rows => rows.reduce((s, t) => s + (t.type === "Expense" ? t.amount : 0), 0);
  const STATE = {
    ok: { cls: "ok", now: "On pace", done: "Within budget" },
    ahead: { cls: "ahead", now: "Ahead of usual pace", done: "Within budget" },
    over: { cls: "over", now: "Over budget", done: "Over budget" },
  };
  const pctOf = (part, whole) => whole > 0 ? Math.min(100, part / whole * 100).toFixed(1) : "0";

  // Everything the cards below need, worked out once per render.
  function context() {
    const today = MM.app.todayIso(), curYm = today.slice(0, 7), ym = S.monthYm;
    const { actual, upcoming } = MM.splitActual(S.raw.filter(t => t.ym === ym), today);
    const dim = MM.daysInMonth(ym);
    const isCurrent = ym === curYm, complete = ym < curYm;
    const day = isCurrent ? +today.slice(8) : complete ? dim : 0; // days of this month that have happened
    const history = S.raw.filter(t => t.date <= today);            // what "typical" is learned from
    const since = MM.firstMonth(S.raw);
    const typical = MM.typicalCumulative(history, ym, 6, since);
    return {
      today, curYm, ym, actual, upcoming, dim, isCurrent, complete, day, history, since, typical,
      spent: sumExpense(actual),
      share: day ? MM.expectedShare(typical, day, dim) : 0,
      budget: MM.budgetUi.get(),
    };
  }

  // ---- budget ----
  function renderBudget(c) {
    const el = $("budgetBody"), total = c.budget.total;
    $("budgetEdit").textContent = MM.isEmptyBudget(c.budget) ? "Set budget" : "Edit budget";
    if (!(total > 0)) {
      const s = MM.suggestBudget(c.history, c.curYm);
      el.innerHTML = `<p class="bnote">No monthly budget yet.${s.total ? ` Your median month over the last 6 months is <b>${fmt0(s.total)}</b> — a good place to start.` : ""}</p>`;
      return;
    }
    const st = MM.budgetStatus({ spent: c.spent, budget: total, share: c.share, complete: c.complete });
    const info = STATE[ st.state ];
    const facts = [];
    if (c.isCurrent) {
      const daysLeft = c.dim - c.day;
      if (st.left >= 0) facts.push(`<b>${fmt0(st.left)}</b> left${daysLeft > 0 ? ` · ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go · about <b>${fmt0(st.left / daysLeft)}</b> a day` : ""}`);
      else facts.push(`<b class="badtxt">${fmt0(-st.left)}</b> over budget${daysLeft > 0 ? ` with ${daysLeft} day${daysLeft === 1 ? "" : "s"} to go` : ""}`);
      const proj = MM.projectMonthEnd(c.spent, c.share);
      if (proj != null && daysLeft > 0) facts.push(`At your usual pace this month ends near <b class="${proj > total ? "badtxt" : "goodtxt"}">${fmt0(proj)}</b>`);
      const planned = sumExpense(c.upcoming);
      if (planned > 0) facts.push(`Planned payments still to come: <b>${fmt0(planned)}</b> — with them <b class="${c.spent + planned > total ? "badtxt" : "goodtxt"}">${fmt0(c.spent + planned)}</b>`);
    } else if (c.complete) {
      facts.push(st.left >= 0 ? `Ended <b class="goodtxt">${fmt0(st.left)}</b> under budget` : `Ended <b class="badtxt">${fmt0(-st.left)}</b> over budget`);
    } else {
      facts.push("This month has not started yet.");
    }
    const marker = c.isCurrent ? `<i class="mark" style="left:${pctOf(st.expected, total)}%" title="Usual level by day ${c.day}: ${fmt0(st.expected)}"></i>` : "";
    el.innerHTML = `
      <div class="bhead">
        <span class="bnum"><b>${fmt0(c.spent)}</b> of ${fmt0(total)}</span>
        <span class="chip ${info.cls}">${c.complete ? info.done : info.now}</span>
      </div>
      <div class="bbar ${info.cls}" role="img" aria-label="${(st.used * 100).toFixed(0)}% of the budget used"><i class="fill" style="width:${pctOf(c.spent, total)}%"></i>${marker}</div>
      <div class="bscale"><span>${(st.used * 100).toFixed(0)}% used</span>${c.isCurrent ? `<span>usual by day ${c.day}: ${fmt0(st.expected)}</span>` : ""}</div>
      <ul class="bfacts">${facts.map(f => `<li>${f}</li>`).join("")}</ul>`;
  }

  // ---- cumulative spending: this month vs a typical month vs the budget ----
  function renderPace(c) {
    const labels = Array.from({ length: c.dim }, (_, i) => i + 1);
    const cum = MM.cumulativeByDay(c.actual, c.ym);
    const datasets = [ {
      label: c.complete ? `${monthName(c.ym)} ${c.ym.slice(0, 4)}` : `${monthName(c.ym)} so far`, data: labels.map(d => d <= c.day ? cum[ d - 1 ] : null),
      borderColor: css("--net"), backgroundColor: css("--net") + "22", fill: "origin", borderWidth: 2.5, pointRadius: 0, tension: .15, order: 1,
    } ];
    const plannedExp = c.upcoming.filter(t => t.type === "Expense");
    if (plannedExp.length && c.day > 0) {
      const withPlanned = MM.cumulativeByDay([ ...c.actual, ...plannedExp ], c.ym);
      datasets.push({
        label: "With planned payments", data: labels.map(d => d >= c.day ? withPlanned[ d - 1 ] : null),
        borderColor: css("--net"), borderDash: [ 2, 4 ], borderWidth: 2, pointRadius: 0, tension: 0, order: 2,
      });
    }
    if (c.typical) datasets.push({
      label: "Typical month", data: c.typical,
      borderColor: css("--muted"), borderDash: [ 6, 4 ], borderWidth: 1.6, pointRadius: 0, tension: .15, order: 3,
    });
    if (c.budget.total > 0) datasets.push({
      label: "Budget", data: labels.map(() => c.budget.total),
      borderColor: css("--bad"), borderDash: [ 3, 3 ], borderWidth: 1.4, pointRadius: 0, order: 4,
    });
    mkChart("pace", {
      type: "line",
      data: { labels, datasets },
      options: {
        maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { tooltip: { callbacks: { title: items => `${items[ 0 ].label} ${monthName(c.ym)}`, ...tipMoney } } },
        scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 11 } }, y: { beginAtZero: true, ticks: moneyTicks } },
      },
    });
    const cap = $("paceCap");
    if (!c.day) { cap.textContent = "Running total of spending, day by day"; return; }
    const usual = c.typical ? c.typical[ c.day - 1 ] : null;
    const diff = usual > 0 ? (c.spent - usual) / usual * 100 : null;
    const vs = diff == null ? "" : ` — usually ${fmt0(usual)} by ${c.isCurrent ? "now" : "month end"} (<span class="${diff > 0 ? "badtxt" : "goodtxt"}">${diff > 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(0)}%</span>)`;
    cap.innerHTML = `${c.isCurrent ? `Day ${c.day} of ${c.dim}: ` : ""}<b>${fmt0(c.spent)}</b> spent${vs}`;
  }

  // ---- spending by category, against category budgets where they exist ----
  function renderCats(c) {
    const g = groupBy(c.actual.filter(t => t.type === "Expense"), t => t.category);
    const budgets = c.budget.categories;
    const cats = [ ...new Set([ ...Object.keys(g), ...Object.keys(budgets) ]) ].sort((a, b) => (g[ b ] || 0) - (g[ a ] || 0) || (budgets[ b ] || 0) - (budgets[ a ] || 0));
    const total = c.spent, max = cats.length ? (g[ cats[ 0 ] ] || 1) : 1;
    const anyBudget = cats.some(cat => budgets[ cat ] > 0);
    $("monthCatsCap").textContent = !cats.length ? "No expenses in this month."
      : anyBudget ? `Largest first — bars with a budget show how much of it is used${c.isCurrent ? "; the tick marks the usual level by today" : ""}. Tap a category for its transactions.`
        : "Largest first — tap a category to see its transactions";
    $("monthCats").innerHTML = cats.map(cat => {
      const spent = g[ cat ] || 0, b = budgets[ cat ];
      if (b > 0) {
        const typ = MM.typicalCumulative(c.history.filter(t => t.category === cat), c.ym, 6, c.since);
        const st = MM.budgetStatus({ spent, budget: b, share: c.day ? MM.expectedShare(typ, c.day, c.dim) : 0, complete: c.complete });
        const info = STATE[ st.state ];
        const marker = c.isCurrent ? `<i class="mark" style="left:${pctOf(st.expected, b)}%"></i>` : "";
        return `
      <button class="catrow budgeted ${info.cls}" data-cat="${esc(cat)}" title="${esc(cat)}: ${c.complete ? info.done : info.now}">
        <span class="name"><i class="dot" style="background:${catColor(cat)}"></i>${esc(cat)}</span>
        <span class="amt">${fmt0(spent)} <small>/ ${fmt0(b)}</small></span>
        <span class="pct">${(st.used * 100).toFixed(0)}%</span>
        <span class="bar"><i class="fill" style="width:${pctOf(spent, b)}%"></i>${marker}</span>
      </button>`;
      }
      return `
      <button class="catrow" data-cat="${esc(cat)}">
        <span class="name"><i class="dot" style="background:${catColor(cat)}"></i>${esc(cat)}</span>
        <span class="amt">${fmt0(spent)}</span>
        <span class="pct">${total > 0 ? (spent / total * 100).toFixed(0) : 0}%</span>
        <span class="bar"><i class="fill" style="width:${pctOf(spent, max)}%;background:${catColor(cat)}"></i></span>
      </button>`;
    }).join("");
    $("monthCats").querySelectorAll(".catrow").forEach(b => {
      b.onclick = () => MM.app.showMonthInTx(S.monthYm, b.dataset.cat);
    });
  }

  const txItem = t => `
      <li>
        <span class="d">${+t.date.slice(8)} ${monthName(t.ym)}</span>
        <span class="what"><b>${esc(t.category)}</b><small>${esc((t.content || t.subCategory || "").slice(0, 60))}</small></span>
        <span class="amt${t.type === "Income" ? " inc" : ""}">${t.type === "Income" ? "+" : ""}${fmt2(t.amount)}</span>
      </li>`;

  // ---- planned entries: dated after today, not spent yet ----
  function renderUpcoming(c) {
    $("sec-upcoming").hidden = !c.upcoming.length;
    if (!c.upcoming.length) return;
    const planned = sumExpense(c.upcoming);
    $("upcomingCap").textContent = `Entries dated after today — not counted as spent yet${planned > 0 ? `. ${fmt0(planned)} in expenses.` : "."}`;
    $("upcoming").innerHTML = c.upcoming.slice().sort((a, b) => a.d - b.d).map(txItem).join("");
  }

  // ---- how this month compares with the usual ----
  function renderInsights(c) {
    const refYm = c.ym, spent = c.spent;
    $("insightsCap").textContent = `How ${monthName(refYm)} compares with your recent months`;
    const monthExp = t => t.type === "Expense" && t.ym === refYm;
    const expByYm = groupBy(c.history.filter(t => t.type === "Expense"), t => t.ym);
    const incByYm = groupBy(c.history.filter(t => t.type === "Income"), t => t.ym);
    const priorKeys = monthKeys(c.history).filter(k => k < refYm);
    const items = [];

    // total vs the trailing 6-month average (a month still running is judged in "Spending so far" instead)
    const last6 = priorKeys.slice(-6);
    const avg6 = last6.length ? last6.reduce((s, k) => s + (expByYm[ k ] || 0), 0) / last6.length : 0;
    if (c.complete && avg6 > 0) {
      const pct = (spent - avg6) / avg6 * 100;
      items.push(`Total spend <b>${fmt0(spent)}</b> — <span class="${pct <= 0 ? "down" : "up"}">${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}%</span> vs the 6-month average before it (${fmt0(avg6)}/mo)`);
    }

    // biggest category moves vs previous month
    const prevYm = MM.shiftMonth(refYm, -1);
    const gRef = groupBy(c.actual.filter(monthExp), t => t.category);
    const gPrev = groupBy(c.history.filter(t => t.type === "Expense" && t.ym === prevYm), t => t.category);
    let up = null, down = null;
    new Set([ ...Object.keys(gRef), ...Object.keys(gPrev) ]).forEach(cat => {
      const d = (gRef[ cat ] || 0) - (gPrev[ cat ] || 0);
      if (d >= 500 && (!up || d > up.d)) up = { cat, d };
      if (d <= -500 && (!down || d < down.d)) down = { cat, d };
    });
    if (up) items.push(`Biggest increase vs ${monthName(prevYm)}: <b>${esc(up.cat)}</b> <span class="up">▲ ${fmt0(up.d)}</span>`);
    // a month still running has simply not spent everything yet, so a "decrease" would mislead
    if (down && c.complete) items.push(`Biggest decrease vs ${monthName(prevYm)}: <b>${esc(down.cat)}</b> <span class="down">▼ ${fmt0(-down.d)}</span>`);

    // unusually large expenses (above p95 of trailing 12 months)
    const trail = new Set(priorKeys.slice(-12));
    const amounts = c.history.filter(t => t.type === "Expense" && trail.has(t.ym)).map(t => t.amount).sort((a, b) => a - b);
    if (amounts.length >= 20) {
      const p95 = amounts[ Math.floor(amounts.length * 0.95) ];
      const big = c.actual.filter(monthExp).filter(t => t.amount > p95).sort((a, b) => b.amount - a.amount).slice(0, 3);
      if (big.length) items.push(`Unusually large: ${big.map(t => `<b>${esc(t.category)}${t.content ? " · " + esc(t.content) : ""}</b> (${fmt0(t.amount)})`).join(", ")}`);
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
      items.push(`Savings rate${c.isCurrent ? " so far" : ""}: <span class="${cls}">${rate.toFixed(0)}%</span>${avgRate != null ? ` (12-month average ${avgRate.toFixed(0)}%)` : ""}`);
    }

    if (!items.length) items.push(spent > 0 ? "Nothing notable — steady month." : "No spending recorded in this month.");
    $("insights").innerHTML = items.map(i => `<li>${i}</li>`).join("");
  }

  // ---- last 12 months against the budget ----
  function renderHistory(c) {
    const total = c.budget.total;
    // normally the 12 months up to now; slide the window when an older or later month is selected
    const end = (c.ym > c.curYm || c.ym < MM.shiftMonth(c.curYm, -11)) ? c.ym : c.curYm;
    const h = MM.budgetHistory(S.raw, total, end, c.today, 12);
    const max = Math.max(total || 0, ...h.map(m => m.spent), 1);
    const full = h.filter(m => !m.partial && !m.future && m.spent > 0);
    $("historyCap").textContent = total > 0
      ? `${full.filter(m => !m.over).length} of ${full.length} finished months stayed within ${fmt0(total)} — tap a month to open it`
      : "Monthly spending — set a budget to see which months went over. Tap a month to open it";
    // bars are 96px tall and sit above a 22px label row (see .hcol in dashboard.css)
    const line = total > 0 ? `<i class="hline" style="bottom:${(22 + total / max * 96).toFixed(1)}px" title="Budget ${fmt0(total)}"></i>` : "";
    $("history").innerHTML = `<div class="hcols">${line}${h.map(m => {
      const cls = [ "hcol", m.ym === c.ym ? "sel" : "", m.over == null ? "" : m.over ? "over" : "ok", m.partial ? "partial" : "" ].filter(Boolean).join(" ");
      const verdict = m.future ? "not started" : m.diff == null ? "" : m.diff > 0 ? ` — ${fmt0(m.diff)} over budget` : ` — ${fmt0(-m.diff)} under budget`;
      const label = `${monthName(m.ym)} ${m.ym.slice(0, 4)}: ${fmt0(m.spent)}${m.partial ? " so far" : ""}${verdict}`;
      return `<button class="${cls}" data-ym="${m.ym}" title="${label}" aria-label="${label}"><span class="hbar"><i style="height:${(m.spent / max * 100).toFixed(1)}%"></i></span><span class="hlbl">${monthName(m.ym)}</span></button>`;
    }).join("")}</div>`;
    $("history").querySelectorAll(".hcol").forEach(b => { b.onclick = () => MM.app.setMonth(b.dataset.ym); });
  }

  // ---- latest transactions ----
  function renderLatest(c) {
    const rows = c.actual;
    $("monthTxCap").textContent = rows.length ? `Most recent of ${rows.length} in ${monthName(c.ym)}` : "No transactions in this month.";
    $("monthTx").innerHTML = rows.slice().sort((a, b) => b.d - a.d).slice(0, 8).map(txItem).join("");
    const all = $("monthTxAll");
    all.style.display = rows.length ? "" : "none";
    all.textContent = `View all ${rows.length} transactions →`;
  }
  $("monthTxAll").onclick = () => MM.app.showMonthInTx(S.monthYm, "");
  $("budgetEdit").onclick = () => MM.budgetUi.open();

  function render() {
    if (!S.monthYm) return;
    const c = context();
    const prevYm = MM.shiftMonth(c.ym, -1);
    // a month still running is compared with the same days of the month before, not with all of it
    const sameDays = t => t.ym === prevYm && (!c.isCurrent || +t.date.slice(8) <= c.day);
    renderKPIs(c.actual, MM.app.monthPeriod(c.ym), "monthKpis", {
      prev: c.history.filter(sameDays),
      prevLabel: c.isCurrent ? `vs ${monthName(prevYm)} 1–${c.day}` : `vs ${monthName(prevYm)}`,
    });
    renderBudget(c);
    renderPace(c);
    renderCats(c);
    renderUpcoming(c);
    renderInsights(c);
    renderHistory(c);
    renderLatest(c);
  }

  MM.month = { render };
})();

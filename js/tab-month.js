// The This-month tab: one calendar month at a time (S.monthYm).
(() => {
  "use strict";
  const { fmt0, fmt2, MONTHS, esc, catColor, monthKeys, groupBy, renderKPIs } = MM.ui;
  const S = MM.state;
  const $ = id => document.getElementById(id);
  const monthName = ym => MONTHS[ +ym.slice(5, 7) - 1 ];

  // ---- how this month compares with the usual ----
  function renderInsights(refYm) {
    const today = new Date();
    const isCurrent = refYm === MM.isoDate(today).slice(0, 7);
    $("insightsCap").textContent = `How ${monthName(refYm)} compares with your recent months`;
    const monthExp = t => t.type === "Expense" && t.ym === refYm;
    const spent = S.raw.filter(monthExp).reduce((s, t) => s + t.amount, 0);
    const expByYm = groupBy(S.raw.filter(t => t.type === "Expense"), t => t.ym);
    const incByYm = groupBy(S.raw.filter(t => t.type === "Income"), t => t.ym);
    const priorKeys = monthKeys(S.raw).filter(k => k < refYm);
    const items = [];
    const money = n => `<b>${fmt0(n)}</b>`;

    // spend pace vs trailing 6-month average
    const last6 = priorKeys.slice(-6);
    const avg6 = last6.length ? last6.reduce((s, k) => s + (expByYm[ k ] || 0), 0) / last6.length : 0;
    const dim = MM.daysInMonth(refYm);
    const proj = isCurrent && today.getDate() < dim ? spent / today.getDate() * dim : spent;
    if (avg6 > 0) {
      const pct = (proj - avg6) / avg6 * 100;
      const cls = pct <= 0 ? "down" : "up";
      items.push(`${isCurrent ? `Spending pace: ${money(spent)} so far, on track for ~${money(proj)}` : `Total spend ${money(spent)}`} — <span class="${cls}">${pct >= 0 ? "▲" : "▼"} ${Math.abs(pct).toFixed(0)}%</span> vs your 6-month average (${fmt0(avg6)}/mo)`);
    }

    // biggest category moves vs previous month
    const prevYm = MM.shiftMonth(refYm, -1);
    const gRef = groupBy(S.raw.filter(monthExp), t => t.category);
    const gPrev = groupBy(S.raw.filter(t => t.type === "Expense" && t.ym === prevYm), t => t.category);
    let up = null, down = null;
    new Set([ ...Object.keys(gRef), ...Object.keys(gPrev) ]).forEach(c => {
      const d = (gRef[ c ] || 0) - (gPrev[ c ] || 0);
      if (d >= 500 && (!up || d > up.d)) up = { c, d };
      if (d <= -500 && (!down || d < down.d)) down = { c, d };
    });
    if (up) items.push(`Biggest increase vs ${monthName(prevYm)}: <b>${esc(up.c)}</b> <span class="up">▲ ${fmt0(up.d)}</span>`);
    if (down) items.push(`Biggest decrease vs ${monthName(prevYm)}: <b>${esc(down.c)}</b> <span class="down">▼ ${fmt0(-down.d)}</span>`);

    // unusually large expenses (above p95 of trailing 12 months)
    const trail = new Set(priorKeys.slice(-12));
    const amounts = S.raw.filter(t => t.type === "Expense" && trail.has(t.ym)).map(t => t.amount).sort((a, b) => a - b);
    if (amounts.length >= 20) {
      const p95 = amounts[ Math.floor(amounts.length * 0.95) ];
      const big = S.raw.filter(monthExp).filter(t => t.amount > p95).sort((a, b) => b.amount - a.amount).slice(0, 3);
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
      items.push(`Savings rate: <span class="${cls}">${rate.toFixed(0)}%</span>${avgRate != null ? ` (12-month average ${avgRate.toFixed(0)}%)` : ""}`);
    }

    if (!items.length) items.push(spent > 0 ? "Nothing notable — steady month." : "No spending recorded in this month.");
    $("insights").innerHTML = items.map(i => `<li>${i}</li>`).join("");
  }

  // ---- spending by category ----
  function renderCats(rows) {
    const g = groupBy(rows.filter(t => t.type === "Expense"), t => t.category);
    const cats = Object.keys(g).sort((a, b) => g[ b ] - g[ a ]);
    const total = cats.reduce((s, c) => s + g[ c ], 0);
    $("monthCatsCap").textContent = cats.length
      ? "Largest first — tap a category to see its transactions"
      : "No expenses in this month.";
    const max = cats.length ? g[ cats[ 0 ] ] : 1;
    $("monthCats").innerHTML = cats.map(c => `
      <button class="catrow" data-cat="${esc(c)}">
        <span class="name"><i class="dot" style="background:${catColor(c)}"></i>${esc(c)}</span>
        <span class="amt">${fmt0(g[ c ])}</span>
        <span class="pct">${(g[ c ] / total * 100).toFixed(0)}%</span>
        <span class="bar"><i style="width:${(g[ c ] / max * 100).toFixed(1)}%;background:${catColor(c)}"></i></span>
      </button>`).join("");
    $("monthCats").querySelectorAll(".catrow").forEach(b => {
      b.onclick = () => MM.app.showMonthInTx(S.monthYm, b.dataset.cat);
    });
  }

  // ---- latest transactions ----
  function renderLatest(rows) {
    const latest = rows.slice().sort((a, b) => b.d - a.d).slice(0, 8);
    $("monthTxCap").textContent = rows.length ? `Most recent of ${rows.length} in ${monthName(S.monthYm)}` : "No transactions in this month.";
    $("monthTx").innerHTML = latest.map(t => `
      <li>
        <span class="d">${+t.date.slice(8)} ${monthName(t.ym)}</span>
        <span class="what"><b>${esc(t.category)}</b><small>${esc((t.content || t.subCategory || "").slice(0, 60))}</small></span>
        <span class="amt${t.type === "Income" ? " inc" : ""}">${t.type === "Income" ? "+" : ""}${fmt2(t.amount)}</span>
      </li>`).join("");
    const all = $("monthTxAll");
    all.style.display = rows.length ? "" : "none";
    all.textContent = `View all ${rows.length} transactions →`;
  }
  $("monthTxAll").onclick = () => MM.app.showMonthInTx(S.monthYm, "");

  function render() {
    const ym = S.monthYm;
    if (!ym) return;
    const rows = S.raw.filter(t => t.ym === ym);
    const prevYm = MM.shiftMonth(ym, -1);
    renderKPIs(rows, MM.app.monthPeriod(ym), "monthKpis", { prev: S.raw.filter(t => t.ym === prevYm), prevLabel: `vs ${monthName(prevYm)}` });
    renderInsights(ym);
    renderCats(rows);
    renderLatest(rows);
  }

  MM.month = { render };
})();

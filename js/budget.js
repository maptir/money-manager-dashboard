// Budget and pace calculations for the This-month tab. Pure functions, no
// DOM, no clock, no storage. Rows are transactions ({ date: "YYYY-MM-DD",
// type, category, amount }); months are "YYYY-MM". A budget is
// { total: number|null, categories: { [category]: number } } in baht per month.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else Object.assign(root.MM = root.MM || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const pad = n => String(n).padStart(2, "0");
  const ymOf = t => t.date.slice(0, 7);
  const dayOf = t => Number(t.date.slice(8, 10));
  const isExpense = t => t.type === "Expense" && !!t.date;
  const daysIn = ym => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();
  const shift = (ym, delta) => {
    const months = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + delta;
    return `${Math.floor(months / 12)}-${pad(months % 12 + 1)}`;
  };

  const firstMonth = rows => {
    let first = null;
    for (const t of rows) if (t.date && (!first || t.date < first)) first = t.date;
    return first ? first.slice(0, 7) : null;
  };

  // The n calendar months before ym, oldest first, never earlier than `since`.
  const priorMonths = (ym, n, since) => {
    const out = [];
    for (let i = n; i >= 1; i--) {
      const m = shift(ym, -i);
      if (!since || m >= since) out.push(m);
    }
    return out;
  };

  const median = nums => {
    if (!nums.length) return 0;
    const s = nums.slice().sort((a, b) => a - b), mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  };

  // Budgets are round numbers: nobody plans to spend 6,137.50.
  const roundUp = n => {
    const step = n >= 10000 ? 500 : n >= 1000 ? 100 : 50;
    return Math.ceil(n / step) * step;
  };

  // Keep only what a budget may contain; anything else (text, negatives, zero) is dropped.
  function normalizeBudget(input) {
    const num = v => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
    const src = input && typeof input === "object" ? input : {};
    const categories = {};
    if (src.categories && typeof src.categories === "object") {
      for (const [cat, v] of Object.entries(src.categories)) if (cat && num(v) != null) categories[cat] = num(v);
    }
    return { total: num(src.total), categories };
  }

  const isEmptyBudget = b => !b || (b.total == null && !Object.keys(b.categories || {}).length);

  // A starting budget: the median month among the `months` before ym, overall
  // and per category. The median ignores one-off spikes (a flight, a new phone).
  // A month with nothing spent in a category counts as 0 for that category.
  function suggestBudget(rows, ym, months = 6) {
    const yms = priorMonths(ym, months, firstMonth(rows));
    if (!yms.length) return { total: null, categories: {} };
    const wanted = new Set(yms), totals = {}, byCat = {};
    for (const t of rows) {
      if (!isExpense(t) || !wanted.has(ymOf(t))) continue;
      const m = ymOf(t);
      totals[m] = (totals[m] || 0) + t.amount;
      (byCat[t.category] = byCat[t.category] || {})[m] = (byCat[t.category][m] || 0) + t.amount;
    }
    const total = median(yms.map(m => totals[m] || 0));
    const categories = {};
    for (const [cat, perMonth] of Object.entries(byCat)) {
      const med = median(yms.map(m => perMonth[m] || 0));
      if (med > 0) categories[cat] = roundUp(med);
    }
    return { total: total > 0 ? roundUp(total) : null, categories };
  }

  // Split a list into what has happened and what is only planned (dated after today).
  function splitActual(rows, today) {
    const actual = [], upcoming = [];
    for (const t of rows) (t.date > today ? upcoming : actual).push(t);
    return { actual, upcoming };
  }

  // Running expense total at the end of each day of ym. Index 0 is day 1.
  function cumulativeByDay(rows, ym) {
    const perDay = new Array(daysIn(ym)).fill(0);
    for (const t of rows) if (isExpense(t) && ymOf(t) === ym) perDay[dayOf(t) - 1] += t.amount;
    let acc = 0;
    return perDay.map(v => acc += v);
  }

  // What the running total usually looks like: the average of the `months`
  // before ym, day by day. A shorter month contributes its final total to the
  // days it does not have. null when there is no earlier month to learn from.
  function typicalCumulative(rows, ym, months = 6, since = firstMonth(rows)) {
    const yms = since ? priorMonths(ym, months, since) : [];
    if (!yms.length) return null;
    const dim = daysIn(ym);
    const sums = new Array(dim).fill(0);
    for (const m of yms) {
      const cum = cumulativeByDay(rows, m);
      for (let d = 0; d < dim; d++) sums[d] += cum[Math.min(d, cum.length - 1)];
    }
    return sums.map(v => v / yms.length);
  }

  // Fraction of a month's spending that is usually done by the end of `day`.
  // Falls back to a straight line when there is no usable history.
  function expectedShare(typical, day, dim) {
    const d = Math.min(Math.max(day, 1), dim);
    const end = typical ? typical[dim - 1] : 0;
    return end > 0 ? typical[d - 1] / end : d / dim;
  }

  // Where spending stands against a budget.
  //   over  — more than the whole budget is gone
  //   ahead — within budget, but more is gone than usual by this point of the month
  //   ok    — at or under the usual pace (for a finished month: within budget)
  function budgetStatus({ spent, budget, share = 1, complete = false }) {
    if (!(budget > 0)) return null;
    const expected = budget * (complete ? 1 : share);
    const state = spent > budget ? "over" : (!complete && spent > expected) ? "ahead" : "ok";
    return { state, used: spent / budget, expected, left: budget - spent };
  }

  // Month-end estimate from the usual shape of a month. null early in the
  // month, when the share is too small to extrapolate from.
  const projectMonthEnd = (spent, share) => share >= 0.1 ? spent / share : null;

  // Spending for the n months ending at endYm, against one budget total.
  // Planned (future-dated) entries never count as spent.
  function budgetHistory(rows, budgetTotal, endYm, today, n = 12) {
    const curYm = today.slice(0, 7), spentBy = {};
    for (const t of rows) if (isExpense(t) && t.date <= today) spentBy[ymOf(t)] = (spentBy[ymOf(t)] || 0) + t.amount;
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const ym = shift(endYm, -i), spent = spentBy[ym] || 0, has = budgetTotal > 0;
      out.push({ ym, spent, diff: has ? spent - budgetTotal : null, over: has ? spent > budgetTotal : null, partial: ym === curYm, future: ym > curYm });
    }
    return out;
  }

  return { firstMonth, priorMonths, median, roundUp, normalizeBudget, isEmptyBudget, suggestBudget, splitActual, cumulativeByDay, typicalCumulative, expectedShare, budgetStatus, projectMonthEnd, budgetHistory };
});

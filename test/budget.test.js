// Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const B = require("../js/budget.js");

const exp = (date, amount, category = "Food") => ({ date, type: "Expense", category, amount });
const inc = (date, amount) => ({ date, type: "Income", category: "Salary", amount });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test("priorMonths lists the months before, oldest first, not before `since`", () => {
  assert.deepEqual(B.priorMonths("2026-02", 3), ["2025-11", "2025-12", "2026-01"]);
  assert.deepEqual(B.priorMonths("2026-02", 3, "2025-12"), ["2025-12", "2026-01"]);
  assert.deepEqual(B.priorMonths("2026-02", 3, "2026-02"), []);
});

test("median handles odd, even and empty lists", () => {
  assert.equal(B.median([5, 1, 3]), 3);
  assert.equal(B.median([4, 1, 3, 2]), 2.5);
  assert.equal(B.median([]), 0);
});

test("roundUp gives round budget numbers, never below the input", () => {
  assert.equal(B.roundUp(6137.5), 6200);
  assert.equal(B.roundUp(6200), 6200);
  assert.equal(B.roundUp(420), 450);
  assert.equal(B.roundUp(34210), 34500);
  assert.equal(B.roundUp(10000), 10000);
});

test("normalizeBudget keeps positive numbers and drops everything else", () => {
  assert.deepEqual(B.normalizeBudget({ total: "40000", categories: { Food: 6000, Rent: "12000", Bad: -5, Zero: 0, Text: "abc", Empty: "" } }),
    { total: 40000, categories: { Food: 6000, Rent: 12000 } });
  assert.deepEqual(B.normalizeBudget({ total: 0 }), { total: null, categories: {} });
  assert.deepEqual(B.normalizeBudget(null), { total: null, categories: {} });
  assert.deepEqual(B.normalizeBudget("nonsense"), { total: null, categories: {} });
  assert.deepEqual(B.normalizeBudget({ total: NaN, categories: [1, 2] }).total, null);
});

test("isEmptyBudget", () => {
  assert.equal(B.isEmptyBudget(null), true);
  assert.equal(B.isEmptyBudget({ total: null, categories: {} }), true);
  assert.equal(B.isEmptyBudget({ total: 1, categories: {} }), false);
  assert.equal(B.isEmptyBudget({ total: null, categories: { Food: 1 } }), false);
});

test("suggestBudget uses the median month, so one spike does not inflate it", () => {
  const rows = [
    exp("2026-05-10", 30000), exp("2026-06-10", 32000), exp("2026-07-10", 31000),
    exp("2026-08-10", 90000), // one-off
    exp("2026-09-10", 33000), exp("2026-10-10", 34000),
    exp("2026-11-05", 99999), // the month being budgeted is never part of its own suggestion
  ];
  const s = B.suggestBudget(rows, "2026-11");
  assert.equal(s.total, 32500); // median of 30k,31k,32k,33k,34k,90k = 32.5k (the mean would be 41.7k)
  assert.deepEqual(s.categories, { Food: 32500 });
});

test("suggestBudget is per category, counts empty months as 0, ignores income", () => {
  const rows = [
    exp("2026-08-01", 12000, "Rent"), exp("2026-09-01", 12000, "Rent"), exp("2026-10-01", 12000, "Rent"),
    exp("2026-08-15", 900, "Fun"), // 1 month of 3 → median 0 → no suggestion
    exp("2026-08-03", 3010, "Food"), exp("2026-09-03", 2990, "Food"), exp("2026-10-03", 3600, "Food"),
    inc("2026-10-25", 50000),
    exp("2026-07-31", 1, "Old"), // establishes that data starts in July
  ];
  const s = B.suggestBudget(rows, "2026-11", 3);
  assert.deepEqual(s.categories, { Rent: 12000, Food: 3100 });
  assert.equal(s.total, 16000); // months: 15,910 / 14,990 / 15,600 → median 15,600 → rounded up to the next 500
});

test("suggestBudget only looks at months the data covers", () => {
  // data starts in October: the 6-month window shrinks to that single month
  assert.equal(B.suggestBudget([exp("2026-10-10", 20000)], "2026-11").total, 20000);
  assert.deepEqual(B.suggestBudget([exp("2026-11-10", 20000)], "2026-11"), { total: null, categories: {} });
  assert.deepEqual(B.suggestBudget([], "2026-11"), { total: null, categories: {} });
});

test("splitActual separates planned (future-dated) entries; today counts as actual", () => {
  const rows = [exp("2026-11-13", 1), exp("2026-11-14", 2), exp("2026-11-15", 3), exp("2026-11-20", 4)];
  const { actual, upcoming } = B.splitActual(rows, "2026-11-14");
  assert.deepEqual(actual.map(t => t.amount), [1, 2]);
  assert.deepEqual(upcoming.map(t => t.amount), [3, 4]);
});

test("cumulativeByDay is a running expense total for one month", () => {
  const rows = [exp("2026-02-01", 100), exp("2026-02-01", 50), exp("2026-02-03", 25), exp("2026-02-28", 5), exp("2026-03-01", 999), inc("2026-02-02", 5000)];
  const cum = B.cumulativeByDay(rows, "2026-02");
  assert.equal(cum.length, 28);
  assert.deepEqual(cum.slice(0, 4), [150, 150, 175, 175]);
  assert.equal(cum[27], 180);
});

test("typicalCumulative averages earlier months day by day", () => {
  const rows = [
    exp("2026-09-01", 100), exp("2026-09-20", 100), // Sep: 100 from day 1, 200 from day 20
    exp("2026-10-10", 300),                         // Oct: 300 from day 10
  ];
  const t = B.typicalCumulative(rows, "2026-11", 2);
  assert.equal(t.length, 30);
  assert.equal(t[0], 50);    // day 1: (100 + 0) / 2
  assert.equal(t[9], 200);   // day 10: (100 + 300) / 2
  assert.equal(t[19], 250);  // day 20: (200 + 300) / 2
  assert.equal(t[29], 250);
});

test("typicalCumulative carries a short month's total into the days it lacks", () => {
  const rows = [exp("2026-02-28", 280)]; // February has 28 days; March has 31
  const t = B.typicalCumulative(rows, "2026-03", 1);
  assert.equal(t.length, 31);
  assert.equal(t[26], 0);
  assert.equal(t[27], 280);
  assert.equal(t[30], 280);
});

test("typicalCumulative is null without an earlier month, and honours `since`", () => {
  assert.equal(B.typicalCumulative([exp("2026-11-03", 10)], "2026-11"), null);
  assert.equal(B.typicalCumulative([], "2026-11"), null);
  // a category first used in October still averages over every month the data covers
  const t = B.typicalCumulative([exp("2026-10-05", 600, "Trip")], "2026-11", 6, "2026-08");
  assert.equal(t[29], 200); // (0 + 0 + 600) / 3
});

test("expectedShare follows the usual shape of a month", () => {
  const typical = [100, 100, 100, 200]; // imagine a 4-day month: half the money goes on day 1
  near(B.expectedShare(typical, 1, 4), 0.5);
  near(B.expectedShare(typical, 3, 4), 0.5);
  near(B.expectedShare(typical, 4, 4), 1);
  near(B.expectedShare(typical, 9, 4), 1); // clamped
});

test("expectedShare falls back to a straight line without usable history", () => {
  near(B.expectedShare(null, 15, 30), 0.5);
  near(B.expectedShare(new Array(30).fill(0), 3, 30), 0.1);
});

test("budgetStatus: ok, ahead of the usual pace, and over", () => {
  // by now 40% of the month's money is usually gone → expected 4,000 of 10,000
  const at = spent => B.budgetStatus({ spent, budget: 10000, share: 0.4 });
  assert.equal(at(3900).state, "ok");
  assert.equal(at(4000).state, "ok");
  assert.equal(at(4100).state, "ahead");
  assert.equal(at(10000).state, "ahead");
  assert.equal(at(10001).state, "over");
  assert.deepEqual(at(2500), { state: "ok", used: 0.25, expected: 4000, left: 7500 });
  assert.equal(at(12000).left, -2000);
});

test("budgetStatus for a finished month only asks whether it stayed within budget", () => {
  assert.equal(B.budgetStatus({ spent: 9000, budget: 10000, share: 0.4, complete: true }).state, "ok");
  assert.equal(B.budgetStatus({ spent: 11000, budget: 10000, complete: true }).state, "over");
});

test("budgetStatus is null without a budget", () => {
  assert.equal(B.budgetStatus({ spent: 500, budget: null }), null);
  assert.equal(B.budgetStatus({ spent: 500, budget: 0 }), null);
});

test("projectMonthEnd scales by the usual share and refuses to guess too early", () => {
  assert.equal(B.projectMonthEnd(4000, 0.4), 10000);
  assert.equal(B.projectMonthEnd(4000, 1), 4000);
  assert.equal(B.projectMonthEnd(300, 0.05), null);
});

test("budgetHistory lists n months ending at endYm against the budget", () => {
  const rows = [exp("2026-09-10", 900), exp("2026-10-10", 1200), exp("2026-11-05", 300), exp("2026-11-20", 5000)];
  const h = B.budgetHistory(rows, 1000, "2026-11", "2026-11-14", 3);
  assert.deepEqual(h, [
    { ym: "2026-09", spent: 900, diff: -100, over: false, partial: false, future: false },
    { ym: "2026-10", spent: 1200, diff: 200, over: true, partial: false, future: false },
    { ym: "2026-11", spent: 300, diff: -700, over: false, partial: true, future: false }, // the planned 5,000 is not spent yet
  ]);
});

test("budgetHistory without a budget still reports spending, and marks future months", () => {
  const h = B.budgetHistory([exp("2026-11-05", 300)], null, "2026-12", "2026-11-14", 2);
  assert.deepEqual(h, [
    { ym: "2026-11", spent: 300, diff: null, over: null, partial: true, future: false },
    { ym: "2026-12", spent: 0, diff: null, over: null, partial: false, future: true },
  ]);
});

// Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const MM = require("../js/calc.js");

const tx = (...dates) => dates.map(date => ({ date, type: "Expense", amount: 1 }));

test("isoDate uses the local calendar date", () => {
  assert.equal(MM.isoDate(new Date(2026, 0, 5)), "2026-01-05");
  assert.equal(MM.isoDate(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
});

test("shiftMonth crosses year boundaries in both directions", () => {
  assert.equal(MM.shiftMonth("2026-11", 1), "2026-12");
  assert.equal(MM.shiftMonth("2026-12", 1), "2027-01");
  assert.equal(MM.shiftMonth("2026-01", -1), "2025-12");
  assert.equal(MM.shiftMonth("2026-03", -15), "2024-12");
  assert.equal(MM.shiftMonth("2026-03", 0), "2026-03");
});

test("monthRange knows month lengths and leap years", () => {
  assert.deepEqual(MM.monthRange("2026-11"), { start: "2026-11-01", end: "2026-11-30" });
  assert.deepEqual(MM.monthRange("2026-02"), { start: "2026-02-01", end: "2026-02-28" });
  assert.deepEqual(MM.monthRange("2024-02"), { start: "2024-02-01", end: "2024-02-29" });
  assert.deepEqual(MM.monthRange("2026-12"), { start: "2026-12-01", end: "2026-12-31" });
});

test("singleMonth recognises exactly one calendar month and nothing else", () => {
  assert.equal(MM.singleMonth("2026-11-01", "2026-11-30"), "2026-11");
  assert.equal(MM.singleMonth("2024-02-01", "2024-02-29"), "2024-02");
  assert.equal(MM.singleMonth("2026-11-01", "2026-11-29"), null); // partial
  assert.equal(MM.singleMonth("2026-11-02", "2026-11-30"), null);
  assert.equal(MM.singleMonth("2026-10-01", "2026-11-30"), null); // two months
  assert.equal(MM.singleMonth("2026-01-01", "2026-12-31"), null); // a year
  assert.equal(MM.singleMonth(null, null), null); // all time
});

test("daysBetween counts calendar days", () => {
  assert.equal(MM.daysBetween("2026-11-14", "2026-11-14"), 0);
  assert.equal(MM.daysBetween("2026-10-31", "2026-11-14"), 14);
  assert.equal(MM.daysBetween("2026-07-18", "2026-11-14"), 119);
  assert.equal(MM.daysBetween("2024-02-28", "2024-03-01"), 2); // leap day
});

test("latestActualDate ignores future-dated (planned) entries", () => {
  const rows = tx("2026-11-01", "2026-11-14", "2026-11-20", "2026-12-01");
  assert.equal(MM.latestActualDate(rows, "2026-11-14"), "2026-11-14");
  assert.equal(MM.latestActualDate(rows, "2026-11-13"), "2026-11-01");
  assert.equal(MM.latestActualDate(tx("2026-12-01"), "2026-11-14"), null);
  assert.equal(MM.latestActualDate([], "2026-11-14"), null);
});

test("staleness flags data older than the limit, not data at the limit", () => {
  assert.deepEqual(MM.staleness(tx("2026-07-18"), "2026-11-14"), { latest: "2026-07-18", days: 119, stale: true });
  assert.deepEqual(MM.staleness(tx("2026-10-31"), "2026-11-14"), { latest: "2026-10-31", days: 14, stale: false });
  assert.deepEqual(MM.staleness(tx("2026-10-30"), "2026-11-14"), { latest: "2026-10-30", days: 15, stale: true });
  assert.equal(MM.staleness(tx("2026-11-14"), "2026-11-14").stale, false);
});

test("staleness is not fooled by a planned entry later this month", () => {
  const s = MM.staleness(tx("2026-07-18", "2026-11-20"), "2026-11-14");
  assert.deepEqual(s, { latest: "2026-07-18", days: 119, stale: true });
});

test("staleness has a configurable limit and returns null without usable data", () => {
  assert.equal(MM.staleness(tx("2026-11-10"), "2026-11-14", 3).stale, true);
  assert.equal(MM.staleness([], "2026-11-14"), null);
  assert.equal(MM.staleness(tx("2027-01-01"), "2026-11-14"), null);
});

test("defaultMonth is the current month when it has data", () => {
  assert.equal(MM.defaultMonth(tx("2026-10-03", "2026-11-02"), "2026-11-14"), "2026-11");
});

test("defaultMonth falls back to the latest month with real data", () => {
  assert.equal(MM.defaultMonth(tx("2026-06-30", "2026-07-18"), "2026-11-14"), "2026-07");
  // a planned entry this month is not real data yet
  assert.equal(MM.defaultMonth(tx("2026-07-18", "2026-11-20"), "2026-11-14"), "2026-07");
  assert.equal(MM.defaultMonth([], "2026-11-14"), null);
});

test("monthBounds spans the data and always includes the current month", () => {
  assert.deepEqual(MM.monthBounds(tx("2020-06-01", "2026-07-18"), "2026-11-14"), { min: "2020-06", max: "2026-11" });
  assert.deepEqual(MM.monthBounds(tx("2020-06-01", "2027-01-05"), "2026-11-14"), { min: "2020-06", max: "2027-01" });
  assert.deepEqual(MM.monthBounds(tx("2027-01-05"), "2026-11-14"), { min: "2026-11", max: "2027-01" });
  assert.equal(MM.monthBounds([], "2026-11-14"), null);
});

test("stepMonth moves one month and stops at the bounds", () => {
  const b = { min: "2020-06", max: "2026-11" };
  assert.equal(MM.stepMonth("2026-10", 1, b), "2026-11");
  assert.equal(MM.stepMonth("2026-11", 1, b), "2026-11");
  assert.equal(MM.stepMonth("2026-01", -1, b), "2025-12");
  assert.equal(MM.stepMonth("2020-06", -1, b), "2020-06");
});

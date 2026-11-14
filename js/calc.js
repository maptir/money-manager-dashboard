// Date and money calculations for the dashboard. Pure functions, no DOM, no
// clock: "today" is always passed in, so every result can be tested.
// Dates are ISO strings ("YYYY-MM-DD"), months are "YYYY-MM"; both sort and
// compare correctly as plain strings and carry no time zone.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else Object.assign(root.MM = root.MM || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const pad = n => String(n).padStart(2, "0");

  // Local calendar date of a Date object.
  const isoDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const shiftMonth = (ym, delta) => {
    const months = Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1 + delta;
    return `${Math.floor(months / 12)}-${pad(months % 12 + 1)}`;
  };

  const daysInMonth = ym => new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate();

  const monthRange = ym => ({ start: `${ym}-01`, end: `${ym}-${pad(daysInMonth(ym))}` });

  // The month a date range covers, or null when it is not exactly one calendar month.
  const singleMonth = (start, end) => {
    if (!start || !end) return null;
    const ym = start.slice(0, 7);
    const r = monthRange(ym);
    return start === r.start && end === r.end ? ym : null;
  };

  const daysBetween = (from, to) => Math.round((Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) / 864e5);

  // Latest transaction date that has already happened. The app allows
  // future-dated (planned) entries; those say nothing about how fresh the data is.
  const latestActualDate = (rows, today) => {
    let latest = null;
    for (const t of rows) if (t.date && t.date <= today && (!latest || t.date > latest)) latest = t.date;
    return latest;
  };

  // How old the data is. null when there is no transaction up to today.
  const staleness = (rows, today, limitDays = 14) => {
    const latest = latestActualDate(rows, today);
    if (!latest) return null;
    const days = daysBetween(latest, today);
    return { latest, days, stale: days > limitDays };
  };

  // The month to open on: the current month, falling back to the most recent
  // month that has real data when the export does not reach today.
  const defaultMonth = (rows, today) => {
    const latest = latestActualDate(rows, today);
    return latest ? latest.slice(0, 7) : null;
  };

  // First and last month the month stepper may reach. It can always get back
  // to the current month, and forward to months that only hold planned entries.
  const monthBounds = (rows, today) => {
    let min = null, max = null;
    for (const t of rows) {
      if (!t.date) continue;
      const ym = t.date.slice(0, 7);
      if (!min || ym < min) min = ym;
      if (!max || ym > max) max = ym;
    }
    if (!min) return null;
    const cur = today.slice(0, 7);
    return { min: min < cur ? min : cur, max: max > cur ? max : cur };
  };

  const stepMonth = (ym, delta, bounds) => {
    const next = shiftMonth(ym, delta);
    return next < bounds.min ? bounds.min : next > bounds.max ? bounds.max : next;
  };

  return { isoDate, shiftMonth, daysInMonth, monthRange, singleMonth, daysBetween, latestActualDate, staleness, defaultMonth, monthBounds, stepMonth };
});

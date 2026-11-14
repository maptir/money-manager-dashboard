// Parsing of Money Manager data files. Pure functions, no DOM — the same code
// runs in the browser (window.MM) and in Node (require), so the dashboard's
// "load data" button and convert-xls.js can never disagree about a file.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else Object.assign(root.MM = root.MM || {}, api);
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  const decodeEntities = s => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if (body[0] !== "#") return NAMED[body.toLowerCase()] ?? whole;
    const code = body[1].toLowerCase() === "x" ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });

  const cellsOf = tr => (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || [])
    .map(c => decodeEntities(c.replace(/<[^>]+>/g, "")).trim());

  // The app's ".xls" export is really one HTML table. Columns:
  // Date (DD/MM/YYYY HH:mm:ss), Account, Category, Subcategory, Note, THB,
  // Income/Expense, Description, Amount, Currency. Rows come back in file order.
  function parseXlsHtml(text) {
    const trs = text.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    if (trs.length < 2) throw new Error("no table rows found in file");
    const header = cellsOf(trs[0]).map(h => h.toLowerCase());
    const col = n => header.indexOf(n);
    const iDate = col("date"), iType = col("income/expense"), iCat = col("category"),
      iSub = col("subcategory"), iNote = col("note"), iDesc = col("description"),
      iAcc = col("account"), iAmt = col("thb") >= 0 ? col("thb") : col("amount");
    if (iDate < 0 || iType < 0 || iAmt < 0) throw new Error("unrecognized columns: " + header.join(", "));
    const rows = [];
    for (const tr of trs.slice(1)) {
      const c = cellsOf(tr);
      const dm = (c[iDate] || "").split(" ")[0].split("/"); // DD/MM/YYYY [HH:mm:ss]
      if (dm.length !== 3) continue;
      rows.push({
        date: `${dm[2]}-${dm[1].padStart(2, "0")}-${dm[0].padStart(2, "0")}`,
        type: c[iType],
        category: iCat >= 0 ? c[iCat] : "",
        subCategory: iSub >= 0 ? c[iSub] : "",
        content: iNote >= 0 ? c[iNote] : "",
        detail: iDesc >= 0 ? c[iDesc] : "",
        amount: parseFloat(String(c[iAmt]).replace(/,/g, "")) || 0,
        assetId: "",
        payType: iAcc >= 0 ? c[iAcc] : "",
      });
    }
    return rows;
  }

  // Any file the dashboard accepts: transactions.json (an array, or an object
  // wrapping one) or the app's .xls export.
  function parseDataFile(text) {
    let rows;
    if (/^\s*[\[{]/.test(text)) {
      const j = JSON.parse(text);
      rows = Array.isArray(j) ? j : j.rows || j.transactions;
    } else {
      rows = parseXlsHtml(text);
    }
    if (!rows || !rows.length) throw new Error("no transactions found in file");
    return rows;
  }

  return { parseXlsHtml, parseDataFile };
});

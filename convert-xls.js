#!/usr/bin/env node
// Convert a Money Manager Excel export (.xls — actually an HTML table) into
// data/data.js (what dashboard.html loads), plus data/transactions.csv and
// data/transactions.json as portable copies for Excel/other tools.
// Usage: node convert-xls.js "data\2018-07-06_2026-07-31.xls"
const fs = require("fs");
const path = require("path");

const input = process.argv[2];
if (!input) { console.error("usage: node convert-xls.js <export.xls>"); process.exit(1); }
const html = fs.readFileSync(input, "utf8");

const trs = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
if (trs.length < 2) { console.error("no table rows found in " + input); process.exit(1); }
const cellsOf = tr => (tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || [])
  .map(c => c.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").trim());

const header = cellsOf(trs[0]).map(h => h.toLowerCase());
const col = n => header.indexOf(n);
const iDate = col("date"), iType = col("income/expense"), iCat = col("category"),
      iSub = col("subcategory"), iNote = col("note"), iDesc = col("description"),
      iAcc = col("account"), iAmt = col("thb") >= 0 ? col("thb") : col("amount");
if (iDate < 0 || iType < 0 || iAmt < 0) { console.error("unrecognized columns: " + header.join(", ")); process.exit(1); }

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
rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
console.log(`parsed ${rows.length} rows (${rows[0].date} .. ${rows[rows.length - 1].date})`);

const root = __dirname;
fs.mkdirSync(path.join(root, "data"), { recursive: true });

// data/data.js — what dashboard.html actually loads via <script src>.
// A real fetch() of a .json/.csv from a file:// page is blocked by browser
// CORS with no local server; a <script src> to a sibling file is not, so the
// data ships as a JS file that just assigns a global.
const d = new Date(), p = n => String(n).padStart(2, "0");
const stamp = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
const dataJsPath = path.join(root, "data", "data.js");
fs.writeFileSync(dataJsPath,
  `window.MM_DATA = ${JSON.stringify(rows)};\n` +
  `window.MM_EXPORTED_AT = ${JSON.stringify(`${stamp} (from ${path.basename(input)})`)};\n`);
console.log("wrote " + dataJsPath);

// portable copies for Excel / other tools — not read by the dashboard itself
const jsonPath = path.join(root, "data", "transactions.json");
fs.writeFileSync(jsonPath, JSON.stringify(rows));
console.log("wrote " + jsonPath);

const csvEsc = v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
const csvCols = ["date", "type", "category", "subCategory", "content", "detail", "amount", "payType"];
const csv = [csvCols.join(",")].concat(rows.map(r => csvCols.map(c => csvEsc(r[c] ?? "")).join(","))).join("\r\n");
const csvPath = path.join(root, "data", "transactions.csv");
fs.writeFileSync(csvPath, "﻿" + csv); // UTF-8 BOM so Excel opens Thai text correctly
console.log("wrote " + csvPath);

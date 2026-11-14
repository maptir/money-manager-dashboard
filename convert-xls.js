#!/usr/bin/env node
// Convert a Money Manager Excel export (.xls — actually an HTML table) into
// data/data.js (what index.html loads), plus data/transactions.csv and
// data/transactions.json as portable copies for Excel/other tools.
// Usage: node convert-xls.js "data\2018-07-06_2026-07-31.xls"
const fs = require("fs");
const path = require("path");
const { parseXlsHtml } = require("./js/parse.js"); // same parser the dashboard's "load data" uses

const input = process.argv[2];
if (!input) { console.error("usage: node convert-xls.js <export.xls>"); process.exit(1); }

let rows;
try {
  rows = parseXlsHtml(fs.readFileSync(input, "utf8"));
} catch (err) {
  console.error(`${err.message} (${input})`);
  process.exit(1);
}
if (!rows.length) { console.error("no transactions found in " + input); process.exit(1); }
rows.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
console.log(`parsed ${rows.length} rows (${rows[0].date} .. ${rows[rows.length - 1].date})`);

const root = __dirname;
fs.mkdirSync(path.join(root, "data"), { recursive: true });

// data/data.js — what index.html actually loads via <script src>.
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

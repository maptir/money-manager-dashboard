// Run with: node --test
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseXlsHtml, parseDataFile } = require("../js/parse.js");

// Same shape as the app's export: one HTML table, header row first, the
// "Account" column repeated at the end.
const HEADER = ["Date", "Account", "Category", "Subcategory", "Note", "THB", "Income/Expense", "Description", "Amount", "Currency", "Account"];
const table = (rows, header = HEADER) =>
  "<html><head><style>.s{color:red}</style></head><body><table>" +
  [header, ...rows].map(r => "<tr>" + r.map(c => `<td class='s'>${c}</td>`).join("") + "</tr>").join("\n") +
  "</table></body></html>";

test("parses an export row into a transaction", () => {
  const rows = parseXlsHtml(table([
    ["05/03/2024 18:42:10", "main", "🍜 Food", "Lunch", "noodles", "1,250.50", "Expense", "", "1,250.50", "THB", "main"],
  ]));
  assert.deepEqual(rows, [{
    date: "2024-03-05", type: "Expense", category: "🍜 Food", subCategory: "Lunch",
    content: "noodles", detail: "", amount: 1250.5, assetId: "", payType: "main",
  }]);
});

test("pads single-digit day and month, and accepts a date without a time", () => {
  const [row] = parseXlsHtml(table([["5/3/2024", "main", "Food", "", "", "10", "Expense", "", "10", "THB", "main"]]));
  assert.equal(row.date, "2024-03-05");
});

test("keeps every transaction type and the file's row order", () => {
  const rows = parseXlsHtml(table([
    ["02/01/2024 08:00:00", "main", "Salary", "", "", "50,000", "Income", "", "50,000", "THB", "main"],
    ["01/01/2024 09:00:00", "main", "Saving", "", "", "5,000", "Transfer-Out", "", "5,000", "THB", "main"],
  ]));
  assert.deepEqual(rows.map(r => [r.date, r.type, r.amount]), [
    ["2024-01-02", "Income", 50000],
    ["2024-01-01", "Transfer-Out", 5000],
  ]);
});

test("decodes HTML entities and strips markup inside cells", () => {
  const [row] = parseXlsHtml(table([
    ["01/01/2024", "main", "Food &amp; Drink", "", "<b>M&amp;S</b> &#3585;&#x41;&nbsp;&lt;3", "10", "Expense", "", "10", "THB", "main"],
  ]));
  assert.equal(row.category, "Food & Drink");
  assert.equal(row.content, "M&S กA <3");
});

test("skips rows that have no valid date", () => {
  const rows = parseXlsHtml(table([
    ["", "main", "Food", "", "", "10", "Expense", "", "10", "THB", "main"],
    ["Total", "", "", "", "", "10", "", "", "", "", ""],
    ["01/01/2024", "main", "Food", "", "", "10", "Expense", "", "10", "THB", "main"],
  ]));
  assert.equal(rows.length, 1);
});

test("an amount that is not a number becomes 0", () => {
  const [row] = parseXlsHtml(table([["01/01/2024", "main", "Food", "", "", "n/a", "Expense", "", "n/a", "THB", "main"]]));
  assert.equal(row.amount, 0);
});

test("falls back to the Amount column when there is no THB column", () => {
  const header = ["Date", "Account", "Category", "Income/Expense", "Amount"];
  const [row] = parseXlsHtml(table([["01/01/2024", "main", "Food", "Expense", "99"]], header));
  assert.equal(row.amount, 99);
  assert.equal(row.subCategory, "");
});

test("rejects a file with no table and a table with unknown columns", () => {
  assert.throws(() => parseXlsHtml("just some text"), /no table rows/);
  assert.throws(() => parseXlsHtml(table([["a", "b"]], ["Foo", "Bar"])), /unrecognized columns: foo, bar/);
});

test("parseDataFile accepts transactions.json as an array or a wrapper object", () => {
  const tx = [{ date: "2024-01-01", type: "Expense", category: "Food", amount: 10 }];
  assert.deepEqual(parseDataFile(JSON.stringify(tx)), tx);
  assert.deepEqual(parseDataFile("  " + JSON.stringify({ rows: tx })), tx);
  assert.deepEqual(parseDataFile(JSON.stringify({ transactions: tx })), tx);
});

test("parseDataFile routes anything else to the .xls parser", () => {
  const rows = parseDataFile(table([["01/01/2024", "main", "Food", "", "", "10", "Expense", "", "10", "THB", "main"]]));
  assert.equal(rows.length, 1);
});

test("parseDataFile rejects a file with no transactions", () => {
  assert.throws(() => parseDataFile("[]"), /no transactions found/);
  assert.throws(() => parseDataFile(table([])), /no table rows/);
  assert.throws(() => parseDataFile(table([["", "", "", "", "", "", "", "", "", "", ""]])), /no transactions found/);
});

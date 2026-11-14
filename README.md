# Money Manager — Monthly review dashboard

A read-only dashboard for the RealByte Money Manager app, built around one question: **how is this month going against my budget and against a normal month?** It is a static page — no server, no build step, no account. Your transactions and your budget stay in the browser you load them into.

## The three tabs

- **This month** (opens first) — one calendar month at a time; step with **‹ ›** or jump back with **Today**.
  - **Budget** — spent vs. your monthly budget. The tick on the bar is where you usually are by this day of the month, so a rent payment on the 1st does not look like overspending. Green = at or under your usual pace, amber = within budget but ahead of the usual pace, red = over budget.
  - **Spending so far** — running total for the month against a typical month (average of the previous 6) and the budget line.
  - **Spending by category** — with a progress bar for every category that has its own budget. Tap a category to see its transactions.
  - **Coming up** — entries dated after today. They are never counted as spent.
  - **Last 12 months** — which months stayed within the budget. Tap a month to open it.
- **Trends** — the charts over a longer period (cash flow, categories, year over year, heatmap, …).
- **Transactions** — search, filter and sort every transaction.

Trends and Transactions share one period filter (default: last 12 months).

## Budget

Click **Set budget** on the This-month tab. There is one total per month plus optional per-category amounts; the same budget applies to every month. **Use suggested amounts** fills in the median month of your last 6 months (the median ignores one-off spikes such as a flight).

The budget is saved in the browser's localStorage, so each device has its own. To copy it, use **Export** on one device and **Import** on the other (a small `money-manager-budget.json` file).

## Refreshing data — pick whichever is easiest

Always export the **full date range** from the app; a new file replaces the old data.

**A. Load a file in the dashboard (works on a phone too)**
1. In the app, export the Excel file.
2. Open the dashboard → **⤒ load data** → pick the `.xls` file (on a computer you can also drag it onto the page). `transactions.json` is accepted too.
3. The file is remembered in that browser (localStorage) until you load another one or click **✕ use embedded data**.

A warning appears when the newest transaction is more than 14 days old.

**B. Regenerate `data/data.js` (the copy the page loads by itself on this computer)**
- From a manual export: `node convert-xls.js "data\<your-export>.xls"`
- Straight from the phone (PC Manager open, default `http://192.168.1.38:8888`): `powershell -ExecutionPolicy Bypass -File .\export.ps1` (IP changed? add `-BaseUrl http://NEW.IP:8888`)

Both write `data/data.js` plus `data/transactions.csv` and `data/transactions.json` (portable copies for Excel/other tools — the dashboard itself doesn't read these).

`data/` is git-ignored: the hosted copy of the page never contains your transactions, so there you always use path A.

## On a phone

Open the hosted page, load your export once, and use the browser's **Add to Home screen** to get an app-like icon. Tabs move to the bottom of the screen.

## Files

- `index.html` + `dashboard.css` — the page markup and styles. No data, logic or libraries baked in.
- `js/app.js` — wires the page together: data loading, the three tabs, the month stepper and the period filter.
- `js/tab-month.js`, `js/tab-trends.js`, `js/tab-tx.js` — one file per tab.
- `js/ui.js` — shared state, formatting and chart helpers used by every tab.
- `js/budget-ui.js` — budget storage and the budget dialog.
- `js/parse.js`, `js/calc.js`, `js/budget.js` — parsing, date maths, and budget/pace maths. Plain functions: no DOM, no storage, no clock ("today" is passed in), so they run in Node too. `js/parse.js` is shared with `convert-xls.js`.
- `test/` — tests for those plain-function files. Run `node --test` (Node 18+, nothing to install).
- `lib/chart.min.js` — Chart.js, loaded via `<script src>`.
- `data/data.js` — the transactions the page loads by itself, also via `<script src>`.
- `data/transactions.csv` / `data/transactions.json` — same data, portable formats for Excel/other tools.
- `convert-xls.js` — converts an app `.xls` export (it's an HTML table, hence Excel's format warning) into the files above.
- `export.ps1` — pulls per-year `.xls` files into `exports/` + regenerates the files above, straight from the phone's PC Manager server.
- `manifest.webmanifest`, `icons/` — lets a phone add the dashboard to its home screen.
- `.claude/serve.js` — optional dev-only static server (`node .claude/serve.js` → http://localhost:4173). The dashboard never needs it.

## Why plain `<script src>` files and no `fetch()`?

Opening `index.html` directly (`file://…`, no server) is a hard requirement — that's what makes it double-click-and-go. Browsers block `fetch()`/`XMLHttpRequest` to local files from a `file://` page (CORS), and they block ES modules (`<script type="module">`) there too, but they do **not** block a classic `<script src="…">` to a sibling local file. So the code is classic scripts sharing one `MM` global, and the data ships as `data/data.js` (a `.js` file that just assigns `window.MM_DATA`) instead of a `.json`/`.csv` the page would have to fetch.

## Moving the dashboard

Keep `index.html`, `dashboard.css`, `manifest.webmanifest`, `js/`, `lib/`, `icons/`, and `data/` together (same relative layout) — copy the whole `money-manager` folder if you want to share or archive it elsewhere.

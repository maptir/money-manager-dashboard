# Money Manager — Export + Dashboard

Read-only income/expense dashboard for the RealByte Money Manager app.

## Refreshing data — pick whichever is easiest

**A. Load a file in the dashboard (no scripts needed)**
1. In the app (or PC Manager web page) export the Excel file for the date range you want.
2. Open `index.html` → click **⤒ load data** (or drag the `.xls` file onto the page). Accepts the app's `.xls` export or `transactions.json`.
3. The loaded file is remembered in the browser (localStorage) until you click **✕ use embedded data**.

**B. Regenerate `data/data.js` (dashboard folder stays double-click, no server)**
- From a manual export: `node convert-xls.js "data\<your-export>.xls"`
- Straight from the phone (PC Manager open, default `http://192.168.1.38:8888`): `powershell -ExecutionPolicy Bypass -File .\export.ps1` (IP changed? add `-BaseUrl http://NEW.IP:8888`)

Both write `data/data.js` (what the dashboard loads) plus `data/transactions.csv` and `data/transactions.json` (portable copies for Excel/other tools — the dashboard itself doesn't read these).

## Files

- `index.html` — the dashboard page. ~64 KB — no data or libraries baked in.
- `lib/chart.min.js` — Chart.js, loaded via `<script src>`.
- `data/data.js` — the transactions the dashboard loads, also via `<script src>`.
- `data/transactions.csv` / `data/transactions.json` — same data, portable formats for Excel/other tools.
- `convert-xls.js` — converts an app `.xls` export (it's an HTML table, hence Excel's format warning) into the files above.
- `export.ps1` — pulls per-year `.xls` files into `exports/` + regenerates the files above, straight from the phone's PC Manager server.

## Why not just `fetch()` a CSV/JSON file?

Opening `index.html` directly (`file://…`, no server) is a hard requirement — that's what makes it double-click-and-go. Browsers block `fetch()`/`XMLHttpRequest` to local files from a `file://` page (CORS), but they do **not** block `<script src="…">` to a sibling local file — it's a script load, not a cross-origin request. So the data ships as `data/data.js` (a `.js` file that just assigns `window.MM_DATA`) instead of a `.json`/`.csv` the page would have to fetch. The CSV/JSON copies still get written for opening in Excel or feeding other tools — the dashboard just doesn't read them directly.

If you'd rather work with real CSV+fetch (e.g. to hack on the data loading yourself), run any static file server from this folder (`npx serve`, `python -m http.server`, etc.) and fetch works normally too — just not needed for the shipped setup.

## Moving the dashboard

Keep `index.html`, `lib/`, and `data/` together (same relative layout) — copy the whole `money-manager` folder if you want to share or archive it elsewhere.

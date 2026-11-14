// Tiny static file server for previewing the dashboard (dev only, no dependencies).
// The dashboard itself needs no server — double-clicking index.html still works.
const http = require("http");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT) || 4173;
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml", ".png": "image/png",
  ".xls": "application/vnd.ms-excel", ".csv": "text/csv; charset=utf-8",
};

http.createServer((req, res) => {
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const file = path.resolve(root, "." + (urlPath.endsWith("/") ? urlPath + "index.html" : urlPath));
  if (file !== root && !file.startsWith(root + path.sep)) { res.writeHead(403).end("forbidden"); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404).end("not found"); return; }
    res.writeHead(200, { "Content-Type": types[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(buf);
  });
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} at http://localhost:${port}`));

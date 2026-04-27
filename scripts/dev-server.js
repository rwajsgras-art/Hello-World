#!/usr/bin/env node
// Local dev server for DoD AI News.
// - Serves the static PWA from the repo root on http://localhost:<PORT>.
// - Runs scripts/fetch-feeds.js on startup so feed.json is fresh.
// - Re-runs the fetcher every hour while the server is up.
// - Optionally opens the URL in the default browser (--open).
// Zero dependencies; needs Node 18+.

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT || 3000);
const REFRESH_MIN = Number(process.env.REFRESH_MIN || 60);
const OPEN_BROWSER = process.argv.includes("--open");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico":  "image/x-icon",
  ".txt":  "text/plain; charset=utf-8",
};

function safeJoin(root, requested) {
  const clean = decodeURIComponent(requested.split("?")[0]);
  const target = path.normalize(path.join(root, clean));
  return target.startsWith(root) ? target : null;
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "Cache-Control": "no-store",
    ...headers,
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  let p = safeJoin(ROOT, req.url || "/");
  if (!p) return send(res, 400, "bad path");
  try {
    const stat = fs.statSync(p);
    if (stat.isDirectory()) p = path.join(p, "index.html");
  } catch {
    return send(res, 404, "not found");
  }
  fs.readFile(p, (err, data) => {
    if (err) return send(res, 404, "not found");
    const ext = path.extname(p).toLowerCase();
    send(res, 200, data, { "Content-Type": MIME[ext] || "application/octet-stream" });
  });
});

function runFetcher() {
  const started = Date.now();
  console.log(`\n[${new Date().toISOString()}] running fetch-feeds.js…`);
  const child = spawn(process.execPath, [path.join(__dirname, "fetch-feeds.js")], {
    stdio: "inherit",
    cwd: ROOT,
  });
  child.on("exit", (code) => {
    const took = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[${new Date().toISOString()}] fetcher finished (${took}s, exit ${code})`);
  });
}

function openInBrowser(url) {
  const cmd =
    process.platform === "darwin" ? "open" :
    process.platform === "win32"  ? "start" :
                                    "xdg-open";
  spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref();
}

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/`;
  console.log(`\n  DoD AI News  →  ${url}`);
  console.log(`  Auto-refresh every ${REFRESH_MIN} min. Ctrl+C to stop.\n`);
  runFetcher();
  setInterval(runFetcher, REFRESH_MIN * 60 * 1000);
  if (OPEN_BROWSER) openInBrowser(url);
});

process.on("SIGINT", () => { console.log("\nbye."); process.exit(0); });

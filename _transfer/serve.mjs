// 本地/局域网静态服务：和 GitHub Pages 用同一个 index.html，便于离线传输脚本。
// 用法： node _transfer/serve.mjs   然后手机浏览器打开 http://<PC局域网IP>:8787/
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.PORT || 8787);
const ROOT = path.resolve(import.meta.dirname, "..");

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/plain; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
  ".png": "image/png",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".gitignore": "text/plain; charset=utf-8",
  ".nojekyll": "text/plain; charset=utf-8",
};

function lanIPs() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const ni of list || []) {
      if (ni.family === "IPv4" && !ni.internal) out.push(ni.address);
    }
  }
  return out;
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let rel = decodeURIComponent(url.pathname);
  if (rel === "/") rel = "/index.html";

  const target = path.resolve(ROOT, "." + rel);
  if (!target.startsWith(ROOT)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("403");
    return;
  }
  if (rel === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
    return;
  }
  let body;
  try {
    body = fs.readFileSync(target);
  } catch (e) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("404");
    return;
  }
  res.writeHead(200, {
    "Content-Type": TYPES[path.extname(target).toLowerCase()] || "application/octet-stream",
    "Content-Length": body.length,
    "Cache-Control": "no-store",
  });
  res.end(body);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("root: " + ROOT);
  for (const ip of lanIPs()) console.log("  http://" + ip + ":" + PORT + "/");
  console.log("  http://127.0.0.1:" + PORT + "/  (本机)");
});

// 从 DSH 本地会话日志统计真实 token 用量与费用。
//
// DSH 把每个会话存成 ~/.dsh/sessions/<workspace>/<session>/session.v4.jsonl.zstd
// （多帧 zstd），其中的 assistant 记录带有：
//   data.usage = { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens, totalTokens }
// 字段语义与官方计费口径对应：
//   cacheReadTokens -> 输入·缓存命中      inputTokens -> 输入·缓存未命中      outputTokens -> 输出
//
// 用法：
//   node _transfer/usage-stats.mjs                     # 最近 14 天
//   node _transfer/usage-stats.mjs --days 30
//   node _transfer/usage-stats.mjs --json usage.json   # 顺便写出一份 JSON（给手机小组件用）
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const argv = process.argv.slice(2);
const argVal = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const DAYS = Number(argVal("--days", "14"));
const JSON_OUT = argVal("--json", null);

// 官方定价（元 / 百万 tokens），deepseek-flash。
// 高峰：北京时间周一至周五 9:00-12:00、14:00-18:00（不含节假日）；其余为空闲，价格为一半。
const PRICE = {
  "deepseek-flash": { cacheMiss: 1, cacheHit: 0.02, output: 4 },
  "deepseek-v4-pro": { cacheMiss: 4.5, cacheHit: 0.15, output: 13.5 },
};

function isPeak(date) {
  const day = date.getDay(); // 0=周日
  if (day === 0 || day === 6) return false;
  const h = date.getHours() + date.getMinutes() / 60;
  return (h >= 9 && h < 12) || (h >= 14 && h < 18);
}

function costOf(model, u, at) {
  const p = PRICE[model] || PRICE["deepseek-flash"];
  const k = isPeak(at) ? 2 : 1;
  return (
    ((u.cacheMiss || 0) / 1e6) * p.cacheMiss * k +
    ((u.cacheHit || 0) / 1e6) * p.cacheHit * k +
    ((u.output || 0) / 1e6) * p.output * k
  );
}

const dayKey = (ts) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

// ---- 收集并逐帧解压 ----
const sessionsRoot = path.join(os.homedir(), ".dsh", "sessions");
if (!fs.existsSync(sessionsRoot)) { console.log("找不到 " + sessionsRoot); process.exit(1); }

const files = [];
for (const ws of fs.readdirSync(sessionsRoot)) {
  const wsDir = path.join(sessionsRoot, ws);
  if (!fs.statSync(wsDir).isDirectory()) continue;
  for (const s of fs.readdirSync(wsDir)) {
    const f = path.join(wsDir, s, "session.v4.jsonl.zstd");
    if (fs.existsSync(f)) files.push({ file: f, workspace: ws, mtime: fs.statSync(f).mtimeMs });
  }
}

function readRecords(file) {
  const buf = fs.readFileSync(file);
  const out = [];
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (buf[i] !== 0x28 || buf[i + 1] !== 0xb5 || buf[i + 2] !== 0x2f || buf[i + 3] !== 0xfd) continue;
    try {
      out.push(zlib.zstdDecompressSync(buf.subarray(i)).toString("utf8"));
    } catch {}
  }
  return out.join("\n").split("\n").filter((l) => l.trim());
}

const since = Date.now() - DAYS * 86400000;
const byDay = new Map();
let scanned = 0, usedRecords = 0, firstKeysPrinted = false, skippedOld = 0;

for (const { file, workspace, mtime } of files) {
  if (mtime < since - 2 * 86400000) continue; // 文件太旧，跳过
  scanned++;
  for (const line of readRecords(file)) {
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const data = rec.data || {};
    const u = data.usage && typeof data.usage.totalTokens === "number" ? data.usage : null;
    if (!u) continue;

    if (!firstKeysPrinted) {
      firstKeysPrinted = true;
      console.log("调试 · 用量记录字段: " + JSON.stringify(Object.keys(rec)) + " / data: " + JSON.stringify(Object.keys(data)));
    }

    const at = rec.at || rec.timestamp || rec.time || data.at || data.timestamp || mtime;
    if (at < since) { skippedOld++; continue; }
    const model = rec.model || data.model || rec.modelId || "deepseek-flash";
    const day = dayKey(at);
    const bucket = byDay.get(day) || { cacheMiss: 0, cacheHit: 0, output: 0, total: 0, cost: 0, calls: 0 };
    bucket.cacheMiss += u.inputTokens || 0;
    bucket.cacheHit += u.cacheReadTokens || 0;
    bucket.output += u.outputTokens || 0;
    bucket.total += u.totalTokens || 0;
    bucket.cost += costOf(model, { cacheMiss: u.inputTokens, cacheHit: u.cacheReadTokens, output: u.outputTokens }, new Date(at));
    bucket.calls += 1;
    byDay.set(day, bucket);
    usedRecords++;
  }
}

const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));
const sum = days.reduce(
  (a, [, b]) => ({
    cacheMiss: a.cacheMiss + b.cacheMiss,
    cacheHit: a.cacheHit + b.cacheHit,
    output: a.output + b.output,
    total: a.total + b.total,
    cost: a.cost + b.cost,
    calls: a.calls + b.calls,
  }),
  { cacheMiss: 0, cacheHit: 0, output: 0, total: 0, cost: 0, calls: 0 }
);

const fmt = (n) => n.toLocaleString("en-US");
console.log(`\n扫描 ${scanned} 个会话文件（跳过 ${files.length - scanned} 个过旧文件），命中 ${usedRecords} 次带用量的请求`);
console.log(`时间范围：最近 ${DAYS} 天\n`);
console.log("日期        请求   输入(未命中)   输入(命中)      输出       合计      估算费用");
console.log("─".repeat(84));
for (const [day, b] of days) {
  console.log(
    `${day}  ${String(b.calls).padStart(4)}  ${fmt(b.cacheMiss).padStart(12)}  ${fmt(b.cacheHit).padStart(12)}  ${fmt(b.output).padStart(10)}  ${fmt(b.total).padStart(10)}   ¥${b.cost.toFixed(4)}`
  );
}
console.log("─".repeat(84));
console.log(
  `合计        ${String(sum.calls).padStart(4)}  ${fmt(sum.cacheMiss).padStart(12)}  ${fmt(sum.cacheHit).padStart(12)}  ${fmt(sum.output).padStart(10)}  ${fmt(sum.total).padStart(10)}   ¥${sum.cost.toFixed(4)}`
);
if (skippedOld) console.log(`（另有 ${skippedOld} 条记录早于统计窗口，已跳过）`);

if (JSON_OUT) {
  const payload = {
    generatedAt: Date.now(),
    days: DAYS,
    pricing: "deepseek-flash 官方价（高峰×2，空闲×1，已按北京时间判断）",
    totals: sum,
    daily: days.map(([day, b]) => ({ day, ...b })),
  };
  fs.writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2));
  console.log(`\n已写出 ${JSON_OUT}（${(fs.statSync(JSON_OUT).size / 1024).toFixed(1)} KB）`);
}

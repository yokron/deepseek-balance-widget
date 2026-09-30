// 把 collectUsage() 的结果发布到一个「私密 Gist」，供手机小组件读取。
//
// 为什么需要这一步：token 用量只存在于发起请求的那台机器（电脑上的 DSH 会话日志），
// 手机从没调用过 API，所以拿不到这些数字。这个脚本只做「搬运」：
//   电脑上已有的数据 -> 私密 Gist（unlisted） -> 手机小组件读 raw URL
//
// 用法：
//   node _transfer/publish-usage.mjs              # 最近 30 天，创建/更新 Gist
//   node _transfer/publish-usage.mjs --days 14
//   node _transfer/publish-usage.mjs --show       # 只打印当前 Gist 地址
//
// Gist id 与 URL 记在 _transfer/.usage-gist.json（已 gitignore，不会提交）。
import fs from "node:fs";
import path from "node:path";
import { collectUsage } from "./usage-stats.mjs";

const CONF = path.join(import.meta.dirname, ".usage-gist.json");
const argv = process.argv.slice(2);
const argVal = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const DAYS = Number(argVal("--days", "30"));
const TOKEN = process.env.GH_TOKEN;
const FILE_NAME = "deepseek-usage.json";

const readConf = () => (fs.existsSync(CONF) ? JSON.parse(fs.readFileSync(CONF, "utf8")) : null);

if (argv.includes("--show")) {
  const c = readConf();
  console.log(c ? `Gist id  : ${c.id}\nraw URL  : ${c.rawUrl}\n页面     : ${c.htmlUrl}` : "还没有创建 Gist，先跑一次不带 --show 的命令");
  process.exit(0);
}

if (!TOKEN) {
  console.error("缺少 GH_TOKEN（用 . .\\_transfer\\token.ps1 从凭据管理器注入）");
  process.exit(2);
}

async function gh(method, url, body) {
  const res = await fetch(url.startsWith("http") ? url : "https://api.github.com" + url, {
    method,
    headers: {
      Authorization: "Bearer " + TOKEN,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "dsh-deepseek-widget",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  return { status: res.status, json };
}

const usage = collectUsage(DAYS);
if (usage.error) { console.error(usage.error); process.exit(1); }

const content = JSON.stringify(usage, null, 2);
let conf = readConf();
let action;

if (!conf || !conf.id) {
  const r = await gh("POST", "/gists", {
    description: "DeepSeek token 用量（DSH 本地统计，仅数字，无对话内容）",
    public: false,
    files: { [FILE_NAME]: { content } },
  });
  if (r.status !== 201) { console.error(`创建 Gist 失败 ${r.status}: ${JSON.stringify(r.json).slice(0, 300)}`); process.exit(1); }
  const owner = (r.json.owner && r.json.owner.login) || "unknown";
  conf = {
    id: r.json.id,
    // 不带 revision 的稳定地址，更新后内容会跟着变
    rawUrl: `https://gist.githubusercontent.com/${owner}/${r.json.id}/raw/${FILE_NAME}`,
    htmlUrl: r.json.html_url,
    createdAt: Date.now(),
  };
  fs.writeFileSync(CONF, JSON.stringify(conf, null, 2));
  action = "已创建私密 Gist";
} else {
  const r = await gh("PATCH", "/gists/" + conf.id, { files: { [FILE_NAME]: { content } } });
  if (r.status !== 200) { console.error(`更新 Gist 失败 ${r.status}: ${JSON.stringify(r.json).slice(0, 300)}`); process.exit(1); }
  action = "已更新私密 Gist";
}

console.log(`${action}`);
console.log(`  raw URL : ${conf.rawUrl}`);
console.log(`  页面    : ${conf.htmlUrl}`);
console.log(`  内容    : 最近 ${usage.days} 天 · ${usage.totals.total.toLocaleString("en-US")} tokens · ¥${usage.totals.cost.toFixed(4)} · ${usage.totals.calls} 次请求`);
console.log(`\n把它填进小组件参数（第 3 段）：default|CNY|${conf.rawUrl}`);

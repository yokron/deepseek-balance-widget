// GitHub 操作工具（走 Node 自带 TLS，绕过沙箱里失效的 schannel）
// token 由调用方通过环境变量 GH_TOKEN 注入，本脚本只打印结果，绝不打印 token。
//
//   node _transfer/gh.mjs check [owner/repo]
//   node _transfer/gh.mjs create <repo> [--private] [--desc "..."]
//   node _transfer/gh.mjs pages <owner/repo> [branch]
//   node _transfer/gh.mjs repo <owner/repo>
import fs from "node:fs";
import path from "node:path";

const TOKEN = process.env.GH_TOKEN;
if (!TOKEN) {
  console.error("缺少 GH_TOKEN 环境变量");
  process.exit(2);
}

const API = "https://api.github.com";

async function api(method, url, body) {
  const res = await fetch(url.startsWith("http") ? url : API + url, {
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
  return { status: res.status, scopes: res.headers.get("x-oauth-scopes") || "", json };
}

const [cmd, ...rest] = process.argv.slice(2);
const flags = rest.filter((a) => a.startsWith("--"));
const args = rest.filter((a) => !a.startsWith("--"));

function flagVal(name) {
  const i = flags.findIndex((f) => f === name);
  return i >= 0 ? rest[rest.indexOf(name) + 1] : null;
}

if (cmd === "check") {
  const me = await api("GET", "/user");
  if (me.status !== 200) {
    console.log(`FAIL  /user -> ${me.status} ${JSON.stringify(me.json).slice(0, 200)}`);
    process.exit(1);
  }
  console.log(`login      : ${me.json.login}`);
  console.log(`name       : ${me.json.name || "-"}`);
  console.log(`scopes     : ${me.scopes || "(fine-grained / none reported)"}`);
  console.log(`public repo: ${me.json.public_repos}  private: ${me.json.total_private_repos ?? "-"}`);
  console.log(`plan       : ${me.json.plan ? me.json.plan.name : "-"}`);
  const target = args[0];
  if (target) {
    const r = await api("GET", "/repos/" + target);
    if (r.status === 200) {
      console.log(`repo ${target}: EXISTS  default_branch=${r.json.default_branch}  private=${r.json.private}  size=${r.json.size}KB`);
    } else if (r.status === 404) {
      console.log(`repo ${target}: 不存在（可创建）`);
    } else {
      console.log(`repo ${target}: ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
    }
  }
  process.exit(0);
}

if (cmd === "create") {
  const name = args[0];
  if (!name) { console.error("需要仓库名"); process.exit(2); }
  const priv = flags.includes("--private");
  const desc = flagVal("--desc") || "iOS 桌面小组件：在 iPhone 上查看 DeepSeek API 余额（Scriptable）";
  const r = await api("POST", "/user/repos", {
    name,
    description: desc,
    private: priv,
    has_issues: true,
    has_wiki: false,
    has_projects: false,
    auto_init: false,
  });
  if (r.status === 201) {
    console.log(`OK 已创建 ${r.json.full_name}  private=${r.json.private}`);
    console.log(`clone: ${r.json.clone_url}`);
  } else if (r.status === 422) {
    console.log(`SKIP 已存在或名称不可用: ${JSON.stringify(r.json.errors || r.json.message)}`);
  } else {
    console.log(`FAIL ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
    process.exit(1);
  }
  process.exit(0);
}

if (cmd === "pages") {
  const [repo, branch = "main"] = args;
  if (!repo) { console.error("需要 owner/repo"); process.exit(2); }
  let r = await api("POST", `/repos/${repo}/pages`, { source: { branch, path: "/" } });
  if (r.status === 201 || r.status === 200) {
    console.log(`OK Pages 已开启: ${r.json.html_url || "(部署中)"}`);
  } else if (r.status === 409) {
    r = await api("PUT", `/repos/${repo}/pages`, { source: { branch, path: "/" } });
    console.log(r.status === 204 ? "OK Pages 已更新" : `FAIL ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
  } else {
    console.log(`FAIL ${r.status} ${JSON.stringify(r.json).slice(0, 300)}`);
    process.exit(1);
  }
  const info = await api("GET", `/repos/${repo}/pages`);
  if (info.status === 200) console.log(`url : ${info.json.html_url}   status=${info.json.status}`);
  process.exit(0);
}

if (cmd === "repo") {
  const [repo] = args;
  const r = await api("GET", "/repos/" + repo);
  console.log(`status=${r.status}`);
  if (r.status === 200) {
    console.log(`full_name      : ${r.json.full_name}`);
    console.log(`private        : ${r.json.private}`);
    console.log(`default_branch : ${r.json.default_branch}`);
    console.log(`pushed_at      : ${r.json.pushed_at}`);
    console.log(`html_url       : ${r.json.html_url}`);
  }
  process.exit(r.status === 200 ? 0 : 1);
}

console.error("用法: check | create | pages | repo");
process.exit(2);

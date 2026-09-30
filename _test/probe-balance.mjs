// 用本机 DSH 里配置的 DeepSeek key 查一次真实余额，看接口到底返回什么。
// 只打印「结构」和接口响应，绝不打印 key 本身。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const p = path.join(os.homedir(), ".dsh", ".credentials.yaml");
if (!fs.existsSync(p)) {
  console.log("没有 " + p);
  process.exit(0);
}
const text = fs.readFileSync(p, "utf8");
const lines = text.split(/\r?\n/);

console.log("=== 凭据文件结构（值已遮蔽）===");
for (const line of lines) {
  if (!line.trim()) continue;
  const m = line.match(/^(\s*[^\s:]+)\s*:\s*(.*)$/);
  if (m && m[2] && m[2].trim()) {
    console.log(`${m[1]}: <${m[2].trim().length} 字符>`);
  } else {
    console.log(line.replace(/sk-[A-Za-z0-9_\-]{6,}/g, "sk-***"));
  }
}

let section = "(root)";
const found = [];
lines.forEach((line, i) => {
  const sec = line.match(/^([A-Za-z_][\w\-]*):/);
  if (sec) section = sec[1];
  const hits = line.match(/sk-[A-Za-z0-9_\-]{20,}/g);
  if (hits) hits.forEach((k) => found.push({ section, line: i + 1, key: k }));
});

console.log("\n=== 候选 key（不含内容）===");
for (const f of found) console.log(`  段 ${f.section} · 第 ${f.line} 行 · 长度 ${f.key.length}`);
if (!found.length) { console.log("  没有找到 sk- 形式的 key"); process.exit(0); }

const pick = found.find((f) => /deepseek/i.test(f.section)) || (found.length === 1 ? found[0] : null);
if (!pick) { console.log("\n无法唯一确定 DeepSeek 的 key，跳过查询"); process.exit(0); }

console.log(`\n=== 用「${pick.section}」段的 key 请求 GET https://api.deepseek.com/user/balance ===`);
try {
  const r = await fetch("https://api.deepseek.com/user/balance", {
    headers: { Authorization: "Bearer " + pick.key, Accept: "application/json" },
  });
  console.log("HTTP " + r.status);
  const body = await r.text();
  console.log(body);
  try {
    const j = JSON.parse(body);
    for (const b of j.balance_infos || []) {
      console.log(`  解析后：${b.currency} 总额=${b.total_balance} 赠金=${b.granted_balance} 充值=${b.topped_up_balance}`);
    }
  } catch {}
} catch (e) {
  console.log("请求失败: " + (e.cause?.code || e.message));
}

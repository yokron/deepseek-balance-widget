// 用最小 stub 模拟 Scriptable 运行时，验证 DeepSeekBalance.js 能否正常执行。
//
// 两条硬约束：
//   1) stub 全部包在「严格 Proxy」里 —— 脚本一旦访问 Scriptable 真实不存在的
//      属性/方法就立刻失败（早期 stub 手写过不存在的 Alert.buttonTitle()，
//      导致本地全绿、真机报错）。
//   2) 断言脚本只写缓存文件 —— 保证"只显示官方接口返回的字段"，不落地任何推算数据。
//
// 运行： node _test/run.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const files = new Map();

const src = fs.readFileSync(path.join(ROOT, "DeepSeekBalance.js"), "utf8");
if (!src.includes("await main();")) throw new Error("脚本入口 await main(); 未找到");
fs.writeFileSync(path.join(import.meta.dirname, "DeepSeekBalance.mjs"), src.replace("await main();", "export { main };"));

// ---------------------------------------------------------------- 严格代理

const unknownApi = [];
function strict(target, label) {
  if (target == null || typeof target !== "object") return target;
  return new Proxy(target, {
    get(t, prop, recv) {
      if (typeof prop === "symbol") return Reflect.get(t, prop, recv);
      if (!(prop in t)) {
        unknownApi.push(label + "." + String(prop));
        throw new Error(`调用了 Scriptable 不存在的 API: ${label}.${String(prop)}`);
      }
      const v = Reflect.get(t, prop, recv);
      return typeof v === "function" ? v.bind(recv) : v;
    },
    set(t, prop, val, recv) { return Reflect.set(t, prop, val, recv); },
  });
}

// ---------------------------------------------------------------- 可编程的“用户”

const user = { choices: [], texts: [], menus: [] };
const choose = (...t) => user.choices.push(...t);
const type = (...v) => user.texts.push(...v);
const nextChoice = () => (user.choices.length ? user.choices.shift() : null);

// ---------------------------------------------------------------- stubs

let sample = () => ({
  is_available: true,
  balance_infos: [
    { currency: "CNY", total_balance: "110.00", granted_balance: "10.00", topped_up_balance: "100.00" },
    { currency: "USD", total_balance: "8.20", granted_balance: "0.00", topped_up_balance: "8.20" },
  ],
});

let nextStatus = 200;
let requestCount = 0;
const log = [];

class ColorImpl {
  constructor(hex, alpha) {
    if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) throw new Error("Invalid hex string: " + hex);
    if (alpha !== undefined && (typeof alpha !== "number" || alpha < 0 || alpha > 1)) throw new Error("Color alpha 必须是 0~1");
    this.hex = hex;
  }
  static dynamic(a) { return new ColorImpl(a.hex); }
}
class FontImpl {
  static boldSystemFont(s) { return { kind: "bold", s }; }
  static systemFont(s) { return { kind: "sys", s }; }
  static semiboldSystemFont(s) { return { kind: "semi", s }; }
  static mediumSystemFont(s) { return { kind: "med", s }; }
  static boldMonospacedSystemFont(s) { return { kind: "monoB", s }; }
  static regularMonospacedSystemFont(s) { return { kind: "mono", s }; }
}
class SizeImpl { constructor(w, h) { this.width = w; this.height = h; return strict(this, "Size"); } }
class PointImpl { constructor(x, y) { this.x = x; this.y = y; return strict(this, "Point"); } }
class LinearGradientImpl {
  constructor() { this.colors = []; this.locations = []; this.startPoint = null; this.endPoint = null; return strict(this, "LinearGradient"); }
}
class TextImpl {
  constructor() { this.text = ""; this.font = null; this.textColor = null; this.lineLimit = 0; this.minimumScaleFactor = 1; this.url = null; return strict(this, "Text"); }
}
class StackImpl {
  constructor() { this.children = []; this.spacing = 0; this.layout = null; return strict(this, "Stack"); }
  addStack() { const s = new StackImpl(); s.layout = this.layout; this.children.push(s); return s; }
  addText(t) {
    if (typeof t !== "string") throw new Error("addText 需要字符串，收到 " + typeof t);
    const x = new TextImpl(); x.text = t; this.children.push(x); return x;
  }
  addSpacer(n) {
    if (n !== undefined && typeof n !== "number") throw new Error("addSpacer 需要 number");
    this.children.push({ spacer: n == null ? 0 : n });
  }
  addImage(img) { if (!img) throw new Error("addImage 收到 null"); this.children.push({ image: img }); }
  layoutHorizontally() { this.layout = "h"; }
  layoutVertically() { this.layout = "v"; }
  centerAlignContent() { this.align = "center"; }
  bottomAlignContent() { this.align = "bottom"; }
}
class ListWidgetImpl extends StackImpl {
  constructor() { super(); this.backgroundColor = null; this.backgroundGradient = null; this.url = null; }
  setPadding(...a) { if (a.some((v) => typeof v !== "number")) throw new Error("setPadding 需要 number"); this.padding = a; }
  async presentSmall() { log.push("presentSmall"); }
  async presentMedium() { log.push("presentMedium"); }
  async presentLarge() { log.push("presentLarge"); }
}
class AlertImpl {
  constructor() { this.buttons = []; this.fields = []; this.title = ""; this.message = ""; return strict(this, "Alert"); }
  addAction(t) { this.buttons.push(t); }
  addDestructiveAction(t) { this.buttons.push(t); }
  addCancelAction(t) { this.cancel = t; }
  addTextField(p, v) { this.fields.push(user.texts.length ? user.texts.shift() : v || ""); }
  addSecureTextField(p, v) { this.fields.push(user.texts.length ? user.texts.shift() : v || ""); }
  textFieldValue(i) { return this.fields[i]; }
  answer() {
    if (this.fields.length > 0) return 0;          // 输入框弹窗：直接点确定
    const want = nextChoice();
    if (want == null) return -1;
    const i = this.buttons.indexOf(want);
    if (i < 0) throw new Error(`脚本化了点击「${want}」，但实际按钮是: ${this.buttons.join(" / ")}`);
    return i;
  }
  async present() { this.kind = "modal"; return this.answer(); }
  async presentAlert() { this.kind = "modal"; return this.answer(); }
  async presentSheet() { this.kind = "sheet"; user.menus.push(this.title + "\n" + this.message); return this.answer(); }
}
class FileManagerImpl {
  constructor() { return strict(this, "FileManager"); }
  static local() { return new FileManagerImpl(); }
  documentsDirectory() { return "/mock/Documents"; }
  joinPath(...p) { return p.join("/"); }
  fileExists(p) { return files.has(p); }
  readString(p) { if (!files.has(p)) throw new Error("ENOENT " + p); return files.get(p); }
  writeString(p, s) { if (typeof s !== "string") throw new Error("writeString 需要字符串"); files.set(p, s); }
}
class RequestImpl {
  constructor(url) {
    if (typeof url !== "string" || !url.startsWith("http")) throw new Error("bad url " + url);
    this.url = url; this.method = "GET"; this.headers = {}; this.timeoutInterval = 60;
    return strict(this, "Request");
  }
  async loadString() {
    requestCount++;
    log.push("GET " + this.url + " status=" + nextStatus);
    if (nextStatus === 0) throw new Error("network down");
    if (nextStatus === 401) return JSON.stringify({ error: { message: "Authentication Fails" } });
    return JSON.stringify(sample());
  }
  get response() { return { statusCode: nextStatus }; }
}

const store = new Map();
const keychain = {
  contains: (k) => store.has(k),
  get: (k) => (store.has(k) ? store.get(k) : null),
  set: (k, v) => { if (!k) throw new Error("Keychain.set 需要 key"); store.set(k, v); },
  remove: (k) => store.delete(k),
};
const pasteboard = { copy: (s) => log.push("copy:" + s) };
const device = { screenSize: () => new SizeImpl(393, 852) };
const script = {
  _widget: null,
  setWidget(w) { if (!w) throw new Error("setWidget(null)"); this._widget = w; },
  complete() { log.push("complete"); },
  name: () => "DeepSeekBalance",
};
const config = strict({ runsInWidget: true, widgetFamily: "small" }, "config");
const args = strict({ widgetParameter: null }, "args");

Object.assign(globalThis, {
  Color: strict(ColorImpl, "Color"),
  Font: strict(FontImpl, "Font"),
  Size: SizeImpl, Point: PointImpl, LinearGradient: LinearGradientImpl, Text: TextImpl,
  ListWidget: ListWidgetImpl, Alert: AlertImpl,
  FileManager: strict(FileManagerImpl, "FileManager"),
  Request: RequestImpl,
  Keychain: strict(keychain, "Keychain"),
  Pasteboard: strict(pasteboard, "Pasteboard"),
  Device: strict(device, "Device"),
  Script: strict(script, "Script"),
  args, config,
});

const mod = await import(pathToFileURL(path.join(import.meta.dirname, "DeepSeekBalance.mjs")).href);

// ---------------------------------------------------------------- 断言工具

const results = [];
async function check(name, fn) {
  try {
    const v = await fn();
    results.push(["PASS", name, v === undefined ? "" : v]);
  } catch (e) {
    results.push(["FAIL", name, e.message]);
  }
}
function walk(w, fn) {
  const seen = new Set();
  (function rec(s) {
    if (!s || seen.has(s)) return;
    seen.add(s);
    fn(s);
    const kids = "children" in s ? s.children : null;
    if (kids) kids.forEach(rec);
  })(w);
}
const textsOf = (w) => { const o = []; walk(w, (s) => { if (s instanceof TextImpl) o.push(s.text); }); return o; };
const CACHE = "/mock/Documents/deepseek-balance-cache.json";
const KC = (alias) => "deepseek.balance.apikey." + alias;

function reset({ key = null } = {}) {
  store.clear();
  files.clear();
  user.choices.length = 0;
  user.texts.length = 0;
  user.menus.length = 0;
  nextStatus = 200;
  requestCount = 0;
  args.widgetParameter = null;
  if (key) store.set(KC("default"), key);
}

// ---------------------------------------------------------------- 场景

await check("无 Key 时返回提示组件（三种尺寸）", async () => {
  reset();
  for (const fam of ["small", "medium", "large"]) {
    config.runsInWidget = true; config.widgetFamily = fam; script._widget = null;
    await mod.main();
    if (!script._widget) throw new Error(fam + " 未生成组件");
    if (textsOf(script._widget).length < 3) throw new Error(fam + " 内容为空");
  }
});

await check("官方 200：显示 总额/赠金/充值，且只写缓存文件", async () => {
  reset({ key: "sk-test-123" });
  for (const fam of ["small", "medium", "large"]) {
    config.runsInWidget = true; config.widgetFamily = fam; script._widget = null;
    await mod.main();
  }
  if (requestCount !== 3) throw new Error("请求次数异常 " + requestCount);
  const t = textsOf(script._widget);
  for (const want of ["110.00", "赠金", "10.00", "充值", "100.00"]) {
    if (!t.includes(want)) throw new Error("缺少 " + want + "：" + t.join(" | "));
  }
  const written = [...files.keys()];
  if (written.length !== 1 || !written[0].endsWith("deepseek-balance-cache.json")) {
    throw new Error("除缓存外还写了其它文件（说明有推算数据落地）: " + written.join(", "));
  }
  const cached = JSON.parse(files.get(CACHE)).default;
  if (!cached || cached.balanceInfos.length !== 2) throw new Error("缓存内容异常");
});

await check("参数 work|USD：主货币切到 USD", async () => {
  reset();
  store.set(KC("work"), "sk-work");
  args.widgetParameter = "work|USD";
  config.runsInWidget = true; config.widgetFamily = "medium"; script._widget = null;
  await mod.main();
  const t = textsOf(script._widget);
  const iUsd = t.indexOf("USD");
  const iCny = t.indexOf("CNY");
  if (iUsd < 0) throw new Error("未显示 USD: " + t.join(" | "));
  if (iCny >= 0 && iCny < iUsd) throw new Error("主货币仍是 CNY: " + t.join(" | "));
  if (t[iUsd + 1] !== "8.20") throw new Error("主货币金额不是 USD 的 8.20: " + t.join(" | "));
});

await check("401 时给出 Key 无效组件", async () => {
  reset({ key: "sk-bad" });
  nextStatus = 401;
  config.runsInWidget = true; config.widgetFamily = "small"; script._widget = null;
  await mod.main();
  const t = textsOf(script._widget).join(" | ");
  if (!/无效或无权限/.test(t)) throw new Error("提示文案不对: " + t);
  nextStatus = 200;
});

await check("断网时回退缓存并标明「缓存数据」", async () => {
  reset({ key: "sk-test-123" });
  config.runsInWidget = true; config.widgetFamily = "medium";
  await mod.main();
  nextStatus = 0;
  script._widget = null;
  await mod.main();
  const t = textsOf(script._widget);
  if (!t.some((x) => x.includes("缓存数据"))) throw new Error("未标明缓存: " + t.join(" | "));
  if (!t.includes("110.00")) throw new Error("未回退到缓存数值");
  nextStatus = 200;
});

await check("赠金为 0 时不显示该字段", async () => {
  reset({ key: "sk-test-123" });
  sample = () => ({ is_available: true, balance_infos: [{ currency: "CNY", total_balance: "16.68", granted_balance: "0.00", topped_up_balance: "16.68" }] });
  config.runsInWidget = true; config.widgetFamily = "large"; script._widget = null;
  await mod.main();
  const t = textsOf(script._widget);
  if (t.includes("赠金")) throw new Error("赠金为 0 仍显示");
  if (!t.includes("16.68")) throw new Error("余额显示异常: " + t.join(" | "));
  sample = () => ({ is_available: true, balance_infos: [
    { currency: "CNY", total_balance: "110.00", granted_balance: "10.00", topped_up_balance: "100.00" },
    { currency: "USD", total_balance: "8.20", granted_balance: "0.00", topped_up_balance: "8.20" }] });
});

await check("is_available=false 时给出账户不可用提示", async () => {
  reset({ key: "sk-test-123" });
  sample = () => ({ is_available: false, balance_infos: [{ currency: "CNY", total_balance: "0.00", granted_balance: "0.00", topped_up_balance: "0.00" }] });
  config.runsInWidget = true; config.widgetFamily = "medium"; script._widget = null;
  await mod.main();
  const t = textsOf(script._widget).join(" | ");
  if (!/账户不可用/.test(t)) throw new Error("未提示不可用: " + t);
  sample = () => ({ is_available: true, balance_infos: [
    { currency: "CNY", total_balance: "110.00", granted_balance: "10.00", topped_up_balance: "100.00" },
    { currency: "USD", total_balance: "8.20", granted_balance: "0.00", topped_up_balance: "8.20" }] });
});

await check("多币种：大号列出其它币种", async () => {
  reset({ key: "sk-test-123" });
  config.runsInWidget = true; config.widgetFamily = "large"; script._widget = null;
  await mod.main();
  const t = textsOf(script._widget);
  if (!t.includes("8.20")) throw new Error("未列出 USD 余额: " + t.join(" | "));
});

await check("App 内：无 Key 时能设置 Key", async () => {
  reset();
  config.runsInWidget = false;
  choose("设置 API Key");
  type("sk-from-menu-123");
  await mod.main();
  if (store.get(KC("default")) !== "sk-from-menu-123") throw new Error("Key 未写入钥匙串");
});

await check("App 内：预览小组件调用 presentMedium", async () => {
  reset({ key: "sk-test-123" });
  config.runsInWidget = false;
  choose("预览小组件");
  await mod.main();
  if (!log.includes("presentMedium")) throw new Error("未调用 presentMedium");
});

await check("App 内：复制总余额写入剪贴板", async () => {
  reset({ key: "sk-test-123" });
  config.runsInWidget = false;
  choose("复制总余额");
  await mod.main();
  const hit = log.find((l) => l.startsWith("copy:"));
  if (!hit || !hit.includes("110.00")) throw new Error("复制内容不对: " + hit);
});

await check("App 内：切换别名后新别名独立存取 Key", async () => {
  reset({ key: "sk-test-123" });
  config.runsInWidget = false;
  choose("切换 / 新增别名", "设置 API Key");
  type("work", "sk-work-999");
  await mod.main();
  if (user.menus.length < 3) throw new Error("菜单只出现 " + user.menus.length + " 次");
  if (!user.menus[1].includes("· work")) throw new Error("标题未显示新别名: " + user.menus[1].split("\n")[0]);
  if (store.get(KC("work")) !== "sk-work-999") throw new Error("work 别名的 Key 未写入");
  if (store.get(KC("default")) !== "sk-test-123") throw new Error("default 的 Key 被改动");
});

await check("App 内：删除 Key 后回到未配置状态", async () => {
  reset({ key: "sk-test-123" });
  config.runsInWidget = false;
  choose("删除此别名的 Key");
  await mod.main();
  if (store.has(KC("default"))) throw new Error("Key 未删除");
});

await check("App 内：一直取消能正常退出", async () => {
  reset({ key: "sk-test-123" });
  config.runsInWidget = false;
  const before = log.filter((l) => l === "complete").length;
  await mod.main();
  const after = log.filter((l) => l === "complete").length;
  if (after !== before + 1) throw new Error("未调用 Script.complete()");
});

await check("严格模式自检：调用不存在的 API 必须报错", async () => {
  let threw = false;
  try {
    new AlertImpl().buttonTitle(0);
  } catch (e) {
    threw = /不存在的 API/.test(e.message);
  }
  if (!threw) throw new Error("严格 Proxy 失效，无法拦截虚构 API");
});

await check("源码不含任何推算/图表残留", async () => {
  const banned = ["consume", "ledger", "dailySeries", "lineChart", "barChart", "DrawContext", "HISTORY_FILE"];
  const hit = banned.filter((w) => src.includes(w));
  if (hit.length) throw new Error("仍存在: " + hit.join(", "));
});

// ---------------------------------------------------------------- 结果

const width = Math.max(...results.map((r) => r[1].length));
for (const [st, name, extra] of results) {
  console.log(`${st === "PASS" ? "✅" : "❌"} ${name.padEnd(width)}  ${extra}`);
}
const failed = results.filter((r) => r[0] === "FAIL").length;
if (unknownApi.length) console.log("\n⚠️ 访问过的未知 API（应只在自检里出现）: " + unknownApi.join(", "));
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);

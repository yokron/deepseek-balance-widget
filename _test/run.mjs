// 用最小 stub 模拟 Scriptable 运行时，验证 DeepSeekBalance.js 能否正常执行。
// 运行： node _test/run.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const files = new Map();

// 把 Scriptable 脚本转成可导入的 ESM：去掉顶层执行，导出 main() 以便逐个场景驱动。
const src = fs.readFileSync(path.join(ROOT, "DeepSeekBalance.js"), "utf8");
if (!src.includes("await main();")) throw new Error("脚本入口 await main(); 未找到");
const esm = src.replace("await main();", "export { main };");
const esmPath = path.join(import.meta.dirname, "DeepSeekBalance.mjs");
fs.writeFileSync(esmPath, esm);

const SAMPLE = {
  is_available: true,
  balance_infos: [
    { currency: "CNY", total_balance: "110.00", granted_balance: "10.00", topped_up_balance: "100.00" },
    { currency: "USD", total_balance: "8.20", granted_balance: "0.00", topped_up_balance: "8.20" },
  ],
};

let nextStatus = 200;
let requestCount = 0;
const cookies = new Map();
const log = [];

class Color {
  constructor(hex) { this.hex = hex; }
  static dynamic(a, b) { return new Color("dynamic:" + a.hex + "/" + b.hex); }
}
class Font {
  static boldSystemFont(s) { return { kind: "bold", s }; }
  static systemFont(s) { return { kind: "sys", s }; }
  static semiboldSystemFont(s) { return { kind: "semi", s }; }
  static mediumSystemFont(s) { return { kind: "med", s }; }
  static boldMonospacedSystemFont(s) { return { kind: "monoB", s }; }
  static regularMonospacedSystemFont(s) { return { kind: "mono", s }; }
}
class Size { constructor(w, h) { this.width = w; this.height = h; } }
class Point { constructor(x, y) { this.x = x; this.y = y; } }
class Rect { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } }
class Path {
  constructor() { this.ops = []; }
  move(p) { this.ops.push(["move", p]); }
  addLine(p) { this.ops.push(["line", p]); }
  addEllipse(r) { this.ops.push(["ellipse", r]); }
}
class LinearGradient { constructor() { this.colors = []; this.locations = []; this.startPoint = null; this.endPoint = null; } }
class DrawContext {
  constructor() { this.size = null; this.paths = []; }
  addPath(p) { this.paths.push(p); }
  setStrokeColor(c) { this.stroke = c; }
  setLineWidth(w) { this.lineWidth = w; }
  strokePath() { if (!this.stroke) throw new Error("strokePath without color"); }
  setFillColor(c) { this.fill = c; }
  fillPath() { if (!this.fill) throw new Error("fillPath without color"); }
  getImage() { return { size: this.size, paths: this.paths }; }
}
class Text {
  constructor() { this.text = ""; this.font = null; this.textColor = null; this.lineLimit = 0; this.minimumScaleFactor = 1; }
}
class Stack {
  constructor() { this.children = []; this.spacing = 0; }
  addStack() { const s = new Stack(); this.children.push(s); return s; }
  addText(t) {
    if (typeof t !== "string") throw new Error("addText expects string, got " + typeof t);
    const x = new Text(); x.text = t; this.children.push(x); return x;
  }
  addSpacer(n) { this.children.push({ spacer: n == null ? 0 : n }); if (n !== undefined && typeof n !== "number") throw new Error("addSpacer expects number"); }
  addImage(img) { if (!img) throw new Error("addImage got null"); this.children.push({ image: img }); }
  layoutHorizontally() { this.layout = "h"; }
  layoutVertically() { this.layout = "v"; }
  centerAlignContent() { this.align = "center"; }
  bottomAlignContent() { this.align = "bottom"; }
}
class ListWidget extends Stack {
  constructor() { super(); this.backgroundColor = null; this.url = null; }
  setPadding(...a) { if (a.some((v) => typeof v !== "number")) throw new Error("setPadding expects numbers"); this.padding = a; }
  async presentSmall() { log.push("presentSmall"); }
  async presentMedium() { log.push("presentMedium"); }
}
class Alert {
  constructor() { this.buttons = []; this.fields = []; this.answers = []; }
  addAction(t) { this.buttons.push(t); }
  addCancelAction(t) { this.buttons.push(t); }
  addDestructiveAction(t) { this.buttons.push(t); }
  addTextField(p, v) { this.fields.push(v || ""); }
  addSecureTextField(p, v) { this.fields.push(v || ""); }
  textFieldValue(i) { return this.fields[i] || ""; }
  buttonTitle(i) { return this.buttons[i]; }
  async present() { return this.answers.length ? this.answers.shift() : -1; }
  async presentSheet() { return this.answers.length ? this.answers.shift() : -1; }
}
class FileManagerStub {
  static local() { return new FileManagerStub(); }
  documentsDirectory() { return "/mock/Documents"; }
  joinPath(...p) { return p.join("/"); }
  fileExists(p) { return files.has(p); }
  readString(p) { if (!files.has(p)) throw new Error("ENOENT " + p); return files.get(p); }
  writeString(p, s) { files.set(p, s); }
}
class Request {
  constructor(url) { if (typeof url !== "string" || !url.startsWith("http")) throw new Error("bad url " + url); this.url = url; }
  async loadString() {
    requestCount++;
    log.push("GET " + this.url + " status=" + nextStatus);
    if (nextStatus === 0) throw new Error("network down");
    if (nextStatus === 401) return JSON.stringify({ error: { message: "Authentication Fails" } });
    return JSON.stringify(SAMPLE);
  }
  get response() { return { statusCode: nextStatus }; }
}
const store = new Map();
const Keychain = {
  contains: (k) => store.has(k),
  get: (k) => (store.has(k) ? store.get(k) : null),
  set: (k, v) => store.set(k, v),
  remove: (k) => store.delete(k),
};
const Pasteboard = { copy: (s) => log.push("copy:" + s) };
const Device = { screenSize: () => new Size(393, 852) };
const Script = {
  _widget: null,
  setWidget(w) { if (!w) throw new Error("setWidget(null)"); this._widget = w; },
  complete() { log.push("complete"); },
  name: () => "DeepSeekBalance",
};

Object.assign(globalThis, {
  Color, Font, Size, Point, Rect, Path, LinearGradient, DrawContext, Text,
  ListWidget, Alert, FileManager: FileManagerStub, Request, Keychain, Pasteboard,
  Device, Script, Image: class {}, args: { widgetParameter: null },
  config: { runsInWidget: true, widgetFamily: "small" },
});

const mod = await import(pathToFileURL(esmPath).href);

function wc(w) {
  let n = 0;
  const walk = (s) => (s.children || []).forEach((c) => {
    if (c instanceof Text) n++;
    else if (c && c.children) { n++; walk(c); }
  });
  walk(w);
  return n;
}

const results = [];
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((v) => results.push(["PASS", name, v === undefined ? "" : v]))
    .catch((e) => results.push(["FAIL", name, e.message]));
}

// 1. 未配置 Key
await check("无 Key 时返回提示组件（三种尺寸）", async () => {
  store.clear();
  for (const fam of ["small", "medium", "large"]) {
    config.runsInWidget = true; config.widgetFamily = fam;
    Script._widget = null;
    await mod.main();
    if (!Script._widget) throw new Error(fam + " 未生成组件");
    if (wc(Script._widget) < 3) throw new Error(fam + " 内容为空");
  }
  return "ok";
});

// 2. 正常数据
await check("有 Key 且接口 200：生成组件并写缓存", async () => {
  nextStatus = 200; requestCount = 0; store.clear();
  Keychain.set("deepseek.balance.apikey.default", "sk-test-123");
  for (const fam of ["small", "medium", "large"]) {
    config.runsInWidget = true; config.widgetFamily = fam;
    await mod.main();
  }
  if (requestCount !== 3) throw new Error("请求次数异常 " + requestCount);
  const cache = JSON.parse(files.get("/mock/Documents/deepseek-balance-cache.json"));
  if (!cache.default || cache.default.balanceInfos.length !== 2) throw new Error("缓存写入异常");
  const hist = JSON.parse(files.get("/mock/Documents/deepseek-balance-history.json"));
  if (hist.default.length !== 1) throw new Error("历史写入异常 " + JSON.stringify(hist));
  return "缓存 + 历史 ok";
});

// 3. 别名 + 货币参数
await check("参数 work|USD 生效", async () => {
  store.clear();
  Keychain.set("deepseek.balance.apikey.work", "sk-work");
  args.widgetParameter = "work|USD";
  config.runsInWidget = true; config.widgetFamily = "medium";
  await mod.main();
  return "ok";
});

// 4. 401
await check("401 时给出 Key 无效组件", async () => {
  nextStatus = 401; files.clear();
  store.clear();
  Keychain.set("deepseek.balance.apikey.default", "sk-bad");
  args.widgetParameter = null;
  config.runsInWidget = true; config.widgetFamily = "small";
  await mod.main();
  nextStatus = 200;
  return "ok";
});

// 5. 断网但有缓存 -> 离线显示
await check("断网时回退到缓存（stale）", async () => {
  nextStatus = 200; files.clear(); store.clear();
  Keychain.set("deepseek.balance.apikey.default", "sk-test-123");
  config.runsInWidget = true; config.widgetFamily = "small";
  await mod.main();
  nextStatus = 0;
  Script._widget = null;
  await mod.main();
  if (!Script._widget) throw new Error("离线未生成组件");
  const texts = [];
  const walk = (s) => (s.children || []).forEach((c) => { if (c instanceof Text) texts.push(c.text); else if (c && c.children) walk(c); });
  walk(Script._widget);
  if (!texts.some((t) => t.includes("离线数据"))) throw new Error("未显示离线标记: " + texts.join(" | "));
  if (!texts.some((t) => t.includes("110.00"))) throw new Error("未回退到缓存数值");
  nextStatus = 200;
  return "离线标记 + 缓存数值 ok";
});

// 6. 连续多次抓取 -> 折线图（大尺寸）
await check("大尺寸在有多条历史时绘制折线", async () => {
  files.clear(); store.clear();
  Keychain.set("deepseek.balance.apikey.default", "sk-test-123");
  config.runsInWidget = true; config.widgetFamily = "large";
  for (let i = 0; i < 3; i++) {
    SAMPLE.balance_infos[0].total_balance = String(110 - i * 5);
    await mod.main();
  }
  const hist = JSON.parse(files.get("/mock/Documents/deepseek-balance-history.json"));
  if (hist.default.length !== 3) throw new Error("历史条数 " + hist.default.length);
  Script._widget = null;
  await mod.main();
  const imgs = [];
  const walk = (s) => (s.children || []).forEach((c) => { if (c && c.image) imgs.push(c.image); else if (c && c.children) walk(c); });
  walk(Script._widget);
  if (imgs.length !== 1) throw new Error("折线图数量 " + imgs.length);
  if (!imgs[0].paths || imgs[0].paths.length === 0) throw new Error("折线无路径");
  SAMPLE.balance_infos[0].total_balance = "110.00";
  return "折线 ok";
});

// 7. App 内模式：直接关闭
await check("App 内运行并选择关闭不崩溃", async () => {
  config.runsInWidget = false;
  await mod.main();
  if (!log.includes("complete")) throw new Error("未调用 Script.complete()");
  return "ok";
});

// 8. App 内模式：预览 -> 设置Key -> 切换别名 -> 关闭
await check("App 内菜单流程", async () => {
  const seen = [];
  const OrigAlert = Alert;
  globalThis.Alert = class extends OrigAlert {
    async presentSheet() { seen.push(this.buttons.slice()); return -1; }
  };
  await mod.main();
  globalThis.Alert = OrigAlert;
  if (seen.length !== 1) throw new Error("菜单未弹出");
  if (!seen[0].some((b) => b.includes("API Key"))) throw new Error("缺少 Key 设置项: " + seen[0].join(","));
  if (!seen[0].includes("预览小组件")) throw new Error("缺少预览项");
  return "菜单项：" + seen[0].length + " 个";
});

const width = Math.max(...results.map((r) => r[1].length));
for (const [st, name, extra] of results) {
  console.log(`${st === "PASS" ? "✅" : "❌"} ${name.padEnd(width)}  ${extra}`);
}
const failed = results.filter((r) => r[0] === "FAIL").length;
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);

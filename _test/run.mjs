// 用最小 stub 模拟 Scriptable 运行时，验证 DeepSeekBalance.js 能否正常执行。
//
// 关键：stub 全部包在「严格 Proxy」里 —— 脚本一旦访问 Scriptable 实际不存在的
// 属性/方法（例如 Alert.buttonTitle），测试会立刻失败。上一版 stub 手写了
// buttonTitle 这种不存在的 API，导致真机上才炸，所以这里加了这层保护。
//
// 运行： node _test/run.mjs
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(import.meta.dirname, "..");
const files = new Map();

// 把 Scriptable 脚本转成可导入的 ESM：去掉顶层执行，导出 main() 以便逐个场景驱动。
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
    set(t, prop, val, recv) {
      // 只放行写入：Scriptable 对未知属性是静默忽略，这里不当作错误
      // （stub 自身也会写内部状态，如 Alert.cancel）
      return Reflect.set(t, prop, val, recv);
    },
  });
}

// ---------------------------------------------------------------- 可编程的“用户”

const user = { choices: [], texts: [], menus: [] };
const choose = (...t) => user.choices.push(...t);
const type = (...v) => user.texts.push(...v);
const nextChoice = () => (user.choices.length ? user.choices.shift() : null);

// ---------------------------------------------------------------- stubs

const SAMPLE = {
  is_available: true,
  balance_infos: [
    { currency: "CNY", total_balance: "110.00", granted_balance: "10.00", topped_up_balance: "100.00" },
    { currency: "USD", total_balance: "8.20", granted_balance: "0.00", topped_up_balance: "8.20" },
  ],
};

let nextStatus = 200;
let requestCount = 0;
const log = [];

class ColorImpl {
  constructor(hex, alpha) {
    if (typeof hex !== "string" || !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(hex)) throw new Error("Invalid hex string: " + hex);
    if (alpha !== undefined && (typeof alpha !== "number" || alpha < 0 || alpha > 1)) throw new Error("Color alpha 必须是 0~1");
    this.hex = hex;
    this.alpha = alpha;
  }
  static dynamic(a, b) { return new ColorImpl(a.hex, a.alpha); }
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
class RectImpl { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); return strict(this, "Rect"); } }

class PathImpl {
  constructor() { this.ops = []; this.fillColor = null; this.strokeColor = null; return strict(this, "Path"); }
  move(p) { if (!(p instanceof PointImpl)) throw new Error("Path.move 需要 Point"); this.ops.push(["move", p]); }
  addLine(p) { this.ops.push(["line", p]); }
  addEllipse(r) { if (!(r instanceof RectImpl)) throw new Error("Path.addEllipse 需要 Rect"); this.ops.push(["ellipse", r]); }
  addRect(r) { if (!(r instanceof RectImpl)) throw new Error("Path.addRect 需要 Rect"); this.ops.push(["rect", r]); }
  addRoundedRect(r, cw, ch) {
    if (!(r instanceof RectImpl)) throw new Error("Path.addRoundedRect 需要 Rect");
    if (typeof cw !== "number" || typeof ch !== "number") throw new Error("Path.addRoundedRect 需要圆角数值");
    this.ops.push(["roundedRect", r]);
  }
}
class LinearGradientImpl {
  constructor() { this.colors = []; this.locations = []; this.startPoint = null; this.endPoint = null; return strict(this, "LinearGradient"); }
}
class DrawContextImpl {
  constructor() { this.size = null; this.paths = []; return strict(this, "DrawContext"); }
  addPath(p) { if (!(p instanceof PathImpl)) throw new Error("addPath 需要 Path"); this.paths.push(p); }
  setStrokeColor(c) { this.stroke = c; }
  setLineWidth(w) { if (typeof w !== "number") throw new Error("setLineWidth 需要 number"); this.lineWidth = w; }
  strokePath() { if (!this.stroke) throw new Error("strokePath 没有颜色"); }
  setFillColor(c) { this.fill = c; }
  fillPath() { if (!this.fill) throw new Error("fillPath 没有颜色"); }
  getImage() { return { size: this.size, paths: this.paths }; }
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
  constructor() { super(); this.backgroundColor = null; this.url = null; }
  setPadding(...a) { if (a.some((v) => typeof v !== "number")) throw new Error("setPadding 需要 number"); this.padding = a; }
  async presentSmall() { log.push("presentSmall"); }
  async presentMedium() { log.push("presentMedium"); }
  async presentLarge() { log.push("presentLarge"); }
}
class AlertImpl {
  constructor() { this.buttons = []; this.fields = []; this.title = ""; this.message = ""; return strict(this, "Alert"); }
  addAction(t) { this.buttons.push(t); }
  addDestructiveAction(t) { this.buttons.push(t); }
  addCancelAction(t) { this.cancel = t; }              // 取消按钮不占 index（文档：返回 -1）
  addTextField(p, v) { this.fields.push(user.texts.length ? user.texts.shift() : v || ""); }
  addSecureTextField(p, v) { this.fields.push(user.texts.length ? user.texts.shift() : v || ""); }
  textFieldValue(i) { return this.fields[i]; }
  answer() {
    // 带输入框的弹窗（设 Key / 改别名）在真机上只有「保存 / 确定」一种走法，
    // 这里直接点第一个非取消按钮；文本内容由 type() 提供。
    if (this.fields.length > 0) return 0;
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
    return JSON.stringify(SAMPLE);
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
  Size: SizeImpl, Point: PointImpl, Rect: RectImpl, Path: PathImpl,
  LinearGradient: LinearGradientImpl, DrawContext: DrawContextImpl, Text: TextImpl,
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
    // 用 in 探测，避免触发严格 Proxy 的「未知属性」报错（探测方是测试自身，不是脚本）
    const kids = "children" in s ? s.children : null;
    if (kids) kids.forEach(rec);
  })(w);
}
function textsOf(w) {
  const out = [];
  walk(w, (s) => { if (s instanceof TextImpl) out.push(s.text); });
  return out;
}
function imgsOf(w) {
  const out = [];
  walk(w, (s) => { if ("image" in s && s.image) out.push(s.image); });
  return out;
}
const KC = (alias) => "deepseek.balance.apikey." + alias;
const HISTORY = "/mock/Documents/deepseek-balance-history.json";
const CACHE = "/mock/Documents/deepseek-balance-cache.json";

function reset({ key = null, cache = false } = {}) {
  store.clear();
  files.clear();
  user.choices.length = 0;
  user.texts.length = 0;
  user.menus.length = 0;
  nextStatus = 200;
  requestCount = 0;
  args.widgetParameter = null;
  // 每个场景都从「干净样本」开始，避免上一个场景改过样本导致连锁失败
  SAMPLE.balance_infos[0].total_balance = "110.00";
  SAMPLE.balance_infos[0].granted_balance = "10.00";
  SAMPLE.balance_infos[0].topped_up_balance = "100.00";
  SAMPLE.balance_infos[1].total_balance = "8.20";
  if (key) store.set(KC("default"), key);
  if (cache) files.set(CACHE, JSON.stringify({ default: { isAvailable: true, balanceInfos: SAMPLE.balance_infos.map((b) => ({ currency: b.currency, total: parseFloat(b.total_balance), granted: parseFloat(b.granted_balance), toppedUp: parseFloat(b.topped_up_balance) })), fetchedAt: Date.now() } }));
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

await check("有 Key 且接口 200：生成组件并写缓存", async () => {
  reset({ key: "sk-test-123" });
  for (const fam of ["small", "medium", "large"]) {
    config.runsInWidget = true; config.widgetFamily = fam;
    await mod.main();
  }
  if (requestCount !== 3) throw new Error("请求次数异常 " + requestCount);
  const cache = JSON.parse(files.get(CACHE));
  if (!cache.default || cache.default.balanceInfos.length !== 2) throw new Error("缓存写入异常");
  const rec = JSON.parse(files.get(HISTORY)).default;
  if (!rec || rec.samples.length !== 1) throw new Error("采样写入异常 " + JSON.stringify(rec));
  if (!rec.ledger || !rec.ledger.CNY || !(rec.ledger.CNY.since > 0)) throw new Error("台账未初始化");
});

await check("参数 work|USD 生效", async () => {
  reset();
  store.set(KC("work"), "sk-work");
  args.widgetParameter = "work|USD";
  config.runsInWidget = true; config.widgetFamily = "medium"; script._widget = null;
  await mod.main();
  const t = textsOf(script._widget);
  if (!t.includes("USD")) throw new Error("未显示 USD: " + t.join(" | "));
});

await check("401 时给出 Key 无效组件", async () => {
  reset({ key: "sk-bad" });
  nextStatus = 401;
  config.runsInWidget = true; config.widgetFamily = "small"; script._widget = null;
  await mod.main();
  const t = textsOf(script._widget).join(" | ");
  if (!/Key 无效|无效或无权限/.test(t)) throw new Error("提示文案不对: " + t);
  nextStatus = 200;
});

await check("断网时回退到缓存（stale）", async () => {
  reset({ key: "sk-test-123" });
  config.runsInWidget = true; config.widgetFamily = "small";
  await mod.main();                       // 先成功一次写缓存
  nextStatus = 0;
  script._widget = null;
  await mod.main();                       // 再断网
  const t = textsOf(script._widget);
  if (!t.some((x) => x.includes("离线数据"))) throw new Error("未显示离线标记: " + t.join(" | "));
  if (!t.some((x) => x.includes("110.00"))) throw new Error("未回退到缓存数值");
  nextStatus = 200;
});

await check("余额下降记消费、上升记充值，当日分桶", async () => {
  reset({ key: "sk-test-123" });
  config.runsInWidget = true; config.widgetFamily = "small";
  SAMPLE.balance_infos[0].total_balance = "100.00";
  await mod.main();                                    // 基准
  SAMPLE.balance_infos[0].total_balance = "97.50";
  await mod.main();                                    // -2.50 消费
  SAMPLE.balance_infos[0].total_balance = "107.50";
  await mod.main();                                    // +10 充值，不算消费
  SAMPLE.balance_infos[0].total_balance = "106.00";
  await mod.main();                                    // -1.50 消费
  const rec = JSON.parse(files.get(HISTORY)).default;
  const led = rec.ledger.CNY;
  const near = (a, b) => Math.abs(a - b) < 1e-6;
  if (!near(led.consume, 4)) throw new Error("累计消费应为 4，实际 " + led.consume);
  if (!near(led.recharge, 10)) throw new Error("累计充值应为 10，实际 " + led.recharge);
  const days = Object.keys(rec.daily.CNY);
  if (days.length !== 1) throw new Error("当日分桶异常 " + JSON.stringify(rec.daily));
  if (!near(rec.daily.CNY[days[0]], 4)) throw new Error("当日消费应为 4，实际 " + rec.daily.CNY[days[0]]);
  return "消费 4.00 / 充值 10.00";
});

await check("中号/大号在有消费时画折线图（默认）", async () => {
  reset({ key: "sk-test-123" });
  config.runsInWidget = true; config.widgetFamily = "large";
  SAMPLE.balance_infos[0].total_balance = "100.00";
  await mod.main();
  SAMPLE.balance_infos[0].total_balance = "96.00";
  await mod.main();
  script._widget = null;
  await mod.main();
  const imgs = imgsOf(script._widget);
  if (imgs.length !== 1) throw new Error("图形数量 " + imgs.length);
  const ops = imgs[0].paths.flatMap((p) => p.ops.map((o) => o[0]));
  if (ops.includes("roundedRect")) throw new Error("默认不该是柱状: " + ops.join(","));
  if (!ops.includes("move")) throw new Error("折线缺少路径");
  const t = textsOf(script._widget).join(" | ");
  if (!/近 30 天/.test(t)) throw new Error("缺少图表说明: " + t);
  if (!/合计/.test(t)) throw new Error("说明里没有合计: " + t);
  config.widgetFamily = "medium"; script._widget = null;
  await mod.main();
  if (imgsOf(script._widget).length !== 1) throw new Error("中号没有图形");
});

await check("近 30 天窗口：窗口内的计入、窗口外的排除", async () => {
  reset();
  store.set(KC("default"), "sk-test-123");
  const dayMs = 86400000;
  const k = (off) => {
    const d = new Date(Date.now() - off * dayMs);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  };
  // 今天 3.00 + 3 天前 1.00 在 30 天窗口内（合计 4.00）；40 天前的 5.00 必须被排除
  files.set(HISTORY, JSON.stringify({
    default: {
      samples: [],
      ledger: { CNY: { consume: 6, recharge: 0, since: Date.now() - 45 * dayMs, last: { t: Date.now(), v: 110 } } },
      daily: { CNY: { [k(0)]: 3, [k(3)]: 1, [k(40)]: 5 } },
    },
  }));
  args.widgetParameter = null;
  config.runsInWidget = true; config.widgetFamily = "large";
  await mod.main();
  const t = textsOf(script._widget).join(" | ");
  if (!/近 30 天/.test(t)) throw new Error("caption 没有跨度: " + t);
  if (!/合计 4\.00/.test(t)) throw new Error("窗口合计应为 4.00（40 天前那 5.00 要排除）: " + t);
  if (!/单日最高 3\.00/.test(t)) throw new Error("单日最高应为 3.00: " + t);
});

await check("参数写 bar 时改用直方图", async () => {
  reset({ key: "sk-test-123" });
  args.widgetParameter = "bar";
  config.runsInWidget = true; config.widgetFamily = "large";
  SAMPLE.balance_infos[0].total_balance = "100.00";
  await mod.main();
  SAMPLE.balance_infos[0].total_balance = "96.00";
  await mod.main();
  script._widget = null;
  await mod.main();
  const imgs = imgsOf(script._widget);
  if (imgs.length !== 1) throw new Error("图形数量 " + imgs.length);
  const ops = imgs[0].paths.flatMap((p) => p.ops.map((o) => o[0]));
  if (!ops.includes("roundedRect") && !ops.includes("rect")) throw new Error("bar 模式没有柱子: " + ops.join(","));
});

await check("没有消费数据时不画图，给文字提示", async () => {
  reset({ key: "sk-test-123" });
  config.runsInWidget = true; config.widgetFamily = "medium";
  await mod.main();                                    // 只有基准，没有消费
  const t = textsOf(script._widget).join(" | ");
  if (!/暂无消费记录/.test(t)) throw new Error("缺少提示: " + t);
  if (imgsOf(script._widget).length !== 0) throw new Error("无消费却画了图");
});

await check("赠金为 0 时不显示该字段", async () => {
  reset({ key: "sk-test-123" });
  SAMPLE.balance_infos[0].granted_balance = "0.00";
  config.runsInWidget = true; config.widgetFamily = "large";
  await mod.main();
  if (textsOf(script._widget).includes("赠金")) throw new Error("赠金为 0 仍显示");
  SAMPLE.balance_infos[0].granted_balance = "5.00";
  script._widget = null;
  await mod.main();
  if (!textsOf(script._widget).includes("赠金")) throw new Error("赠金非 0 却没显示");
});

await check("旧版历史（纯数组）自动迁移并接上基准", async () => {
  reset();
  store.set(KC("default"), "sk-test-123");
  files.set(HISTORY, JSON.stringify({ default: [{ t: Date.now() - 3600e3, v: 50, c: "CNY" }] }));
  SAMPLE.balance_infos[0].total_balance = "45.00";
  config.runsInWidget = true; config.widgetFamily = "small";
  await mod.main();
  const rec = JSON.parse(files.get(HISTORY)).default;
  if (Array.isArray(rec)) throw new Error("未迁移成新结构");
  const c = rec.ledger.CNY.consume;
  if (Math.abs(c - 5) > 1e-6) throw new Error("迁移后应把 50→45 记为消费 5，实际 " + c);
});

await check("App 内：无 Key 时能设置 Key（真机崩溃路径）", async () => {
  reset();
  config.runsInWidget = false;
  choose("设置 API Key");
  type("sk-from-menu-123");
  await mod.main();
  if (store.get(KC("default")) !== "sk-from-menu-123") throw new Error("Key 未写入钥匙串");
  if (!user.menus[0].includes("尚未保存")) throw new Error("菜单未提示缺少 Key");
});

await check("App 内：点「预览小组件」调用 presentMedium", async () => {
  reset({ key: "sk-test-123" });
  config.runsInWidget = false;
  choose("预览小组件");
  await mod.main();
  if (!log.includes("presentMedium")) throw new Error("未调用 presentMedium");
});

await check("App 内：点「复制总余额」写入剪贴板", async () => {
  reset({ key: "sk-test-123" });
  config.runsInWidget = false;
  choose("复制总余额");
  await mod.main();
  const hit = log.find((l) => l.startsWith("copy:"));
  if (!hit) throw new Error("未写入剪贴板");
  if (!hit.includes("110.00")) throw new Error("复制内容不对: " + hit);
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

await check("App 内：清空历史 + 删除 Key 生效", async () => {
  reset({ key: "sk-test-123" });
  config.runsInWidget = false;
  // 预置两条「旧」历史，清空后不应再出现
  files.set(HISTORY, JSON.stringify({ default: [{ t: 1, v: 999, c: "CNY" }, { t: 2, v: 998, c: "CNY" }] }));
  choose("清空历史记录", "删除此别名的 Key");
  await mod.main();
  const hist = JSON.parse(files.get(HISTORY));
  const rec = hist.default || {};
  const samples = Array.isArray(rec) ? rec : rec.samples || [];
  if (samples.some((h) => h.v > 900)) throw new Error("旧采样未清空: " + JSON.stringify(samples));
  const led = rec.ledger && rec.ledger.CNY;
  if (led && led.consume > 0.005) throw new Error("清空后仍有累计消费 " + led.consume);
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

// ---------------------------------------------------------------- 结果

const width = Math.max(...results.map((r) => r[1].length));
for (const [st, name, extra] of results) {
  console.log(`${st === "PASS" ? "✅" : "❌"} ${name.padEnd(width)}  ${extra}`);
}
const failed = results.filter((r) => r[0] === "FAIL").length;
if (unknownApi.length) {
  console.log("\n⚠️ 访问过的未知 API（应只在自检里出现）: " + unknownApi.join(", "));
}
console.log(`\n${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);

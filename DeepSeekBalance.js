// ============================================================
//  DeepSeek API 余额 · iOS 桌面小组件（Scriptable）
// ------------------------------------------------------------
//  用法：
//   1. App Store 安装 Scriptable
//   2. 把本文件内容粘进 Scriptable 新建的脚本里（或存成文件导入）
//   3. 在 Scriptable 里点运行一次 -> 选择「设置 API Key」并粘贴 sk-xxx
//   4. 回到桌面：长按 -> 添加小组件 -> Scriptable -> 选择脚本与尺寸
//
//  小组件参数（可选，在小部件配置里填）：
//   - 留空            使用 default 别名下保存的 Key，显示 CNY（若有）
//   - work            使用 work 别名下保存的 Key（可管理多个 Key）
//   - work|USD        使用 work 别名的 Key，主货币显示 USD
//   - work|USD|bar    消费图用直方图（默认是折线 line）
//   - sk-xxxxxxxx     直接把 Key 写在参数里（不推荐，参数是明文）
// ============================================================

const API_URL = "https://api.deepseek.com/user/balance";
const KC_PREFIX = "deepseek.balance.apikey.";
const DEFAULT_ALIAS = "default";
const CACHE_FILE = "deepseek-balance-cache.json";
const HISTORY_FILE = "deepseek-balance-history.json";
const HISTORY_LIMIT = 96;
const DAILY_KEEP = 130;      // 保留约一个季度的每日消费，够 30 天窗口用
const CHART_DAYS = 30;       // 消费图跨度：近 30 天（逐日一个点）

const C = {
  brand: Color.dynamic(new Color("#4D6BFE"), new Color("#7B93FF")),
  text: Color.dynamic(new Color("#111111"), new Color("#F2F3F7")),
  dim: Color.dynamic(new Color("#8A8F9C"), new Color("#9AA0AE")),
  ok: Color.dynamic(new Color("#12A150"), new Color("#3DD68C")),
  warn: Color.dynamic(new Color("#D97706"), new Color("#F5B04A")),
  bad: Color.dynamic(new Color("#DC2626"), new Color("#FF6B6B")),
  card: Color.dynamic(new Color("#F4F6FF"), new Color("#1B1D24")),
};

// 折线图下方的面积填充 / 直方图柱子用的品牌色梯度。
// Color(hex, alpha) 万一不支持就退化成不可见（图形主体仍能用）。
function brandShade(alpha) {
  try {
    return Color.dynamic(new Color("#4D6BFE", alpha), new Color("#7B93FF", alpha));
  } catch (e) {
    return C.card;
  }
}
const softBrand = () => brandShade(0.16);
const midBrand = () => brandShade(0.55);

// ---------------------------------------------------------------- utils

function mono(size, bold) {
  try {
    return bold ? Font.boldMonospacedSystemFont(size) : Font.regularMonospacedSystemFont(size);
  } catch (e) {
    return bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  }
}

function toNumber(v) {
  const n = parseFloat(String(v == null ? "" : v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function money(v, currency) {
  const n = toNumber(v);
  const sym = currency === "USD" ? "$" : currency === "CNY" ? "¥" : "";
  return sym + n.toFixed(2);
}

function relTime(ts) {
  if (!ts) return "从未";
  const diff = Math.max(0, Date.now() - ts);
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚刚";
  if (m < 60) return m + " 分钟前";
  const h = Math.floor(m / 60);
  if (h < 24) return h + " 小时前";
  return Math.floor(h / 24) + " 天前";
}

function clockTime(ts) {
  const d = new Date(ts);
  const p = (x) => String(x).padStart(2, "0");
  return p(d.getMonth() + 1) + "-" + p(d.getDate()) + " " + p(d.getHours()) + ":" + p(d.getMinutes());
}

function fm() {
  return FileManager.local();
}

function readJSON(path, fallback) {
  try {
    const f = fm();
    if (!f.fileExists(path)) return fallback;
    return JSON.parse(f.readString(path));
  } catch (e) {
    return fallback;
  }
}

function writeJSON(path, obj) {
  try {
    fm().writeString(path, JSON.stringify(obj));
  } catch (e) {
    /* 忽略写入失败 */
  }
}

const cachePath = () => fm().joinPath(fm().documentsDirectory(), CACHE_FILE);
const historyPath = () => fm().joinPath(fm().documentsDirectory(), HISTORY_FILE);

// ---------------------------------------------------------------- 参数 / Key

function parseParams(raw) {
  const out = { alias: DEFAULT_ALIAS, currency: null, chart: "line", inlineKey: null };
  const s = (raw == null ? "" : String(raw)).trim();
  if (!s) return out;
  if (s.indexOf("sk-") === 0) {
    out.inlineKey = s;
    return out;
  }
  const parts = s.split("|").map((x) => x.trim()).filter((x) => x.length > 0);
  const positional = [];
  parts.forEach((p) => {
    const low = p.toLowerCase();
    if (low === "bar" || low === "line") out.chart = low;
    else positional.push(p);
  });
  if (positional[0]) out.alias = positional[0];
  if (positional[1]) out.currency = positional[1].toUpperCase();
  return out;
}

function keychainKey(alias) {
  return KC_PREFIX + alias;
}

function storedKey(alias) {
  const k = keychainKey(alias);
  return Keychain.contains(k) ? Keychain.get(k) : null;
}

async function promptForKey(alias) {
  const a = new Alert();
  a.title = "DeepSeek API Key";
  a.message = "别名：" + alias + "\n粘贴以 sk- 开头的 API Key，仅保存在本机钥匙串。";
  // addSecureTextField 从 Scriptable 1.5 起就有；用 try 兜底是为了极端老版本。
  // 注意：文本输入框只支持 present()/presentAlert()，presentSheet() 不支持。
  try {
    a.addSecureTextField("sk-...", "");
  } catch (e) {
    a.addTextField("sk-...", "");
  }
  a.addAction("保存");
  a.addCancelAction("取消");
  const idx = await a.present();
  if (idx === -1) return null;
  const v = (a.textFieldValue(0) || "").trim();
  if (!v) return null;
  Keychain.set(keychainKey(alias), v);
  return v;
}

// ---------------------------------------------------------------- 网络

async function fetchBalance(apiKey) {
  const req = new Request(API_URL);
  req.method = "GET";
  req.timeoutInterval = 20;
  req.headers = {
    Authorization: "Bearer " + apiKey,
    Accept: "application/json",
  };

  let status = 0;
  let body = "";
  try {
    body = await req.loadString();
    status = req.response ? req.response.statusCode : 200;
  } catch (e) {
    return { ok: false, kind: "network", message: "网络不可用或请求超时" };
  }

  if (status === 401 || status === 403) {
    return { ok: false, kind: "auth", status, message: "API Key 无效或无权限（" + status + "）" };
  }
  if (status === 402) {
    return { ok: false, kind: "auth", status, message: "账户余额不足（402）" };
  }
  if (status === 429) {
    return { ok: false, kind: "rate", status, message: "请求过于频繁（429），稍后再试" };
  }
  if (status >= 500) {
    return { ok: false, kind: "server", status, message: "DeepSeek 服务端错误（" + status + "）" };
  }
  if (status !== 200) {
    return { ok: false, kind: "http", status, message: "请求失败（" + status + "）" };
  }

  let json = null;
  try {
    json = JSON.parse(body);
  } catch (e) {
    return { ok: false, kind: "parse", message: "返回内容无法解析" };
  }

  const infos = Array.isArray(json.balance_infos) ? json.balance_infos : [];
  if (infos.length === 0) {
    return { ok: false, kind: "empty", message: "接口未返回余额信息" };
  }

  return {
    ok: true,
    isAvailable: json.is_available !== false,
    balanceInfos: infos.map((b) => ({
      currency: b.currency || "CNY",
      total: toNumber(b.total_balance),
      granted: toNumber(b.granted_balance),
      toppedUp: toNumber(b.topped_up_balance),
    })),
    fetchedAt: Date.now(),
  };
}

// ---------------------------------------------------------------- 缓存 / 历史

function loadCache(alias) {
  const all = readJSON(cachePath(), {});
  return all[alias] || null;
}

function saveCache(alias, data) {
  const all = readJSON(cachePath(), {});
  all[alias] = data;
  writeJSON(cachePath(), all);
}

// ------------------------------------------------- 采样 / 累计消费台账
//
// DeepSeek 没有「用量 / 消费」查询接口（官方 API 只有 Chat、Responses、FIM、
// 获取模型列表、查询余额、Files），所以累计消费只能靠本机采样推算：
//     余额下降 = 消费，余额上升 = 充值
// 采样频率不影响总量正确性 —— 两次观测之间的变化都会被计入；
// 只有「记在哪一天」取决于观测时刻，所以系统刷新越频繁，日粒度越准。
// 局限：只能统计本脚本开始记录之后的消费，之前的历史无法回溯。

function dayKey(ts) {
  const d = new Date(ts);
  const p = (x) => String(x).padStart(2, "0");
  return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate());
}

function emptyRecord() {
  return { samples: [], ledger: {}, daily: {} };
}

// 兼容早期只存一个采样数组的格式：把每个币种最后一次采样作为「基准」，
// 这样紧接着的这次刷新就能算出差额（since 即基准时刻，之后的变化才计入）
function seedLedgerFromSamples(rec) {
  (rec.samples || []).forEach((s) => {
    if (!s || typeof s.v !== "number" || !s.c) return;
    const led = rec.ledger[s.c] || (rec.ledger[s.c] = { consume: 0, recharge: 0, since: null, last: null });
    if (!led.last || s.t >= led.last.t) {
      led.last = { t: s.t, v: s.v };
      led.since = s.t;
    }
  });
}

function normalizeRecord(raw) {
  if (Array.isArray(raw)) {
    const rec = { samples: raw, ledger: {}, daily: {} };
    seedLedgerFromSamples(rec);
    return rec;
  }
  if (raw && typeof raw === "object") {
    return {
      samples: Array.isArray(raw.samples) ? raw.samples : [],
      ledger: raw.ledger && typeof raw.ledger === "object" ? raw.ledger : {},
      daily: raw.daily && typeof raw.daily === "object" ? raw.daily : {},
    };
  }
  return emptyRecord();
}

function loadRecord(alias) {
  const all = readJSON(historyPath(), {});
  return normalizeRecord(all[alias]);
}

function recordSample(alias, currency, total) {
  const all = readJSON(historyPath(), {});
  const rec = normalizeRecord(all[alias]);
  const now = Date.now();
  const r2 = (n) => Math.round(n * 100) / 100;

  const led = rec.ledger[currency] || { consume: 0, recharge: 0, since: now, last: null };
  if (led.last && typeof led.last.v === "number") {
    const delta = total - led.last.v;
    if (delta < -0.005) {
      const spend = -delta;
      led.consume = r2(led.consume + spend);
      rec.daily[currency] = rec.daily[currency] || {};
      const day = dayKey(now);
      rec.daily[currency][day] = r2((rec.daily[currency][day] || 0) + spend);
    } else if (delta > 0.005) {
      led.recharge = r2(led.recharge + delta);
    }
  }
  led.last = { t: now, v: total };
  rec.ledger[currency] = led;

  // 采样序列（大号折线备用，同时兼容旧数据）
  const list = rec.samples;
  const lastS = list[list.length - 1];
  if (!lastS || lastS.c !== currency || Math.abs(lastS.v - total) > 0.0001 || now - lastS.t > 30 * 60000) {
    list.push({ t: now, v: total, c: currency });
  }
  while (list.length > HISTORY_LIMIT) list.shift();

  // 每日消费只留最近 DAILY_KEEP 天
  Object.keys(rec.daily).forEach((cur) => {
    const map = rec.daily[cur];
    const keys = Object.keys(map).sort();
    while (keys.length > DAILY_KEEP) delete map[keys.shift()];
  });

  all[alias] = rec;
  writeJSON(historyPath(), all);
  return rec;
}

function ledgerFor(rec, currency) {
  return (rec && rec.ledger && rec.ledger[currency]) || { consume: 0, recharge: 0, since: null, last: null };
}

// 每日消费序列（从旧到新共 days 项）。30 天跨度逐日画点正好，不需要再聚合。
function dailySeries(rec, currency, days) {
  const map = (rec && rec.daily && rec.daily[currency]) || {};
  const out = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const k = dayKey(d.getTime());
    out.push({ day: k, label: k.slice(5), value: map[k] || 0 });
  }
  return out;
}

// ---------------------------------------------------------------- 数据准备

function pickPrimary(balanceInfos, prefer) {
  if (prefer) {
    const hit = balanceInfos.find((b) => b.currency.toUpperCase() === prefer);
    if (hit) return hit;
  }
  const cny = balanceInfos.find((b) => b.currency.toUpperCase() === "CNY");
  return cny || balanceInfos[0];
}

async function resolveState(alias, currency) {
  const cached = loadCache(alias);
  const key = storedKey(alias);

  if (!key) {
    return { state: "no-key", alias, cached };
  }

  const res = await fetchBalance(key);
  if (res.ok) {
    saveCache(alias, res);
    const primary = pickPrimary(res.balanceInfos, currency);
    const rec = recordSample(alias, primary.currency, primary.total);
    return { state: "live", alias, data: res, primary, rec, key };
  }

  if (cached && Array.isArray(cached.balanceInfos)) {
    const primary = pickPrimary(cached.balanceInfos, currency);
    return {
      state: "stale",
      alias,
      data: cached,
      primary,
      rec: loadRecord(alias),
      error: res,
      key,
    };
  }

  return { state: "error", alias, error: res, key };
}

// ---------------------------------------------------------------- 绘图

// 折线图。values 是等间隔数值序列；fillColor 非空时在折线下方做面积填充。
function lineChart(values, width, height, color, fillColor) {
  if (!values || values.length < 2) return null;

  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const max = Math.max.apply(null, values);
  const span = max > 0 ? max : 1;
  const padTop = 4;
  const padBottom = 3;
  const usable = height - padTop - padBottom;
  const stepX = width / (values.length - 1);
  const pts = values.map((v, i) => new Point(i * stepX, padTop + (1 - v / span) * usable));

  if (fillColor) {
    const area = new Path();
    area.move(new Point(0, height - padBottom));
    pts.forEach((p) => area.addLine(p));
    area.addLine(new Point(width, height - padBottom));
    ctx.addPath(area);
    ctx.setFillColor(fillColor);
    ctx.fillPath();
  }

  const path = new Path();
  pts.forEach((p, i) => (i === 0 ? path.move(p) : path.addLine(p)));
  ctx.addPath(path);
  ctx.setStrokeColor(color);
  ctx.setLineWidth(1.6);
  ctx.strokePath();

  // 末端圆点
  const lastP = pts[pts.length - 1];
  const dot = new Path();
  dot.addEllipse(new Rect(lastP.x - 3, lastP.y - 3, 6, 6));
  ctx.addPath(dot);
  ctx.setFillColor(color);
  ctx.fillPath();

  return ctx.getImage();
}

// 直方图：每日消费的柱子，最后一项是今天；零消费的日子只留一条基线。
function barChart(values, width, height, maxColor, midColor, faintColor) {
  if (!values || values.length < 2) return null;

  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  const max = Math.max.apply(null, values);
  const span = max > 0 ? max : 1;
  const n = values.length;
  const gap = 2;
  const bw = (width - gap * (n - 1)) / n;
  const base = height - 1;
  const usable = height - 4;

  values.forEach((v, i) => {
    const h = v > 0 ? Math.max(2, (v / span) * usable) : 1;
    const x = i * (bw + gap);
    const rect = new Rect(Math.round(x), Math.round(base - h), Math.max(1, Math.round(bw)), Math.round(h));
    const p = new Path();
    if (typeof p.addRoundedRect === "function") p.addRoundedRect(rect, 1.5, 1.5);
    else p.addRect(rect);
    ctx.addPath(p);
    ctx.setFillColor(v <= 0 ? faintColor : v >= max - 1e-9 ? maxColor : midColor);
    ctx.fillPath();
  });

  const line = new Path();
  line.move(new Point(0, base + 0.5));
  line.addLine(new Point(width, base + 0.5));
  ctx.addPath(line);
  ctx.setStrokeColor(faintColor);
  ctx.setLineWidth(0.5);
  ctx.strokePath();

  return ctx.getImage();
}

// ---------------------------------------------------------------- 组件构建

function label(text, font, color) {
  const t = new Text();
  t.text = text;
  t.font = font;
  t.textColor = color;
  return t;
}

function stack(parent) {
  const s = parent.addStack();
  return s;
}

function buildHeader(root, state) {
  const head = stack(root);
  head.centerAlignContent();
  const dot = head.addText("●");
  dot.font = Font.systemFont(10);
  dot.textColor = state.state === "live" ? C.ok : state.state === "stale" ? C.warn : C.bad;

  head.addSpacer(5);
  const title = head.addText("DeepSeek 余额");
  title.font = Font.semiboldSystemFont(12);
  title.textColor = C.dim;

  head.addSpacer();
  const alias = head.addText(state.alias === DEFAULT_ALIAS ? "" : state.alias);
  alias.font = Font.mediumSystemFont(10);
  alias.textColor = C.dim;
  return head;
}

function buildBalanceBlock(root, primary, big) {
  const wrap = stack(root);
  wrap.layoutHorizontally();
  wrap.bottomAlignContent();

  const cur = wrap.addText(primary.currency);
  cur.font = Font.semiboldSystemFont(big ? 13 : 11);
  cur.textColor = C.dim;

  wrap.addSpacer(6);

  const amount = wrap.addText(toNumber(primary.total).toFixed(2));
  amount.font = mono(big ? 34 : 26, true);
  amount.textColor = C.text;
  amount.lineLimit = 1;
  amount.minimumScaleFactor = 0.6;
  return wrap;
}

function buildDetailRows(root, primary, compact, rec) {
  const row = stack(root);
  row.layoutHorizontally();
  row.spacing = 12;

  const mk = (k, v, color) => {
    const col = stack(row);
    col.layoutVertically();
    col.spacing = 1;
    const t1 = col.addText(k);
    t1.font = Font.systemFont(compact ? 9 : 10);
    t1.textColor = C.dim;
    const t2 = col.addText(v);
    t2.font = mono(compact ? 11 : 12, false);
    t2.textColor = color || C.text;
  };

  // 接口语义（官方文档 /user/balance）：
  //   total_balance      = 总的可用余额，包括赠金和充值余额
  //   granted_balance    = 未过期的赠金余额
  //   topped_up_balance  = 充值余额
  // 即 total = granted + toppedUp，所以这里只列构成，不推导"已用"
  // （曾经加过一行"已用 = 赠金+充值-总额"，它恒为 0，容易让人误以为显示的是用量）
  const granted = toNumber(primary.granted);
  const led = ledgerFor(rec, primary.currency);

  // 赠金为 0 时没有任何信息量，不占位置；小号空间紧张，有累计消费数据时也让位
  if (granted > 0.005 && (!compact || led.consume < 0.005)) mk("赠金", granted.toFixed(2));
  mk("充值", toNumber(primary.toppedUp).toFixed(2));
  if (led.since) mk("累计消费", led.consume.toFixed(2), led.consume > 0.005 ? C.warn : C.dim);
  return row;
}

function buildFooter(root, state) {
  const f = stack(root);
  f.layoutHorizontally();
  f.centerAlignContent();

  const when = state.state === "live" ? "更新 " + relTime(state.data.fetchedAt) : state.state === "stale" ? "离线数据 · " + relTime(state.data.fetchedAt) : "无数据";
  const t = f.addText(when);
  t.font = Font.systemFont(9);
  t.textColor = C.dim;

  if (state.state === "stale" && state.error) {
    f.addSpacer(6);
    const w = f.addText("⚠︎ " + (state.error.message || "刷新失败"));
    w.font = Font.systemFont(9);
    w.textColor = C.warn;
    w.lineLimit = 1;
  }
  return f;
}

function buildMessageWidget(title, message, hint) {
  const w = new ListWidget();
  w.backgroundColor = C.card;
  w.setPadding(14, 14, 14, 14);

  const head = stack(w);
  const dot = head.addText("●");
  dot.font = Font.systemFont(10);
  dot.textColor = C.bad;
  head.addSpacer(5);
  const t0 = head.addText("DeepSeek 余额");
  t0.font = Font.semiboldSystemFont(12);
  t0.textColor = C.dim;

  w.addSpacer();
  const t = w.addText(title);
  t.font = Font.boldSystemFont(15);
  t.textColor = C.text;
  if (message) {
    w.addSpacer(4);
    const m = w.addText(message);
    m.font = Font.systemFont(11);
    m.textColor = C.dim;
  }
  if (hint) {
    w.addSpacer(6);
    const h = w.addText(hint);
    h.font = Font.systemFont(9);
    h.textColor = C.dim;
  }
  w.addSpacer();
  w.url = "scriptable:///run/" + encodeURIComponent(Script.name());
  return w;
}

function buildWidget(state, family) {
  if (state.state === "no-key") {
    return buildMessageWidget(
      "还没有配置 API Key",
      "在 Scriptable 中运行本脚本，选择「设置 API Key」。",
      "别名 " + state.alias
    );
  }
  if (state.state === "error") {
    return buildMessageWidget(
      "获取余额失败",
      state.error ? state.error.message : "未知错误",
      state.error && state.error.kind === "auth" ? "点按此组件可重新设置 Key" : "稍后下拉刷新重试"
    );
  }

  const primary = state.primary;
  const isSmall = family === "small";
  const isLarge = family === "large";

  const w = new ListWidget();
  const grad = new LinearGradient();
  grad.colors = [C.card, Color.dynamic(new Color("#FFFFFF"), new Color("#111318"))];
  grad.locations = [0, 1];
  grad.startPoint = new Point(0, 0);
  grad.endPoint = new Point(1, 1);
  w.backgroundGradient = grad;
  w.setPadding(isSmall ? 12 : 14, isSmall ? 12 : 15, isSmall ? 12 : 14, isSmall ? 12 : 15);
  w.url = "scriptable:///run/" + encodeURIComponent(Script.name());

  buildHeader(w, state);
  w.addSpacer(isSmall ? 6 : 8);

  buildBalanceBlock(w, primary, !isSmall);

  if (state.data.isAvailable === false) {
    w.addSpacer(3);
    const u = w.addText("账户不可用（可能已欠费）");
    u.font = Font.systemFont(9);
    u.textColor = C.bad;
  }

  w.addSpacer(isSmall ? 5 : 6);
  buildDetailRows(w, primary, isSmall, state.rec);

  // 多币种其它币种
  const others = (state.data.balanceInfos || []).filter((b) => b.currency !== primary.currency);
  if (!isSmall && others.length) {
    w.addSpacer(5);
    const line = others.map((b) => b.currency + " " + toNumber(b.total).toFixed(2)).join("   ");
    const o = w.addText(line);
    o.font = mono(10, false);
    o.textColor = C.dim;
    o.lineLimit = 1;
  }


  // 消费图（中号 / 大号）：默认折线，参数里写 bar 可切直方图。
  // 跨度近 30 天，逐日一个点（30 个点在组件宽度下正好，不需要聚合）。
  // 数据来自本机采样：余额下降即消费。
  if (!isSmall && state.rec) {
    const series = dailySeries(state.rec, primary.currency, CHART_DAYS);
    const values = series.map((s) => s.value);
    const dayMax = Math.max.apply(null, values);
    const daySum = values.reduce((a, b) => a + b, 0);
    const led = ledgerFor(state.rec, primary.currency);

    w.addSpacer(isLarge ? 8 : 6);
    if (dayMax > 0.005) {
      const cw = isLarge ? 285 : 255;
      const ch = isLarge ? 58 : 34;
      const img = state.chart === "line"
        ? lineChart(values, cw, ch, C.brand, softBrand())
        : barChart(values, cw, ch, C.brand, midBrand(), softBrand());
      if (img) {
        const box = stack(w);
        box.centerAlignContent();
        box.addImage(img);
        w.addSpacer(3);
      }
      const cap = w.addText(
        "近 " + CHART_DAYS + " 天 · 合计 " + daySum.toFixed(2) +
          (isLarge ? " · 单日最高 " + dayMax.toFixed(2) : "")
      );
      cap.font = Font.systemFont(9);
      cap.textColor = C.dim;
      cap.lineLimit = 1;
      cap.minimumScaleFactor = 0.7;

      if (isLarge && led.since) {
        w.addSpacer(2);
        const from = w.addText("消费记录自 " + clockTime(led.since) + " 起累计（接口不提供历史账单）");
        from.font = Font.systemFont(9);
        from.textColor = C.dim;
        from.lineLimit = 1;
        from.minimumScaleFactor = 0.7;
      }
    } else {
      const cap = w.addText("近 " + CHART_DAYS + " 天暂无消费记录（脚本每次刷新时累计）");
      cap.font = Font.systemFont(9);
      cap.textColor = C.dim;
      cap.lineLimit = 1;
      cap.minimumScaleFactor = 0.7;
    }
  }

  w.addSpacer();
  buildFooter(w, state);
  return w;
}

// ---------------------------------------------------------------- App 内交互

function detailText(state) {
  if (state.state !== "live" && state.state !== "stale") {
    return state.error ? state.error.message : "无数据";
  }
  const lines = [];
  lines.push("别名：" + state.alias);
  lines.push("状态：" + (state.data.isAvailable === false ? "不可用" : "正常") + (state.state === "stale" ? "（缓存）" : ""));
  lines.push("");
  (state.data.balanceInfos || []).forEach((b) => {
    lines.push("[" + b.currency + "]");
    lines.push("  总额：" + toNumber(b.total).toFixed(2));
    lines.push("  赠金：" + toNumber(b.granted).toFixed(2) + (toNumber(b.granted) <= 0.005 ? "（无）" : ""));
    lines.push("  充值：" + toNumber(b.toppedUp).toFixed(2));
    const led = ledgerFor(state.rec, b.currency);
    if (led.since) {
      lines.push("  累计消费：" + led.consume.toFixed(2) + "（自 " + clockTime(led.since).slice(0, 5) + " 起）");
      lines.push("  累计充值：" + led.recharge.toFixed(2));
    } else {
      lines.push("  累计消费：待记录（下次刷新开始）");
    }
    lines.push("");
  });
  lines.push("抓取时间：" + clockTime(state.data.fetchedAt) + "（" + relTime(state.data.fetchedAt) + "）");
  lines.push("累计消费由余额变化推算（官方接口只提供余额）");

  return lines.join("\n");
}

async function runInApp(initialAlias, chart) {
  let alias = initialAlias;
  const fam = Device.screenSize().width > 400 ? "medium" : "small";

  for (;;) {
    const state = await resolveState(alias, null);
    state.chart = chart;
    const hasKey = !!storedKey(alias);

    const a = new Alert();
    a.title = "DeepSeek API 余额" + (alias === DEFAULT_ALIAS ? "" : " · " + alias);
    a.message = detailText(state) + "\n\n" + (hasKey ? "" : "⚠️ 尚未保存该别名的 API Key");

    // Alert 只返回被点按钮的 index，没有取标题的 API，所以自己按相同顺序记下来。
    // 注意：取消按钮不占 index，选中时一律返回 -1。
    const actions = [];
    const action = (t) => { a.addAction(t); actions.push(t); };
    const destructive = (t) => { a.addDestructiveAction(t); actions.push(t); };

    if (state.state === "live" || state.state === "stale") action("预览小组件");
    action("刷新");
    action(hasKey ? "更换 API Key" : "设置 API Key");
    action("切换 / 新增别名");
    if (state.state === "live") action("复制总余额");
    action("清空历史记录");
    if (hasKey) destructive("删除此别名的 Key");
    a.addCancelAction("关闭");

    const idx = await a.presentSheet();
    const title = idx >= 0 && idx < actions.length ? actions[idx] : null;
    if (!title) break;

    if (title === "预览小组件") {
      const w = buildWidget(state, fam);
      await w.presentMedium();
      continue;
    }
    if (title === "刷新") continue;
    if (title === "设置 API Key" || title === "更换 API Key") {
      await promptForKey(alias);
      continue;
    }
    if (title === "切换 / 新增别名") {
      const b = new Alert();
      b.title = "别名";
      b.message = "给不同的 Key 起个名字（英文数字），例如 default、work。";
      b.addTextField("别名", alias);
      b.addAction("确定");
      b.addCancelAction("取消");
      const i2 = await b.present();
      if (i2 !== -1) {
        const v = (b.textFieldValue(0) || "").trim();
        if (v) alias = v;
      }
      continue;
    }
    if (title === "复制总余额") {
      Pasteboard.copy("DeepSeek 余额 " + state.primary.currency + " " + toNumber(state.primary.total).toFixed(2));
      continue;
    }
    if (title === "清空历史记录") {
      const all = readJSON(historyPath(), {});
      delete all[alias];
      writeJSON(historyPath(), all);
      continue;
    }
    if (title === "删除此别名的 Key") {
      Keychain.remove(keychainKey(alias));
      continue;
    }
  }
  Script.complete();
}

// ---------------------------------------------------------------- 入口

async function main() {
  const params = parseParams(args.widgetParameter);
  const alias = params.inlineKey ? DEFAULT_ALIAS : params.alias;

  if (params.inlineKey) Keychain.set(keychainKey(alias), params.inlineKey);

  if (!config.runsInWidget) {
    await runInApp(alias, params.chart);
    return;
  }

  const family = config.widgetFamily || "small";
  const state = await resolveState(alias, params.currency);
  state.chart = params.chart;
  const w = buildWidget(state, family);
  Script.setWidget(w);
  Script.complete();
}

await main();

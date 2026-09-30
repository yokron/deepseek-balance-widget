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
//   - sk-xxxxxxxx     直接把 Key 写在参数里（不推荐，参数是明文）
// ============================================================

const API_URL = "https://api.deepseek.com/user/balance";
const KC_PREFIX = "deepseek.balance.apikey.";
const DEFAULT_ALIAS = "default";
const CACHE_FILE = "deepseek-balance-cache.json";
const HISTORY_FILE = "deepseek-balance-history.json";
const HISTORY_LIMIT = 96;

const C = {
  brand: Color.dynamic(new Color("#4D6BFE"), new Color("#7B93FF")),
  text: Color.dynamic(new Color("#111111"), new Color("#F2F3F7")),
  dim: Color.dynamic(new Color("#8A8F9C"), new Color("#9AA0AE")),
  ok: Color.dynamic(new Color("#12A150"), new Color("#3DD68C")),
  warn: Color.dynamic(new Color("#D97706"), new Color("#F5B04A")),
  bad: Color.dynamic(new Color("#DC2626"), new Color("#FF6B6B")),
  card: Color.dynamic(new Color("#F4F6FF"), new Color("#1B1D24")),
};

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
  const out = { alias: DEFAULT_ALIAS, currency: null, inlineKey: null };
  const s = (raw == null ? "" : String(raw)).trim();
  if (!s) return out;
  if (s.indexOf("sk-") === 0) {
    out.inlineKey = s;
    return out;
  }
  const parts = s.split("|").map((x) => x.trim()).filter((x) => x.length > 0);
  if (parts[0]) out.alias = parts[0];
  if (parts[1]) out.currency = parts[1].toUpperCase();
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
  if (a.addSecureTextField) a.addSecureTextField("sk-...", "");
  else a.addTextField("sk-...", "");
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

function pushHistory(alias, currency, total) {
  const all = readJSON(historyPath(), {});
  const list = Array.isArray(all[alias]) ? all[alias] : [];
  const last = list[list.length - 1];
  if (!last || last.c !== currency || Math.abs(last.v - total) > 0.0001 || Date.now() - last.t > 30 * 60000) {
    list.push({ t: Date.now(), v: total, c: currency });
  }
  while (list.length > HISTORY_LIMIT) list.shift();
  all[alias] = list;
  writeJSON(historyPath(), all);
  return list;
}

function historyFor(alias) {
  const all = readJSON(historyPath(), {});
  return Array.isArray(all[alias]) ? all[alias] : [];
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
    const hist = pushHistory(alias, primary.currency, primary.total);
    return { state: "live", alias, data: res, primary, history: hist, key };
  }

  if (cached && Array.isArray(cached.balanceInfos)) {
    const primary = pickPrimary(cached.balanceInfos, currency);
    return {
      state: "stale",
      alias,
      data: cached,
      primary,
      history: historyFor(alias),
      error: res,
      key,
    };
  }

  return { state: "error", alias, error: res, key };
}

// ---------------------------------------------------------------- 绘图

function sparkline(values, width, height, color) {
  const ctx = new DrawContext();
  ctx.size = new Size(width, height);
  ctx.opaque = false;
  ctx.respectScreenScale = true;

  if (!values || values.length < 2) return null;

  const min = Math.min.apply(null, values);
  const max = Math.max.apply(null, values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const pad = 3;

  const path = new Path();
  values.forEach((v, i) => {
    const x = i * stepX;
    const y = height - pad - ((v - min) / span) * (height - pad * 2);
    if (i === 0) path.move(new Point(x, y));
    else path.addLine(new Point(x, y));
  });

  ctx.addPath(path);
  ctx.setStrokeColor(color);
  ctx.setLineWidth(1.6);
  ctx.strokePath();

  // 末端圆点
  const lastX = width;
  const lastY = height - pad - ((values[values.length - 1] - min) / span) * (height - pad * 2);
  const dot = new Path();
  dot.addEllipse(new Rect(lastX - 3.5, lastY - 3.5, 7, 7));
  ctx.addPath(dot);
  ctx.setFillColor(color);
  ctx.fillPath();

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

function buildDetailRows(root, primary, compact) {
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

  mk("赠送", toNumber(primary.granted).toFixed(2));
  mk("充值", toNumber(primary.toppedUp).toFixed(2));
  const used = Math.max(0, toNumber(primary.granted) + toNumber(primary.toppedUp) - toNumber(primary.total));
  if (used > 0.005) mk("已用", used.toFixed(2), C.warn);
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
  buildDetailRows(w, primary, isSmall);

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

  if (isLarge && state.history && state.history.length >= 2) {
    w.addSpacer(8);
    const vals = state.history.map((h) => h.v);
    const img = sparkline(vals, 260, 54, C.brand);
    if (img) {
      const box = stack(w);
      box.addImage(img);
      const cap = w.addText("近 " + state.history.length + " 次记录");
      cap.font = Font.systemFont(9);
      cap.textColor = C.dim;
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
    lines.push("  赠送：" + toNumber(b.granted).toFixed(2));
    lines.push("  充值：" + toNumber(b.toppedUp).toFixed(2));
    lines.push("");
  });
  lines.push("抓取时间：" + clockTime(state.data.fetchedAt) + "（" + relTime(state.data.fetchedAt) + "）");
  return lines.join("\n");
}

async function runInApp(initialAlias) {
  let alias = initialAlias;
  const fam = Device.screenSize().width > 400 ? "medium" : "small";

  for (;;) {
    const state = await resolveState(alias, null);
    const hasKey = !!storedKey(alias);

    const a = new Alert();
    a.title = "DeepSeek API 余额";
    a.message = detailText(state) + "\n\n" + (hasKey ? "" : "⚠️ 尚未保存该别名的 API Key");
    if (state.state === "live" || state.state === "stale") a.addAction("预览小组件");
    a.addAction("刷新");
    a.addAction(hasKey ? "更换 API Key" : "设置 API Key");
    a.addAction("切换 / 新增别名");
    if (state.state === "live") a.addAction("复制总余额");
    a.addAction("清空历史记录");
    if (hasKey) a.addDestructiveAction("删除此别名的 Key");
    a.addCancelAction("关闭");

    const idx = await a.presentSheet();
    const title = a.buttonTitle(idx);
    if (idx === -1 || title === "关闭") break;

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
    await runInApp(alias);
    return;
  }

  const family = config.widgetFamily || "small";
  const state = await resolveState(alias, params.currency);
  const w = buildWidget(state, family);
  Script.setWidget(w);
  Script.complete();
}

await main();

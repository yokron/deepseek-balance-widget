// ============================================================
//  DeepSeek 余额 · iOS 桌面小组件（Scriptable）
// ------------------------------------------------------------
//  只显示官方接口返回的字段，不做任何推算：
//    GET https://api.deepseek.com/user/balance   （官方文档：查询账号余额）
//      is_available      当前账户是否有余额可供 API 调用
//      total_balance     总的可用余额，包括赠金和充值余额
//      granted_balance   未过期的赠金余额（为 0 时不显示）
//      topped_up_balance 充值余额
//
//  用法：
//   1. App Store 安装 Scriptable（免费）
//   2. 把本文件内容粘进 Scriptable 新建的脚本里
//   3. 在 Scriptable 里运行一次 -> 选「设置 API Key」并粘贴 sk-xxx
//   4. 回桌面：长按 -> 添加小组件 -> Scriptable -> 选择本脚本
//
//  小组件参数（可选，在小部件配置里填）：
//   - 留空            使用 default 别名下保存的 Key，主货币自动选 CNY
//   - work            使用 work 别名下保存的 Key（可管理多个 Key）
//   - work|USD        使用 work 别名下保存的 Key，主货币显示 USD
//   - sk-xxxxxxxx     直接把 Key 写在参数里（不推荐，参数是明文）
// ============================================================

const API_URL = "https://api.deepseek.com/user/balance";
const KC_PREFIX = "deepseek.balance.apikey.";
const DEFAULT_ALIAS = "default";
const CACHE_FILE = "deepseek-balance-cache.json";

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

const fm = () => FileManager.local();
const cachePath = () => fm().joinPath(fm().documentsDirectory(), CACHE_FILE);

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
    /* 写入失败不影响显示 */
  }
}

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

const keychainKey = (alias) => KC_PREFIX + alias;

function storedKey(alias) {
  const k = keychainKey(alias);
  return Keychain.contains(k) ? Keychain.get(k) : null;
}

async function promptForKey(alias) {
  const a = new Alert();
  a.title = "DeepSeek API Key";
  a.message = "别名：" + alias + "\n粘贴以 sk- 开头的 API Key，仅保存在本机钥匙串。";
  // addSecureTextField 从 Scriptable 1.5 起就有；try 兜底是为了极端老版本。
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

  if (status === 401 || status === 403) return { ok: false, kind: "auth", status, message: "API Key 无效或无权限（" + status + "）" };
  if (status === 402) return { ok: false, kind: "auth", status, message: "账户余额不足（402）" };
  if (status === 429) return { ok: false, kind: "rate", status, message: "请求过于频繁（429），稍后再试" };
  if (status >= 500) return { ok: false, kind: "server", status, message: "DeepSeek 服务端错误（" + status + "）" };
  if (status !== 200) return { ok: false, kind: "http", status, message: "请求失败（" + status + "）" };

  let json = null;
  try {
    json = JSON.parse(body);
  } catch (e) {
    return { ok: false, kind: "parse", message: "返回内容无法解析" };
  }

  const infos = Array.isArray(json.balance_infos) ? json.balance_infos : [];
  if (infos.length === 0) return { ok: false, kind: "empty", message: "接口未返回余额信息" };

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

// ---------------------------------------------------------------- 缓存（离线时显示上次的官方数据）

function loadCache(alias) {
  const all = readJSON(cachePath(), {});
  return all[alias] || null;
}

function saveCache(alias, data) {
  const all = readJSON(cachePath(), {});
  all[alias] = data;
  writeJSON(cachePath(), all);
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

  if (!key) return { state: "no-key", alias, cached };

  const res = await fetchBalance(key);
  if (res.ok) {
    saveCache(alias, res);
    return { state: "live", alias, data: res, primary: pickPrimary(res.balanceInfos, currency), key };
  }

  if (cached && Array.isArray(cached.balanceInfos)) {
    return { state: "stale", alias, data: cached, primary: pickPrimary(cached.balanceInfos, currency), error: res, key };
  }

  return { state: "error", alias, error: res, key };
}

// ---------------------------------------------------------------- 组件构建

function stack(parent) {
  return parent.addStack();
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

function buildBalanceBlock(root, primary, size) {
  const wrap = stack(root);
  wrap.layoutHorizontally();
  wrap.bottomAlignContent();

  const cur = wrap.addText(primary.currency);
  cur.font = Font.semiboldSystemFont(Math.round(size * 0.38));
  cur.textColor = C.dim;

  wrap.addSpacer(6);

  const amount = wrap.addText(toNumber(primary.total).toFixed(2));
  amount.font = mono(size, true);
  amount.textColor = C.text;
  amount.lineLimit = 1;
  amount.minimumScaleFactor = 0.6;
  return wrap;
}

function buildDetailRows(root, primary, labelSize, valueSize) {
  const row = stack(root);
  row.layoutHorizontally();
  row.spacing = 14;

  const mk = (k, v, color) => {
    const col = stack(row);
    col.layoutVertically();
    col.spacing = 1;
    const t1 = col.addText(k);
    t1.font = Font.systemFont(labelSize);
    t1.textColor = C.dim;
    const t2 = col.addText(v);
    t2.font = mono(valueSize, false);
    t2.textColor = color || C.text;
  };

  // 官方字段：赠金为 0 时没有信息量，不占位置
  const granted = toNumber(primary.granted);
  if (granted > 0.005) mk("赠金", granted.toFixed(2), C.ok);
  mk("充值", toNumber(primary.toppedUp).toFixed(2));
  return row;
}

function buildFooter(root, state) {
  const f = stack(root);
  f.layoutHorizontally();
  f.centerAlignContent();

  const when =
    state.state === "live" ? "官方数据 · 更新 " + relTime(state.data.fetchedAt)
      : state.state === "stale" ? "缓存数据 · " + relTime(state.data.fetchedAt)
        : "无数据";
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
    return buildMessageWidget("还没有配置 API Key", "在 Scriptable 中运行本脚本，选择「设置 API Key」。", "别名 " + state.alias);
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
  buildBalanceBlock(w, primary, isLarge ? 44 : isSmall ? 26 : 34);

  if (state.data.isAvailable === false) {
    w.addSpacer(3);
    const u = w.addText("账户不可用（余额不足以调用 API）");
    u.font = Font.systemFont(9);
    u.textColor = C.bad;
  }

  w.addSpacer(isSmall ? 5 : 7);
  buildDetailRows(w, primary, isLarge ? 11 : isSmall ? 9 : 10, isLarge ? 14 : isSmall ? 11 : 12);

  // 其它币种（官方返回多个币种时）
  const others = (state.data.balanceInfos || []).filter((b) => b.currency !== primary.currency);
  if (!isSmall && others.length) {
    w.addSpacer(7);
    others.forEach((b) => {
      const line = stack(w);
      line.layoutHorizontally();
      line.centerAlignContent();
      const cur = line.addText(b.currency);
      cur.font = Font.semiboldSystemFont(11);
      cur.textColor = C.dim;
      line.addSpacer(6);
      const amt = line.addText(toNumber(b.total).toFixed(2));
      amt.font = mono(13, false);
      amt.textColor = C.text;
      if (toNumber(b.granted) > 0.005) {
        line.addSpacer(8);
        const g = line.addText("赠金 " + toNumber(b.granted).toFixed(2));
        g.font = Font.systemFont(10);
        g.textColor = C.dim;
      }
    });
  }

  if (isLarge) {
    w.addSpacer(8);
    const src = w.addText("数据来源：官方 GET /user/balance");
    src.font = Font.systemFont(9);
    src.textColor = C.dim;
    src.lineLimit = 1;
  }

  w.addSpacer();
  buildFooter(w, state);
  return w;
}

// ---------------------------------------------------------------- App 内交互

function detailText(state) {
  if (state.state !== "live" && state.state !== "stale") return state.error ? state.error.message : "无数据";
  const lines = [];
  lines.push("别名：" + state.alias);
  lines.push("状态：" + (state.data.isAvailable === false ? "不可用" : "正常") + (state.state === "stale" ? "（缓存）" : ""));
  lines.push("");
  (state.data.balanceInfos || []).forEach((b) => {
    lines.push("[" + b.currency + "]");
    lines.push("  总额：" + toNumber(b.total).toFixed(2) + "   （官方 total_balance）");
    lines.push("  赠金：" + toNumber(b.granted).toFixed(2) + (toNumber(b.granted) <= 0.005 ? "（无）" : ""));
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
    a.title = "DeepSeek 余额" + (alias === DEFAULT_ALIAS ? "" : " · " + alias);
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
    if (hasKey) destructive("删除此别名的 Key");
    a.addCancelAction("关闭");

    const idx = await a.presentSheet();
    const title = idx >= 0 && idx < actions.length ? actions[idx] : null;
    if (!title) break;

    if (title === "预览小组件") {
      await buildWidget(state, fam).presentMedium();
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

  const state = await resolveState(alias, params.currency);
  Script.setWidget(buildWidget(state, config.widgetFamily || "small"));
  Script.complete();
}

await main();

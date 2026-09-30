# DeepSeek API 余额 · iOS 桌面小组件

在 iPhone / iPad 主屏上直接看 DeepSeek 开放平台**账户余额**（总可用余额、赠金构成、充值构成、多币种、历史走势）。

方案：**Scriptable 小组件**。不需要 Mac、不需要 Xcode、不需要 Apple 开发者账号，App Store 装一个免费 App 即可。

> **安装页**：<https://yokron.github.io/deepseek-balance-widget/> — iPhone Safari 打开，点「复制脚本」即可。
> 仓库：<https://github.com/yokron/deepseek-balance-widget>


| 文件 | 说明 |
| --- | --- |
| [DeepSeekBalance.js](DeepSeekBalance.js) | 小组件脚本本体（复制到 Scriptable 里用） |
| [index.html](index.html) | 手机安装页：一键复制脚本 + 二维码（GitHub Pages / 局域网都能用） |
| [preview.png](preview.png) | 效果示意图 |
| [push-to-github.ps1](push-to-github.ps1) | 一键推到你的 GitHub 仓库（含署名、remote、Pages 指引） |
| [_test/run.mjs](_test/run.mjs) | 开发用：在电脑上模拟 Scriptable 运行环境做回归测试 |
| [_transfer/serve.mjs](_transfer/serve.mjs) | 局域网静态服务，手机同 Wi-Fi 打开安装页 |
| [_transfer/gh.mjs](_transfer/gh.mjs) | 没装 `gh` CLI 时用它建仓库 / 开 Pages（走 REST API） |
| [_transfer/usage-stats.mjs](_transfer/usage-stats.mjs) | 可选：在电脑上统计 DSH 的真实 token 用量与估算费用（不参与小组件） |
| [_transfer/pin-proxy.mjs](_transfer/pin-proxy.mjs) | 网络阻断 `github.com` 时，用固定 IP 代理完成 push |

---

## 一、准备工作

1. 在 iPhone / iPad 上从 App Store 安装 **Scriptable**（免费）。
2. 取得 DeepSeek API Key：
   打开 <https://platform.deepseek.com/api_keys> → 创建 API Key → 复制 `sk-` 开头的那串。
   > 只读余额用同一个 Key 即可；建议专门建一个 Key 便于随时吊销。

## 二、把脚本弄到 iPhone 上

脚本必须"住"在手机上的 Scriptable 里，电脑上的这个 `.js` 文件是拿不到的。四选一：

### 方式 0：GitHub 安装页（推荐，一次push长期可用）⭐

推到自己仓库并开启 Pages 后，手机上打开一个网址即可**点一下复制**（HTTPS 页面剪贴板才可用），还可以把网址存成书签/加进主屏，以后换手机、更新脚本都用它。

```powershell
pwsh -ExecutionPolicy Bypass -File .\push-to-github.ps1 -User 你的GitHub用户名 -Repo deepseek-balance-widget
```

脚本会自动：改署名 → 提交 → 配好 `origin` → 推送 → 打印后续链接。详见 [第九节](#九推到自己的-github推荐)。

若不想开 Pages：**公开仓库**可直接用 raw 链接——手机 Safari 打开
`https://raw.githubusercontent.com/<用户名>/<仓库>/main/DeepSeekBalance.js` → 长按**全选 → 拷贝**。
**私有仓库**的 raw 直链在手机上未登录是打不开的，要走网页版：Safari 打开仓库里的 `DeepSeekBalance.js` → 点右上角 **Raw** → 全选 → 拷贝。

### 方式 A：局域网传输页（Windows 用户最省事，无需任何云服务）

电脑上执行（页面和 GitHub Pages 用的是同一个 [index.html](index.html)）：

```powershell
node _transfer/serve.mjs
```

它会打印一个地址，例如 `http://192.168.1.126:8787/`。

1. 手机连**同一个 Wi-Fi**，用 Safari 打开这个地址（页面上有二维码，也可用相机扫）。
2. 点 **「复制脚本」**；若浏览器提示不安全上下文没复制成功，改点 **「全选」** → 再点弹出的 **「拷贝」**。

> 如果手机打不开：多半是 Windows 防火墙拦了入站，弹窗时勾选**专用网络**允许；或改用方式 0/B/C。传完按 `Ctrl+C` 关掉这个服务。

### 方式 B：iCloud 云盘（不同 Wi-Fi 也行）

电脑浏览器登录 <https://www.icloud.com> → iCloud 云盘 → 上传 `DeepSeekBalance.js` → 手机「文件」App 里打开它 → 长按文本**全选 → 拷贝**。

### 方式 C：微信 / QQ / 邮件传文件

把 `.js` 发给自己（文件传输助手）→ 手机微信里点开该文件 → 右上角 `···` → **用其他应用打开 / 存储到「文件」** → 再按方式 B 的"打开 → 全选 → 拷贝"操作。

### 方式 D：手动敲（不推荐，约 600 行）

## 二点五、粘进 Scriptable

1. 打开 **Scriptable** → 右上角 `+` 新建脚本。
2. 在编辑区**长按 → 粘贴**（先清空默认内容）。
3. 点左上角脚本名 → 改成 `DeepSeek 余额` → 完成。
   > 名字随意，但**必须和后面小组件里选的脚本一致**。
4. 点 ▶️ 运行一次，确认能弹出菜单。

## 三、保存 API Key

1. 在 Scriptable 里点开脚本 → 点 ▶️ 运行。
2. 弹出菜单选 **设置 API Key** → 粘贴 `sk-...` → 保存。
   Key 存放在 **iOS 钥匙串（Keychain）**，不会写进脚本明文，也不会离开本机。
3. 再选 **预览小组件**，确认能看到余额数字。

## 四、加到桌面（iPhone 上的具体点法）

1. 回到**主屏幕**，长按任意空白处，图标开始抖动（或长按桌面 → 左上角出现 `+`）。
2. 点左上角 **`+`** → 搜索框输入 `Scriptable` → 选中 **Scriptable**。
3. 左右滑动选尺寸（小 / 中 / 大）→ 点 **添加小组件** → 点 **完成**。
4. **长按刚放上去的小组件** → 选 **编辑小组件**：
   - **Script**：点一下 → 选 `DeepSeek 余额`
   - **When Interacting**：选 **Run Script**（点组件即打开脚本菜单，方便手动刷新）
   - **Parameter**：见下表，一般留空
5. 点组件外任意处退出编辑。第一次可能显示"还没有配置 API Key"或需要几秒才出数，属正常。

> **负一屏（今天视图）**：主屏右滑到底 → 编辑 → 自定 → 添加 Scriptable。
> **锁屏**：iOS 16+ 长按锁屏 → 自定 → 添加小组件 → Scriptable（此处只支持矩形/圆形尺寸，选 `# 大` 之类的脚本需要适配，本脚本会自动用紧凑布局）。
>
> ⚠️ Scriptable 必须**先运行过一次**（至少创建过一个脚本），才会出现在小组件列表里。

### 小组件参数（Parameter）

| 参数写法 | 含义 |
| --- | --- |
| *（留空）* | 用 `default` 别名保存的 Key，主货币自动选 CNY |
| `work` | 用 `work` 别名保存的 Key（脚本菜单里可切换/新增别名，管理多个 Key） |
| `work\|USD` | 用 `work` 的 Key，主货币显示 USD |
| `work\|USD\|line` | 消费图从直方图（默认 `bar`）改成折线图 |
| `sk-xxxxxxxx` | 直接把 Key 写在参数里（**明文，不推荐**） |

> 参数里任意一段写 `bar` 或 `line` 就是图形样式，其余段按顺序是「别名 | 货币」。

添加多个小组件、填不同别名，就能在一屏里同时盯多个账号。

## 五、界面上有什么

- **圆点颜色**：绿 = 实时数据，黄 = 网络失败正在显示缓存，红 = 出错 / 未配 Key。
- **大号数字**：主货币总额（`total_balance`）。
- **赠金 / 充值**：`granted_balance`（未过期的赠金余额）与 `topped_up_balance`（充值余额），两者之和即上面的总额。
  > 赠金是官方赠送的额度（新用户/活动），**扣费时优先扣赠金**，过期作废。为 0 时组件不显示这一项（没有信息量）。
- **累计消费**：`累计消费` 是**本机推算**的 —— 余额下降记为消费、上升记为充值，从脚本第一次记录开始累计。
  > ⚠️ 官方没有用量/账单查询接口，所以这是**唯一**能拿到的消费数据，且**无法回溯**脚本开始记录之前的消费。
  > 采样频率不影响总额正确性（两次观测之间的变化都会被计入），只影响「记在哪一天」。
- **消费直方图**：跨度 **13 周（约一个季度）**。逐日画柱在这个宽度下会细成条形码，所以**按周聚合成 13 根柱子**：单周最高的那根用品牌色高亮，零消费的周只留基线。下方标注窗口合计 / 单周最高，以及「消费记录自 X 起累计」—— 官方不提供历史账单，左边那些柱子要靠时间慢慢填满。参数里写 `line` 可切成折线（同样 13 周）。
- **多币种**：中号/大号会额外列出一行其它币种（如 `USD 8.20`）。
- **底部时间**：`更新 12 分钟前`；离线时显示 `离线数据 · 3 小时前`。

## 六、脚本菜单（在 App 内运行脚本时）

| 菜单项 | 作用 |
| --- | --- |
| 预览小组件 | 不离开 App 直接预览效果 |
| 刷新 | 重新请求接口 |
| 设置 / 更换 API Key | 写入或覆盖当前别名的 Key |
| 切换 / 新增别名 | 管理多套 Key |
| 复制总余额 | 复制到剪贴板 |
| 清空历史记录 | 清掉采样、累计消费与消费图数据 |
| 删除此别名的 Key | 从钥匙串移除 |

---

## 七、关于刷新频率（重要）

iOS **不允许**第三方小组件实时刷新。Scriptable 小组件由系统调度，通常 **15 分钟 ~ 1 小时**才会重新执行一次脚本，锁屏/低电量模式下更久。

- 看到的数字可能有延迟，这是系统限制，不是脚本问题。
- 想立刻更新：点一下小组件（进入 App 菜单）或打开 Scriptable 手动运行。
- 脚本已做**本地缓存**：即使某次刷新失败（地铁里没信号），也会继续显示上次的余额并标黄提示。

## 八、接口说明

```
GET https://api.deepseek.com/user/balance
Authorization: Bearer sk-xxxxxxxx
```

返回示例：

```json
{
  "is_available": true,
  "balance_infos": [
    { "currency": "CNY", "total_balance": "110.00",
      "granted_balance": "10.00", "topped_up_balance": "100.00" }
  ]
}
```

脚本对 `401/403`（Key 无效）、`402`（余额不足）、`429`（限流）、`5xx`、断网分别给了不同的提示文案。

### 为什么没有 token 消耗量

**官方没有任何用量/账单查询接口。** 整个 API 文档只有：Chat Completions、Responses、FIM 补全、获取模型列表、查询余额、Files。token 数只存在于**每次 API 响应的 `usage` 字段**里 —— 也就是「谁发起调用谁才知道」；而调用是你在电脑上发起的，手机从没调过 API，所以**物理上拿不到**这些数字。

所以本小组件只做**钱**：余额来自官方接口，已消费与每日消费来自余额采样台账（纯本机推算，零外部依赖，不会因为某个数据源挂掉而失效）。如果你只是想在电脑上看看 token 用量，`node _transfer/usage-stats.mjs --days 14` 可以从 DSH 会话日志里算出真实数值。

## 九、推到自己的 GitHub（推荐）

本仓库已经准备好 `.gitignore / .gitattributes / LICENSE / index.html / .nojekyll`，只差一次带认证的 push。

### 一条命令

```powershell
# 公开仓库：能开 GitHub Pages，手机上一键复制
pwsh -ExecutionPolicy Bypass -File .\push-to-github.ps1 -User 你的用户名

# 私有仓库：开不了免费 Pages，用 raw 链接
pwsh -ExecutionPolicy Bypass -File .\push-to-github.ps1 -User 你的用户名 -Visibility private

# 只想配好 remote、自己手动推
pwsh -ExecutionPolicy Bypass -File .\push-to-github.ps1 -User 你的用户名 -Repo deepseek-balance-widget -SkipPush
```

脚本会：把提交署名改成 `用户名 <用户名@users.noreply.github.com>`（让 commit 归属到你的账号）→ 替换 LICENSE 里的版权占位符 → 提交 → 配置 `origin` → 打印建仓库链接 → 推送。**首次推送会弹出浏览器让你登录 GitHub**（Git Credential Manager，Git for Windows 自带，无需手动配 token）。

> ⚠️ 网页建仓库时**不要**勾选 Add README / .gitignore / license，保持空仓库，否则 push 会被拒（冲突了就跑 `git pull --rebase origin main` 再推）。

### 手动等价命令

```powershell
git remote add origin https://github.com/<用户名>/<仓库>.git
git push -u origin main
```

#### 如果 `git push` 报 Could not connect to server

国内网络下 `github.com` 常被解析到已被阻断的 IP（例如 `20.205.243.166`），而 GitHub 的美国 IP 其实是通的。用仓库里的固定 IP 代理绕过：

```powershell
node _transfer/pin-proxy.mjs          # 另开一个窗口，监听 127.0.0.1:9443
git -c http.proxy=http://127.0.0.1:9443 push -u origin main
```

它只把 `github.com / api.github.com / codeload / ssh` 的 CONNECT 转到可用 IP，TLS 依旧端到端（SNI 与证书校验不变）。`raw.githubusercontent.com` 一般不受影响，所以**读一直正常、只有 push 失败**是典型症状。

### 开启 Pages

仓库 → **Settings → Pages** → Source 选 `Deploy from a branch` → Branch 选 `main`、目录选 `/(root)` → Save。
约 1 分钟后访问 `https://<用户名>.github.io/<仓库>/`，用 iPhone Safari 打开 → 点 **「复制脚本」** → 粘进 Scriptable。

> 提示：把该网址在 Safari 里「添加到主屏幕」，以后就是手机上点一下的事。
> 如果 `.ps1` 被执行策略拦住，加 `-ExecutionPolicy Bypass`（如上）或先 `Unblock-File .\push-to-github.ps1`。

## 十、排错

| 现象 | 处理 |
| --- | --- |
| 运行时报 `xxx is not a function` / `is undefined` | 装的是旧版脚本。打开[安装页](https://yokron.github.io/deepseek-balance-widget/)，重新「复制脚本」覆盖 Scriptable 里那份 |
| 显示「还没有配置 API Key」 | 在 Scriptable 里运行脚本，先设置 Key；Key 存在钥匙串，**重装 Scriptable 会丢失** |
| 一直显示「离线数据」 | 检查网络/代理；确认 Key 未过期；在 App 内手动「刷新」看具体错误 |
| 提示 `API Key 无效或无权限` | Key 复制时带了空格，或已被删除/禁用 |
| 小组件一直不刷新 | 系统调度限制，点开一次脚本或换大尺寸更容易被唤醒；也可删掉小组件重新添加 |
| 数字和网页后台不一致 | 后台含未结算用量，通常几分钟内对齐 |

## 十一、开发者：本地回归测试

脚本用一个最小 stub 模拟了 Scriptable 的 `ListWidget / Alert / Text / Color / Font / Request / Keychain / FileManager / DrawContext` 等全局对象，可以在电脑上直接跑。

**stub 全部包在「严格 Proxy」里**：脚本一旦访问 Scriptable 真实不存在的属性/方法，测试立刻失败。这一层是踩坑加上的 —— 早期 stub 手写了一个并不存在的 `Alert.buttonTitle()`，导致本地全绿、真机运行时报 `a.buttonTitle is not a function`。

```bash
node _test/run.mjs
```

```
✅ 无 Key 时返回提示组件（三种尺寸）
✅ 有 Key 且接口 200：生成组件并写缓存
✅ 参数 work|USD 生效
✅ 401 时给出 Key 无效组件
✅ 断网时回退到缓存（stale）
✅ 余额下降记消费、上升记充值，当日分桶
✅ 中号/大号在有消费时画直方图（默认）
✅ 按周聚合成一个季度（13 周）
✅ 参数写 line 时改用折线图
✅ 没有消费数据时不画图，给文字提示
✅ 赠金为 0 时不显示该字段
✅ 旧版历史（纯数组）自动迁移并接上基准
✅ App 内：无 Key 时能设置 Key（真机崩溃路径）
✅ App 内：点「预览小组件」调用 presentMedium
✅ App 内：点「复制总余额」写入剪贴板
✅ App 内：切换别名后新别名独立存取 Key
✅ App 内：清空历史 + 删除 Key 生效
✅ App 内：一直取消能正常退出
✅ 严格模式自检：调用不存在的 API 必须报错

19/19 通过
```

> stub 只能验证逻辑与 API 用法，真机渲染效果仍需在 iPhone 上看一眼。

## 十二、想要「真·原生 App」？

脚本方案零成本、可立刻用。如果你有 Mac + Xcode 且想要：
- 独立 App（可上架 / 自签）、Key 存 Keychain 并支持 Face ID 解锁；
- WidgetKit 原生小组件（`.systemSmall/.systemMedium/.systemLarge` + accessory 锁屏组件）；
- 余额下降推送提醒、消费趋势图。

我可以再生成一套完整的 SwiftUI + WidgetKit 工程（含 App Group 共享、时间线刷新策略、锁屏组件）。告诉我一声即可。

---

> 本项目只调用 DeepSeek 官方公开的余额查询接口，Key 全程只保存在你本机的钥匙串中。

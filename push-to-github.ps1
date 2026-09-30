<#
.SYNOPSIS
  把本项目推到你的 GitHub 仓库（含首次推送的完整准备）。

.EXAMPLE
  # 公开仓库（推荐：免费版 GitHub Pages 只支持公开仓库）
  pwsh -File .\push-to-github.ps1 -User lwn -Repo deepseek-balance-widget

.EXAMPLE
  # 私有仓库（不能开 Pages，只能用 raw 链接）
  pwsh -File .\push-to-github.ps1 -User lwn -Repo deepseek-balance-widget -Visibility private
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$User,
  [string]$Repo = "deepseek-balance-widget",
  [ValidateSet("public", "private")][string]$Visibility = "public",
  [string]$Branch = "main",
  [switch]$SkipPush
)

Set-Location -LiteralPath $PSScriptRoot

# git 会把提示/警告写到 stderr，不把它当成致命错误（否则 git add 就会中断脚本）
if (Get-Variable -Name PSNativeCommandUseErrorActionPreference -ErrorAction SilentlyContinue) {
  $PSNativeCommandUseErrorActionPreference = $false
}

function Say($msg, $color = "Gray") { Write-Host $msg -ForegroundColor $color }
function Die($msg) { Say "✗ $msg" "Red"; exit 1 }

# ---------- 0. 环境检查 ----------
if (-not (Get-Command git -ErrorAction SilentlyContinue)) { Die "没找到 git，请先安装 Git for Windows。" }
git rev-parse --is-inside-work-tree *> $null
if ($LASTEXITCODE -ne 0) { Die "当前目录不是 git 仓库，请在项目根目录运行。" }

# ---------- 1. 署名（让 commit 正确归属到你的账号） ----------
Say "→ 设置提交署名：$User <$User@users.noreply.github.com>"
git config --local user.name $User
git config --local user.email "$User@users.noreply.github.com"

# LICENSE 里的占位符替换成你的用户名
$license = Join-Path $PSScriptRoot "LICENSE"
if (Test-Path $license) {
  $text = Get-Content -LiteralPath $license -Raw -Encoding UTF8
  if ($text -match "<your GitHub username>") {
    $text = $text -replace "<your GitHub username>", $User
    Set-Content -LiteralPath $license -Value $text -NoNewline -Encoding UTF8
    Say "  已把 LICENSE 的版权人改成 $User"
  }
}

# ---------- 2. 提交 ----------
git add -A
$staged = git diff --cached --name-only
if ($staged) {
  git commit -q -m "feat: DeepSeek API 余额 iOS 桌面小组件 (Scriptable)" 
  Say "→ 已创建提交" "Green"
} else {
  Say "→ 没有新改动需要提交"
}
# 只有一次提交时，把作者改写为当前署名，避免出现占位作者
$count = (git rev-list --count HEAD)
if ($count -eq "1") {
  git commit -q --amend --reset-author --no-edit
  Say "→ 已修正首个提交的作者信息"
}

# ---------- 3. remote ----------
$url = "https://github.com/$User/$Repo.git"
$existing = git remote get-url origin 2>$null
if ($LASTEXITCODE -eq 0 -and $existing) {
  if ($existing -ne $url) { git remote set-url origin $url; Say "→ 已更新 origin = $url" }
  else { Say "→ origin 已是 $url" }
} else {
  git remote add origin $url
  Say "→ 已添加 origin = $url" "Green"
}

# ---------- 4. 提示建仓库 ----------
Say ""
Say "──────────────────────────────────────────────" "DarkGray"
Say " 如果 $User/$Repo 还不存在，先在浏览器里建一个空仓库：" "Yellow"
Say "   https://github.com/new?name=$Repo&visibility=$Visibility" "Cyan"
Say "   ⚠️ 不要勾选 Add README / .gitignore / license（保持空仓库，否则 push 会冲突）"
Say "──────────────────────────────────────────────" "DarkGray"
Say ""

if ($SkipPush) {
  Say "已按 -SkipPush 跳过推送。手动推送命令：" "Yellow"
  Say "  git push -u origin $Branch"
  exit 0
}

# ---------- 5. 推送 ----------
Say "→ 推送中…（首次会弹出浏览器让你登录 GitHub，登录后即可）" "Green"
git push -u origin $Branch
if ($LASTEXITCODE -ne 0) {
  Say ""
  Say "✗ 推送失败。常见原因：" "Red"
  Say "  · 远程仓库还没创建 → 用上面的链接建一个空仓库后重跑本脚本"
  Say "  · 登录/授权没完成 → 重跑一次，浏览器窗口里完成 GitHub 授权"
  Say "  · 远程已有内容（建仓库时勾了 README）→ 执行： git pull --rebase origin $Branch  然后重跑"
  exit 1
}

# ---------- 6. 后续链接 ----------
$pages = "https://${User}.github.io/$Repo/"
Say ""
Say "✅ 推送完成" "Green"
Say ""
Say "仓库       https://github.com/$User/$Repo" "Cyan"
Say "原始脚本   https://raw.githubusercontent.com/$User/$Repo/$Branch/DeepSeekBalance.js" "Cyan"
Say "手机安装页 https://raw.githubusercontent.com/$User/$Repo/$Branch/index.html （需在 Safari 打开；Pages 更好用，见下）" "Cyan"
if ($Visibility -eq "public") {
  Say ""
  Say "想开 GitHub Pages（手机上一键复制的安装页）：" "Yellow"
  Say "  仓库 → Settings → Pages → Source 选 'Deploy from a branch'"
  Say "  → Branch 选 $Branch 、文件夹选 /(root) → Save"
  Say "  等 1 分钟后访问： $pages" "Cyan"
} else {
  Say ""
  Say "私有仓库开不了免费 Pages，手机上这样拿脚本：" "Yellow"
  Say "  Safari 打开 https://github.com/$User/$Repo/blob/$Branch/DeepSeekBalance.js" "Cyan"
  Say "  → 点右上角 Raw → 长按全选 → 拷贝（raw 直链对私有仓库要登录，得走网页版 Raw）"
}

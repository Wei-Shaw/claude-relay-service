$ErrorActionPreference = 'Stop'

$UpstreamUrl   = "https://github.com/Wei-Shaw/claude-relay-service.git"
$UpstreamName  = "upstream"
$UpstreamBranch = "main"
$LocalBranch   = "main"

function Write-Info($msg)  { Write-Host $msg -ForegroundColor Blue }
function Write-Err($msg)   { Write-Host "error: $msg" -ForegroundColor Red; exit 1 }
function Write-Warn($msg)  { Write-Host "warning: $msg" -ForegroundColor Yellow }

# 1. 检查是否位于 Git 仓库中
git rev-parse --git-dir > $null 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "当前目录不在 Git 仓库中。"
}

# 2. 检查工作目录是否干净
$Status = git status --porcelain
if ($Status) {
    Write-Err "工作目录不干净。请在同步前先暂存或提交您的更改。"
}

# 3. 检查当前分支
$CurrentBranch = git rev-parse --abbrev-ref HEAD
if ($CurrentBranch -ne $LocalBranch) {
    Write-Err "当前不在 '$LocalBranch' 分支（当前为 '$CurrentBranch'）。请运行：git switch $LocalBranch"
}

# 4. 配置上游远程仓库（幂等操作）
$remotes = @(git remote)
$hasUpstream = $remotes -contains $UpstreamName

if ($hasUpstream) {
    $ExistingUrl = git remote get-url $UpstreamName
    if ($ExistingUrl -ne $UpstreamUrl) {
        Write-Err "远程仓库 '$UpstreamName' 已存在，但 URL 不一致：$ExistingUrl`n  期望：$UpstreamUrl`n  请手动解决。"
    }
} else {
    Write-Info "添加远程仓库：$UpstreamName -> $UpstreamUrl"
    git remote add $UpstreamName $UpstreamUrl
}

# 5. 获取上游更新
Write-Info "正在获取 $UpstreamName/$UpstreamBranch..."
git --no-pager fetch $UpstreamName $UpstreamBranch --tags

# 6. 显示待合并的提交
$CommitCountStr = git rev-list --count "$LocalBranch..$UpstreamName/$UpstreamBranch"
$CommitCount = [int]$CommitCountStr

if ($CommitCount -eq 0) {
    Write-Info "本地 $LocalBranch 已与 $UpstreamName/$UpstreamBranch 保持同步。无需操作。"
    exit 0
}

Write-Info "发现上游有 $CommitCount 条新提交："
Write-Host ""
git --no-pager log --oneline --max-count=20 "$LocalBranch..$UpstreamName/$UpstreamBranch"
if ($CommitCount -gt 20) {
    $More = $CommitCount - 20
    Write-Host "  ... 还有 $More 条"
}
Write-Host ""

# 7. 请求确认
$Confirm = Read-Host "是否将这 $CommitCount 条提交合并到本地 $LocalBranch 分支？[y/N]"
if ($Confirm -notin @("y", "Y")) {
    Write-Info "同步已被用户取消。"
    exit 1
}

# 8. 执行合并
Write-Info "正在将 $UpstreamName/$UpstreamBranch 合并到 $LocalBranch..."
git --no-pager merge --no-edit "$UpstreamName/$UpstreamBranch"
$MergeExit = $LASTEXITCODE

if ($MergeExit -eq 0) {
    $NewHead = git rev-parse --short HEAD
    Write-Info "上游更改合并成功。"
    Write-Info "新的 HEAD：$NewHead"
    Write-Host ""
    Write-Info "推送到您的 origin："
    Write-Host "  git push origin $LocalBranch"
} else {
    Write-Warn "合并失败 — 存在冲突需要解决。"
    Write-Host ""
    Write-Warn "冲突文件："
    git --no-pager diff --name-only --diff-filter=U
    Write-Host ""
    Write-Info "解决冲突后，暂存并继续："
    Write-Host "  git add <已解决的文件>"
    Write-Host "  git merge --continue"
    Write-Host ""
    Write-Info "或中止合并："
    Write-Host "  git merge --abort"
    exit 1
}

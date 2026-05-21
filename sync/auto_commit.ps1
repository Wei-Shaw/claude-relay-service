param(
    [switch]$DryRun,
    [switch]$NoAI,
    [switch]$Help
)

if ($Help) {
    Write-Host "用法：.\auto_commit.ps1 [-DryRun] [-NoAI]" -ForegroundColor Cyan
    Write-Host "1"
    Write-Host "作用：" -ForegroundColor Cyan
    Write-Host "  自动将工作区改动加入暂存区（git add -A），并生成中文提交信息后提交。" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "参数：" -ForegroundColor Cyan
    Write-Host "  -DryRun   只生成提交信息并展示，不执行 git commit" -ForegroundColor Cyan
    Write-Host "  -NoAI     不调用 claude，使用兜底提交信息" -ForegroundColor Cyan
    exit 0
}

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

git rev-parse --git-dir *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host "错误：当前目录不是 git 仓库。" -ForegroundColor Red
    exit 1
}

$status = git status --porcelain
if ([string]::IsNullOrWhiteSpace($status)) {
    Write-Host "没有需要提交的改动。" -ForegroundColor DarkGray
    exit 0
}

Write-Host "正在加入暂存区（git add -A）..." -ForegroundColor Cyan
git add -A
if ($LASTEXITCODE -ne 0) {
    Write-Host "错误：git add 失败。" -ForegroundColor Red
    exit $LASTEXITCODE
}

$cached = git diff --cached --name-only
if ([string]::IsNullOrWhiteSpace($cached)) {
    Write-Host "暂存区为空，跳过。" -ForegroundColor DarkGray
    exit 0
}

$commitMessage = $null

if (-not $NoAI) {
    $claude = Get-Command claude -ErrorAction SilentlyContinue
    if ($claude) {
        $names = (git diff --cached --name-status --no-renames | Select-Object -First 200) -join "\n"
        $diff = git diff --cached --no-color | Out-String
        if ($diff.Length -gt 6000) { $diff = $diff.Substring(0, 6000) }
        $diff = $diff -replace "`r", ""

        $promptLines = @(
            "你是一个资深软件工程师。请根据下面的 Git staged 变更，生成一个 Conventional Commits 风格的提交信息（中文）。",
            "要求：",
            "1) 第一行是 subject，格式：<type>(<scope>): <一句话> 或 <type>: <一句话>，subject 不超过 72 字符。",
            "2) 如有必要，可在空行后给出 2-6 行 body，每行简短说明关键点。",
            "3) 只输出提交信息本身，不要解释，不要代码块，不要前后缀。",
            "4) type 只能用：feat|fix|refactor|docs|style|test|chore",
            "5) 如果主要是日志/脚本/构建相关，优先用 chore 或 refactor。",
            "",
            "以下是文件列表（name-status）：",
            $names,
            "",
            "以下是 diff（可能截断）：",
            $diff
        )
        $prompt = ($promptLines -join "`n")
        $prompt = $prompt -replace "(`r`n|`n|`r)", "\\n"
        $prompt = $prompt.Replace('"', "'")

        Write-Host "正在调用 claude 生成提交信息..."
        Write-Host "$($claude.Source) -p `"<prompt>`"" -ForegroundColor DarkGray
        $commitMessage = & $claude.Source -p "$prompt" 2>$null
        if ($commitMessage) {
            $commitMessage = $commitMessage -replace "`r", ""
            $commitMessage = $commitMessage.Trim()
        }
    }
}

if ([string]::IsNullOrWhiteSpace($commitMessage)) {
    $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $commitMessage = "chore: 自动提交 ($stamp)"
}

Write-Host ""
Write-Host "提交信息预览：" -ForegroundColor Yellow
Write-Host $commitMessage -ForegroundColor Yellow
Write-Host ""

if ($DryRun) {
    Write-Host "DryRun：未执行 git commit。" -ForegroundColor DarkGray
    exit 0
}

$tmp = Join-Path $env:TEMP ("claude-commit-message-{0}.txt" -f ([guid]::NewGuid().ToString('N')))
try {
    [System.IO.File]::WriteAllText($tmp, $commitMessage, [System.Text.UTF8Encoding]::new($false))
    git commit -F $tmp
    if ($LASTEXITCODE -ne 0) {
        Write-Host "错误：git commit 失败。" -ForegroundColor Red
        exit $LASTEXITCODE
    }
}
finally {
    Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
}

$pushBranch = git rev-parse --abbrev-ref HEAD
Write-Host "正在推送到 origin/$pushBranch ..." -ForegroundColor Cyan
git push origin $pushBranch
if ($LASTEXITCODE -ne 0) {
    Write-Host "错误：git push 失败。" -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "提交并推送完成。" -ForegroundColor Green

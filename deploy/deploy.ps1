# ============================================================================
# Claude Relay Service - 自动化部署脚本 (Windows PowerShell)
# ============================================================================
# 功能：本地构建前端 -> 打包项目 -> 上传服务器 -> 远程部署
# 使用：.\deploy\deploy.ps1
# ============================================================================

param (
    [string]$TargetServer = "cloud-server"
)

$ErrorActionPreference = "Stop"

# 配置
$SERVER = $TargetServer
$REMOTE_PATH = "/www/wwwroot/claude-relay-service"
$TIMESTAMP = Get-Date -Format "yyyyMMdd-HHmmss"
$PACKAGE_NAME = "claude-relay-deploy-$TIMESTAMP.tar.gz"
$TEMP_DIR = "/tmp"

function Invoke-RemoteBashScript {
    param (
        [Parameter(Mandatory = $true)]
        [string]$ScriptContent,

        [Parameter(Mandatory = $true)]
        [string]$StepName
    )

    $normalizedScript = $ScriptContent -replace "`r`n", "`n"
    $normalizedScript | ssh $SERVER "bash -s"

    if ($LASTEXITCODE -ne 0) {
        throw "远程执行失败: $StepName"
    }
}

Write-Host "============================================================================" -ForegroundColor Blue
Write-Host "🚀 Claude Relay Service 自动化部署" -ForegroundColor Blue
Write-Host "============================================================================" -ForegroundColor Blue
Write-Host ""

# ============================================================================
# 步骤 1: 检查前端是否已构建
# ============================================================================
Write-Host "📦 步骤 1/6: 检查前端构建状态..." -ForegroundColor Yellow

if (-Not (Test-Path "web/admin-spa/dist")) {
    Write-Host "⚠️  前端未构建，开始构建前端..." -ForegroundColor Yellow
    
    # 检查前端依赖
    if (-Not (Test-Path "web/admin-spa/node_modules")) {
        Write-Host "📥 安装前端依赖..." -ForegroundColor Yellow
        Push-Location "web/admin-spa"
        npm install
        Pop-Location
    }
    
    # 构建前端
    Write-Host "🔨 构建前端应用..." -ForegroundColor Yellow
    Push-Location "web/admin-spa"
    npm run build
    Pop-Location
    Write-Host "✅ 前端构建完成" -ForegroundColor Green
} else {
    Write-Host "✅ 前端已构建，跳过构建步骤" -ForegroundColor Green
}

Write-Host ""

# ============================================================================
# 步骤 2: 打包项目 (使用 tar 命令，需要 Git Bash 或 WSL)
# ============================================================================
Write-Host "📦 步骤 2/6: 打包项目文件..." -ForegroundColor Yellow

$tarArgs = @(
    "-czf", $PACKAGE_NAME,
    "--exclude=node_modules",
    "--exclude=.git",
    "--exclude=redis_data",
    "--exclude=logs",
    "--exclude=data",
    "--exclude=*.log",
    "--exclude=*.tar.gz",
    "--exclude=.env",
    "--exclude=build.log",
    "--exclude=gemini.mitm",
    "--exclude=*.txt",
    "--exclude=TASKS.md",
    "src", "web", "config", "deploy", "scripts", "cli", "resources",
    "Dockerfile", "docker-compose.yml", "docker-entrypoint.sh",
    "package.json", "package-lock.json",
    "Makefile", "nodemon.json", "VERSION",
    "README.md", "README_EN.md", "AGENTS.md", "DEPLOY.md",
    ".env.example", ".dockerignore", ".gitignore"
)

& tar @tarArgs

if ($LASTEXITCODE -ne 0) {
    throw "打包失败，请检查 tar 命令输出"
}

$packageSize = (Get-Item $PACKAGE_NAME).Length / 1MB
Write-Host "✅ 打包完成: $PACKAGE_NAME ($([math]::Round($packageSize, 2)) MB)" -ForegroundColor Green
Write-Host ""

# ============================================================================
# 步骤 3: 上传到服务器
# ============================================================================
Write-Host "📤 步骤 3/6: 上传到服务器..." -ForegroundColor Yellow

scp $PACKAGE_NAME "${SERVER}:${TEMP_DIR}/"

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ 上传成功" -ForegroundColor Green
} else {
    Write-Host "❌ 上传失败" -ForegroundColor Red
    exit 1
}

Write-Host ""

# ============================================================================
# 步骤 4: 备份服务器现有代码
# ============================================================================
Write-Host "💾 步骤 4/6: 备份服务器现有代码..." -ForegroundColor Yellow

$backupScript = @'
set -e

REMOTE_PATH="__REMOTE_PATH__"
if [ -d "${REMOTE_PATH}/src" ]; then
    BACKUP_NAME="backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    cd "${REMOTE_PATH}"
    tar -czf "../${BACKUP_NAME}" src web config deploy 2>/dev/null || true
    echo "✅ 备份完成: ${BACKUP_NAME}"
else
    echo "⚠️  首次部署，跳过备份"
fi
'@.Replace("__REMOTE_PATH__", $REMOTE_PATH)

Invoke-RemoteBashScript -ScriptContent $backupScript -StepName "备份服务器现有代码"

Write-Host ""

# ============================================================================
# 步骤 5: 解压并部署
# ============================================================================
Write-Host "📦 步骤 5/6: 解压并部署到服务器..." -ForegroundColor Yellow

$deployScript = @'
set -e

REMOTE_PATH="__REMOTE_PATH__"
TEMP_DIR="__TEMP_DIR__"
PACKAGE_NAME="__PACKAGE_NAME__"

echo "📂 解压文件..."
cd "${REMOTE_PATH}"
tar -xzf "${TEMP_DIR}/${PACKAGE_NAME}"

echo "🧹 清理临时文件..."
rm -f "${TEMP_DIR}/${PACKAGE_NAME}"

echo "✅ 文件部署完成"
'@

$deployScript = $deployScript.Replace("__REMOTE_PATH__", $REMOTE_PATH)
$deployScript = $deployScript.Replace("__TEMP_DIR__", $TEMP_DIR)
$deployScript = $deployScript.Replace("__PACKAGE_NAME__", $PACKAGE_NAME)

Invoke-RemoteBashScript -ScriptContent $deployScript -StepName "解压并部署到服务器"

Write-Host ""

# ============================================================================
# 步骤 6: 重启服务
# ============================================================================
Write-Host "🔄 步骤 6/6: 重启 Docker 服务..." -ForegroundColor Yellow

$restartScript = @'
set -e

cd /www/wwwroot/claude-relay-service/deploy

echo "🛑 停止现有服务..."
docker-compose -f docker-compose.prod.yml down 2>/dev/null || true

echo "🔨 重新构建镜像..."
docker-compose -f docker-compose.prod.yml build

echo "🚀 启动服务..."
docker-compose -f docker-compose.prod.yml up -d

echo ""
echo "⏳ 等待服务启动..."
sleep 10

echo ""
echo "📊 服务状态:"
docker-compose -f docker-compose.prod.yml ps

echo ""
echo "🏥 健康检查:"
sleep 5
curl -s http://localhost:7250/health | python3 -m json.tool || echo "⚠️  健康检查失败，请查看日志"

echo ""
echo "🧹 清理 Docker 旧镜像和构建缓存..."
docker image prune -f 2>/dev/null || true
docker builder prune -f --max-storage=1GB 2>/dev/null || true
echo "✅ Docker 清理完成"
'@

Invoke-RemoteBashScript -ScriptContent $restartScript -StepName "重启 Docker 服务"

Write-Host ""

# ============================================================================
# 完成
# ============================================================================
Write-Host "============================================================================" -ForegroundColor Green
Write-Host "✅ 部署完成！" -ForegroundColor Green
Write-Host "============================================================================" -ForegroundColor Green
Write-Host ""
Write-Host "📝 后续操作:" -ForegroundColor Blue
Write-Host "  1. 访问服务: http://your-server-ip:7250"
Write-Host "  2. 查看日志: ssh $SERVER 'cd $REMOTE_PATH/deploy && docker-compose -f docker-compose.prod.yml logs -f'"
Write-Host "  3. 查看状态: ssh $SERVER 'cd $REMOTE_PATH/deploy && docker-compose -f docker-compose.prod.yml ps'"
Write-Host ""

# 清理本地打包文件
Write-Host "🧹 清理本地打包文件..." -ForegroundColor Yellow
Remove-Item "$PACKAGE_NAME" -Force
Write-Host "✅ 清理完成" -ForegroundColor Green
Write-Host ""

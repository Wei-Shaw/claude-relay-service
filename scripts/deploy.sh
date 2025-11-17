#!/bin/bash

#################################################
# Claude Relay Service 自动部署脚本
# 用于服务器端自动更新代码和重启服务
#################################################

set -e  # 遇到错误立即退出

# 颜色输出
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 日志函数
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# 获取当前脚本所在目录的父目录（项目根目录）
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log_info "项目目录: $PROJECT_DIR"

# 切换到项目目录
cd "$PROJECT_DIR"

#################################################
# 1. 备份当前代码
#################################################
log_info "📦 备份当前代码..."
BACKUP_DIR="$PROJECT_DIR/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_PATH="$BACKUP_DIR/backup_$TIMESTAMP"

mkdir -p "$BACKUP_DIR"

# 只备份重要目录和文件
tar -czf "$BACKUP_PATH.tar.gz" \
    --exclude='node_modules' \
    --exclude='logs' \
    --exclude='backups' \
    --exclude='.git' \
    --exclude='web/admin-spa/node_modules' \
    --exclude='web/admin-spa/dist' \
    . 2>/dev/null || log_warning "备份时有些文件被跳过"

log_success "备份已保存到: $BACKUP_PATH.tar.gz"

# 保留最近 5 个备份
log_info "清理旧备份..."
ls -t "$BACKUP_DIR"/backup_*.tar.gz 2>/dev/null | tail -n +6 | xargs rm -f 2>/dev/null || true

#################################################
# 2. 拉取最新代码
#################################################
log_info "🔄 拉取最新代码..."

# 保存本地修改（如果有）
if ! git diff-index --quiet HEAD --; then
    log_warning "检测到本地修改，暂存中..."
    git stash push -m "auto-deploy-stash-$TIMESTAMP"
fi

# 获取当前分支
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
log_info "当前分支: $CURRENT_BRANCH"

# 拉取最新代码
git fetch origin
git reset --hard origin/$CURRENT_BRANCH

log_success "代码已更新到最新版本"
git log -1 --oneline

#################################################
# 3. 检查依赖变化
#################################################
log_info "🔍 检查依赖变化..."

# 检查后端依赖
if git diff HEAD@{1} HEAD --name-only | grep -q "package-lock.json\|package.json"; then
    log_warning "检测到后端依赖变化，重新安装..."
    npm ci --production
    log_success "后端依赖已更新"
else
    log_info "后端依赖无变化，跳过安装"
fi

# 运行设置脚本（会自动创建 .env 和 config.js，如果不存在）
log_info "🔧 运行设置脚本..."
npm run setup 2>&1 | grep -v "⚠️  服务已经初始化过了" || true
log_success "设置检查完成"

# 检查前端是否需要构建
if [ ! -d "web/admin-spa/dist" ]; then
    log_warning "前端未构建，首次构建中..."
    cd web/admin-spa
    npm ci
    npm run build
    cd "$PROJECT_DIR"
    log_success "前端首次构建完成"
elif git diff HEAD@{1} HEAD --name-only | grep -q "web/admin-spa/package"; then
    log_warning "检测到前端依赖变化，重新安装并构建..."
    cd web/admin-spa
    npm ci
    npm run build
    cd "$PROJECT_DIR"
    log_success "前端已重新构建"
elif git diff HEAD@{1} HEAD --name-only | grep -q "web/admin-spa/src"; then
    log_warning "检测到前端代码变化，重新构建..."
    cd web/admin-spa
    npm run build
    cd "$PROJECT_DIR"
    log_success "前端已重新构建"
else
    log_info "前端无变化，跳过构建"
fi

#################################################
# 4. 运行数据库迁移（如果有）
#################################################
# log_info "🗄️ 运行数据库迁移..."
# npm run migrate 2>/dev/null || log_info "无需迁移"

#################################################
# 5. 重启服务
#################################################
log_info "🔄 重启服务..."

# 读取配置端口
PORT=$(grep -oP "(?<=port:\s)\d+" config/config.js 2>/dev/null || echo "3000")

# 总是执行重启（更简单可靠）
log_info "执行服务重启..."
npm run service:restart:daemon

# 等待服务启动
sleep 5

log_success "服务重启命令已执行"

#################################################
# 6. 健康检查
#################################################
log_info "🏥 执行健康检查..."

# 读取配置端口（默认 3000）
PORT=$(grep -oP "(?<=port:\s)\d+" config/config.js 2>/dev/null || echo "3000")

# 等待服务就绪
max_retries=10
retry_count=0

while [ $retry_count -lt $max_retries ]; do
    if curl -sf "http://localhost:$PORT/health" > /dev/null 2>&1; then
        log_success "健康检查通过！"
        break
    else
        retry_count=$((retry_count + 1))
        log_warning "等待服务就绪... ($retry_count/$max_retries)"
        sleep 2
    fi
done

if [ $retry_count -eq $max_retries ]; then
    log_error "健康检查失败！服务可能未正常启动"
    log_info "查看日志: npm run service:logs"
    exit 1
fi

#################################################
# 7. 显示部署信息
#################################################
echo ""
log_success "========================================="
log_success "✅ 部署完成！"
log_success "========================================="
echo ""
log_info "📊 当前状态:"
npm run service:status 2>/dev/null || true
echo ""
log_info "📝 最新提交:"
git log -1 --pretty=format:"%h - %an, %ar : %s"
echo ""
echo ""
log_info "💡 常用命令:"
echo "  查看日志: npm run service:logs"
echo "  查看状态: npm run service:status"
echo "  重启服务: npm run service:restart:daemon"
echo "  停止服务: npm run service:stop"
echo ""

# 可选：发送部署通知（如配置了 webhook）
# curl -X POST "your-webhook-url" -d '{"status":"success","service":"claude-relay"}' || true

log_success "🎉 部署成功完成！"

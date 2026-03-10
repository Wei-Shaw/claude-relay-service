#!/bin/bash

# ============================================================================
# Claude Relay Service - 自动化部署脚本
# ============================================================================
# 功能：本地构建前端 -> 打包项目 -> 上传服务器 -> 远程部署
# 使用：./deploy/deploy.sh
# ============================================================================

set -e  # 遇到错误立即退出

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 配置
SERVER=${1:-"cloud-server"}  # 默认 cloud-server，支持传参覆盖：./deploy.sh root@ip
REMOTE_PATH="/www/wwwroot/claude-relay-service"
PACKAGE_NAME="claude-relay-deploy-$(date +%Y%m%d-%H%M%S).tar.gz"
TEMP_DIR="/tmp"

echo -e "${BLUE}============================================================================${NC}"
echo -e "${BLUE}🚀 Claude Relay Service 自动化部署${NC}"
echo -e "${BLUE}============================================================================${NC}"
echo ""

# ============================================================================
# 步骤 1: 检查前端是否已构建
# ============================================================================
echo -e "${YELLOW}📦 步骤 1/6: 检查前端构建状态...${NC}"

if [ ! -d "web/admin-spa/dist" ]; then
    echo -e "${YELLOW}⚠️  前端未构建，开始构建前端...${NC}"
    
    # 检查前端依赖
    if [ ! -d "web/admin-spa/node_modules" ]; then
        echo -e "${YELLOW}📥 安装前端依赖...${NC}"
        cd web/admin-spa
        npm install
        cd ../..
    fi
    
    # 构建前端
    echo -e "${YELLOW}🔨 构建前端应用...${NC}"
    cd web/admin-spa
    npm run build
    cd ../..
    echo -e "${GREEN}✅ 前端构建完成${NC}"
else
    echo -e "${GREEN}✅ 前端已构建，跳过构建步骤${NC}"
fi

echo ""

# ============================================================================
# 步骤 2: 打包项目
# ============================================================================
echo -e "${YELLOW}📦 步骤 2/6: 打包项目文件...${NC}"

tar -czf "$PACKAGE_NAME" \
    --exclude='node_modules' \
    --exclude='.git' \
    --exclude='redis_data' \
    --exclude='logs' \
    --exclude='data' \
    --exclude='*.log' \
    --exclude='*.tar.gz' \
    --exclude='.env' \
    --exclude='build.log' \
    --exclude='gemini.mitm' \
    --exclude='*.txt' \
    --exclude='TASKS.md' \
    src web config deploy scripts cli resources \
    Dockerfile docker-compose.yml docker-entrypoint.sh \
    package.json package-lock.json \
    Makefile nodemon.json VERSION \
    README.md README_EN.md AGENTS.md DEPLOY.md \
    .env.example .dockerignore .gitignore

PACKAGE_SIZE=$(du -h "$PACKAGE_NAME" | cut -f1)
echo -e "${GREEN}✅ 打包完成: $PACKAGE_NAME ($PACKAGE_SIZE)${NC}"
echo ""

# ============================================================================
# 步骤 3: 上传到服务器
# ============================================================================
echo -e "${YELLOW}📤 步骤 3/6: 上传到服务器...${NC}"

scp "$PACKAGE_NAME" "$SERVER:$TEMP_DIR/"

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ 上传成功${NC}"
else
    echo -e "${RED}❌ 上传失败${NC}"
    exit 1
fi

echo ""

# ============================================================================
# 步骤 4: 备份服务器现有代码
# ============================================================================
echo -e "${YELLOW}💾 步骤 4/6: 备份服务器现有代码...${NC}"

ssh "$SERVER" << EOF
    if [ -d "$REMOTE_PATH/src" ]; then
        BACKUP_NAME="backup-\$(date +%Y%m%d-%H%M%S).tar.gz"
        cd $REMOTE_PATH
        tar -czf ../\$BACKUP_NAME src web config deploy 2>/dev/null || true
        echo "✅ 备份完成: \$BACKUP_NAME"
    else
        echo "⚠️  首次部署，跳过备份"
    fi
EOF

echo ""

# ============================================================================
# 步骤 5: 解压并部署
# ============================================================================
echo -e "${YELLOW}📦 步骤 5/6: 解压并部署到服务器...${NC}"

ssh "$SERVER" << EOF
    set -e
    
    echo "📂 解压文件..."
    cd $REMOTE_PATH
    tar -xzf $TEMP_DIR/$PACKAGE_NAME
    
    echo "🧹 清理临时文件..."
    rm -f $TEMP_DIR/$PACKAGE_NAME
    
    echo "✅ 文件部署完成"
EOF

echo ""

# ============================================================================
# 步骤 6: 重启服务
# ============================================================================
echo -e "${YELLOW}🔄 步骤 6/6: 重启 Docker 服务...${NC}"

ssh "$SERVER" << 'EOF'
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
    docker builder prune -f --keep-storage=1GB 2>/dev/null || true
    echo "✅ Docker 清理完成"
EOF

echo ""

# ============================================================================
# 完成
# ============================================================================
echo -e "${GREEN}============================================================================${NC}"
echo -e "${GREEN}✅ 部署完成！${NC}"
echo -e "${GREEN}============================================================================${NC}"
echo ""
echo -e "${BLUE}📝 后续操作:${NC}"
echo -e "  1. 访问服务: http://your-server-ip:7250"
echo -e "  2. 查看日志: ssh $SERVER 'cd $REMOTE_PATH/deploy && docker-compose -f docker-compose.prod.yml logs -f'"
echo -e "  3. 查看状态: ssh $SERVER 'cd $REMOTE_PATH/deploy && docker-compose -f docker-compose.prod.yml ps'"
echo ""

# 清理本地打包文件
echo -e "${YELLOW}🧹 清理本地打包文件...${NC}"
rm -f "$PACKAGE_NAME"
echo -e "${GREEN}✅ 清理完成${NC}"
echo ""

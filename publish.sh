#!/bin/bash
set -e

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DIST_DIR="$PROJECT_DIR/web/admin-spa/dist"
CRS_DIR="/Users/admin/Documents/claude-relay-service"
CRS_APP_DIR="$CRS_DIR/app"

echo "🔧 构建前端..."
cd "$PROJECT_DIR/web/admin-spa" && npm run build

echo "📦 同步 dist 到 $CRS_APP_DIR ..."
rsync -av --delete "$DIST_DIR/" "$CRS_APP_DIR/web/admin-spa/dist/"

echo "🔄 重启 crs 服务..."
crs restart

echo "✅ 部署完成"

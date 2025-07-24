#!/bin/sh
set -e

echo "🚀 Claude Relay Service 启动中..."

# 检查关键环境变量
if [ -z "$JWT_SECRET" ]; then
  echo "❌ 错误: JWT_SECRET 环境变量未设置"
  echo "   请在 docker-compose.yml 中设置 JWT_SECRET"
  echo "   例如: JWT_SECRET=your-random-secret-key-at-least-32-chars"
  exit 1
fi

if [ -z "$ENCRYPTION_KEY" ]; then
  echo "❌ 错误: ENCRYPTION_KEY 环境变量未设置"
  echo "   请在 docker-compose.yml 中设置 ENCRYPTION_KEY"
  echo "   例如: ENCRYPTION_KEY=your-32-character-encryption-key"
  exit 1
fi

# 检查并复制配置文件
if [ ! -f "/app/config/config.js" ]; then
  echo "📋 检测到 config.js 不存在，从模板创建..."
  if [ -f "/app/config/config.example.js" ]; then
    cp /app/config/config.example.js /app/config/config.js
    echo "✅ config.js 已创建"
  else
    echo "❌ 错误: config.example.js 不存在"
    exit 1
  fi
fi

# 显示配置信息
echo "✅ 环境配置已就绪"
echo "   JWT_SECRET: [已设置]"
echo "   ENCRYPTION_KEY: [已设置]"
echo "   REDIS_HOST: ${REDIS_HOST:-localhost}"
echo "   PORT: ${PORT:-3000}"

# 检查是否需要初始化
if [ ! -f "/app/data/init.json" ]; then
  echo "📋 首次启动，执行初始化设置..."
  
  # 如果设置了环境变量，显示提示
  if [ -n "$ADMIN_USERNAME" ] || [ -n "$ADMIN_PASSWORD" ]; then
    echo "📌 检测到预设的管理员凭据"
  fi
  
  # 执行初始化脚本
  node /app/scripts/setup.js
  
  echo "✅ 初始化完成"
else
  echo "✅ 检测到已有配置，跳过初始化"
  
  # 如果 init.json 存在但环境变量也设置了，显示警告
  if [ -n "$ADMIN_USERNAME" ] || [ -n "$ADMIN_PASSWORD" ]; then
    echo "⚠️  警告: 检测到环境变量 ADMIN_USERNAME/ADMIN_PASSWORD，但系统已初始化"
    echo "   如需使用新凭据，请删除 data/init.json 文件后重启容器"
  fi
fi

# 启动应用
echo "🌐 启动 Claude Relay Service..."
exec "$@"
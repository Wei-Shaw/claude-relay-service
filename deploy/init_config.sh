#!/bin/bash
# -----------------------------------------------------------------------------
# 🚀 Claude Relay Service: 自动配置文件辅助脚本 (小白专用)
# -----------------------------------------------------------------------------
# 该脚本会自动生成随机的 JWT_SECRET 和 32 位 ENCRYPTION_KEY，
# 并根据模板创建 .env, update_subscription.sh 和 clash/config.yaml。
# -----------------------------------------------------------------------------

set -e

echo "🌟 欢迎使用 Claude Relay Service 自动配置脚本"

# 1. 确保在 deploy 目录
DEPLOY_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DEPLOY_DIR"

echo "📂 当前操作目录: $DEPLOY_DIR"

# 2. 从模板创建 .env 并填充随机密钥
if [ ! -f ".env" ]; then
    echo "📝 正在创建 .env 配置文件..."
    cp .env.example .env

    # 生成 64 字符的随机 JWT_SECRET
    JWT_SECRET=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 64 | head -n 1)
    # 生成 32 字符的随机 ENCRYPTION_KEY
    ENC_KEY=$(cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 32 | head -n 1)

    # 替换变量
    # 注意：这里使用不同的分隔符以防变量包含 /
    sed -i "s|JWT_SECRET=.*|JWT_SECRET=${JWT_SECRET}|" .env
    sed -i "s|ENCRYPTION_KEY=.*|ENCRYPTION_KEY=${ENC_KEY}|" .env

    echo "✅ .env 文件已自动生成随机密钥！"
else
    echo "⚠️  .env 文件已存在，跳过密钥生成。如需重新生成，请先删除 .env。"
fi

# 3. 初始化订阅脚本
if [ ! -f "update_subscription.sh" ]; then
    echo "📜 正在创建订阅更新脚本..."
    cp update_subscription.sh.example update_subscription.sh
    chmod +x update_subscription.sh
    echo "✅ update_subscription.sh 已创建 (记得下一步去填写订阅链接)。"
fi

# 4. 初始化 Clash 配置
if [ ! -f "clash/config.yaml" ]; then
    echo "🌐 正在创建 Clash 基础配置..."
    mkdir -p clash
    cp clash/config.yaml.example clash/config.yaml
    echo "✅ clash/config.yaml 已创建。"
fi

echo -e "\n🎉 【一键初始化成功！】"
echo "----------------------------------------------------------------"
echo "👉 下一步操作："
echo "1. 执行命令: vi update_subscription.sh  (填入你的机场订阅链接)"
echo "2. 执行命令: docker-compose -f docker-compose.prod.yml up -d --build"
echo "----------------------------------------------------------------"

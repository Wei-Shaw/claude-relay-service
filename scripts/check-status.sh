#!/bin/bash

# Claude Relay Service - 系统状态查看脚本
# 一次性查看系统并发和使用情况

# 加载环境变量
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

echo "🔍 Claude Relay Service - 系统状态"
echo "=================================="

# 获取服务配置
SERVICE_HOST=${HOST:-127.0.0.1}
SERVICE_PORT=${PORT:-3000}

# 如果HOST是0.0.0.0，客户端应该连接localhost
if [ "$SERVICE_HOST" = "0.0.0.0" ]; then
    SERVICE_HOST="127.0.0.1"
fi

SERVICE_URL="http://${SERVICE_HOST}:${SERVICE_PORT}"

# 获取Redis配置
REDIS_HOST=${REDIS_HOST:-127.0.0.1}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_CMD="redis-cli -h $REDIS_HOST -p $REDIS_PORT"

if [ ! -z "$REDIS_PASSWORD" ]; then
    REDIS_CMD="redis-cli -h $REDIS_HOST -p $REDIS_PORT -a $REDIS_PASSWORD"
fi

# 检查Redis连接
if ! $REDIS_CMD ping > /dev/null 2>&1; then
    echo "❌ Redis连接失败，请检查Redis服务是否运行"
    echo "   配置: $REDIS_HOST:$REDIS_PORT"
    exit 1
fi

echo "📊 当前并发状态："
echo ""

# 获取所有并发计数器
concurrency_keys=$($REDIS_CMD --scan --pattern "concurrency:*" 2>/dev/null)

if [ -z "$concurrency_keys" ]; then
    echo "  💤 当前无活跃并发连接"
else
    total_concurrent=0
    active_keys=0
    
    for key in $concurrency_keys; do
        count=$($REDIS_CMD get "$key" 2>/dev/null)
        if [ ! -z "$count" ] && [ "$count" -gt 0 ]; then
            api_key_id=${key#concurrency:}
            
            # 获取API Key详细信息
            api_key_name=$($REDIS_CMD hget "apikey:$api_key_id" name 2>/dev/null)
            concurrency_limit=$($REDIS_CMD hget "apikey:$api_key_id" concurrencyLimit 2>/dev/null)
            
            if [ -z "$api_key_name" ]; then
                api_key_name="Unknown"
            fi
            
            if [ -z "$concurrency_limit" ] || [ "$concurrency_limit" = "0" ]; then
                limit_text="无限制"
            else
                limit_text="$concurrency_limit"
            fi
            
            echo "  🔑 $api_key_name"
            echo "     ID: $api_key_id"
            echo "     当前并发: $count"
            echo "     并发限制: $limit_text"
            echo ""
            
            total_concurrent=$((total_concurrent + count))
            active_keys=$((active_keys + 1))
        fi
    done
    
    echo "📈 汇总: $total_concurrent 个活跃并发连接 ($active_keys 个API Key)"
fi

echo ""
echo "🏥 系统信息："

# Redis信息
redis_info=$($REDIS_CMD info server 2>/dev/null)
redis_version=$(echo "$redis_info" | grep redis_version | cut -d: -f2 | tr -d '\r')
redis_uptime=$(echo "$redis_info" | grep uptime_in_seconds | cut -d: -f2 | tr -d '\r')

if [ ! -z "$redis_version" ]; then
    echo "  📊 Redis版本: $redis_version"
fi

if [ ! -z "$redis_uptime" ]; then
    uptime_hours=$((redis_uptime / 3600))
    echo "  ⏱️  Redis运行时间: $uptime_hours 小时"
fi

# Redis内存使用
redis_memory_info=$($REDIS_CMD info memory 2>/dev/null)
used_memory=$(echo "$redis_memory_info" | grep used_memory_human | cut -d: -f2 | tr -d '\r')
max_memory=$(echo "$redis_memory_info" | grep maxmemory_human | cut -d: -f2 | tr -d '\r')

if [ ! -z "$used_memory" ]; then
    echo "  💾 Redis内存使用: $used_memory"
fi

# 检查服务健康状态
if command -v curl > /dev/null 2>&1; then
    echo ""
    echo "🌐 服务状态检查："
    
    health_response=$(curl -s ${SERVICE_URL}/health 2>/dev/null)
    if [ $? -eq 0 ]; then
        health_status=$(echo "$health_response" | grep -o '"status":"[^"]*"' | cut -d'"' -f4 | head -1)
        uptime=$(echo "$health_response" | grep -o '"uptime":[^,}]*' | cut -d: -f2 | head -1)
        
        if [ "$health_status" = "healthy" ]; then
            echo "  ✅ 服务状态: 健康 (${SERVICE_URL})"
        else
            echo "  ⚠️  服务状态: $health_status (${SERVICE_URL})"
        fi
        
        if [ ! -z "$uptime" ]; then
            uptime_hours=$(echo "scale=1; $uptime / 3600" | bc 2>/dev/null)
            if [ ! -z "$uptime_hours" ]; then
                echo "  ⏰ 服务运行时间: $uptime_hours 小时"
            fi
        fi
        
        # 检查端口
        if netstat -ln 2>/dev/null | grep -q ":${SERVICE_PORT} "; then
            echo "  🔌 端口${SERVICE_PORT}: 正在监听"
        else
            echo "  ❌ 端口${SERVICE_PORT}: 未监听"
        fi
    else
        echo "  ❌ 无法连接到服务 (${SERVICE_URL})"
    fi
fi

echo ""
echo "📋 API Key统计："

# 统计API Key数量
total_keys=$($REDIS_CMD keys "apikey:*" 2>/dev/null | grep -v "apikey:hash_map" | wc -l)
echo "  📊 总API Key数量: $total_keys"

# 统计Claude账户数量
total_accounts=$($REDIS_CMD keys "claude:account:*" 2>/dev/null | wc -l)
echo "  🏢 Claude账户数量: $total_accounts"

echo ""
echo "✅ 状态检查完成 - $(date '+%Y-%m-%d %H:%M:%S')"
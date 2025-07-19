#!/bin/bash

# Claude Relay Service - 并发监控脚本
# 实时监控所有API Key的并发使用情况

echo "🔍 Claude Relay Service - 并发监控"
echo "按 Ctrl+C 退出"
echo "=================================="

# 检查Redis连接
if ! redis-cli ping > /dev/null 2>&1; then
    echo "❌ Redis连接失败，请检查Redis服务是否运行"
    exit 1
fi

# 获取Redis配置
REDIS_HOST=${REDIS_HOST:-127.0.0.1}
REDIS_PORT=${REDIS_PORT:-6379}
REDIS_CMD="redis-cli"

if [ ! -z "$REDIS_PASSWORD" ]; then
    REDIS_CMD="redis-cli -a $REDIS_PASSWORD"
fi

# 监控函数
monitor_concurrency() {
    while true; do
        clear
        echo "🔍 Claude Relay Service - 并发监控 | $(date '+%Y-%m-%d %H:%M:%S')"
        echo "=================================="
        
        # 获取所有并发计数器
        concurrency_keys=$($REDIS_CMD --scan --pattern "concurrency:*" 2>/dev/null)
        
        if [ -z "$concurrency_keys" ]; then
            echo "📊 当前无活跃并发连接"
        else
            echo "📊 当前活跃并发连接："
            echo ""
            
            total_concurrent=0
            key_count=0
            
            for key in $concurrency_keys; do
                count=$($REDIS_CMD get "$key" 2>/dev/null)
                if [ ! -z "$count" ] && [ "$count" -gt 0 ]; then
                    api_key_id=${key#concurrency:}
                    
                    # 尝试获取API Key名称
                    api_key_name=$($REDIS_CMD hget "apikey:$api_key_id" name 2>/dev/null)
                    if [ -z "$api_key_name" ]; then
                        api_key_name="Unknown"
                    fi
                    
                    echo "  🔑 $api_key_name ($api_key_id): $count 个并发连接"
                    total_concurrent=$((total_concurrent + count))
                    key_count=$((key_count + 1))
                fi
            done
            
            echo ""
            echo "📈 总计: $total_concurrent 个并发连接 ($key_count 个API Key)"
        fi
        
        # 获取系统统计
        echo ""
        echo "🏥 系统状态："
        
        # Redis内存使用
        redis_memory=$($REDIS_CMD info memory 2>/dev/null | grep used_memory_human | cut -d: -f2 | tr -d '\r')
        if [ ! -z "$redis_memory" ]; then
            echo "  📊 Redis内存使用: $redis_memory"
        fi
        
        # 检查服务健康状态
        if command -v curl > /dev/null 2>&1; then
            health_check=$(curl -s http://localhost:3000/health 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4)
            if [ "$health_check" = "healthy" ]; then
                echo "  ✅ 服务状态: 健康"
            else
                echo "  ⚠️  服务状态: 异常"
            fi
        fi
        
        echo ""
        echo "刷新间隔: 5秒 | 按 Ctrl+C 退出"
        
        sleep 5
    done
}

# 信号处理
cleanup() {
    echo ""
    echo "👋 监控已停止"
    exit 0
}

trap cleanup SIGINT SIGTERM

# 开始监控
monitor_concurrency
#!/bin/bash

# OpenAI故障转移快速测试脚本

echo "🔍 Checking prerequisites..."

# 切换到项目根目录
cd "$(dirname "$0")/.."

# 检查配置文件
if [ ! -f "config/config.js" ]; then
  echo "⚠️  config/config.js not found. Creating from example..."
  if [ -f "config/config.example.js" ]; then
    cp config/config.example.js config/config.js
    echo "✅ Created config/config.js"
  else
    echo "❌ config/config.example.js not found!"
    exit 1
  fi
else
  echo "✅ Config file exists"
fi

# 检查Redis
if ! redis-cli ping > /dev/null 2>&1; then
  echo "❌ Redis is not running. Please start Redis first:"
  echo "   sudo systemctl start redis"
  exit 1
fi
echo "✅ Redis is running"

# 可选：检查清理服务是否在运行（主服务需启动）
echo "\n🔍 Checking if main service (app.js) is running..."
if pgrep -f "node.*src/app.js" > /dev/null; then
  echo "✅ Main service appears to be running (cleanup services active)"
else
  echo "⚠️  Main service may not be running; cleanup services won't execute automatically"
fi

# 检查并创建测试账户（如果需要）
echo "📝 Checking/creating test account..."
node << 'EOF'
const redisClient = require('./src/models/redis');
const openaiAccountService = require('./src/services/openaiAccountService');

(async () => {
  try {
    await redisClient.connect();
    const accounts = await openaiAccountService.getAllAccounts();
    
    if (accounts.length === 0) {
      console.log('⚠️  No OpenAI accounts found. Creating test account...');
      const account = await openaiAccountService.createAccount({
        name: 'Test OpenAI Account (Failover)',
        description: 'Auto-created for failover testing',
        accountType: 'openai-responses',
        apiKey: 'sk-test-dummy-key-for-failover-testing-' + Date.now()
      });
      console.log('✅ Test account created:', account.name);
    } else {
      console.log('✅ Found', accounts.length, 'OpenAI account(s)');
    }
    
    await redisClient.cleanup();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
})();
EOF

if [ $? -ne 0 ]; then
  echo "❌ Failed to setup test account"
  exit 1
fi

echo ""
echo "🧪 Running failover mechanism test..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
node scripts/test-openai-failover.js
OPENAI_RC=$?
if [ $OPENAI_RC -ne 0 ]; then
  echo "❌ OpenAI failover test failed (exit code $OPENAI_RC)"
  exit 1
else
  echo "✅ OpenAI failover test passed"
fi
TMP_RESP_LOG=$(mktemp)
node scripts/test-openai-responses-failover.js | tee "$TMP_RESP_LOG"
RESP_RC=${PIPESTATUS[0]}

if [ $RESP_RC -ne 0 ]; then
  echo "❌ OpenAI-Responses failover test failed (exit code $RESP_RC)"
  rm -f "$TMP_RESP_LOG"
  exit 1
fi

# 简单断言：若出现未恢复提示则判定失败；否则判定通过
if grep -q "❌ Account not recovered" "$TMP_RESP_LOG"; then
  echo "❌ OpenAI-Responses failover test failed (not recovered)"
  rm -f "$TMP_RESP_LOG"
  exit 1
else
  echo "✅ OpenAI-Responses failover test passed"
fi

rm -f "$TMP_RESP_LOG"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Test completed!"
echo "✅ ✅ All failover tests passed! | {\"type\":\"success\"}"

const redis = require('../src/models/redis');
const logger = require('../src/utils/logger');

async function testRealtimeMetrics() {
  try {
    // 连接Redis
    await redis.connect();
    
    // 获取当前时间戳
    const now = new Date();
    const currentMinute = Math.floor(now.getTime() / 60000);
    
    console.log('=== 时间戳测试 ===');
    console.log('当前时间:', now.toISOString());
    console.log('当前分钟时间戳:', currentMinute);
    console.log('');
    
    // 检查最近5分钟的键
    console.log('=== 检查Redis键 ===');
    const client = redis.getClient();
    for (let i = 0; i < 5; i++) {
      const minuteKey = `system:metrics:minute:${currentMinute - i}`;
      const exists = await client.exists(minuteKey);
      const data = await client.hgetall(minuteKey);
      
      console.log(`键: ${minuteKey}`);
      console.log(`  存在: ${exists ? '是' : '否'}`);
      if (exists && data) {
        console.log(`  数据: requests=${data.requests}, totalTokens=${data.totalTokens}`);
      }
      console.log('');
    }
    
    // 调用getRealtimeSystemMetrics
    console.log('=== 调用 getRealtimeSystemMetrics ===');
    const metrics = await redis.getRealtimeSystemMetrics();
    console.log('结果:', JSON.stringify(metrics, null, 2));
    
    // 列出所有system:metrics:minute:*键
    console.log('\n=== 所有系统指标键 ===');
    const allKeys = await client.keys('system:metrics:minute:*');
    console.log('找到的键数量:', allKeys.length);
    if (allKeys.length > 0) {
      // 排序并显示最新的10个
      allKeys.sort((a, b) => {
        const aNum = parseInt(a.split(':').pop());
        const bNum = parseInt(b.split(':').pop());
        return bNum - aNum;
      });
      
      console.log('最新的10个键:');
      for (let i = 0; i < Math.min(10, allKeys.length); i++) {
        const key = allKeys[i];
        const timestamp = parseInt(key.split(':').pop());
        const timeDiff = currentMinute - timestamp;
        console.log(`  ${key} (${timeDiff}分钟前)`);
      }
    }
    
  } catch (error) {
    console.error('测试失败:', error);
  } finally {
    await redis.disconnect();
    process.exit(0);
  }
}

// 运行测试
testRealtimeMetrics();
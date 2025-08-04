/**
 * 检查 Redis 中的所有键
 */

const redis = require('../src/models/redis');

async function checkRedisKeys() {
  console.log('🔍 检查 Redis 中的所有键...\n');

  try {
    // 确保 Redis 已连接
    await redis.connect();
    
    // 获取所有键
    const allKeys = await redis.client.keys('*');
    console.log(`找到 ${allKeys.length} 个键\n`);
    
    // 按类型分组
    const keysByType = {};
    
    allKeys.forEach(key => {
      const prefix = key.split(':')[0];
      if (!keysByType[prefix]) {
        keysByType[prefix] = [];
      }
      keysByType[prefix].push(key);
    });
    
    // 显示各类型的键
    Object.keys(keysByType).sort().forEach(type => {
      console.log(`\n📁 ${type}: ${keysByType[type].length} 个`);
      
      // 显示前 5 个键作为示例
      const keysToShow = keysByType[type].slice(0, 5);
      keysToShow.forEach(key => {
        console.log(`  - ${key}`);
      });
      
      if (keysByType[type].length > 5) {
        console.log(`  ... 还有 ${keysByType[type].length - 5} 个`);
      }
    });
    
  } catch (error) {
    console.error('❌ 错误:', error);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

checkRedisKeys();
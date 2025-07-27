#!/usr/bin/env node

const costInitService = require('../services/costInitService');
const logger = require('../utils/logger');
const redis = require('../models/redis');

async function main() {
  try {
    // 连接Redis
    await redis.connect();
    
    console.log('💰 Starting cost data initialization...\n');
    
    // 执行初始化
    const result = await costInitService.initializeAllCosts();
    
    console.log('\n✅ Cost initialization completed!');
    console.log(`   Processed: ${result.processed} API Keys`);
    console.log(`   Errors: ${result.errors}`);
    
    // 断开连接
    await redis.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Cost initialization failed:', error.message);
    logger.error('Cost initialization failed:', error);
    process.exit(1);
  }
}

// 运行主函数
main();
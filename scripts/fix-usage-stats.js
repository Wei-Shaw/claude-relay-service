#!/usr/bin/env node

/**
 * 数据迁移脚本：修复历史使用统计数据
 * 
 * 功能：
 * 1. 统一 totalTokens 和 allTokens 字段
 * 2. 确保 allTokens 包含所有类型的 tokens
 * 3. 修复历史数据的不一致性
 * 
 * 使用方法：
 * node scripts/fix-usage-stats.js [--dry-run]
 */

require('dotenv').config();
const redis = require('../src/models/redis');
const logger = require('../src/utils/logger');

// 解析命令行参数
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

async function fixUsageStats() {
  try {
    logger.info('🔧 开始修复使用统计数据...');
    if (isDryRun) {
      logger.info('📝 DRY RUN 模式 - 不会实际修改数据');
    }

    // 连接到 Redis
    await redis.connect();
    logger.success('✅ 已连接到 Redis');
    
    const client = redis.getClientSafe();
    
    // 统计信息
    let stats = {
      totalKeys: 0,
      fixedTotalKeys: 0,
      fixedDailyKeys: 0,
      fixedMonthlyKeys: 0,
      fixedModelKeys: 0,
      errors: 0
    };

    // 1. 修复 API Key 级别的总统计
    logger.info('\n📊 修复 API Key 总统计数据...');
    const apiKeyPattern = 'apikey:*';
    const apiKeys = await client.keys(apiKeyPattern);
    stats.totalKeys = apiKeys.length;

    for (const apiKeyKey of apiKeys) {
      const keyId = apiKeyKey.replace('apikey:', '');
      const usageKey = `usage:${keyId}`;
      
      try {
        const usageData = await client.hgetall(usageKey);
        if (usageData && Object.keys(usageData).length > 0) {
          const inputTokens = parseInt(usageData.totalInputTokens) || 0;
          const outputTokens = parseInt(usageData.totalOutputTokens) || 0;
          const cacheCreateTokens = parseInt(usageData.totalCacheCreateTokens) || 0;
          const cacheReadTokens = parseInt(usageData.totalCacheReadTokens) || 0;
          const currentAllTokens = parseInt(usageData.totalAllTokens) || 0;
          
          // 计算正确的 allTokens
          const correctAllTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens;
          
          if (currentAllTokens !== correctAllTokens && correctAllTokens > 0) {
            logger.info(`  修复 ${keyId}: ${currentAllTokens} -> ${correctAllTokens}`);
            
            if (!isDryRun) {
              await client.hset(usageKey, 'totalAllTokens', correctAllTokens);
            }
            stats.fixedTotalKeys++;
          }
        }
      } catch (error) {
        logger.error(`  错误处理 ${keyId}: ${error.message}`);
        stats.errors++;
      }
    }

    // 2. 修复每日统计数据
    logger.info('\n📅 修复每日统计数据...');
    const dailyPattern = 'usage:daily:*';
    const dailyKeys = await client.keys(dailyPattern);

    for (const dailyKey of dailyKeys) {
      try {
        const data = await client.hgetall(dailyKey);
        if (data && Object.keys(data).length > 0) {
          const inputTokens = parseInt(data.inputTokens) || 0;
          const outputTokens = parseInt(data.outputTokens) || 0;
          const cacheCreateTokens = parseInt(data.cacheCreateTokens) || 0;
          const cacheReadTokens = parseInt(data.cacheReadTokens) || 0;
          const currentAllTokens = parseInt(data.allTokens) || 0;
          
          const correctAllTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens;
          
          if (currentAllTokens !== correctAllTokens && correctAllTokens > 0) {
            if (!isDryRun) {
              await client.hset(dailyKey, 'allTokens', correctAllTokens);
            }
            stats.fixedDailyKeys++;
          }
        }
      } catch (error) {
        logger.error(`  错误处理 ${dailyKey}: ${error.message}`);
        stats.errors++;
      }
    }

    // 3. 修复每月统计数据
    logger.info('\n📆 修复每月统计数据...');
    const monthlyPattern = 'usage:monthly:*';
    const monthlyKeys = await client.keys(monthlyPattern);

    for (const monthlyKey of monthlyKeys) {
      try {
        const data = await client.hgetall(monthlyKey);
        if (data && Object.keys(data).length > 0) {
          const inputTokens = parseInt(data.inputTokens) || 0;
          const outputTokens = parseInt(data.outputTokens) || 0;
          const cacheCreateTokens = parseInt(data.cacheCreateTokens) || 0;
          const cacheReadTokens = parseInt(data.cacheReadTokens) || 0;
          const currentAllTokens = parseInt(data.allTokens) || 0;
          
          const correctAllTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens;
          
          if (currentAllTokens !== correctAllTokens && correctAllTokens > 0) {
            if (!isDryRun) {
              await client.hset(monthlyKey, 'allTokens', correctAllTokens);
            }
            stats.fixedMonthlyKeys++;
          }
        }
      } catch (error) {
        logger.error(`  错误处理 ${monthlyKey}: ${error.message}`);
        stats.errors++;
      }
    }

    // 4. 修复模型级别的统计数据
    logger.info('\n🤖 修复模型级别统计数据...');
    const modelPatterns = [
      'usage:model:daily:*',
      'usage:model:monthly:*',
      'usage:*:model:daily:*',
      'usage:*:model:monthly:*'
    ];

    for (const pattern of modelPatterns) {
      const modelKeys = await client.keys(pattern);
      
      for (const modelKey of modelKeys) {
        try {
          const data = await client.hgetall(modelKey);
          if (data && Object.keys(data).length > 0) {
            const inputTokens = parseInt(data.inputTokens) || 0;
            const outputTokens = parseInt(data.outputTokens) || 0;
            const cacheCreateTokens = parseInt(data.cacheCreateTokens) || 0;
            const cacheReadTokens = parseInt(data.cacheReadTokens) || 0;
            const currentAllTokens = parseInt(data.allTokens) || 0;
            
            const correctAllTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens;
            
            if (currentAllTokens !== correctAllTokens && correctAllTokens > 0) {
              if (!isDryRun) {
                await client.hset(modelKey, 'allTokens', correctAllTokens);
              }
              stats.fixedModelKeys++;
            }
          }
        } catch (error) {
          logger.error(`  错误处理 ${modelKey}: ${error.message}`);
          stats.errors++;
        }
      }
    }

    // 5. 验证修复结果
    if (!isDryRun) {
      logger.info('\n✅ 验证修复结果...');
      
      // 随机抽样验证
      const sampleSize = Math.min(5, apiKeys.length);
      for (let i = 0; i < sampleSize; i++) {
        const randomIndex = Math.floor(Math.random() * apiKeys.length);
        const keyId = apiKeys[randomIndex].replace('apikey:', '');
        const usage = await redis.getUsageStats(keyId);
        
        logger.info(`  样本 ${keyId}:`);
        logger.info(`    Total tokens: ${usage.total.tokens}`);
        logger.info(`    All tokens: ${usage.total.allTokens}`);
        logger.info(`    一致性: ${usage.total.tokens === usage.total.allTokens ? '✅' : '❌'}`);
      }
    }

    // 打印统计结果
    logger.info('\n📊 修复统计：');
    logger.info(`  总 API Keys: ${stats.totalKeys}`);
    logger.info(`  修复的总统计: ${stats.fixedTotalKeys}`);
    logger.info(`  修复的日统计: ${stats.fixedDailyKeys}`);
    logger.info(`  修复的月统计: ${stats.fixedMonthlyKeys}`);
    logger.info(`  修复的模型统计: ${stats.fixedModelKeys}`);
    logger.info(`  错误数: ${stats.errors}`);

    if (isDryRun) {
      logger.info('\n💡 这是 DRY RUN - 没有实际修改数据');
      logger.info('   运行不带 --dry-run 参数来实际执行修复');
    } else {
      logger.success('\n✅ 数据修复完成！');
    }

  } catch (error) {
    logger.error('❌ 修复过程出错:', error);
    process.exit(1);
  } finally {
    await redis.disconnect();
  }
}

// 执行修复
fixUsageStats().catch(error => {
  logger.error('❌ 未处理的错误:', error);
  process.exit(1);
});
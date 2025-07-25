#!/usr/bin/env node

/**
 * 数据导出/导入工具
 * 
 * 使用方法：
 * 导出: node scripts/data-transfer.js export --output=backup.json [options]
 * 导入: node scripts/data-transfer.js import --input=backup.json [options]
 * 
 * 选项：
 * --types: 要导出/导入的数据类型（apikeys,accounts,admins,all）
 * --sanitize: 导出时脱敏敏感数据
 * --force: 导入时强制覆盖已存在的数据
 * --skip-conflicts: 导入时跳过冲突的数据
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const redis = require('../src/models/redis');
const logger = require('../src/utils/logger');
const readline = require('readline');

// 解析命令行参数
const args = process.argv.slice(2);
const command = args[0];
const params = {};

args.slice(1).forEach(arg => {
  const [key, value] = arg.split('=');
  params[key.replace('--', '')] = value || true;
});

// 创建 readline 接口
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function askConfirmation(question) {
  return new Promise((resolve) => {
    rl.question(question + ' (yes/no): ', (answer) => {
      resolve(answer.toLowerCase() === 'yes' || answer.toLowerCase() === 'y');
    });
  });
}

// 数据脱敏函数
function sanitizeData(data, type) {
  const sanitized = { ...data };
  
  switch (type) {
    case 'apikey':
      // 隐藏 API Key 的大部分内容
      if (sanitized.apiKey) {
        sanitized.apiKey = sanitized.apiKey.substring(0, 10) + '...[REDACTED]';
      }
      break;
      
    case 'claude_account':
    case 'gemini_account':
      // 隐藏 OAuth tokens
      if (sanitized.accessToken) {
        sanitized.accessToken = '[REDACTED]';
      }
      if (sanitized.refreshToken) {
        sanitized.refreshToken = '[REDACTED]';
      }
      if (sanitized.claudeAiOauth) {
        sanitized.claudeAiOauth = '[REDACTED]';
      }
      // 隐藏代理密码
      if (sanitized.proxyPassword) {
        sanitized.proxyPassword = '[REDACTED]';
      }
      break;
      
    case 'admin':
      // 隐藏管理员密码
      if (sanitized.password) {
        sanitized.password = '[REDACTED]';
      }
      break;
  }
  
  return sanitized;
}

// 导出数据
async function exportData() {
  try {
    const outputFile = params.output || `backup-${new Date().toISOString().split('T')[0]}.json`;
    const types = params.types ? params.types.split(',') : ['all'];
    const shouldSanitize = params.sanitize === true;
    
    logger.info('🔄 Starting data export...');
    logger.info(`📁 Output file: ${outputFile}`);
    logger.info(`📋 Data types: ${types.join(', ')}`);
    logger.info(`🔒 Sanitize sensitive data: ${shouldSanitize ? 'YES' : 'NO'}`);
    
    // 连接 Redis
    await redis.connect();
    logger.success('✅ Connected to Redis');
    
    const exportData = {
      metadata: {
        version: '1.0',
        exportDate: new Date().toISOString(),
        sanitized: shouldSanitize,
        types: types
      },
      data: {}
    };
    
    // 导出 API Keys
    if (types.includes('all') || types.includes('apikeys')) {
      logger.info('📤 Exporting API Keys...');
      const keys = await redis.client.keys('apikey:*');
      const apiKeys = [];
      
      for (const key of keys) {
        if (key === 'apikey:hash_map') continue;
        
        // 使用 hgetall 而不是 get，因为数据存储在哈希表中
        const data = await redis.client.hgetall(key);
        
        if (data && Object.keys(data).length > 0) {
          apiKeys.push(shouldSanitize ? sanitizeData(data, 'apikey') : data);
        }
      }
      
      exportData.data.apiKeys = apiKeys;
      logger.success(`✅ Exported ${apiKeys.length} API Keys`);
    }
    
    // 导出 Claude 账户
    if (types.includes('all') || types.includes('accounts')) {
      logger.info('📤 Exporting Claude accounts...');
      // 注意：Claude 账户使用 claude:account: 前缀，不是 claude_account:
      const keys = await redis.client.keys('claude:account:*');
      logger.info(`Found ${keys.length} Claude account keys in Redis`);
      const accounts = [];
      
      for (const key of keys) {
        // 使用 hgetall 而不是 get，因为数据存储在哈希表中
        const data = await redis.client.hgetall(key);
        
        if (data && Object.keys(data).length > 0) {
          // 解析 JSON 字段（如果存在）
          if (data.claudeAiOauth) {
            try {
              data.claudeAiOauth = JSON.parse(data.claudeAiOauth);
            } catch (e) {
              // 保持原样
            }
          }
          accounts.push(shouldSanitize ? sanitizeData(data, 'claude_account') : data);
        }
      }
      
      exportData.data.claudeAccounts = accounts;
      logger.success(`✅ Exported ${accounts.length} Claude accounts`);
      
      // 导出 Gemini 账户
      logger.info('📤 Exporting Gemini accounts...');
      const geminiKeys = await redis.client.keys('gemini_account:*');
      logger.info(`Found ${geminiKeys.length} Gemini account keys in Redis`);
      const geminiAccounts = [];
      
      for (const key of geminiKeys) {
        // 使用 hgetall 而不是 get，因为数据存储在哈希表中
        const data = await redis.client.hgetall(key);
        
        if (data && Object.keys(data).length > 0) {
          geminiAccounts.push(shouldSanitize ? sanitizeData(data, 'gemini_account') : data);
        }
      }
      
      exportData.data.geminiAccounts = geminiAccounts;
      logger.success(`✅ Exported ${geminiAccounts.length} Gemini accounts`);
    }
    
    // 导出管理员
    if (types.includes('all') || types.includes('admins')) {
      logger.info('📤 Exporting admins...');
      const keys = await redis.client.keys('admin:*');
      const admins = [];
      
      for (const key of keys) {
        if (key.includes('admin_username:')) continue;
        
        // 使用 hgetall 而不是 get，因为数据存储在哈希表中
        const data = await redis.client.hgetall(key);
        
        if (data && Object.keys(data).length > 0) {
          admins.push(shouldSanitize ? sanitizeData(data, 'admin') : data);
        }
      }
      
      exportData.data.admins = admins;
      logger.success(`✅ Exported ${admins.length} admins`);
    }
    
    // 写入文件
    await fs.writeFile(outputFile, JSON.stringify(exportData, null, 2));
    
    // 显示导出摘要
    console.log('\n' + '='.repeat(60));
    console.log('✅ Export Complete!');
    console.log('='.repeat(60));
    console.log(`Output file: ${outputFile}`);
    console.log(`File size: ${(await fs.stat(outputFile)).size} bytes`);
    
    if (exportData.data.apiKeys) {
      console.log(`API Keys: ${exportData.data.apiKeys.length}`);
    }
    if (exportData.data.claudeAccounts) {
      console.log(`Claude Accounts: ${exportData.data.claudeAccounts.length}`);
    }
    if (exportData.data.geminiAccounts) {
      console.log(`Gemini Accounts: ${exportData.data.geminiAccounts.length}`);
    }
    if (exportData.data.admins) {
      console.log(`Admins: ${exportData.data.admins.length}`);
    }
    console.log('='.repeat(60));
    
    if (shouldSanitize) {
      logger.warn('⚠️  Sensitive data has been sanitized in this export.');
    }
    
  } catch (error) {
    logger.error('💥 Export failed:', error);
    process.exit(1);
  } finally {
    await redis.disconnect();
    rl.close();
  }
}

// 导入数据
async function importData() {
  try {
    const inputFile = params.input;
    if (!inputFile) {
      logger.error('❌ Please specify input file with --input=filename.json');
      process.exit(1);
    }
    
    const forceOverwrite = params.force === true;
    const skipConflicts = params['skip-conflicts'] === true;
    
    logger.info('🔄 Starting data import...');
    logger.info(`📁 Input file: ${inputFile}`);
    logger.info(`⚡ Mode: ${forceOverwrite ? 'FORCE OVERWRITE' : (skipConflicts ? 'SKIP CONFLICTS' : 'ASK ON CONFLICT')}`);
    
    // 读取文件
    const fileContent = await fs.readFile(inputFile, 'utf8');
    const importData = JSON.parse(fileContent);
    
    // 验证文件格式
    if (!importData.metadata || !importData.data) {
      logger.error('❌ Invalid backup file format');
      process.exit(1);
    }
    
    logger.info(`📅 Backup date: ${importData.metadata.exportDate}`);
    logger.info(`🔒 Sanitized: ${importData.metadata.sanitized ? 'YES' : 'NO'}`);
    
    if (importData.metadata.sanitized) {
      logger.warn('⚠️  This backup contains sanitized data. Sensitive fields will be missing!');
      const proceed = await askConfirmation('Continue with sanitized data?');
      if (!proceed) {
        logger.info('❌ Import cancelled');
        return;
      }
    }
    
    // 显示导入摘要
    console.log('\n' + '='.repeat(60));
    console.log('📋 Import Summary:');
    console.log('='.repeat(60));
    if (importData.data.apiKeys) {
      console.log(`API Keys to import: ${importData.data.apiKeys.length}`);
    }
    if (importData.data.claudeAccounts) {
      console.log(`Claude Accounts to import: ${importData.data.claudeAccounts.length}`);
    }
    if (importData.data.geminiAccounts) {
      console.log(`Gemini Accounts to import: ${importData.data.geminiAccounts.length}`);
    }
    if (importData.data.admins) {
      console.log(`Admins to import: ${importData.data.admins.length}`);
    }
    console.log('='.repeat(60) + '\n');
    
    // 确认导入
    const confirmed = await askConfirmation('⚠️  Proceed with import?');
    if (!confirmed) {
      logger.info('❌ Import cancelled');
      return;
    }
    
    // 连接 Redis
    await redis.connect();
    logger.success('✅ Connected to Redis');
    
    const stats = {
      imported: 0,
      skipped: 0,
      errors: 0
    };
    
    // 导入 API Keys
    if (importData.data.apiKeys) {
      logger.info('\n📥 Importing API Keys...');
      for (const apiKey of importData.data.apiKeys) {
        try {
          const exists = await redis.client.exists(`apikey:${apiKey.id}`);
          
          if (exists && !forceOverwrite) {
            if (skipConflicts) {
              logger.warn(`⏭️  Skipped existing API Key: ${apiKey.name} (${apiKey.id})`);
              stats.skipped++;
              continue;
            } else {
              const overwrite = await askConfirmation(`API Key "${apiKey.name}" (${apiKey.id}) exists. Overwrite?`);
              if (!overwrite) {
                stats.skipped++;
                continue;
              }
            }
          }
          
          // 使用 hset 存储到哈希表
          const pipeline = redis.client.pipeline();
          for (const [field, value] of Object.entries(apiKey)) {
            pipeline.hset(`apikey:${apiKey.id}`, field, value);
          }
          await pipeline.exec();
          
          // 更新哈希映射
          if (apiKey.apiKey && !importData.metadata.sanitized) {
            await redis.client.hset('apikey:hash_map', apiKey.apiKey, apiKey.id);
          }
          
          logger.success(`✅ Imported API Key: ${apiKey.name} (${apiKey.id})`);
          stats.imported++;
        } catch (error) {
          logger.error(`❌ Failed to import API Key ${apiKey.id}:`, error.message);
          stats.errors++;
        }
      }
    }
    
    // 导入 Claude 账户
    if (importData.data.claudeAccounts) {
      logger.info('\n📥 Importing Claude accounts...');
      for (const account of importData.data.claudeAccounts) {
        try {
          const exists = await redis.client.exists(`claude_account:${account.id}`);
          
          if (exists && !forceOverwrite) {
            if (skipConflicts) {
              logger.warn(`⏭️  Skipped existing Claude account: ${account.name} (${account.id})`);
              stats.skipped++;
              continue;
            } else {
              const overwrite = await askConfirmation(`Claude account "${account.name}" (${account.id}) exists. Overwrite?`);
              if (!overwrite) {
                stats.skipped++;
                continue;
              }
            }
          }
          
          // 使用 hset 存储到哈希表
          const pipeline = redis.client.pipeline();
          for (const [field, value] of Object.entries(account)) {
            // 如果是对象，需要序列化
            if (field === 'claudeAiOauth' && typeof value === 'object') {
              pipeline.hset(`claude_account:${account.id}`, field, JSON.stringify(value));
            } else {
              pipeline.hset(`claude_account:${account.id}`, field, value);
            }
          }
          await pipeline.exec();
          logger.success(`✅ Imported Claude account: ${account.name} (${account.id})`);
          stats.imported++;
        } catch (error) {
          logger.error(`❌ Failed to import Claude account ${account.id}:`, error.message);
          stats.errors++;
        }
      }
    }
    
    // 导入 Gemini 账户
    if (importData.data.geminiAccounts) {
      logger.info('\n📥 Importing Gemini accounts...');
      for (const account of importData.data.geminiAccounts) {
        try {
          const exists = await redis.client.exists(`gemini_account:${account.id}`);
          
          if (exists && !forceOverwrite) {
            if (skipConflicts) {
              logger.warn(`⏭️  Skipped existing Gemini account: ${account.name} (${account.id})`);
              stats.skipped++;
              continue;
            } else {
              const overwrite = await askConfirmation(`Gemini account "${account.name}" (${account.id}) exists. Overwrite?`);
              if (!overwrite) {
                stats.skipped++;
                continue;
              }
            }
          }
          
          // 使用 hset 存储到哈希表
          const pipeline = redis.client.pipeline();
          for (const [field, value] of Object.entries(account)) {
            pipeline.hset(`gemini_account:${account.id}`, field, value);
          }
          await pipeline.exec();
          logger.success(`✅ Imported Gemini account: ${account.name} (${account.id})`);
          stats.imported++;
        } catch (error) {
          logger.error(`❌ Failed to import Gemini account ${account.id}:`, error.message);
          stats.errors++;
        }
      }
    }
    
    // 显示导入结果
    console.log('\n' + '='.repeat(60));
    console.log('✅ Import Complete!');
    console.log('='.repeat(60));
    console.log(`Successfully imported: ${stats.imported}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);
    console.log('='.repeat(60));
    
  } catch (error) {
    logger.error('💥 Import failed:', error);
    process.exit(1);
  } finally {
    await redis.disconnect();
    rl.close();
  }
}

// 显示帮助信息
function showHelp() {
  console.log(`
Data Transfer Tool for Claude Relay Service

This tool allows you to export and import data between environments.

Usage:
  node scripts/data-transfer.js <command> [options]

Commands:
  export    Export data from Redis to a JSON file
  import    Import data from a JSON file to Redis

Export Options:
  --output=FILE        Output filename (default: backup-YYYY-MM-DD.json)
  --types=TYPE,...     Data types to export: apikeys,accounts,admins,all (default: all)
  --sanitize           Remove sensitive data from export

Import Options:
  --input=FILE         Input filename (required)
  --force              Overwrite existing data without asking
  --skip-conflicts     Skip conflicting data without asking

Examples:
  # Export all data
  node scripts/data-transfer.js export

  # Export only API keys with sanitized data
  node scripts/data-transfer.js export --types=apikeys --sanitize

  # Import data, skip conflicts
  node scripts/data-transfer.js import --input=backup.json --skip-conflicts

  # Export specific data types
  node scripts/data-transfer.js export --types=apikeys,accounts --output=prod-data.json
`);
}

// 主函数
async function main() {
  if (!command || command === '--help' || command === 'help') {
    showHelp();
    process.exit(0);
  }
  
  switch (command) {
    case 'export':
      await exportData();
      break;
      
    case 'import':
      await importData();
      break;
      
    default:
      logger.error(`❌ Unknown command: ${command}`);
      showHelp();
      process.exit(1);
  }
}

// 运行
main().catch(error => {
  logger.error('💥 Unexpected error:', error);
  process.exit(1);
});
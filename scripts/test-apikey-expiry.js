#!/usr/bin/env node

/**
 * 测试 API Key 过期功能
 * 快速创建和修改 API Key 过期时间以便测试
 */

const apiKeyService = require('../src/services/apiKeyService');
const redis = require('../src/models/redis');
const logger = require('../src/utils/logger');
const chalk = require('chalk');

async function createTestApiKeys() {
  console.log(chalk.bold.blue('\n🧪 创建测试 API Keys\n'));
  
  try {
    await redis.connect();
    
    // 创建不同过期时间的测试 Keys
    const testKeys = [
      {
        name: 'Test-Expired',
        description: '已过期的测试 Key',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() // 1天前过期
      },
      {
        name: 'Test-1Hour',
        description: '1小时后过期的测试 Key',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1小时后
      },
      {
        name: 'Test-1Day',
        description: '1天后过期的测试 Key',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 1天后
      },
      {
        name: 'Test-7Days',
        description: '7天后过期的测试 Key',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7天后
      },
      {
        name: 'Test-Never',
        description: '永不过期的测试 Key',
        expiresAt: null // 永不过期
      }
    ];
    
    console.log('正在创建测试 API Keys...\n');
    
    for (const keyData of testKeys) {
      try {
        const newKey = await apiKeyService.generateApiKey(keyData);
        
        const expiryInfo = keyData.expiresAt 
          ? new Date(keyData.expiresAt).toLocaleString()
          : '永不过期';
        
        console.log(`✅ 创建成功: ${keyData.name}`);
        console.log(`   API Key: ${newKey.apiKey}`);
        console.log(`   过期时间: ${expiryInfo}`);
        console.log('');
        
      } catch (error) {
        console.log(chalk.red(`❌ 创建失败: ${keyData.name} - ${error.message}`));
      }
    }
    
    // 运行清理任务测试
    console.log(chalk.bold.yellow('\n🔄 运行清理任务...\n'));
    const cleanedCount = await apiKeyService.cleanupExpiredKeys();
    console.log(`清理了 ${cleanedCount} 个过期的 API Keys\n`);
    
    // 显示所有 API Keys 状态
    console.log(chalk.bold.cyan('📊 当前所有 API Keys 状态:\n'));
    const allKeys = await apiKeyService.getAllApiKeys();
    
    for (const key of allKeys) {
      const now = new Date();
      const expiresAt = key.expiresAt ? new Date(key.expiresAt) : null;
      let status = '✅ 活跃';
      let expiryInfo = '永不过期';
      
      if (expiresAt) {
        if (expiresAt < now) {
          status = '❌ 已过期';
          expiryInfo = `过期于 ${expiresAt.toLocaleString()}`;
        } else {
          const hoursLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60));
          const daysLeft = Math.ceil(hoursLeft / 24);
          
          if (hoursLeft < 24) {
            expiryInfo = chalk.yellow(`${hoursLeft}小时后过期`);
          } else if (daysLeft <= 7) {
            expiryInfo = chalk.yellow(`${daysLeft}天后过期`);
          } else {
            expiryInfo = chalk.green(`${daysLeft}天后过期`);
          }
        }
      }
      
      if (!key.isActive) {
        status = '🔒 已禁用';
      }
      
      console.log(`${status} ${key.name} - ${expiryInfo}`);
      console.log(`   API Key: ${key.apiKey?.substring(0, 30)}...`);
      console.log('');
    }
    
  } catch (error) {
    console.error(chalk.red('测试失败:'), error);
  } finally {
    await redis.disconnect();
  }
}

// 主函数
async function main() {
  console.log(chalk.bold.magenta('\n===================================='));
  console.log(chalk.bold.magenta('   API Key 过期功能测试工具'));
  console.log(chalk.bold.magenta('====================================\n'));
  
  console.log('此工具将：');
  console.log('1. 创建不同过期时间的测试 API Keys');
  console.log('2. 运行清理任务禁用过期的 Keys');
  console.log('3. 显示所有 Keys 的当前状态\n');
  
  console.log(chalk.yellow('⚠️  注意：这会在您的系统中创建真实的 API Keys\n'));
  
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  readline.question('是否继续？(y/n): ', async (answer) => {
    if (answer.toLowerCase() === 'y') {
      await createTestApiKeys();
      
      console.log(chalk.bold.green('\n✅ 测试完成！\n'));
      console.log('您现在可以：');
      console.log('1. 使用 CLI 工具管理这些测试 Keys:');
      console.log('   npm run cli keys');
      console.log('');
      console.log('2. 在 Web 界面查看和管理这些 Keys');
      console.log('');
      console.log('3. 测试 API 调用时的过期验证');
    } else {
      console.log('\n已取消');
    }
    
    readline.close();
  });
}

// 运行
main().catch(error => {
  console.error(chalk.red('错误:'), error);
  process.exit(1);
});
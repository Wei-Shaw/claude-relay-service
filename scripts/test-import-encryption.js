#!/usr/bin/env node

/**
 * 测试导入加密处理
 * 验证增强版数据传输工具是否正确处理加密和未加密的导出数据
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const config = require('../config/config');
const logger = require('../src/utils/logger');

// 模拟加密函数
function encryptData(data, salt = 'salt') {
  if (!data || !config.security.encryptionKey) return data;
  
  const key = crypto.scryptSync(config.security.encryptionKey, salt, 32);
  const iv = crypto.randomBytes(16);
  
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  return iv.toString('hex') + ':' + encrypted;
}

// 模拟解密函数
function decryptData(encryptedData, salt = 'salt') {
  if (!encryptedData || !config.security.encryptionKey) return encryptedData;
  
  try {
    if (encryptedData.includes(':')) {
      const parts = encryptedData.split(':');
      const key = crypto.scryptSync(config.security.encryptionKey, salt, 32);
      const iv = Buffer.from(parts[0], 'hex');
      const encrypted = parts[1];
      
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    return encryptedData;
  } catch (error) {
    logger.warn(`⚠️  Failed to decrypt data: ${error.message}`);
    return encryptedData;
  }
}

async function testImportHandling() {
  console.log('🧪 测试导入加密处理\n');
  
  // 测试数据
  const testClaudeAccount = {
    id: 'test-claude-123',
    name: 'Test Claude Account',
    email: 'test@example.com',
    password: 'testPassword123',
    accessToken: 'test-access-token',
    refreshToken: 'test-refresh-token',
    claudeAiOauth: {
      access_token: 'oauth-access-token',
      refresh_token: 'oauth-refresh-token',
      scopes: ['read', 'write']
    }
  };
  
  const testGeminiAccount = {
    id: 'test-gemini-456',
    name: 'Test Gemini Account',
    geminiOauth: {
      access_token: 'gemini-access-token',
      refresh_token: 'gemini-refresh-token'
    },
    accessToken: 'gemini-access-token',
    refreshToken: 'gemini-refresh-token'
  };
  
  // 1. 创建解密的导出文件（模拟 --decrypt=true）
  const decryptedExport = {
    metadata: {
      version: '2.0',
      exportDate: new Date().toISOString(),
      sanitized: false,
      decrypted: true,  // 标记为已解密
      types: ['all']
    },
    data: {
      claudeAccounts: [testClaudeAccount],
      geminiAccounts: [testGeminiAccount]
    }
  };
  
  // 2. 创建加密的导出文件（模拟 --decrypt=false）
  const encryptedClaudeAccount = { ...testClaudeAccount };
  encryptedClaudeAccount.email = encryptData(encryptedClaudeAccount.email);
  encryptedClaudeAccount.password = encryptData(encryptedClaudeAccount.password);
  encryptedClaudeAccount.accessToken = encryptData(encryptedClaudeAccount.accessToken);
  encryptedClaudeAccount.refreshToken = encryptData(encryptedClaudeAccount.refreshToken);
  encryptedClaudeAccount.claudeAiOauth = encryptData(JSON.stringify(encryptedClaudeAccount.claudeAiOauth));
  
  const encryptedGeminiAccount = { ...testGeminiAccount };
  encryptedGeminiAccount.geminiOauth = encryptData(JSON.stringify(encryptedGeminiAccount.geminiOauth), 'gemini-account-salt');
  encryptedGeminiAccount.accessToken = encryptData(encryptedGeminiAccount.accessToken, 'gemini-account-salt');
  encryptedGeminiAccount.refreshToken = encryptData(encryptedGeminiAccount.refreshToken, 'gemini-account-salt');
  
  const encryptedExport = {
    metadata: {
      version: '2.0',
      exportDate: new Date().toISOString(),
      sanitized: false,
      decrypted: false,  // 标记为未解密（加密状态）
      types: ['all']
    },
    data: {
      claudeAccounts: [encryptedClaudeAccount],
      geminiAccounts: [encryptedGeminiAccount]
    }
  };
  
  // 写入测试文件
  const testDir = path.join(__dirname, '../data/test-imports');
  await fs.mkdir(testDir, { recursive: true });
  
  await fs.writeFile(
    path.join(testDir, 'decrypted-export.json'),
    JSON.stringify(decryptedExport, null, 2)
  );
  
  await fs.writeFile(
    path.join(testDir, 'encrypted-export.json'),
    JSON.stringify(encryptedExport, null, 2)
  );
  
  console.log('✅ 测试文件已创建：');
  console.log('   - data/test-imports/decrypted-export.json (解密的数据)');
  console.log('   - data/test-imports/encrypted-export.json (加密的数据)\n');
  
  console.log('📋 测试场景：\n');
  
  console.log('1. 导入解密的数据（decrypted=true）：');
  console.log('   - 导入时应该重新加密敏感字段');
  console.log('   - 命令: npm run data:import:enhanced -- --input=data/test-imports/decrypted-export.json\n');
  
  console.log('2. 导入加密的数据（decrypted=false）：');
  console.log('   - 导入时应该保持原样（已经是加密的）');
  console.log('   - 命令: npm run data:import:enhanced -- --input=data/test-imports/encrypted-export.json\n');
  
  console.log('3. 验证导入后的数据：');
  console.log('   - 使用 CLI 查看账户状态');
  console.log('   - 命令: npm run cli accounts list\n');
  
  // 显示示例数据对比
  console.log('📊 数据对比示例：\n');
  console.log('原始数据（解密状态）：');
  console.log(`  email: "${testClaudeAccount.email}"`);
  console.log(`  password: "${testClaudeAccount.password}"`);
  console.log(`  accessToken: "${testClaudeAccount.accessToken}"\n`);
  
  console.log('加密后的数据：');
  console.log(`  email: "${encryptedClaudeAccount.email.substring(0, 50)}..."`);
  console.log(`  password: "${encryptedClaudeAccount.password.substring(0, 50)}..."`);
  console.log(`  accessToken: "${encryptedClaudeAccount.accessToken.substring(0, 50)}..."\n`);
  
  // 验证加密/解密
  console.log('🔐 验证加密/解密功能：');
  const testString = 'test-data-123';
  const encrypted = encryptData(testString);
  const decrypted = decryptData(encrypted);
  console.log(`  原始: "${testString}"`);
  console.log(`  加密: "${encrypted.substring(0, 50)}..."`);
  console.log(`  解密: "${decrypted}"`);
  console.log(`  验证: ${testString === decrypted ? '✅ 成功' : '❌ 失败'}\n`);
}

// 运行测试
testImportHandling().catch(error => {
  console.error('❌ 测试失败:', error);
  process.exit(1);
});
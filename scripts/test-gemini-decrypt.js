#!/usr/bin/env node

/**
 * 测试 Gemini 账户解密
 */

const path = require('path');
const dotenv = require('dotenv');
const crypto = require('crypto');

// 加载环境变量
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const redis = require('../src/models/redis');
const config = require('../config/config');

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_SALT = 'gemini-account-salt'; // 正确的盐值！
const GEMINI_ACCOUNT_KEY_PREFIX = 'gemini_account:';

// 生成加密密钥（与 geminiAccountService 完全相同）
function generateEncryptionKey() {
  return crypto.scryptSync(config.security.encryptionKey, ENCRYPTION_SALT, 32);
}

// 解密函数（与 geminiAccountService 相同）
function decrypt(text) {
  if (!text) return '';
  try {
    const key = generateEncryptionKey();
    // IV 是固定长度的 32 个十六进制字符（16 字节）
    const ivHex = text.substring(0, 32);
    const encryptedHex = text.substring(33); // 跳过冒号
    
    const iv = Buffer.from(ivHex, 'hex');
    const encryptedText = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (error) {
    console.error('解密错误:', error.message);
    return null;
  }
}

async function testDecrypt() {
  try {
    console.log('🚀 测试 Gemini 账户解密...\n');
    
    console.log('📋 加密配置:');
    console.log(`   config.security.encryptionKey: ${config.security.encryptionKey}`);
    console.log(`   ENCRYPTION_SALT: ${ENCRYPTION_SALT}`);
    console.log();
    
    // 连接 Redis
    console.log('📡 连接 Redis...');
    await redis.connect();
    console.log('✅ Redis 连接成功\n');
    
    const client = redis.getClient();
    const keys = await client.keys(`${GEMINI_ACCOUNT_KEY_PREFIX}*`);
    
    if (keys.length === 0) {
      console.log('❌ 没有找到 Gemini 账户');
      process.exit(1);
    }
    
    console.log(`🔍 找到 ${keys.length} 个 Gemini 账户\n`);
    
    for (const key of keys) {
      const accountData = await client.hgetall(key);
      const accountId = key.replace(GEMINI_ACCOUNT_KEY_PREFIX, '');
      
      console.log(`📋 账户: ${accountData.name} (${accountId})`);
      
      if (accountData.refreshToken) {
        console.log('🔐 尝试解密 refreshToken...');
        const decrypted = decrypt(accountData.refreshToken);
        
        if (decrypted) {
          console.log('✅ 解密成功!');
          console.log(`   Token 前缀: ${decrypted.substring(0, 20)}...`);
        } else {
          console.log('❌ 解密失败');
        }
      } else {
        console.log('⚠️  无 refreshToken');
      }
      
      console.log();
    }
    
  } catch (error) {
    console.error('❌ 测试失败:', error);
  } finally {
    await redis.disconnect();
    process.exit(0);
  }
}

testDecrypt();
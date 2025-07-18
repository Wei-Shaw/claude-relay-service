/**
 * API Key 服务 - Vercel 适配版本
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('../config');
const kv = require('../database/kv');
const logger = require('../utils/logger');

class ApiKeyService {
  constructor() {
    this.prefix = config.security.apiKeyPrefix;
  }

  // 生成新的API Key
  async generateApiKey(options = {}) {
    const {
      name = 'Unnamed Key',
      description = '',
      tokenLimit = config.limits.defaultTokenLimit,
      expiresAt = null,
      claudeAccountId = null,
      isActive = true,
      concurrencyLimit = 0
    } = options;

    const apiKey = `${this.prefix}${this._generateSecretKey()}`;
    const keyId = uuidv4();
    const hashedKey = this._hashApiKey(apiKey);
    
    const keyData = {
      id: keyId,
      name,
      description,
      apiKey: hashedKey,
      tokenLimit: String(tokenLimit ?? 0),
      concurrencyLimit: String(concurrencyLimit ?? 0),
      isActive: String(isActive),
      claudeAccountId: claudeAccountId || '',
      createdAt: new Date().toISOString(),
      lastUsedAt: '',
      expiresAt: expiresAt || '',
      createdBy: 'admin'
    };

    await kv.setApiKey(keyId, keyData, hashedKey);
    
    logger.success(`🔑 Generated new API key: ${name} (${keyId})`);
    
    return {
      id: keyId,
      apiKey,
      name: keyData.name,
      description: keyData.description,
      tokenLimit: parseInt(keyData.tokenLimit),
      concurrencyLimit: parseInt(keyData.concurrencyLimit),
      isActive: keyData.isActive === 'true',
      claudeAccountId: keyData.claudeAccountId,
      createdAt: keyData.createdAt,
      expiresAt: keyData.expiresAt,
      createdBy: keyData.createdBy
    };
  }

  // 验证API Key
  async validateApiKey(apiKey) {
    try {
      if (!apiKey || !apiKey.startsWith(this.prefix)) {
        return { valid: false, error: 'Invalid API key format' };
      }

      const hashedKey = this._hashApiKey(apiKey);
      const keyData = await kv.findApiKeyByHash(hashedKey);
      
      if (!keyData) {
        return { valid: false, error: 'API key not found' };
      }

      if (keyData.isActive !== 'true') {
        return { valid: false, error: 'API key is disabled' };
      }

      if (keyData.expiresAt && new Date() > new Date(keyData.expiresAt)) {
        return { valid: false, error: 'API key has expired' };
      }

      const usage = await kv.getUsageStats(keyData.id);
      const tokenLimit = parseInt(keyData.tokenLimit);
      
      if (tokenLimit > 0 && usage.total.tokens >= tokenLimit) {
        return { valid: false, error: 'Token limit exceeded' };
      }

      logger.api(`🔓 API key validated successfully: ${keyData.id}`);

      return {
        valid: true,
        keyData: {
          id: keyData.id,
          name: keyData.name,
          claudeAccountId: keyData.claudeAccountId,
          tokenLimit: parseInt(keyData.tokenLimit),
          concurrencyLimit: parseInt(keyData.concurrencyLimit || 0),
          usage
        }
      };
    } catch (error) {
      logger.error('❌ API key validation error:', error);
      return { valid: false, error: 'Internal validation error' };
    }
  }

  // 获取所有API Keys
  async getAllApiKeys() {
    try {
      const apiKeys = await kv.getAllApiKeys();
      
      for (const key of apiKeys) {
        key.usage = await kv.getUsageStats(key.id);
        key.tokenLimit = parseInt(key.tokenLimit);
        key.concurrencyLimit = parseInt(key.concurrencyLimit || 0);
        key.currentConcurrency = await kv.getConcurrency(key.id);
        key.isActive = key.isActive === 'true';
        delete key.apiKey;
      }

      return apiKeys;
    } catch (error) {
      logger.error('❌ Failed to get API keys:', error);
      throw error;
    }
  }

  // 更新API Key
  async updateApiKey(keyId, updates) {
    try {
      const keyData = await kv.getApiKey(keyId);
      if (!keyData) {
        throw new Error('API key not found');
      }

      const allowedUpdates = ['name', 'description', 'tokenLimit', 'concurrencyLimit', 'isActive', 'claudeAccountId', 'expiresAt'];
      const updatedData = { ...keyData };

      for (const [field, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(field)) {
          updatedData[field] = (value != null ? value : '').toString();
        }
      }

      updatedData.updatedAt = new Date().toISOString();
      
      await kv.setApiKey(keyId, updatedData);
      
      logger.success(`📝 Updated API key: ${keyId}`);
      
      return { success: true };
    } catch (error) {
      logger.error('❌ Failed to update API key:', error);
      throw error;
    }
  }

  // 删除API Key
  async deleteApiKey(keyId) {
    try {
      const result = await kv.deleteApiKey(keyId);
      
      if (result === 0) {
        throw new Error('API key not found');
      }
      
      logger.success(`🗑️ Deleted API key: ${keyId}`);
      
      return { success: true };
    } catch (error) {
      logger.error('❌ Failed to delete API key:', error);
      throw error;
    }
  }

  // 记录使用情况
  async recordUsage(keyId, inputTokens = 0, outputTokens = 0, cacheCreateTokens = 0, cacheReadTokens = 0, model = 'unknown') {
    try {
      const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens;
      await kv.incrementTokenUsage(keyId, totalTokens, inputTokens, outputTokens, cacheCreateTokens, cacheReadTokens, model);
      
      // 更新最后使用时间
      const keyData = await kv.getApiKey(keyId);
      if (keyData) {
        keyData.lastUsedAt = new Date().toISOString();
        await kv.setApiKey(keyId, keyData);
      }
      
      const logParts = [`Model: ${model}`, `Input: ${inputTokens}`, `Output: ${outputTokens}`];
      if (cacheCreateTokens > 0) logParts.push(`Cache Create: ${cacheCreateTokens}`);
      if (cacheReadTokens > 0) logParts.push(`Cache Read: ${cacheReadTokens}`);
      logParts.push(`Total: ${totalTokens} tokens`);
      
      logger.database(`📊 Recorded usage: ${keyId} - ${logParts.join(', ')}`);
    } catch (error) {
      logger.error('❌ Failed to record usage:', error);
    }
  }

  // 生成密钥
  _generateSecretKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  // 哈希API Key
  _hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey + config.security.encryptionKey).digest('hex');
  }

  // 获取使用统计
  async getUsageStats(keyId) {
    return await kv.getUsageStats(keyId);
  }
}

module.exports = new ApiKeyService();
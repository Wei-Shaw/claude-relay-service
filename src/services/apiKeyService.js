const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config/config');
const redis = require('../models/redis');
const logger = require('../utils/logger');

class ApiKeyService {
  constructor() {
    this.prefix = config.security.apiKeyPrefix;
  }

  // 🔑 生成新的API Key
  async generateApiKey(options = {}) {
    const {
      name = 'Unnamed Key',
      description = '',
      tokenLimit = config.limits.defaultTokenLimit,
      expiresAt = null,
      claudeAccountId = null,
      isActive = true,
      concurrencyLimit = 0,
      rateLimitWindow = null,
      rateLimitRequests = null,
      enableModelRestriction = false,
      restrictedModels = []
    } = options;

    // 生成简单的API Key (64字符十六进制)
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
      rateLimitWindow: String(rateLimitWindow ?? 0),
      rateLimitRequests: String(rateLimitRequests ?? 0),
      isActive: String(isActive),
      claudeAccountId: claudeAccountId || '',
      enableModelRestriction: String(enableModelRestriction),
      restrictedModels: JSON.stringify(restrictedModels || []),
      createdAt: new Date().toISOString(),
      lastUsedAt: '',
      expiresAt: expiresAt || '',
      createdBy: 'admin' // 可以根据需要扩展用户系统
    };

    // 保存API Key数据并建立哈希映射
    await redis.setApiKey(keyId, keyData, hashedKey);
    
    logger.success(`🔑 Generated new API key: ${name} (${keyId})`);
    
    return {
      id: keyId,
      apiKey, // 只在创建时返回完整的key
      name: keyData.name,
      description: keyData.description,
      tokenLimit: parseInt(keyData.tokenLimit),
      concurrencyLimit: parseInt(keyData.concurrencyLimit),
      rateLimitWindow: parseInt(keyData.rateLimitWindow || 0),
      rateLimitRequests: parseInt(keyData.rateLimitRequests || 0),
      isActive: keyData.isActive === 'true',
      claudeAccountId: keyData.claudeAccountId,
      enableModelRestriction: keyData.enableModelRestriction === 'true',
      restrictedModels: JSON.parse(keyData.restrictedModels),
      createdAt: keyData.createdAt,
      expiresAt: keyData.expiresAt,
      createdBy: keyData.createdBy
    };
  }

  // 🔍 验证API Key  
  async validateApiKey(apiKey) {
    try {
      if (!apiKey || !apiKey.startsWith(this.prefix)) {
        return { valid: false, error: 'Invalid API key format' };
      }

      // 计算API Key的哈希值
      const hashedKey = this._hashApiKey(apiKey);
      
      // 通过哈希值直接查找API Key（性能优化）
      const keyData = await redis.findApiKeyByHash(hashedKey);
      
      if (!keyData) {
        return { valid: false, error: 'API key not found' };
      }

      // 检查是否激活
      if (keyData.isActive !== 'true') {
        return { valid: false, error: 'API key is disabled' };
      }

      // 检查是否过期
      if (keyData.expiresAt && new Date() > new Date(keyData.expiresAt)) {
        return { valid: false, error: 'API key has expired' };
      }

      // 获取使用统计（供返回数据使用）
      const usage = await redis.getUsageStats(keyData.id);

      // 更新最后使用时间（优化：只在实际API调用时更新，而不是验证时）
      // 注意：lastUsedAt的更新已移至recordUsage方法中

      logger.api(`🔓 API key validated successfully: ${keyData.id}`);

      // 解析限制模型数据
      let restrictedModels = [];
      try {
        restrictedModels = keyData.restrictedModels ? JSON.parse(keyData.restrictedModels) : [];
      } catch (e) {
        restrictedModels = [];
      }

      return {
        valid: true,
        keyData: {
          id: keyData.id,
          name: keyData.name,
          claudeAccountId: keyData.claudeAccountId,
          tokenLimit: parseInt(keyData.tokenLimit),
          concurrencyLimit: parseInt(keyData.concurrencyLimit || 0),
          rateLimitWindow: parseInt(keyData.rateLimitWindow || 0),
          rateLimitRequests: parseInt(keyData.rateLimitRequests || 0),
          enableModelRestriction: keyData.enableModelRestriction === 'true',
          restrictedModels: restrictedModels,
          usage
        }
      };
    } catch (error) {
      logger.error('❌ API key validation error:', error);
      return { valid: false, error: 'Internal validation error' };
    }
  }

  // 📋 获取所有API Keys
  async getAllApiKeys() {
    try {
      const apiKeys = await redis.getAllApiKeys();
      
      // 为每个key添加使用统计和当前并发数
      for (const key of apiKeys) {
        key.usage = await redis.getUsageStats(key.id);
        key.tokenLimit = parseInt(key.tokenLimit);
        key.concurrencyLimit = parseInt(key.concurrencyLimit || 0);
        key.rateLimitWindow = parseInt(key.rateLimitWindow || 0);
        key.rateLimitRequests = parseInt(key.rateLimitRequests || 0);
        key.currentConcurrency = await redis.getConcurrency(key.id);
        key.isActive = key.isActive === 'true';
        key.enableModelRestriction = key.enableModelRestriction === 'true';
        try {
          key.restrictedModels = key.restrictedModels ? JSON.parse(key.restrictedModels) : [];
        } catch (e) {
          key.restrictedModels = [];
        }
        delete key.apiKey; // 不返回哈希后的key
      }

      return apiKeys;
    } catch (error) {
      logger.error('❌ Failed to get API keys:', error);
      throw error;
    }
  }

  // 📝 更新API Key
  async updateApiKey(keyId, updates) {
    try {
      const keyData = await redis.getApiKey(keyId);
      if (!keyData || Object.keys(keyData).length === 0) {
        throw new Error('API key not found');
      }

      // 允许更新的字段
      const allowedUpdates = ['name', 'description', 'tokenLimit', 'concurrencyLimit', 'rateLimitWindow', 'rateLimitRequests', 'isActive', 'claudeAccountId', 'expiresAt', 'enableModelRestriction', 'restrictedModels'];
      const updatedData = { ...keyData };

      for (const [field, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(field)) {
          if (field === 'restrictedModels') {
            // 特殊处理 restrictedModels 数组
            updatedData[field] = JSON.stringify(value || []);
          } else if (field === 'enableModelRestriction') {
            // 布尔值转字符串
            updatedData[field] = String(value);
          } else {
            updatedData[field] = (value != null ? value : '').toString();
          }
        }
      }

      updatedData.updatedAt = new Date().toISOString();
      
      // 更新时不需要重新建立哈希映射，因为API Key本身没有变化
      await redis.setApiKey(keyId, updatedData);
      
      logger.success(`📝 Updated API key: ${keyId}`);
      
      return { success: true };
    } catch (error) {
      logger.error('❌ Failed to update API key:', error);
      throw error;
    }
  }

  // 🗑️ 删除API Key
  async deleteApiKey(keyId) {
    try {
      const result = await redis.deleteApiKey(keyId);
      
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

  // 📊 记录使用情况（支持缓存token）
  async recordUsage(keyId, inputTokens = 0, outputTokens = 0, cacheCreateTokens = 0, cacheReadTokens = 0, model = 'unknown') {
    try {
      const totalTokens = inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens;
      await redis.incrementTokenUsage(keyId, totalTokens, inputTokens, outputTokens, cacheCreateTokens, cacheReadTokens, model);
      
      // 更新最后使用时间（性能优化：只在实际使用时更新）
      const keyData = await redis.getApiKey(keyId);
      if (keyData && Object.keys(keyData).length > 0) {
        keyData.lastUsedAt = new Date().toISOString();
        // 使用记录时不需要重新建立哈希映射
        await redis.setApiKey(keyId, keyData);
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

  // 🔐 生成密钥
  _generateSecretKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  // 🔒 哈希API Key
  _hashApiKey(apiKey) {
    return crypto.createHash('sha256').update(apiKey + config.security.encryptionKey).digest('hex');
  }

  // 📈 获取使用统计
  async getUsageStats(keyId) {
    return await redis.getUsageStats(keyId);
  }


  // 🧹 清理过期的API Keys
  async cleanupExpiredKeys() {
    try {
      const apiKeys = await redis.getAllApiKeys();
      const now = new Date();
      let cleanedCount = 0;

      for (const key of apiKeys) {
        if (key.expiresAt && new Date(key.expiresAt) < now) {
          await redis.deleteApiKey(key.id);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.success(`🧹 Cleaned up ${cleanedCount} expired API keys`);
      }

      return cleanedCount;
    } catch (error) {
      logger.error('❌ Failed to cleanup expired keys:', error);
      return 0;
    }
  }
}

module.exports = new ApiKeyService();
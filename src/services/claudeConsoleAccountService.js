const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const redis = require('../models/redis');
const logger = require('../utils/logger');
const config = require('../../config/config');

class ClaudeConsoleAccountService {
  constructor() {
    // 加密相关常量
    this.ENCRYPTION_ALGORITHM = 'aes-256-cbc';
    this.ENCRYPTION_SALT = 'claude-console-salt';
    
    // Redis键前缀
    this.ACCOUNT_KEY_PREFIX = 'claude_console_account:';
    this.SHARED_ACCOUNTS_KEY = 'shared_claude_console_accounts';
  }

  // 🏢 创建Claude Console账户
  async createAccount(options = {}) {
    const {
      name = 'Claude Console Account',
      description = '',
      apiUrl = '',
      apiKey = '',
      priority = 50, // 默认优先级50（1-100）
      supportedModels = [], // 支持的模型列表或映射表，空数组/对象表示支持所有
      userAgent = 'claude-cli/1.0.61 (console, cli)',
      rateLimitDuration = 60, // 限流时间（分钟）
      proxy = null,
      isActive = true,
      accountType = 'shared', // 'dedicated' or 'shared'
      schedulable = true // 是否可被调度
    } = options;

    // 验证必填字段
    if (!apiUrl || !apiKey) {
      throw new Error('API URL and API Key are required for Claude Console account');
    }

    const accountId = uuidv4();
    
    // 处理 supportedModels，确保向后兼容
    const processedModels = this._processModelMapping(supportedModels);
    
    const accountData = {
      id: accountId,
      platform: 'claude-console',
      name,
      description,
      apiUrl: apiUrl,
      apiKey: this._encryptSensitiveData(apiKey),
      priority: priority.toString(),
      supportedModels: JSON.stringify(processedModels),
      userAgent,
      rateLimitDuration: rateLimitDuration.toString(),
      proxy: proxy ? JSON.stringify(proxy) : '',
      isActive: isActive.toString(),
      accountType,
      createdAt: new Date().toISOString(),
      lastUsedAt: '',
      status: 'active',
      errorMessage: '',
      // 限流相关
      rateLimitedAt: '',
      rateLimitStatus: '',
      // 调度控制
      schedulable: schedulable.toString()
    };

    const client = redis.getClientSafe();
    logger.debug(`[DEBUG] Saving account data to Redis with key: ${this.ACCOUNT_KEY_PREFIX}${accountId}`);
    logger.debug(`[DEBUG] Account data to save: ${JSON.stringify(accountData, null, 2)}`);
    
    await client.hset(
      `${this.ACCOUNT_KEY_PREFIX}${accountId}`,
      accountData
    );
    
    // 如果是共享账户，添加到共享账户集合
    if (accountType === 'shared') {
      await client.sadd(this.SHARED_ACCOUNTS_KEY, accountId);
    }
    
    logger.success(`🏢 Created Claude Console account: ${name} (${accountId})`);
    
    return {
      id: accountId,
      name,
      description,
      apiUrl,
      priority,
      supportedModels,
      userAgent,
      rateLimitDuration,
      isActive,
      proxy,
      accountType,
      status: 'active',
      createdAt: accountData.createdAt
    };
  }

  // 📋 获取所有Claude Console账户
  async getAllAccounts() {
    try {
      const client = redis.getClientSafe();
      const keys = await client.keys(`${this.ACCOUNT_KEY_PREFIX}*`);
      const accounts = [];
      
      for (const key of keys) {
        const accountData = await client.hgetall(key);
        if (accountData && Object.keys(accountData).length > 0) {
          // 获取限流状态信息
          const rateLimitInfo = this._getRateLimitInfo(accountData);
          
          accounts.push({
            id: accountData.id,
            platform: accountData.platform,
            name: accountData.name,
            description: accountData.description,
            apiUrl: accountData.apiUrl,
            priority: parseInt(accountData.priority) || 50,
            supportedModels: JSON.parse(accountData.supportedModels || '[]'),
            userAgent: accountData.userAgent,
            rateLimitDuration: parseInt(accountData.rateLimitDuration) || 60,
            isActive: accountData.isActive === 'true',
            proxy: accountData.proxy ? JSON.parse(accountData.proxy) : null,
            accountType: accountData.accountType || 'shared',
            status: accountData.status,
            errorMessage: accountData.errorMessage,
            createdAt: accountData.createdAt,
            lastUsedAt: accountData.lastUsedAt,
            rateLimitStatus: rateLimitInfo,
            schedulable: accountData.schedulable !== 'false' // 默认为true，只有明确设置为false才不可调度
          });
        }
      }
      
      return accounts;
    } catch (error) {
      logger.error('❌ Failed to get Claude Console accounts:', error);
      throw error;
    }
  }

  // 🔍 获取单个账户（内部使用，包含敏感信息）
  async getAccount(accountId) {
    const client = redis.getClientSafe();
    logger.debug(`[DEBUG] Getting account data for ID: ${accountId}`);
    const accountData = await client.hgetall(`${this.ACCOUNT_KEY_PREFIX}${accountId}`);
    
    if (!accountData || Object.keys(accountData).length === 0) {
      logger.debug(`[DEBUG] No account data found for ID: ${accountId}`);
      return null;
    }
    
    logger.debug(`[DEBUG] Raw account data keys: ${Object.keys(accountData).join(', ')}`);
    logger.debug(`[DEBUG] Raw supportedModels value: ${accountData.supportedModels}`);
    
    // 解密敏感字段（只解密apiKey，apiUrl不加密）
    const decryptedKey = this._decryptSensitiveData(accountData.apiKey);
    logger.debug(`[DEBUG] URL exists: ${!!accountData.apiUrl}, Decrypted key exists: ${!!decryptedKey}`);
    
    accountData.apiKey = decryptedKey;
    
    // 解析JSON字段
    const parsedModels = JSON.parse(accountData.supportedModels || '[]');
    logger.debug(`[DEBUG] Parsed supportedModels: ${JSON.stringify(parsedModels)}`);
    
    accountData.supportedModels = parsedModels;
    accountData.priority = parseInt(accountData.priority) || 50;
    accountData.rateLimitDuration = parseInt(accountData.rateLimitDuration) || 60;
    accountData.isActive = accountData.isActive === 'true';
    accountData.schedulable = accountData.schedulable !== 'false'; // 默认为true
    
    if (accountData.proxy) {
      accountData.proxy = JSON.parse(accountData.proxy);
    }
    
    logger.debug(`[DEBUG] Final account data - name: ${accountData.name}, hasApiUrl: ${!!accountData.apiUrl}, hasApiKey: ${!!accountData.apiKey}, supportedModels: ${JSON.stringify(accountData.supportedModels)}`);
    
    return accountData;
  }

  // 📝 更新账户
  async updateAccount(accountId, updates) {
    try {
      const existingAccount = await this.getAccount(accountId);
      if (!existingAccount) {
        throw new Error('Account not found');
      }

      const client = redis.getClientSafe();
      const updatedData = {};

      // 处理各个字段的更新
      logger.debug(`[DEBUG] Update request received with fields: ${Object.keys(updates).join(', ')}`);
      logger.debug(`[DEBUG] Updates content: ${JSON.stringify(updates, null, 2)}`);
      
      if (updates.name !== undefined) updatedData.name = updates.name;
      if (updates.description !== undefined) updatedData.description = updates.description;
      if (updates.apiUrl !== undefined) {
        logger.debug(`[DEBUG] Updating apiUrl from frontend: ${updates.apiUrl}`);
        updatedData.apiUrl = updates.apiUrl;
      }
      if (updates.apiKey !== undefined) {
        logger.debug(`[DEBUG] Updating apiKey (length: ${updates.apiKey?.length})`);
        updatedData.apiKey = this._encryptSensitiveData(updates.apiKey);
      }
      if (updates.priority !== undefined) updatedData.priority = updates.priority.toString();
      if (updates.supportedModels !== undefined) {
        logger.debug(`[DEBUG] Updating supportedModels: ${JSON.stringify(updates.supportedModels)}`);
        // 处理 supportedModels，确保向后兼容
        const processedModels = this._processModelMapping(updates.supportedModels);
        updatedData.supportedModels = JSON.stringify(processedModels);
      }
      if (updates.userAgent !== undefined) updatedData.userAgent = updates.userAgent;
      if (updates.rateLimitDuration !== undefined) updatedData.rateLimitDuration = updates.rateLimitDuration.toString();
      if (updates.proxy !== undefined) updatedData.proxy = updates.proxy ? JSON.stringify(updates.proxy) : '';
      if (updates.isActive !== undefined) updatedData.isActive = updates.isActive.toString();
      if (updates.schedulable !== undefined) updatedData.schedulable = updates.schedulable.toString();

      // 处理账户类型变更
      if (updates.accountType && updates.accountType !== existingAccount.accountType) {
        updatedData.accountType = updates.accountType;
        
        if (updates.accountType === 'shared') {
          await client.sadd(this.SHARED_ACCOUNTS_KEY, accountId);
        } else {
          await client.srem(this.SHARED_ACCOUNTS_KEY, accountId);
        }
      }

      updatedData.updatedAt = new Date().toISOString();
      
      logger.debug(`[DEBUG] Final updatedData to save: ${JSON.stringify(updatedData, null, 2)}`);
      logger.debug(`[DEBUG] Updating Redis key: ${this.ACCOUNT_KEY_PREFIX}${accountId}`);
      
      await client.hset(
        `${this.ACCOUNT_KEY_PREFIX}${accountId}`,
        updatedData
      );
      
      logger.success(`📝 Updated Claude Console account: ${accountId}`);
      
      return { success: true };
    } catch (error) {
      logger.error('❌ Failed to update Claude Console account:', error);
      throw error;
    }
  }

  // 🗑️ 删除账户
  async deleteAccount(accountId) {
    try {
      const client = redis.getClientSafe();
      const account = await this.getAccount(accountId);
      
      if (!account) {
        throw new Error('Account not found');
      }
      
      // 从Redis删除
      await client.del(`${this.ACCOUNT_KEY_PREFIX}${accountId}`);
      
      // 从共享账户集合中移除
      if (account.accountType === 'shared') {
        await client.srem(this.SHARED_ACCOUNTS_KEY, accountId);
      }
      
      logger.success(`🗑️ Deleted Claude Console account: ${accountId}`);
      
      return { success: true };
    } catch (error) {
      logger.error('❌ Failed to delete Claude Console account:', error);
      throw error;
    }
  }


  // 🚫 标记账号为限流状态
  async markAccountRateLimited(accountId) {
    try {
      const client = redis.getClientSafe();
      const account = await this.getAccount(accountId);
      
      if (!account) {
        throw new Error('Account not found');
      }

      const updates = {
        rateLimitedAt: new Date().toISOString(),
        rateLimitStatus: 'limited'
      };

      await client.hset(
        `${this.ACCOUNT_KEY_PREFIX}${accountId}`,
        updates
      );

      logger.warn(`🚫 Claude Console account marked as rate limited: ${account.name} (${accountId})`);
      return { success: true };
    } catch (error) {
      logger.error(`❌ Failed to mark Claude Console account as rate limited: ${accountId}`, error);
      throw error;
    }
  }

  // ✅ 移除账号的限流状态
  async removeAccountRateLimit(accountId) {
    try {
      const client = redis.getClientSafe();
      
      await client.hdel(
        `${this.ACCOUNT_KEY_PREFIX}${accountId}`,
        'rateLimitedAt',
        'rateLimitStatus'
      );

      logger.success(`✅ Rate limit removed for Claude Console account: ${accountId}`);
      return { success: true };
    } catch (error) {
      logger.error(`❌ Failed to remove rate limit for Claude Console account: ${accountId}`, error);
      throw error;
    }
  }

  // 🔍 检查账号是否处于限流状态
  async isAccountRateLimited(accountId) {
    try {
      const account = await this.getAccount(accountId);
      if (!account) {
        return false;
      }

      if (account.rateLimitStatus === 'limited' && account.rateLimitedAt) {
        const rateLimitedAt = new Date(account.rateLimitedAt);
        const now = new Date();
        const minutesSinceRateLimit = (now - rateLimitedAt) / (1000 * 60);

        // 使用账户配置的限流时间
        const rateLimitDuration = account.rateLimitDuration || 60;
        
        if (minutesSinceRateLimit >= rateLimitDuration) {
          await this.removeAccountRateLimit(accountId);
          return false;
        }

        return true;
      }

      return false;
    } catch (error) {
      logger.error(`❌ Failed to check rate limit status for Claude Console account: ${accountId}`, error);
      return false;
    }
  }

  // 🚫 标记账号为封锁状态（模型不支持等原因）
  async blockAccount(accountId, reason) {
    try {
      const client = redis.getClientSafe();
      
      const updates = {
        status: 'blocked',
        errorMessage: reason,
        blockedAt: new Date().toISOString()
      };

      await client.hset(
        `${this.ACCOUNT_KEY_PREFIX}${accountId}`,
        updates
      );

      logger.warn(`🚫 Claude Console account blocked: ${accountId} - ${reason}`);
      return { success: true };
    } catch (error) {
      logger.error(`❌ Failed to block Claude Console account: ${accountId}`, error);
      throw error;
    }
  }

  // 🌐 创建代理agent
  _createProxyAgent(proxyConfig) {
    if (!proxyConfig) {
      return null;
    }

    try {
      const proxy = typeof proxyConfig === 'string' ? JSON.parse(proxyConfig) : proxyConfig;
      
      if (proxy.type === 'socks5') {
        const auth = proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : '';
        const socksUrl = `socks5://${auth}${proxy.host}:${proxy.port}`;
        return new SocksProxyAgent(socksUrl);
      } else if (proxy.type === 'http' || proxy.type === 'https') {
        const auth = proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : '';
        const httpUrl = `${proxy.type}://${auth}${proxy.host}:${proxy.port}`;
        return new HttpsProxyAgent(httpUrl);
      }
    } catch (error) {
      logger.warn('⚠️ Invalid proxy configuration:', error);
    }

    return null;
  }

  // 🔐 加密敏感数据
  _encryptSensitiveData(data) {
    if (!data) return '';
    
    try {
      const key = this._generateEncryptionKey();
      const iv = crypto.randomBytes(16);
      
      const cipher = crypto.createCipheriv(this.ENCRYPTION_ALGORITHM, key, iv);
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      return iv.toString('hex') + ':' + encrypted;
    } catch (error) {
      logger.error('❌ Encryption error:', error);
      return data;
    }
  }

  // 🔓 解密敏感数据
  _decryptSensitiveData(encryptedData) {
    if (!encryptedData) return '';
    
    try {
      if (encryptedData.includes(':')) {
        const parts = encryptedData.split(':');
        if (parts.length === 2) {
          const key = this._generateEncryptionKey();
          const iv = Buffer.from(parts[0], 'hex');
          const encrypted = parts[1];
          
          const decipher = crypto.createDecipheriv(this.ENCRYPTION_ALGORITHM, key, iv);
          let decrypted = decipher.update(encrypted, 'hex', 'utf8');
          decrypted += decipher.final('utf8');
          return decrypted;
        }
      }
      
      return encryptedData;
    } catch (error) {
      logger.error('❌ Decryption error:', error);
      return encryptedData;
    }
  }

  // 🔑 生成加密密钥
  _generateEncryptionKey() {
    return crypto.scryptSync(config.security.encryptionKey, this.ENCRYPTION_SALT, 32);
  }

  // 🎭 掩码API URL
  _maskApiUrl(apiUrl) {
    if (!apiUrl) return '';
    
    try {
      const url = new URL(apiUrl);
      return `${url.protocol}//${url.hostname}/***`;
    } catch {
      return '***';
    }
  }

  // 📊 获取限流信息
  _getRateLimitInfo(accountData) {
    if (accountData.rateLimitStatus === 'limited' && accountData.rateLimitedAt) {
      const rateLimitedAt = new Date(accountData.rateLimitedAt);
      const now = new Date();
      const minutesSinceRateLimit = Math.floor((now - rateLimitedAt) / (1000 * 60));
      const rateLimitDuration = parseInt(accountData.rateLimitDuration) || 60;
      const minutesRemaining = Math.max(0, rateLimitDuration - minutesSinceRateLimit);

      return {
        isRateLimited: minutesRemaining > 0,
        rateLimitedAt: accountData.rateLimitedAt,
        minutesSinceRateLimit,
        minutesRemaining
      };
    }

    return {
      isRateLimited: false,
      rateLimitedAt: null,
      minutesSinceRateLimit: 0,
      minutesRemaining: 0
    };
  }

  // 🔄 处理模型映射，确保向后兼容
  _processModelMapping(supportedModels) {
    // 如果是空值，返回空对象（支持所有模型）
    if (!supportedModels || (Array.isArray(supportedModels) && supportedModels.length === 0)) {
      return {};
    }

    // 如果已经是对象格式（新的映射表格式），直接返回
    if (typeof supportedModels === 'object' && !Array.isArray(supportedModels)) {
      return supportedModels;
    }

    // 如果是数组格式（旧格式），转换为映射表
    if (Array.isArray(supportedModels)) {
      const mapping = {};
      supportedModels.forEach(model => {
        if (model && typeof model === 'string') {
          mapping[model] = model; // 映射到自身
        }
      });
      return mapping;
    }

    // 其他情况返回空对象
    return {};
  }

  // 🔍 检查模型是否支持（用于调度）
  isModelSupported(modelMapping, requestedModel) {
    // 如果映射表为空，支持所有模型
    if (!modelMapping || Object.keys(modelMapping).length === 0) {
      return true;
    }

    // 检查请求的模型是否在映射表的键中
    return Object.prototype.hasOwnProperty.call(modelMapping, requestedModel);
  }

  // 🔄 获取映射后的模型名称
  getMappedModel(modelMapping, requestedModel) {
    // 如果映射表为空，返回原模型
    if (!modelMapping || Object.keys(modelMapping).length === 0) {
      return requestedModel;
    }

    // 返回映射后的模型，如果不存在则返回原模型
    return modelMapping[requestedModel] || requestedModel;
  }
}

module.exports = new ClaudeConsoleAccountService();
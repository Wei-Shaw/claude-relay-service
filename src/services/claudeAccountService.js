const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');
const redis = require('../models/redis');
const logger = require('../utils/logger');
const config = require('../../config/config');

class ClaudeAccountService {
  constructor() {
    this.claudeApiUrl = 'https://console.anthropic.com/v1/oauth/token';
    this.claudeOauthClientId = '9d1c250a-e61b-44d9-88ed-5944d1962f5e';
    
    // 加密相关常量
    this.ENCRYPTION_ALGORITHM = 'aes-256-cbc';
    this.ENCRYPTION_SALT = 'salt';
  }

  // 🏢 创建Claude账户
  async createAccount(options = {}) {
    const {
      name = 'Unnamed Account',
      description = '',
      email = '',
      password = '',
      refreshToken = '',
      claudeAiOauth = null, // Claude标准格式的OAuth数据
      proxy = null, // { type: 'socks5', host: 'localhost', port: 1080, username: '', password: '' }
      isActive = true,
      accountType = 'shared' // 'dedicated' or 'shared'
    } = options;

    const accountId = uuidv4();
    
    let accountData;
    
    if (claudeAiOauth) {
      // 使用Claude标准格式的OAuth数据
      accountData = {
        id: accountId,
        name,
        description,
        email: this._encryptSensitiveData(email),
        password: this._encryptSensitiveData(password),
        claudeAiOauth: this._encryptSensitiveData(JSON.stringify(claudeAiOauth)),
        accessToken: this._encryptSensitiveData(claudeAiOauth.accessToken),
        refreshToken: this._encryptSensitiveData(claudeAiOauth.refreshToken),
        expiresAt: claudeAiOauth.expiresAt.toString(),
        scopes: claudeAiOauth.scopes.join(' '),
        proxy: proxy ? JSON.stringify(proxy) : '',
        isActive: isActive.toString(),
        accountType: accountType, // 账号类型：'dedicated' 或 'shared'
        createdAt: new Date().toISOString(),
        lastUsedAt: '',
        lastRefreshAt: '',
        status: 'active', // 有OAuth数据的账户直接设为active
        errorMessage: ''
      };
    } else {
      // 兼容旧格式
      accountData = {
        id: accountId,
        name,
        description,
        email: this._encryptSensitiveData(email),
        password: this._encryptSensitiveData(password),
        refreshToken: this._encryptSensitiveData(refreshToken),
        accessToken: '',
        expiresAt: '',
        scopes: '',
        proxy: proxy ? JSON.stringify(proxy) : '',
        isActive: isActive.toString(),
        accountType: accountType, // 账号类型：'dedicated' 或 'shared'
        createdAt: new Date().toISOString(),
        lastUsedAt: '',
        lastRefreshAt: '',
        status: 'created', // created, active, expired, error
        errorMessage: ''
      };
    }

    await redis.setClaudeAccount(accountId, accountData);
    
    logger.success(`🏢 Created Claude account: ${name} (${accountId})`);
    
    return {
      id: accountId,
      name,
      description,
      email,
      isActive,
      proxy,
      accountType,
      status: accountData.status,
      createdAt: accountData.createdAt,
      expiresAt: accountData.expiresAt,
      scopes: claudeAiOauth ? claudeAiOauth.scopes : []
    };
  }

  // 🔄 刷新Claude账户token
  async refreshAccountToken(accountId) {
    try {
      const accountData = await redis.getClaudeAccount(accountId);
      
      if (!accountData || Object.keys(accountData).length === 0) {
        throw new Error('Account not found');
      }

      const refreshToken = this._decryptSensitiveData(accountData.refreshToken);
      
      if (!refreshToken) {
        throw new Error('No refresh token available - manual token update required');
      }

      // 创建代理agent
      const agent = this._createProxyAgent(accountData.proxy);

      const response = await axios.post(this.claudeApiUrl, {
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: this.claudeOauthClientId
      }, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'User-Agent': 'claude-cli/1.0.53 (external, cli)',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://claude.ai/',
          'Origin': 'https://claude.ai'
        },
        httpsAgent: agent,
        timeout: 30000
      });

      if (response.status === 200) {
        const { access_token, refresh_token, expires_in } = response.data;
        
        // 更新账户数据
        accountData.accessToken = this._encryptSensitiveData(access_token);
        accountData.refreshToken = this._encryptSensitiveData(refresh_token);
        accountData.expiresAt = (Date.now() + (expires_in * 1000)).toString();
        accountData.lastRefreshAt = new Date().toISOString();
        accountData.status = 'active';
        accountData.errorMessage = '';

        await redis.setClaudeAccount(accountId, accountData);
        
        logger.success(`🔄 Refreshed token for account: ${accountData.name} (${accountId})`);
        
        return {
          success: true,
          accessToken: access_token,
          expiresAt: accountData.expiresAt
        };
      } else {
        throw new Error(`Token refresh failed with status: ${response.status}`);
      }
    } catch (error) {
      logger.error(`❌ Failed to refresh token for account ${accountId}:`, error);
      
      // 更新错误状态
      const accountData = await redis.getClaudeAccount(accountId);
      if (accountData) {
        accountData.status = 'error';
        accountData.errorMessage = error.message;
        await redis.setClaudeAccount(accountId, accountData);
      }
      
      throw error;
    }
  }

  // 🎯 获取有效的访问token
  async getValidAccessToken(accountId) {
    try {
      const accountData = await redis.getClaudeAccount(accountId);
      
      if (!accountData || Object.keys(accountData).length === 0) {
        throw new Error('Account not found');
      }

      if (accountData.isActive !== 'true') {
        throw new Error('Account is disabled');
      }

      // 检查token是否过期
      const expiresAt = parseInt(accountData.expiresAt);
      const now = Date.now();
      
      if (!expiresAt || now >= (expiresAt - 60000)) { // 60秒提前刷新
        logger.info(`🔄 Token expired/expiring for account ${accountId}, attempting refresh...`);
        try {
          const refreshResult = await this.refreshAccountToken(accountId);
          return refreshResult.accessToken;
        } catch (refreshError) {
          logger.warn(`⚠️ Token refresh failed for account ${accountId}: ${refreshError.message}`);
          // 如果刷新失败，仍然尝试使用当前token（可能是手动添加的长期有效token）
          const currentToken = this._decryptSensitiveData(accountData.accessToken);
          if (currentToken) {
            logger.info(`🔄 Using current token for account ${accountId} (refresh failed)`);
            return currentToken;
          }
          throw refreshError;
        }
      }

      const accessToken = this._decryptSensitiveData(accountData.accessToken);
      
      if (!accessToken) {
        throw new Error('No access token available');
      }

      // 更新最后使用时间
      accountData.lastUsedAt = new Date().toISOString();
      await redis.setClaudeAccount(accountId, accountData);

      return accessToken;
    } catch (error) {
      logger.error(`❌ Failed to get valid access token for account ${accountId}:`, error);
      throw error;
    }
  }

  // 📋 获取所有Claude账户
  async getAllAccounts() {
    try {
      const accounts = await redis.getAllClaudeAccounts();
      
      // 处理返回数据，移除敏感信息
      return accounts.map(account => ({
        id: account.id,
        name: account.name,
        description: account.description,
        email: account.email ? this._maskEmail(this._decryptSensitiveData(account.email)) : '',
        isActive: account.isActive === 'true',
        proxy: account.proxy ? JSON.parse(account.proxy) : null,
        status: account.status,
        errorMessage: account.errorMessage,
        accountType: account.accountType || 'shared', // 兼容旧数据，默认为共享
        createdAt: account.createdAt,
        lastUsedAt: account.lastUsedAt,
        lastRefreshAt: account.lastRefreshAt,
        expiresAt: account.expiresAt
      }));
    } catch (error) {
      logger.error('❌ Failed to get Claude accounts:', error);
      throw error;
    }
  }

  // 📝 更新Claude账户
  async updateAccount(accountId, updates) {
    try {
      const accountData = await redis.getClaudeAccount(accountId);
      
      if (!accountData || Object.keys(accountData).length === 0) {
        throw new Error('Account not found');
      }

      const allowedUpdates = ['name', 'description', 'email', 'password', 'refreshToken', 'proxy', 'isActive', 'claudeAiOauth', 'accountType'];
      const updatedData = { ...accountData };

      for (const [field, value] of Object.entries(updates)) {
        if (allowedUpdates.includes(field)) {
          if (['email', 'password', 'refreshToken'].includes(field)) {
            updatedData[field] = this._encryptSensitiveData(value);
          } else if (field === 'proxy') {
            updatedData[field] = value ? JSON.stringify(value) : '';
          } else if (field === 'claudeAiOauth') {
            // 更新 Claude AI OAuth 数据
            if (value) {
              updatedData.claudeAiOauth = this._encryptSensitiveData(JSON.stringify(value));
              updatedData.accessToken = this._encryptSensitiveData(value.accessToken);
              updatedData.refreshToken = this._encryptSensitiveData(value.refreshToken);
              updatedData.expiresAt = value.expiresAt.toString();
              updatedData.scopes = value.scopes.join(' ');
              updatedData.status = 'active';
              updatedData.errorMessage = '';
              updatedData.lastRefreshAt = new Date().toISOString();
            }
          } else {
            updatedData[field] = value.toString();
          }
        }
      }

      updatedData.updatedAt = new Date().toISOString();
      
      await redis.setClaudeAccount(accountId, updatedData);
      
      logger.success(`📝 Updated Claude account: ${accountId}`);
      
      return { success: true };
    } catch (error) {
      logger.error('❌ Failed to update Claude account:', error);
      throw error;
    }
  }

  // 🗑️ 删除Claude账户
  async deleteAccount(accountId) {
    try {
      const result = await redis.deleteClaudeAccount(accountId);
      
      if (result === 0) {
        throw new Error('Account not found');
      }
      
      logger.success(`🗑️ Deleted Claude account: ${accountId}`);
      
      return { success: true };
    } catch (error) {
      logger.error('❌ Failed to delete Claude account:', error);
      throw error;
    }
  }

  // 🎯 智能选择可用账户（支持sticky会话）
  async selectAvailableAccount(sessionHash = null) {
    try {
      const accounts = await redis.getAllClaudeAccounts();
      
      const activeAccounts = accounts.filter(account => 
        account.isActive === 'true' && 
        account.status !== 'error'
      );

      if (activeAccounts.length === 0) {
        throw new Error('No active Claude accounts available');
      }

      // 如果有会话哈希，检查是否有已映射的账户
      if (sessionHash) {
        const mappedAccountId = await redis.getSessionAccountMapping(sessionHash);
        if (mappedAccountId) {
          // 验证映射的账户是否仍然可用
          const mappedAccount = activeAccounts.find(acc => acc.id === mappedAccountId);
          if (mappedAccount) {
            logger.info(`🎯 Using sticky session account: ${mappedAccount.name} (${mappedAccountId}) for session ${sessionHash}`);
            return mappedAccountId;
          } else {
            logger.warn(`⚠️ Mapped account ${mappedAccountId} is no longer available, selecting new account`);
            // 清理无效的映射
            await redis.deleteSessionAccountMapping(sessionHash);
          }
        }
      }

      // 如果没有映射或映射无效，选择新账户
      // 优先选择最近刷新过token的账户
      const sortedAccounts = activeAccounts.sort((a, b) => {
        const aLastRefresh = new Date(a.lastRefreshAt || 0).getTime();
        const bLastRefresh = new Date(b.lastRefreshAt || 0).getTime();
        return bLastRefresh - aLastRefresh;
      });

      const selectedAccountId = sortedAccounts[0].id;
      
      // 如果有会话哈希，建立新的映射
      if (sessionHash) {
        await redis.setSessionAccountMapping(sessionHash, selectedAccountId, 3600); // 1小时过期
        logger.info(`🎯 Created new sticky session mapping: ${sortedAccounts[0].name} (${selectedAccountId}) for session ${sessionHash}`);
      }

      return selectedAccountId;
    } catch (error) {
      logger.error('❌ Failed to select available account:', error);
      throw error;
    }
  }

  // 🎯 基于API Key选择账户（支持专属绑定和共享池）
  async selectAccountForApiKey(apiKeyData, sessionHash = null) {
    try {
      // 如果API Key绑定了专属账户，优先使用
      if (apiKeyData.claudeAccountId) {
        const boundAccount = await redis.getClaudeAccount(apiKeyData.claudeAccountId);
        if (boundAccount && boundAccount.isActive === 'true' && boundAccount.status !== 'error') {
          logger.info(`🎯 Using bound dedicated account: ${boundAccount.name} (${apiKeyData.claudeAccountId}) for API key ${apiKeyData.name}`);
          return apiKeyData.claudeAccountId;
        } else {
          logger.warn(`⚠️ Bound account ${apiKeyData.claudeAccountId} is not available, falling back to shared pool`);
        }
      }

      // 如果没有绑定账户或绑定账户不可用，从共享池选择
      const accounts = await redis.getAllClaudeAccounts();
      
      const sharedAccounts = accounts.filter(account => 
        account.isActive === 'true' && 
        account.status !== 'error' &&
        (account.accountType === 'shared' || !account.accountType) // 兼容旧数据
      );

      if (sharedAccounts.length === 0) {
        throw new Error('No active shared Claude accounts available');
      }

      // 如果有会话哈希，检查是否有已映射的账户
      if (sessionHash) {
        const mappedAccountId = await redis.getSessionAccountMapping(sessionHash);
        if (mappedAccountId) {
          // 验证映射的账户是否仍然在共享池中且可用
          const mappedAccount = sharedAccounts.find(acc => acc.id === mappedAccountId);
          if (mappedAccount) {
            logger.info(`🎯 Using sticky session shared account: ${mappedAccount.name} (${mappedAccountId}) for session ${sessionHash}`);
            return mappedAccountId;
          } else {
            logger.warn(`⚠️ Mapped shared account ${mappedAccountId} is no longer available, selecting new account`);
            // 清理无效的映射
            await redis.deleteSessionAccountMapping(sessionHash);
          }
        }
      }

      // 从共享池选择账户（负载均衡）
      const sortedAccounts = sharedAccounts.sort((a, b) => {
        const aLastRefresh = new Date(a.lastRefreshAt || 0).getTime();
        const bLastRefresh = new Date(b.lastRefreshAt || 0).getTime();
        return bLastRefresh - aLastRefresh;
      });
      const selectedAccountId = sortedAccounts[0].id;
      
      // 如果有会话哈希，建立新的映射
      if (sessionHash) {
        await redis.setSessionAccountMapping(sessionHash, selectedAccountId, 3600); // 1小时过期
        logger.info(`🎯 Created new sticky session mapping for shared account: ${sortedAccounts[0].name} (${selectedAccountId}) for session ${sessionHash}`);
      }

      logger.info(`🎯 Selected shared account: ${sortedAccounts[0].name} (${selectedAccountId}) for API key ${apiKeyData.name}`);
      return selectedAccountId;
    } catch (error) {
      logger.error('❌ Failed to select account for API key:', error);
      throw error;
    }
  }

  // 🌐 创建代理agent
  _createProxyAgent(proxyConfig) {
    if (!proxyConfig) {
      return null;
    }

    try {
      const proxy = JSON.parse(proxyConfig);
      
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
      
      // 将IV和加密数据一起返回，用:分隔
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
      // 检查是否是新格式（包含IV）
      if (encryptedData.includes(':')) {
        // 新格式：iv:encryptedData
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
      
      // 旧格式或格式错误，尝试旧方式解密（向后兼容）
      // 注意：在新版本Node.js中这将失败，但我们会捕获错误
      try {
        const decipher = crypto.createDecipher('aes-256-cbc', config.security.encryptionKey);
        let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
      } catch (oldError) {
        // 如果旧方式也失败，返回原数据
        logger.warn('⚠️ Could not decrypt data, returning as-is:', oldError.message);
        return encryptedData;
      }
    } catch (error) {
      logger.error('❌ Decryption error:', error);
      return encryptedData;
    }
  }

  // 🔑 生成加密密钥（辅助方法）
  _generateEncryptionKey() {
    return crypto.scryptSync(config.security.encryptionKey, this.ENCRYPTION_SALT, 32);
  }

  // 🎭 掩码邮箱地址
  _maskEmail(email) {
    if (!email || !email.includes('@')) return email;
    
    const [username, domain] = email.split('@');
    const maskedUsername = username.length > 2 
      ? `${username.slice(0, 2)}***${username.slice(-1)}`
      : `${username.slice(0, 1)}***`;
    
    return `${maskedUsername}@${domain}`;
  }

  // 🧹 清理错误账户
  async cleanupErrorAccounts() {
    try {
      const accounts = await redis.getAllClaudeAccounts();
      let cleanedCount = 0;

      for (const account of accounts) {
        if (account.status === 'error' && account.lastRefreshAt) {
          const lastRefresh = new Date(account.lastRefreshAt);
          const now = new Date();
          const hoursSinceLastRefresh = (now - lastRefresh) / (1000 * 60 * 60);

          // 如果错误状态超过24小时，尝试重新激活
          if (hoursSinceLastRefresh > 24) {
            account.status = 'created';
            account.errorMessage = '';
            await redis.setClaudeAccount(account.id, account);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        logger.success(`🧹 Reset ${cleanedCount} error accounts`);
      }

      return cleanedCount;
    } catch (error) {
      logger.error('❌ Failed to cleanup error accounts:', error);
      return 0;
    }
  }
}

module.exports = new ClaudeAccountService();
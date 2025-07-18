/**
 * Claude 账户服务 - Vercel 适配版本
 * 管理 Claude 账户和 OAuth Token
 */

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');
const axios = require('axios');
const kv = require('../database/kv');
const logger = require('../utils/logger');
const config = require('../config');

class ClaudeAccountService {
  constructor() {
    this.claudeApiUrl = config.oauth.tokenUrl;
    this.claudeOauthClientId = config.oauth.clientId;
    
    // 加密相关常量
    this.ENCRYPTION_ALGORITHM = 'aes-256-cbc';
    this.ENCRYPTION_SALT = 'salt';
  }

  // 创建Claude账户
  async createAccount(options = {}) {
    const {
      name = 'Unnamed Account',
      description = '',
      email = '',
      password = '',
      refreshToken = '',
      claudeAiOauth = null,
      proxy = null,
      isActive = true,
      accountType = 'shared'
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
        accountType: accountType,
        createdAt: new Date().toISOString(),
        lastUsedAt: '',
        lastRefreshAt: '',
        status: 'active',
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
        accountType: accountType,
        createdAt: new Date().toISOString(),
        lastUsedAt: '',
        lastRefreshAt: '',
        status: 'created',
        errorMessage: ''
      };
    }

    await kv.setClaudeAccount(accountId, accountData);
    
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

  // 刷新Claude账户token
  async refreshAccountToken(accountId) {
    try {
      const accountData = await kv.getClaudeAccount(accountId);
      
      if (!accountData) {
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

        await kv.setClaudeAccount(accountId, accountData);
        
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
      const accountData = await kv.getClaudeAccount(accountId);
      if (accountData) {
        accountData.status = 'error';
        accountData.errorMessage = error.message;
        await kv.setClaudeAccount(accountId, accountData);
      }
      
      throw error;
    }
  }

  // 获取有效的访问token
  async getValidAccessToken(accountId) {
    try {
      const accountData = await kv.getClaudeAccount(accountId);
      
      if (!accountData) {
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
          // 如果刷新失败，仍然尝试使用当前token
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
      await kv.setClaudeAccount(accountId, accountData);

      return accessToken;
    } catch (error) {
      logger.error(`❌ Failed to get valid access token for account ${accountId}:`, error);
      throw error;
    }
  }

  // 获取所有Claude账户
  async getAllAccounts() {
    try {
      const accounts = await kv.getAllClaudeAccounts();
      
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
        accountType: account.accountType || 'shared',
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

  // 智能选择可用账户
  async selectAvailableAccount(sessionHash = null) {
    try {
      const accounts = await kv.getAllClaudeAccounts();
      
      const activeAccounts = accounts.filter(account => 
        account.isActive === 'true' && 
        account.status !== 'error'
      );

      if (activeAccounts.length === 0) {
        throw new Error('No active Claude accounts available');
      }

      // 如果有会话哈希，检查是否有已映射的账户
      if (sessionHash) {
        const mappedAccountId = await kv.getSessionAccountMapping(sessionHash);
        if (mappedAccountId) {
          const mappedAccount = activeAccounts.find(acc => acc.id === mappedAccountId);
          if (mappedAccount) {
            logger.info(`🎯 Using sticky session account: ${mappedAccount.name} (${mappedAccountId})`);
            return mappedAccountId;
          } else {
            logger.warn(`⚠️ Mapped account ${mappedAccountId} is no longer available`);
            await kv.deleteSessionAccountMapping(sessionHash);
          }
        }
      }

      // 选择最近刷新过token的账户
      const sortedAccounts = activeAccounts.sort((a, b) => {
        const aLastRefresh = new Date(a.lastRefreshAt || 0).getTime();
        const bLastRefresh = new Date(b.lastRefreshAt || 0).getTime();
        return bLastRefresh - aLastRefresh;
      });

      const selectedAccountId = sortedAccounts[0].id;
      
      // 如果有会话哈希，建立新的映射
      if (sessionHash) {
        await kv.setSessionAccountMapping(sessionHash, selectedAccountId, 3600);
        logger.info(`🎯 Created new sticky session mapping: ${sortedAccounts[0].name} (${selectedAccountId})`);
      }

      return selectedAccountId;
    } catch (error) {
      logger.error('❌ Failed to select available account:', error);
      throw error;
    }
  }

  // 基于API Key选择账户
  async selectAccountForApiKey(apiKeyData, sessionHash = null) {
    try {
      // 如果API Key绑定了专属账户，优先使用
      if (apiKeyData.claudeAccountId) {
        const boundAccount = await kv.getClaudeAccount(apiKeyData.claudeAccountId);
        if (boundAccount && boundAccount.isActive === 'true' && boundAccount.status !== 'error') {
          logger.info(`🎯 Using bound dedicated account: ${boundAccount.name} (${apiKeyData.claudeAccountId})`);
          return apiKeyData.claudeAccountId;
        } else {
          logger.warn(`⚠️ Bound account ${apiKeyData.claudeAccountId} is not available, falling back to shared pool`);
        }
      }

      // 从共享池选择
      const accounts = await kv.getAllClaudeAccounts();
      
      const sharedAccounts = accounts.filter(account => 
        account.isActive === 'true' && 
        account.status !== 'error' &&
        (account.accountType === 'shared' || !account.accountType)
      );

      if (sharedAccounts.length === 0) {
        throw new Error('No active shared Claude accounts available');
      }

      // 会话映射逻辑
      if (sessionHash) {
        const mappedAccountId = await kv.getSessionAccountMapping(sessionHash);
        if (mappedAccountId) {
          const mappedAccount = sharedAccounts.find(acc => acc.id === mappedAccountId);
          if (mappedAccount) {
            logger.info(`🎯 Using sticky session shared account: ${mappedAccount.name} (${mappedAccountId})`);
            return mappedAccountId;
          } else {
            await kv.deleteSessionAccountMapping(sessionHash);
          }
        }
      }

      // 负载均衡选择
      const sortedAccounts = sharedAccounts.sort((a, b) => {
        const aLastRefresh = new Date(a.lastRefreshAt || 0).getTime();
        const bLastRefresh = new Date(b.lastRefreshAt || 0).getTime();
        return bLastRefresh - aLastRefresh;
      });
      
      const selectedAccountId = sortedAccounts[0].id;
      
      if (sessionHash) {
        await kv.setSessionAccountMapping(sessionHash, selectedAccountId, 3600);
        logger.info(`🎯 Created new sticky session mapping: ${sortedAccounts[0].name} (${selectedAccountId})`);
      }

      return selectedAccountId;
    } catch (error) {
      logger.error('❌ Failed to select account for API key:', error);
      throw error;
    }
  }

  // 创建代理agent
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

  // 加密敏感数据
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

  // 解密敏感数据
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

  // 生成加密密钥
  _generateEncryptionKey() {
    return crypto.scryptSync(config.security.encryptionKey, this.ENCRYPTION_SALT, 32);
  }

  // 掩码邮箱地址
  _maskEmail(email) {
    if (!email || !email.includes('@')) return email;
    
    const [username, domain] = email.split('@');
    const maskedUsername = username.length > 2 
      ? `${username.slice(0, 2)}***${username.slice(-1)}`
      : `${username.slice(0, 1)}***`;
    
    return `${maskedUsername}@${domain}`;
  }
}

module.exports = new ClaudeAccountService();
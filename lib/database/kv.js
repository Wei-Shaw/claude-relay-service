/**
 * Vercel KV 数据库适配器
 * 兼容原有的 Redis 接口
 */

const { kv } = require('@vercel/kv');

class VercelKVAdapter {
  constructor() {
    this.client = kv;
  }

  async connect() {
    // Vercel KV 不需要显式连接
    return true;
  }

  async disconnect() {
    // Vercel KV 不需要显式断开连接
    return true;
  }

  get isConnected() {
    return true;
  }

  getClient() {
    return this.client;
  }

  // API Key 管理
  async setApiKey(keyId, keyData, hashedKey) {
    const pipeline = [];
    
    // 存储完整的 API Key 数据
    pipeline.push(this.client.set(`api_key:${keyId}`, JSON.stringify(keyData)));
    
    // 建立哈希映射用于快速查找
    if (hashedKey) {
      pipeline.push(this.client.set(`api_key_hash:${hashedKey}`, keyId));
    }
    
    await Promise.all(pipeline);
  }

  async getApiKey(keyId) {
    const data = await this.client.get(`api_key:${keyId}`);
    return data ? JSON.parse(data) : null;
  }

  async findApiKeyByHash(hashedKey) {
    const keyId = await this.client.get(`api_key_hash:${hashedKey}`);
    if (!keyId) return null;
    
    const data = await this.client.get(`api_key:${keyId}`);
    return data ? JSON.parse(data) : null;
  }

  async getAllApiKeys() {
    const keys = await this.client.keys('api_key:*');
    const apiKeys = [];
    
    for (const key of keys) {
      if (key.startsWith('api_key:') && !key.includes('hash:')) {
        const data = await this.client.get(key);
        if (data) {
          apiKeys.push(JSON.parse(data));
        }
      }
    }
    
    return apiKeys;
  }

  async deleteApiKey(keyId) {
    const keyData = await this.getApiKey(keyId);
    if (!keyData) return 0;
    
    const pipeline = [];
    pipeline.push(this.client.del(`api_key:${keyId}`));
    
    // 删除哈希映射
    if (keyData.apiKey) {
      pipeline.push(this.client.del(`api_key_hash:${keyData.apiKey}`));
    }
    
    await Promise.all(pipeline);
    return 1;
  }

  // Claude 账户管理
  async setClaudeAccount(accountId, accountData) {
    await this.client.set(`claude_account:${accountId}`, JSON.stringify(accountData));
  }

  async getClaudeAccount(accountId) {
    const data = await this.client.get(`claude_account:${accountId}`);
    return data ? JSON.parse(data) : null;
  }

  async getAllClaudeAccounts() {
    const keys = await this.client.keys('claude_account:*');
    const accounts = [];
    
    for (const key of keys) {
      const data = await this.client.get(key);
      if (data) {
        accounts.push(JSON.parse(data));
      }
    }
    
    return accounts;
  }

  async deleteClaudeAccount(accountId) {
    const exists = await this.client.exists(`claude_account:${accountId}`);
    if (!exists) return 0;
    
    await this.client.del(`claude_account:${accountId}`);
    return 1;
  }

  // OAuth 会话管理
  async setOAuthSession(sessionId, sessionData) {
    await this.client.set(`oauth_session:${sessionId}`, JSON.stringify(sessionData), {
      ex: 600 // 10 分钟过期
    });
  }

  async getOAuthSession(sessionId) {
    const data = await this.client.get(`oauth_session:${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteOAuthSession(sessionId) {
    await this.client.del(`oauth_session:${sessionId}`);
  }

  // 会话管理
  async setSession(key, data, ttl = 86400) {
    await this.client.set(`session:${key}`, JSON.stringify(data), {
      ex: ttl
    });
  }

  async getSession(key) {
    const data = await this.client.get(`session:${key}`);
    return data ? JSON.parse(data) : null;
  }

  async deleteSession(key) {
    await this.client.del(`session:${key}`);
  }

  // Sticky Session 映射
  async setSessionAccountMapping(sessionHash, accountId, ttl = 3600) {
    await this.client.set(`session_account:${sessionHash}`, accountId, {
      ex: ttl
    });
  }

  async getSessionAccountMapping(sessionHash) {
    return await this.client.get(`session_account:${sessionHash}`);
  }

  async deleteSessionAccountMapping(sessionHash) {
    await this.client.del(`session_account:${sessionHash}`);
  }

  // 使用统计
  async incrementTokenUsage(keyId, totalTokens, inputTokens = 0, outputTokens = 0, cacheCreateTokens = 0, cacheReadTokens = 0, model = 'unknown') {
    const today = new Date().toISOString().split('T')[0];
    const usageKey = `usage:daily:${today}:${keyId}:${model}`;
    
    const pipeline = [];
    pipeline.push(this.client.hincrby(usageKey, 'total_tokens', totalTokens));
    pipeline.push(this.client.hincrby(usageKey, 'input_tokens', inputTokens));
    pipeline.push(this.client.hincrby(usageKey, 'output_tokens', outputTokens));
    pipeline.push(this.client.hincrby(usageKey, 'cache_create_tokens', cacheCreateTokens));
    pipeline.push(this.client.hincrby(usageKey, 'cache_read_tokens', cacheReadTokens));
    pipeline.push(this.client.hincrby(usageKey, 'requests', 1));
    pipeline.push(this.client.expire(usageKey, 2592000)); // 30 天过期
    
    await Promise.all(pipeline);
  }

  async getUsageStats(keyId) {
    const today = new Date().toISOString().split('T')[0];
    const keys = await this.client.keys(`usage:daily:${today}:${keyId}:*`);
    
    let totalStats = {
      total: { tokens: 0, requests: 0, input_tokens: 0, output_tokens: 0, cache_create_tokens: 0, cache_read_tokens: 0 },
      models: {}
    };
    
    for (const key of keys) {
      const stats = await this.client.hgetall(key);
      if (stats) {
        const model = key.split(':').pop();
        const modelStats = {
          tokens: parseInt(stats.total_tokens || 0),
          requests: parseInt(stats.requests || 0),
          input_tokens: parseInt(stats.input_tokens || 0),
          output_tokens: parseInt(stats.output_tokens || 0),
          cache_create_tokens: parseInt(stats.cache_create_tokens || 0),
          cache_read_tokens: parseInt(stats.cache_read_tokens || 0)
        };
        
        totalStats.models[model] = modelStats;
        totalStats.total.tokens += modelStats.tokens;
        totalStats.total.requests += modelStats.requests;
        totalStats.total.input_tokens += modelStats.input_tokens;
        totalStats.total.output_tokens += modelStats.output_tokens;
        totalStats.total.cache_create_tokens += modelStats.cache_create_tokens;
        totalStats.total.cache_read_tokens += modelStats.cache_read_tokens;
      }
    }
    
    return totalStats;
  }

  // 并发控制
  async getConcurrency(keyId) {
    const count = await this.client.get(`concurrency:${keyId}`);
    return parseInt(count || 0);
  }

  async incrementConcurrency(keyId) {
    return await this.client.incr(`concurrency:${keyId}`);
  }

  async decrementConcurrency(keyId) {
    return await this.client.decr(`concurrency:${keyId}`);
  }

  // 系统统计
  async getSystemStats() {
    const stats = {
      totalApiKeys: 0,
      totalClaudeAccounts: 0,
      totalUsage: { tokens: 0, requests: 0 },
      timestamp: new Date().toISOString()
    };
    
    try {
      const apiKeyKeys = await this.client.keys('api_key:*');
      stats.totalApiKeys = apiKeyKeys.filter(key => !key.includes('hash:')).length;
      
      const accountKeys = await this.client.keys('claude_account:*');
      stats.totalClaudeAccounts = accountKeys.length;
      
      const usageKeys = await this.client.keys('usage:daily:*');
      for (const key of usageKeys) {
        const usage = await this.client.hgetall(key);
        if (usage) {
          stats.totalUsage.tokens += parseInt(usage.total_tokens || 0);
          stats.totalUsage.requests += parseInt(usage.requests || 0);
        }
      }
    } catch (error) {
      console.error('获取系统统计失败:', error);
    }
    
    return stats;
  }

  // 清理过期数据
  async cleanup() {
    // Vercel KV 会自动处理过期数据
    return true;
  }
}

module.exports = new VercelKVAdapter();
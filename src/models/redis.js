const Redis = require('ioredis');
const config = require('../../config/config');
const logger = require('../utils/logger');

// 时区辅助函数
// 注意：这个函数的目的是获取某个时间点在目标时区的"本地"表示
// 例如：UTC时间 2025-07-30 01:00:00 在 UTC+8 时区表示为 2025-07-30 09:00:00
function getDateInTimezone(date = new Date()) {
  const offset = config.system.timezoneOffset || 8; // 默认UTC+8
  
  // 方法：创建一个偏移后的Date对象，使其getUTCXXX方法返回目标时区的值
  // 这样我们可以用getUTCFullYear()等方法获取目标时区的年月日时分秒
  const offsetMs = offset * 3600000; // 时区偏移的毫秒数
  const adjustedTime = new Date(date.getTime() + offsetMs);
  
  return adjustedTime;
}

// 获取配置时区的日期字符串 (YYYY-MM-DD)
function getDateStringInTimezone(date = new Date()) {
  const tzDate = getDateInTimezone(date);
  // 使用UTC方法获取偏移后的日期部分
  return `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}-${String(tzDate.getUTCDate()).padStart(2, '0')}`;
}

// 获取配置时区的小时 (0-23)
function getHourInTimezone(date = new Date()) {
  const tzDate = getDateInTimezone(date);
  return tzDate.getUTCHours();
}

class RedisClient {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      this.client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        db: config.redis.db,
        retryDelayOnFailover: config.redis.retryDelayOnFailover,
        maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
        lazyConnect: config.redis.lazyConnect,
        tls: config.redis.enableTLS ? {} : false
      });

      this.client.on('connect', () => {
        this.isConnected = true;
        logger.info('🔗 Redis connected successfully');
      });

      this.client.on('error', (err) => {
        this.isConnected = false;
        logger.error('❌ Redis connection error:', err);
      });

      this.client.on('close', () => {
        this.isConnected = false;
        logger.warn('⚠️  Redis connection closed');
      });

      await this.client.connect();
      return this.client;
    } catch (error) {
      logger.error('💥 Failed to connect to Redis:', error);
      throw error;
    }
  }

  async disconnect() {
    if (this.client) {
      await this.client.quit();
      this.isConnected = false;
      logger.info('👋 Redis disconnected');
    }
  }

  getClient() {
    if (!this.client || !this.isConnected) {
      logger.warn('⚠️ Redis client is not connected');
      return null;
    }
    return this.client;
  }

  // 安全获取客户端（用于关键操作）
  getClientSafe() {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client is not connected');
    }
    return this.client;
  }

  // 🔑 API Key 相关操作
  async setApiKey(keyId, keyData, hashedKey = null) {
    const key = `apikey:${keyId}`;
    const client = this.getClientSafe();

    // 维护哈希映射表（用于快速查找）
    // hashedKey参数是实际的哈希值，用于建立映射
    if (hashedKey) {
      await client.hset('apikey:hash_map', hashedKey, keyId);
    }

    await client.hset(key, keyData);
    await client.expire(key, 86400 * 365); // 1年过期
  }

  async getApiKey(keyId) {
    const key = `apikey:${keyId}`;
    return await this.client.hgetall(key);
  }

  async deleteApiKey(keyId) {
    const key = `apikey:${keyId}`;

    // 获取要删除的API Key哈希值，以便从映射表中移除
    const keyData = await this.client.hgetall(key);
    if (keyData && keyData.apiKey) {
      // keyData.apiKey现在存储的是哈希值，直接从映射表删除
      await this.client.hdel('apikey:hash_map', keyData.apiKey);
    }

    return await this.client.del(key);
  }

  async getAllApiKeys() {
    const keys = await this.client.keys('apikey:*');
    const apiKeys = [];
    for (const key of keys) {
      // 过滤掉hash_map，它不是真正的API Key
      if (key === 'apikey:hash_map') {
        continue;
      }

      const keyData = await this.client.hgetall(key);
      if (keyData && Object.keys(keyData).length > 0) {
        apiKeys.push({ id: key.replace('apikey:', ''), ...keyData });
      }
    }
    return apiKeys;
  }

  // 🔍 通过哈希值查找API Key（性能优化）
  async findApiKeyByHash(hashedKey) {
    // 使用反向映射表：hash -> keyId
    const keyId = await this.client.hget('apikey:hash_map', hashedKey);
    if (!keyId) {
      return null;
    }

    const keyData = await this.client.hgetall(`apikey:${keyId}`);
    if (keyData && Object.keys(keyData).length > 0) {
      return { id: keyId, ...keyData };
    }

    // 如果数据不存在，清理映射表
    await this.client.hdel('apikey:hash_map', hashedKey);
    return null;
  }

  // 📊 使用统计相关操作（支持缓存token统计和模型信息）
  async incrementTokenUsage(keyId, tokens, inputTokens = 0, outputTokens = 0, cacheCreateTokens = 0, cacheReadTokens = 0, model = 'unknown') {
    const key = `usage:${keyId}`;
    const now = new Date();
    const today = getDateStringInTimezone(now);
    const tzDate = getDateInTimezone(now);
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const currentHour = `${today}:${String(getHourInTimezone(now)).padStart(2, '0')}`; // 新增小时级别
    
    const daily = `usage:daily:${keyId}:${today}`;
    const monthly = `usage:monthly:${keyId}:${currentMonth}`;
    const hourly = `usage:hourly:${keyId}:${currentHour}`; // 新增小时级别key

    // 按模型统计的键
    const modelDaily = `usage:model:daily:${model}:${today}`;
    const modelMonthly = `usage:model:monthly:${model}:${currentMonth}`;
    const modelHourly = `usage:model:hourly:${model}:${currentHour}`; // 新增模型小时级别

    // API Key级别的模型统计
    const keyModelDaily = `usage:${keyId}:model:daily:${model}:${today}`;
    const keyModelMonthly = `usage:${keyId}:model:monthly:${model}:${currentMonth}`;
    const keyModelHourly = `usage:${keyId}:model:hourly:${model}:${currentHour}`; // 新增API Key模型小时级别

    // 新增：系统级分钟统计
    const minuteTimestamp = Math.floor(now.getTime() / 60000);
    const systemMinuteKey = `system:metrics:minute:${minuteTimestamp}`;

    // 智能处理输入输出token分配
    const finalInputTokens = inputTokens || 0;
    const finalOutputTokens = outputTokens || (finalInputTokens > 0 ? 0 : tokens);
    const finalCacheCreateTokens = cacheCreateTokens || 0;
    const finalCacheReadTokens = cacheReadTokens || 0;

    // 重新计算真实的总token数（包括缓存token）
    const totalTokens = finalInputTokens + finalOutputTokens + finalCacheCreateTokens + finalCacheReadTokens;
    // 核心token（不包括缓存）- 用于与历史数据兼容
    const coreTokens = finalInputTokens + finalOutputTokens;

    // 使用Pipeline优化性能
    const pipeline = this.client.pipeline();
    
    // 现有的统计保持不变
    // 核心token统计（保持向后兼容）
    pipeline.hincrby(key, 'totalTokens', coreTokens);
    pipeline.hincrby(key, 'totalInputTokens', finalInputTokens);
    pipeline.hincrby(key, 'totalOutputTokens', finalOutputTokens);
    // 缓存token统计（新增）
    pipeline.hincrby(key, 'totalCacheCreateTokens', finalCacheCreateTokens);
    pipeline.hincrby(key, 'totalCacheReadTokens', finalCacheReadTokens);
    pipeline.hincrby(key, 'totalAllTokens', totalTokens); // 包含所有类型的总token
    // 请求计数
    pipeline.hincrby(key, 'totalRequests', 1);
    
    // 每日统计
    pipeline.hincrby(daily, 'tokens', coreTokens);
    pipeline.hincrby(daily, 'inputTokens', finalInputTokens);
    pipeline.hincrby(daily, 'outputTokens', finalOutputTokens);
    pipeline.hincrby(daily, 'cacheCreateTokens', finalCacheCreateTokens);
    pipeline.hincrby(daily, 'cacheReadTokens', finalCacheReadTokens);
    pipeline.hincrby(daily, 'allTokens', totalTokens);
    pipeline.hincrby(daily, 'requests', 1);
    
    // 每月统计
    pipeline.hincrby(monthly, 'tokens', coreTokens);
    pipeline.hincrby(monthly, 'inputTokens', finalInputTokens);
    pipeline.hincrby(monthly, 'outputTokens', finalOutputTokens);
    pipeline.hincrby(monthly, 'cacheCreateTokens', finalCacheCreateTokens);
    pipeline.hincrby(monthly, 'cacheReadTokens', finalCacheReadTokens);
    pipeline.hincrby(monthly, 'allTokens', totalTokens);
    pipeline.hincrby(monthly, 'requests', 1);
    
    // 按模型统计 - 每日
    pipeline.hincrby(modelDaily, 'inputTokens', finalInputTokens);
    pipeline.hincrby(modelDaily, 'outputTokens', finalOutputTokens);
    pipeline.hincrby(modelDaily, 'cacheCreateTokens', finalCacheCreateTokens);
    pipeline.hincrby(modelDaily, 'cacheReadTokens', finalCacheReadTokens);
    pipeline.hincrby(modelDaily, 'allTokens', totalTokens);
    pipeline.hincrby(modelDaily, 'requests', 1);
    
    // 按模型统计 - 每月
    pipeline.hincrby(modelMonthly, 'inputTokens', finalInputTokens);
    pipeline.hincrby(modelMonthly, 'outputTokens', finalOutputTokens);
    pipeline.hincrby(modelMonthly, 'cacheCreateTokens', finalCacheCreateTokens);
    pipeline.hincrby(modelMonthly, 'cacheReadTokens', finalCacheReadTokens);
    pipeline.hincrby(modelMonthly, 'allTokens', totalTokens);
    pipeline.hincrby(modelMonthly, 'requests', 1);
    
    // API Key级别的模型统计 - 每日
    pipeline.hincrby(keyModelDaily, 'inputTokens', finalInputTokens);
    pipeline.hincrby(keyModelDaily, 'outputTokens', finalOutputTokens);
    pipeline.hincrby(keyModelDaily, 'cacheCreateTokens', finalCacheCreateTokens);
    pipeline.hincrby(keyModelDaily, 'cacheReadTokens', finalCacheReadTokens);
    pipeline.hincrby(keyModelDaily, 'allTokens', totalTokens);
    pipeline.hincrby(keyModelDaily, 'requests', 1);
    
    // API Key级别的模型统计 - 每月
    pipeline.hincrby(keyModelMonthly, 'inputTokens', finalInputTokens);
    pipeline.hincrby(keyModelMonthly, 'outputTokens', finalOutputTokens);
    pipeline.hincrby(keyModelMonthly, 'cacheCreateTokens', finalCacheCreateTokens);
    pipeline.hincrby(keyModelMonthly, 'cacheReadTokens', finalCacheReadTokens);
    pipeline.hincrby(keyModelMonthly, 'allTokens', totalTokens);
    pipeline.hincrby(keyModelMonthly, 'requests', 1);
    
    // 小时级别统计
    pipeline.hincrby(hourly, 'tokens', coreTokens);
    pipeline.hincrby(hourly, 'inputTokens', finalInputTokens);
    pipeline.hincrby(hourly, 'outputTokens', finalOutputTokens);
    pipeline.hincrby(hourly, 'cacheCreateTokens', finalCacheCreateTokens);
    pipeline.hincrby(hourly, 'cacheReadTokens', finalCacheReadTokens);
    pipeline.hincrby(hourly, 'allTokens', totalTokens);
    pipeline.hincrby(hourly, 'requests', 1);
    
    // 按模型统计 - 每小时
    pipeline.hincrby(modelHourly, 'inputTokens', finalInputTokens);
    pipeline.hincrby(modelHourly, 'outputTokens', finalOutputTokens);
    pipeline.hincrby(modelHourly, 'cacheCreateTokens', finalCacheCreateTokens);
    pipeline.hincrby(modelHourly, 'cacheReadTokens', finalCacheReadTokens);
    pipeline.hincrby(modelHourly, 'allTokens', totalTokens);
    pipeline.hincrby(modelHourly, 'requests', 1);
    
    // API Key级别的模型统计 - 每小时
    pipeline.hincrby(keyModelHourly, 'inputTokens', finalInputTokens);
    pipeline.hincrby(keyModelHourly, 'outputTokens', finalOutputTokens);
    pipeline.hincrby(keyModelHourly, 'cacheCreateTokens', finalCacheCreateTokens);
    pipeline.hincrby(keyModelHourly, 'cacheReadTokens', finalCacheReadTokens);
    pipeline.hincrby(keyModelHourly, 'allTokens', totalTokens);
    pipeline.hincrby(keyModelHourly, 'requests', 1);
    
    // 新增：系统级分钟统计
    pipeline.hincrby(systemMinuteKey, 'requests', 1);
    pipeline.hincrby(systemMinuteKey, 'totalTokens', totalTokens);
    pipeline.hincrby(systemMinuteKey, 'inputTokens', finalInputTokens);
    pipeline.hincrby(systemMinuteKey, 'outputTokens', finalOutputTokens);
    pipeline.hincrby(systemMinuteKey, 'cacheCreateTokens', finalCacheCreateTokens);
    pipeline.hincrby(systemMinuteKey, 'cacheReadTokens', finalCacheReadTokens);
    
    // 设置过期时间
    pipeline.expire(daily, 86400 * 32); // 32天过期
    pipeline.expire(monthly, 86400 * 365); // 1年过期
    pipeline.expire(hourly, 86400 * 7); // 小时统计7天过期
    pipeline.expire(modelDaily, 86400 * 32); // 模型每日统计32天过期
    pipeline.expire(modelMonthly, 86400 * 365); // 模型每月统计1年过期
    pipeline.expire(modelHourly, 86400 * 7); // 模型小时统计7天过期
    pipeline.expire(keyModelDaily, 86400 * 32); // API Key模型每日统计32天过期
    pipeline.expire(keyModelMonthly, 86400 * 365); // API Key模型每月统计1年过期
    pipeline.expire(keyModelHourly, 86400 * 7); // API Key模型小时统计7天过期
    
    // 系统级分钟统计的过期时间（窗口时间的2倍）
    const config = require('../../config/config');
    const metricsWindow = config.system.metricsWindow;
    pipeline.expire(systemMinuteKey, metricsWindow * 60 * 2);
    
    // 执行Pipeline
    await pipeline.exec();
  }

  // 📊 记录账户级别的使用统计
  async incrementAccountUsage(accountId, totalTokens, inputTokens = 0, outputTokens = 0, cacheCreateTokens = 0, cacheReadTokens = 0, model = 'unknown') {
    const now = new Date();
    const today = getDateStringInTimezone(now);
    const tzDate = getDateInTimezone(now);
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const currentHour = `${today}:${String(getHourInTimezone(now)).padStart(2, '0')}`;
    
    // 账户级别统计的键
    const accountKey = `account_usage:${accountId}`;
    const accountDaily = `account_usage:daily:${accountId}:${today}`;
    const accountMonthly = `account_usage:monthly:${accountId}:${currentMonth}`;
    const accountHourly = `account_usage:hourly:${accountId}:${currentHour}`;
    
    // 账户按模型统计的键
    const accountModelDaily = `account_usage:model:daily:${accountId}:${model}:${today}`;
    const accountModelMonthly = `account_usage:model:monthly:${accountId}:${model}:${currentMonth}`;
    const accountModelHourly = `account_usage:model:hourly:${accountId}:${model}:${currentHour}`;
    
    // 处理token分配
    const finalInputTokens = inputTokens || 0;
    const finalOutputTokens = outputTokens || 0;
    const finalCacheCreateTokens = cacheCreateTokens || 0;
    const finalCacheReadTokens = cacheReadTokens || 0;
    const actualTotalTokens = finalInputTokens + finalOutputTokens + finalCacheCreateTokens + finalCacheReadTokens;
    const coreTokens = finalInputTokens + finalOutputTokens;

    await Promise.all([
      // 账户总体统计
      this.client.hincrby(accountKey, 'totalTokens', coreTokens),
      this.client.hincrby(accountKey, 'totalInputTokens', finalInputTokens),
      this.client.hincrby(accountKey, 'totalOutputTokens', finalOutputTokens),
      this.client.hincrby(accountKey, 'totalCacheCreateTokens', finalCacheCreateTokens),
      this.client.hincrby(accountKey, 'totalCacheReadTokens', finalCacheReadTokens),
      this.client.hincrby(accountKey, 'totalAllTokens', actualTotalTokens),
      this.client.hincrby(accountKey, 'totalRequests', 1),
      
      // 账户每日统计
      this.client.hincrby(accountDaily, 'tokens', coreTokens),
      this.client.hincrby(accountDaily, 'inputTokens', finalInputTokens),
      this.client.hincrby(accountDaily, 'outputTokens', finalOutputTokens),
      this.client.hincrby(accountDaily, 'cacheCreateTokens', finalCacheCreateTokens),
      this.client.hincrby(accountDaily, 'cacheReadTokens', finalCacheReadTokens),
      this.client.hincrby(accountDaily, 'allTokens', actualTotalTokens),
      this.client.hincrby(accountDaily, 'requests', 1),
      
      // 账户每月统计
      this.client.hincrby(accountMonthly, 'tokens', coreTokens),
      this.client.hincrby(accountMonthly, 'inputTokens', finalInputTokens),
      this.client.hincrby(accountMonthly, 'outputTokens', finalOutputTokens),
      this.client.hincrby(accountMonthly, 'cacheCreateTokens', finalCacheCreateTokens),
      this.client.hincrby(accountMonthly, 'cacheReadTokens', finalCacheReadTokens),
      this.client.hincrby(accountMonthly, 'allTokens', actualTotalTokens),
      this.client.hincrby(accountMonthly, 'requests', 1),
      
      // 账户每小时统计
      this.client.hincrby(accountHourly, 'tokens', coreTokens),
      this.client.hincrby(accountHourly, 'inputTokens', finalInputTokens),
      this.client.hincrby(accountHourly, 'outputTokens', finalOutputTokens),
      this.client.hincrby(accountHourly, 'cacheCreateTokens', finalCacheCreateTokens),
      this.client.hincrby(accountHourly, 'cacheReadTokens', finalCacheReadTokens),
      this.client.hincrby(accountHourly, 'allTokens', actualTotalTokens),
      this.client.hincrby(accountHourly, 'requests', 1),
      
      // 账户按模型统计 - 每日
      this.client.hincrby(accountModelDaily, 'inputTokens', finalInputTokens),
      this.client.hincrby(accountModelDaily, 'outputTokens', finalOutputTokens),
      this.client.hincrby(accountModelDaily, 'cacheCreateTokens', finalCacheCreateTokens),
      this.client.hincrby(accountModelDaily, 'cacheReadTokens', finalCacheReadTokens),
      this.client.hincrby(accountModelDaily, 'allTokens', actualTotalTokens),
      this.client.hincrby(accountModelDaily, 'requests', 1),
      
      // 账户按模型统计 - 每月
      this.client.hincrby(accountModelMonthly, 'inputTokens', finalInputTokens),
      this.client.hincrby(accountModelMonthly, 'outputTokens', finalOutputTokens),
      this.client.hincrby(accountModelMonthly, 'cacheCreateTokens', finalCacheCreateTokens),
      this.client.hincrby(accountModelMonthly, 'cacheReadTokens', finalCacheReadTokens),
      this.client.hincrby(accountModelMonthly, 'allTokens', actualTotalTokens),
      this.client.hincrby(accountModelMonthly, 'requests', 1),
      
      // 账户按模型统计 - 每小时
      this.client.hincrby(accountModelHourly, 'inputTokens', finalInputTokens),
      this.client.hincrby(accountModelHourly, 'outputTokens', finalOutputTokens),
      this.client.hincrby(accountModelHourly, 'cacheCreateTokens', finalCacheCreateTokens),
      this.client.hincrby(accountModelHourly, 'cacheReadTokens', finalCacheReadTokens),
      this.client.hincrby(accountModelHourly, 'allTokens', actualTotalTokens),
      this.client.hincrby(accountModelHourly, 'requests', 1),
      
      // 设置过期时间
      this.client.expire(accountDaily, 86400 * 32), // 32天过期
      this.client.expire(accountMonthly, 86400 * 365), // 1年过期
      this.client.expire(accountHourly, 86400 * 7), // 7天过期
      this.client.expire(accountModelDaily, 86400 * 32), // 32天过期
      this.client.expire(accountModelMonthly, 86400 * 365), // 1年过期
      this.client.expire(accountModelHourly, 86400 * 7) // 7天过期
    ]);
  }

  async getUsageStats(keyId) {
    const totalKey = `usage:${keyId}`;
    const today = getDateStringInTimezone();
    const dailyKey = `usage:daily:${keyId}:${today}`;
    const tzDate = getDateInTimezone();
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const monthlyKey = `usage:monthly:${keyId}:${currentMonth}`;

    const [total, daily, monthly] = await Promise.all([
      this.client.hgetall(totalKey),
      this.client.hgetall(dailyKey),
      this.client.hgetall(monthlyKey)
    ]);

    // 获取API Key的创建时间来计算平均值
    const keyData = await this.client.hgetall(`apikey:${keyId}`);
    const createdAt = keyData.createdAt ? new Date(keyData.createdAt) : new Date();
    const now = new Date();
    const daysSinceCreated = Math.max(1, Math.ceil((now - createdAt) / (1000 * 60 * 60 * 24)));

    const totalTokens = parseInt(total.totalTokens) || 0;
    const totalRequests = parseInt(total.totalRequests) || 0;

    // 计算平均RPM (requests per minute) 和 TPM (tokens per minute)
    const totalMinutes = Math.max(1, daysSinceCreated * 24 * 60);
    const avgRPM = totalRequests / totalMinutes;
    const avgTPM = totalTokens / totalMinutes;

    // 处理旧数据兼容性（支持缓存token）
    const handleLegacyData = (data) => {
      // 优先使用total*字段（存储时使用的字段）
      const tokens = parseInt(data.totalTokens) || parseInt(data.tokens) || 0;
      const inputTokens = parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0;
      const outputTokens = parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0;
      const requests = parseInt(data.totalRequests) || parseInt(data.requests) || 0;

      // 新增缓存token字段
      const cacheCreateTokens = parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0;
      const cacheReadTokens = parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0;
      const allTokens = parseInt(data.totalAllTokens) || parseInt(data.allTokens) || 0;

      const totalFromSeparate = inputTokens + outputTokens;
      // 计算实际的总tokens（包含所有类型）
      const actualAllTokens = allTokens || (inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens);

      if (totalFromSeparate === 0 && tokens > 0) {
        // 旧数据：没有输入输出分离
        return {
          tokens: tokens, // 保持兼容性，但统一使用allTokens
          inputTokens: Math.round(tokens * 0.3), // 假设30%为输入
          outputTokens: Math.round(tokens * 0.7), // 假设70%为输出
          cacheCreateTokens: 0, // 旧数据没有缓存token
          cacheReadTokens: 0,
          allTokens: tokens, // 对于旧数据，allTokens等于tokens
          requests
        };
      } else {
        // 新数据或无数据 - 统一使用allTokens作为tokens的值
        return {
          tokens: actualAllTokens, // 统一使用allTokens作为总数
          inputTokens,
          outputTokens,
          cacheCreateTokens,
          cacheReadTokens,
          allTokens: actualAllTokens,
          requests
        };
      }
    };

    const totalData = handleLegacyData(total);
    const dailyData = handleLegacyData(daily);
    const monthlyData = handleLegacyData(monthly);

    return {
      total: totalData,
      daily: dailyData,
      monthly: monthlyData,
      averages: {
        rpm: Math.round(avgRPM * 100) / 100, // 保留2位小数
        tpm: Math.round(avgTPM * 100) / 100,
        dailyRequests: Math.round((totalRequests / daysSinceCreated) * 100) / 100,
        dailyTokens: Math.round((totalTokens / daysSinceCreated) * 100) / 100
      }
    };
  }

  // 💰 获取当日费用
  async getDailyCost(keyId) {
    const today = getDateStringInTimezone();
    const costKey = `usage:cost:daily:${keyId}:${today}`;
    const cost = await this.client.get(costKey);
    const result = parseFloat(cost || 0);
    logger.debug(`💰 Getting daily cost for ${keyId}, date: ${today}, key: ${costKey}, value: ${cost}, result: ${result}`);
    return result;
  }

  // 💰 增加当日费用
  async incrementDailyCost(keyId, amount) {
    const today = getDateStringInTimezone();
    const tzDate = getDateInTimezone();
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const currentHour = `${today}:${String(getHourInTimezone(new Date())).padStart(2, '0')}`;
    
    const dailyKey = `usage:cost:daily:${keyId}:${today}`;
    const monthlyKey = `usage:cost:monthly:${keyId}:${currentMonth}`;
    const hourlyKey = `usage:cost:hourly:${keyId}:${currentHour}`;
    const totalKey = `usage:cost:total:${keyId}`;
    
    logger.debug(`💰 Incrementing cost for ${keyId}, amount: $${amount}, date: ${today}, dailyKey: ${dailyKey}`);
    
    const results = await Promise.all([
      this.client.incrbyfloat(dailyKey, amount),
      this.client.incrbyfloat(monthlyKey, amount),
      this.client.incrbyfloat(hourlyKey, amount),
      this.client.incrbyfloat(totalKey, amount),
      // 设置过期时间
      this.client.expire(dailyKey, 86400 * 30), // 30天
      this.client.expire(monthlyKey, 86400 * 90), // 90天
      this.client.expire(hourlyKey, 86400 * 7) // 7天
    ]);
    
    logger.debug(`💰 Cost incremented successfully, new daily total: $${results[0]}`);
  }

  // 💰 获取费用统计
  async getCostStats(keyId) {
    const today = getDateStringInTimezone();
    const tzDate = getDateInTimezone();
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const currentHour = `${today}:${String(getHourInTimezone(new Date())).padStart(2, '0')}`;
    
    const [daily, monthly, hourly, total] = await Promise.all([
      this.client.get(`usage:cost:daily:${keyId}:${today}`),
      this.client.get(`usage:cost:monthly:${keyId}:${currentMonth}`),
      this.client.get(`usage:cost:hourly:${keyId}:${currentHour}`),
      this.client.get(`usage:cost:total:${keyId}`)
    ]);
    
    return {
      daily: parseFloat(daily || 0),
      monthly: parseFloat(monthly || 0),
      hourly: parseFloat(hourly || 0),
      total: parseFloat(total || 0)
    };
  }

  // 📊 获取账户使用统计
  async getAccountUsageStats(accountId) {
    const accountKey = `account_usage:${accountId}`;
    const today = getDateStringInTimezone();
    const accountDailyKey = `account_usage:daily:${accountId}:${today}`;
    const tzDate = getDateInTimezone();
    const currentMonth = `${tzDate.getUTCFullYear()}-${String(tzDate.getUTCMonth() + 1).padStart(2, '0')}`;
    const accountMonthlyKey = `account_usage:monthly:${accountId}:${currentMonth}`;

    const [total, daily, monthly] = await Promise.all([
      this.client.hgetall(accountKey),
      this.client.hgetall(accountDailyKey),
      this.client.hgetall(accountMonthlyKey)
    ]);

    // 获取账户创建时间来计算平均值
    const accountData = await this.client.hgetall(`claude_account:${accountId}`);
    const createdAt = accountData.createdAt ? new Date(accountData.createdAt) : new Date();
    const now = new Date();
    const daysSinceCreated = Math.max(1, Math.ceil((now - createdAt) / (1000 * 60 * 60 * 24)));

    const totalTokens = parseInt(total.totalTokens) || 0;
    const totalRequests = parseInt(total.totalRequests) || 0;

    // 计算平均RPM和TPM
    const totalMinutes = Math.max(1, daysSinceCreated * 24 * 60);
    const avgRPM = totalRequests / totalMinutes;
    const avgTPM = totalTokens / totalMinutes;

    // 处理账户统计数据
    const handleAccountData = (data) => {
      const tokens = parseInt(data.totalTokens) || parseInt(data.tokens) || 0;
      const inputTokens = parseInt(data.totalInputTokens) || parseInt(data.inputTokens) || 0;
      const outputTokens = parseInt(data.totalOutputTokens) || parseInt(data.outputTokens) || 0;
      const requests = parseInt(data.totalRequests) || parseInt(data.requests) || 0;
      const cacheCreateTokens = parseInt(data.totalCacheCreateTokens) || parseInt(data.cacheCreateTokens) || 0;
      const cacheReadTokens = parseInt(data.totalCacheReadTokens) || parseInt(data.cacheReadTokens) || 0;
      const allTokens = parseInt(data.totalAllTokens) || parseInt(data.allTokens) || 0;

      const actualAllTokens = allTokens || (inputTokens + outputTokens + cacheCreateTokens + cacheReadTokens);

      return {
        tokens: tokens,
        inputTokens: inputTokens,
        outputTokens: outputTokens,
        cacheCreateTokens: cacheCreateTokens,
        cacheReadTokens: cacheReadTokens,
        allTokens: actualAllTokens,
        requests: requests
      };
    };

    const totalData = handleAccountData(total);
    const dailyData = handleAccountData(daily);
    const monthlyData = handleAccountData(monthly);

    return {
      accountId: accountId,
      total: totalData,
      daily: dailyData,
      monthly: monthlyData,
      averages: {
        rpm: Math.round(avgRPM * 100) / 100,
        tpm: Math.round(avgTPM * 100) / 100,
        dailyRequests: Math.round((totalRequests / daysSinceCreated) * 100) / 100,
        dailyTokens: Math.round((totalTokens / daysSinceCreated) * 100) / 100
      }
    };
  }

  // 📈 获取所有账户的使用统计
  async getAllAccountsUsageStats() {
    try {
      // 获取所有Claude账户
      const accountKeys = await this.client.keys('claude_account:*');
      const accountStats = [];
      
      for (const accountKey of accountKeys) {
        const accountId = accountKey.replace('claude_account:', '');
        const accountData = await this.client.hgetall(accountKey);
        
        if (accountData.name) {
          const stats = await this.getAccountUsageStats(accountId);
          accountStats.push({
            id: accountId,
            name: accountData.name,
            email: accountData.email || '',
            status: accountData.status || 'unknown',
            isActive: accountData.isActive === 'true',
            ...stats
          });
        }
      }
      
      // 按当日token使用量排序
      accountStats.sort((a, b) => (b.daily.allTokens || 0) - (a.daily.allTokens || 0));
      
      return accountStats;
    } catch (error) {
      logger.error('❌ Failed to get all accounts usage stats:', error);
      return [];
    }
  }

  // 🧹 清空所有API Key的使用统计数据
  async resetAllUsageStats() {
    const client = this.getClientSafe();
    const stats = {
      deletedKeys: 0,
      deletedDailyKeys: 0,
      deletedMonthlyKeys: 0,
      resetApiKeys: 0
    };

    try {
      // 获取所有API Key ID
      const apiKeyIds = [];
      const apiKeyKeys = await client.keys('apikey:*');

      for (const key of apiKeyKeys) {
        if (key === 'apikey:hash_map') continue; // 跳过哈希映射表
        const keyId = key.replace('apikey:', '');
        apiKeyIds.push(keyId);
      }

      // 清空每个API Key的使用统计
      for (const keyId of apiKeyIds) {
        // 删除总体使用统计
        const usageKey = `usage:${keyId}`;
        const deleted = await client.del(usageKey);
        if (deleted > 0) {
          stats.deletedKeys++;
        }

        // 删除该API Key的每日统计（使用精确的keyId匹配）
        const dailyKeys = await client.keys(`usage:daily:${keyId}:*`);
        if (dailyKeys.length > 0) {
          await client.del(...dailyKeys);
          stats.deletedDailyKeys += dailyKeys.length;
        }

        // 删除该API Key的每月统计（使用精确的keyId匹配）
        const monthlyKeys = await client.keys(`usage:monthly:${keyId}:*`);
        if (monthlyKeys.length > 0) {
          await client.del(...monthlyKeys);
          stats.deletedMonthlyKeys += monthlyKeys.length;
        }

        // 重置API Key的lastUsedAt字段
        const keyData = await client.hgetall(`apikey:${keyId}`);
        if (keyData && Object.keys(keyData).length > 0) {
          keyData.lastUsedAt = '';
          await client.hset(`apikey:${keyId}`, keyData);
          stats.resetApiKeys++;
        }
      }

      // 额外清理：删除所有可能遗漏的usage相关键
      const allUsageKeys = await client.keys('usage:*');
      if (allUsageKeys.length > 0) {
        await client.del(...allUsageKeys);
        stats.deletedKeys += allUsageKeys.length;
      }

      return stats;
    } catch (error) {
      throw new Error(`Failed to reset usage stats: ${error.message}`);
    }
  }

  // 🏢 Claude 账户管理
  async setClaudeAccount(accountId, accountData) {
    const key = `claude:account:${accountId}`;
    await this.client.hset(key, accountData);
  }

  async getClaudeAccount(accountId) {
    const key = `claude:account:${accountId}`;
    return await this.client.hgetall(key);
  }

  async getAllClaudeAccounts() {
    const keys = await this.client.keys('claude:account:*');
    const accounts = [];
    for (const key of keys) {
      const accountData = await this.client.hgetall(key);
      if (accountData && Object.keys(accountData).length > 0) {
        accounts.push({ id: key.replace('claude:account:', ''), ...accountData });
      }
    }
    return accounts;
  }

  async deleteClaudeAccount(accountId) {
    const key = `claude:account:${accountId}`;
    return await this.client.del(key);
  }

  // 🔐 会话管理（用于管理员登录等）
  async setSession(sessionId, sessionData, ttl = 86400) {
    const key = `session:${sessionId}`;
    await this.client.hset(key, sessionData);
    await this.client.expire(key, ttl);
  }

  async getSession(sessionId) {
    const key = `session:${sessionId}`;
    return await this.client.hgetall(key);
  }

  async deleteSession(sessionId) {
    const key = `session:${sessionId}`;
    return await this.client.del(key);
  }

  // 🗝️ API Key哈希索引管理
  async setApiKeyHash(hashedKey, keyData, ttl = 0) {
    const key = `apikey_hash:${hashedKey}`;
    await this.client.hset(key, keyData);
    if (ttl > 0) {
      await this.client.expire(key, ttl);
    }
  }

  async getApiKeyHash(hashedKey) {
    const key = `apikey_hash:${hashedKey}`;
    return await this.client.hgetall(key);
  }

  async deleteApiKeyHash(hashedKey) {
    const key = `apikey_hash:${hashedKey}`;
    return await this.client.del(key);
  }

  // 🔗 OAuth会话管理
  async setOAuthSession(sessionId, sessionData, ttl = 600) { // 10分钟过期
    const key = `oauth:${sessionId}`;

    // 序列化复杂对象，特别是 proxy 配置
    const serializedData = {};
    for (const [dataKey, value] of Object.entries(sessionData)) {
      if (typeof value === 'object' && value !== null) {
        serializedData[dataKey] = JSON.stringify(value);
      } else {
        serializedData[dataKey] = value;
      }
    }

    await this.client.hset(key, serializedData);
    await this.client.expire(key, ttl);
  }

  async getOAuthSession(sessionId) {
    const key = `oauth:${sessionId}`;
    const data = await this.client.hgetall(key);

    // 反序列化 proxy 字段
    if (data.proxy) {
      try {
        data.proxy = JSON.parse(data.proxy);
      } catch (error) {
        // 如果解析失败，设置为 null
        data.proxy = null;
      }
    }

    return data;
  }

  async deleteOAuthSession(sessionId) {
    const key = `oauth:${sessionId}`;
    return await this.client.del(key);
  }


  // 📈 系统统计
  async getSystemStats() {
    const keys = await Promise.all([
      this.client.keys('apikey:*'),
      this.client.keys('claude:account:*'),
      this.client.keys('usage:*')
    ]);

    return {
      totalApiKeys: keys[0].length,
      totalClaudeAccounts: keys[1].length,
      totalUsageRecords: keys[2].length
    };
  }

  // 📊 获取今日系统统计
  async getTodayStats() {
    try {
      const today = getDateStringInTimezone();
      const dailyKeys = await this.client.keys(`usage:daily:*:${today}`);

      let totalRequestsToday = 0;
      let totalTokensToday = 0;
      let totalInputTokensToday = 0;
      let totalOutputTokensToday = 0;
      let totalCacheCreateTokensToday = 0;
      let totalCacheReadTokensToday = 0;

      // 批量获取所有今日数据，提高性能
      if (dailyKeys.length > 0) {
        const pipeline = this.client.pipeline();
        dailyKeys.forEach(key => pipeline.hgetall(key));
        const results = await pipeline.exec();

        for (const [error, dailyData] of results) {
          if (error || !dailyData) continue;

          totalRequestsToday += parseInt(dailyData.requests) || 0;
          const currentDayTokens = parseInt(dailyData.tokens) || 0;
          totalTokensToday += currentDayTokens;

          // 处理旧数据兼容性：如果有总token但没有输入输出分离，则使用总token作为输出token
          const inputTokens = parseInt(dailyData.inputTokens) || 0;
          const outputTokens = parseInt(dailyData.outputTokens) || 0;
          const cacheCreateTokens = parseInt(dailyData.cacheCreateTokens) || 0;
          const cacheReadTokens = parseInt(dailyData.cacheReadTokens) || 0;
          const totalTokensFromSeparate = inputTokens + outputTokens;

          if (totalTokensFromSeparate === 0 && currentDayTokens > 0) {
            // 旧数据：没有输入输出分离，假设70%为输出，30%为输入（基于一般对话比例）
            totalOutputTokensToday += Math.round(currentDayTokens * 0.7);
            totalInputTokensToday += Math.round(currentDayTokens * 0.3);
          } else {
            // 新数据：使用实际的输入输出分离
            totalInputTokensToday += inputTokens;
            totalOutputTokensToday += outputTokens;
          }

          // 添加cache token统计
          totalCacheCreateTokensToday += cacheCreateTokens;
          totalCacheReadTokensToday += cacheReadTokens;
        }
      }

      // 获取今日创建的API Key数量（批量优化）
      const allApiKeys = await this.client.keys('apikey:*');
      let apiKeysCreatedToday = 0;

      if (allApiKeys.length > 0) {
        const pipeline = this.client.pipeline();
        allApiKeys.forEach(key => pipeline.hget(key, 'createdAt'));
        const results = await pipeline.exec();

        for (const [error, createdAt] of results) {
          if (!error && createdAt && createdAt.startsWith(today)) {
            apiKeysCreatedToday++;
          }
        }
      }

      return {
        requestsToday: totalRequestsToday,
        tokensToday: totalTokensToday,
        inputTokensToday: totalInputTokensToday,
        outputTokensToday: totalOutputTokensToday,
        cacheCreateTokensToday: totalCacheCreateTokensToday,
        cacheReadTokensToday: totalCacheReadTokensToday,
        apiKeysCreatedToday
      };
    } catch (error) {
      console.error('Error getting today stats:', error);
      return {
        requestsToday: 0,
        tokensToday: 0,
        inputTokensToday: 0,
        outputTokensToday: 0,
        cacheCreateTokensToday: 0,
        cacheReadTokensToday: 0,
        apiKeysCreatedToday: 0
      };
    }
  }

  // 📈 获取系统总的平均RPM和TPM
  async getSystemAverages() {
    try {
      const allApiKeys = await this.client.keys('apikey:*');
      let totalRequests = 0;
      let totalTokens = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let oldestCreatedAt = new Date();

      // 批量获取所有usage数据和key数据，提高性能
      const usageKeys = allApiKeys.map(key => `usage:${key.replace('apikey:', '')}`);
      const pipeline = this.client.pipeline();

      // 添加所有usage查询
      usageKeys.forEach(key => pipeline.hgetall(key));
      // 添加所有key数据查询
      allApiKeys.forEach(key => pipeline.hgetall(key));

      const results = await pipeline.exec();
      const usageResults = results.slice(0, usageKeys.length);
      const keyResults = results.slice(usageKeys.length);

      for (let i = 0; i < allApiKeys.length; i++) {
        const totalData = usageResults[i][1] || {};
        const keyData = keyResults[i][1] || {};

        totalRequests += parseInt(totalData.totalRequests) || 0;
        totalTokens += parseInt(totalData.totalTokens) || 0;
        totalInputTokens += parseInt(totalData.totalInputTokens) || 0;
        totalOutputTokens += parseInt(totalData.totalOutputTokens) || 0;

        const createdAt = keyData.createdAt ? new Date(keyData.createdAt) : new Date();
        if (createdAt < oldestCreatedAt) {
          oldestCreatedAt = createdAt;
        }
      }

      const now = new Date();
      // 保持与个人API Key计算一致的算法：按天计算然后转换为分钟
      const daysSinceOldest = Math.max(1, Math.ceil((now - oldestCreatedAt) / (1000 * 60 * 60 * 24)));
      const totalMinutes = daysSinceOldest * 24 * 60;

      return {
        systemRPM: Math.round((totalRequests / totalMinutes) * 100) / 100,
        systemTPM: Math.round((totalTokens / totalMinutes) * 100) / 100,
        totalInputTokens,
        totalOutputTokens,
        totalTokens
      };
    } catch (error) {
      console.error('Error getting system averages:', error);
      return {
        systemRPM: 0,
        systemTPM: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalTokens: 0
      };
    }
  }

  // 📊 获取实时系统指标（基于滑动窗口）
  async getRealtimeSystemMetrics() {
    try {
      const config = require('../../config/config');
      const windowMinutes = config.system.metricsWindow || 5;
      
      const now = new Date();
      const currentMinute = Math.floor(now.getTime() / 60000);
      
      // 调试：打印当前时间和分钟时间戳
      logger.debug(`🔍 Realtime metrics - Current time: ${now.toISOString()}, Minute timestamp: ${currentMinute}`);
      
      // 使用Pipeline批量获取窗口内的所有分钟数据
      const pipeline = this.client.pipeline();
      const minuteKeys = [];
      for (let i = 0; i < windowMinutes; i++) {
        const minuteKey = `system:metrics:minute:${currentMinute - i}`;
        minuteKeys.push(minuteKey);
        pipeline.hgetall(minuteKey);
      }
      
      logger.debug(`🔍 Realtime metrics - Checking keys: ${minuteKeys.join(', ')}`);
      
      const results = await pipeline.exec();
      
      // 聚合计算
      let totalRequests = 0;
      let totalTokens = 0;
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalCacheCreateTokens = 0;
      let totalCacheReadTokens = 0;
      let validDataCount = 0;
      
      results.forEach(([err, data], index) => {
        if (!err && data && Object.keys(data).length > 0) {
          validDataCount++;
          totalRequests += parseInt(data.requests || 0);
          totalTokens += parseInt(data.totalTokens || 0);
          totalInputTokens += parseInt(data.inputTokens || 0);
          totalOutputTokens += parseInt(data.outputTokens || 0);
          totalCacheCreateTokens += parseInt(data.cacheCreateTokens || 0);
          totalCacheReadTokens += parseInt(data.cacheReadTokens || 0);
          
          logger.debug(`🔍 Realtime metrics - Key ${minuteKeys[index]} data:`, {
            requests: data.requests,
            totalTokens: data.totalTokens
          });
        }
      });
      
      logger.debug(`🔍 Realtime metrics - Valid data count: ${validDataCount}/${windowMinutes}, Total requests: ${totalRequests}, Total tokens: ${totalTokens}`);
      
      // 计算平均值（每分钟）
      const realtimeRPM = windowMinutes > 0 ? Math.round((totalRequests / windowMinutes) * 100) / 100 : 0;
      const realtimeTPM = windowMinutes > 0 ? Math.round((totalTokens / windowMinutes) * 100) / 100 : 0;
      
      const result = {
        realtimeRPM,
        realtimeTPM,
        windowMinutes,
        totalRequests,
        totalTokens,
        totalInputTokens,
        totalOutputTokens,
        totalCacheCreateTokens,
        totalCacheReadTokens
      };
      
      logger.debug(`🔍 Realtime metrics - Final result:`, result);
      
      return result;
    } catch (error) {
      console.error('Error getting realtime system metrics:', error);
      // 如果出错，返回历史平均值作为降级方案
      const historicalMetrics = await this.getSystemAverages();
      return {
        realtimeRPM: historicalMetrics.systemRPM,
        realtimeTPM: historicalMetrics.systemTPM,
        windowMinutes: 0, // 标识使用了历史数据
        totalRequests: 0,
        totalTokens: historicalMetrics.totalTokens,
        totalInputTokens: historicalMetrics.totalInputTokens,
        totalOutputTokens: historicalMetrics.totalOutputTokens,
        totalCacheCreateTokens: 0,
        totalCacheReadTokens: 0
      };
    }
  }

  // 🔗 会话sticky映射管理
  async setSessionAccountMapping(sessionHash, accountId, ttl = 3600) {
    const key = `sticky_session:${sessionHash}`;
    await this.client.set(key, accountId, 'EX', ttl);
  }

  async getSessionAccountMapping(sessionHash) {
    const key = `sticky_session:${sessionHash}`;
    return await this.client.get(key);
  }

  async deleteSessionAccountMapping(sessionHash) {
    const key = `sticky_session:${sessionHash}`;
    return await this.client.del(key);
  }

  // 🧹 清理过期数据
  async cleanup() {
    try {
      const patterns = [
        'usage:daily:*',
        'ratelimit:*',
        'session:*',
        'sticky_session:*',
        'oauth:*'
      ];

      for (const pattern of patterns) {
        const keys = await this.client.keys(pattern);
        const pipeline = this.client.pipeline();

        for (const key of keys) {
          const ttl = await this.client.ttl(key);
          if (ttl === -1) { // 没有设置过期时间的键
            if (key.startsWith('oauth:')) {
              pipeline.expire(key, 600); // OAuth会话设置10分钟过期
            } else {
              pipeline.expire(key, 86400); // 其他设置1天过期
            }
          }
        }

        await pipeline.exec();
      }

      logger.info('🧹 Redis cleanup completed');
    } catch (error) {
      logger.error('❌ Redis cleanup failed:', error);
    }
  }

  // 增加并发计数
  async incrConcurrency(apiKeyId) {
    try {
      const key = `concurrency:${apiKeyId}`;
      const count = await this.client.incr(key);
      
      // 设置过期时间为180秒（3分钟），防止计数器永远不清零
      // 正常情况下请求会在完成时主动减少计数，这只是一个安全保障
      // 180秒足够支持较长的流式请求
      await this.client.expire(key, 180);
      
      logger.database(`🔢 Incremented concurrency for key ${apiKeyId}: ${count}`);
      return count;
    } catch (error) {
      logger.error('❌ Failed to increment concurrency:', error);
      throw error;
    }
  }

  // 减少并发计数
  async decrConcurrency(apiKeyId) {
    try {
      const key = `concurrency:${apiKeyId}`;
      
      // 使用Lua脚本确保原子性操作，防止计数器变成负数
      const luaScript = `
        local key = KEYS[1]
        local current = tonumber(redis.call('get', key) or "0")
        
        if current <= 0 then
          redis.call('del', key)
          return 0
        else
          local new_value = redis.call('decr', key)
          if new_value <= 0 then
            redis.call('del', key)
            return 0
          else
            return new_value
          end
        end
      `;
      
      const count = await this.client.eval(luaScript, 1, key);
      logger.database(`🔢 Decremented concurrency for key ${apiKeyId}: ${count}`);
      return count;
    } catch (error) {
      logger.error('❌ Failed to decrement concurrency:', error);
      throw error;
    }
  }

  // 获取当前并发数
  async getConcurrency(apiKeyId) {
    try {
      const key = `concurrency:${apiKeyId}`;
      const count = await this.client.get(key);
      return parseInt(count || 0);
    } catch (error) {
      logger.error('❌ Failed to get concurrency:', error);
      return 0;
    }
  }
}

const redisClient = new RedisClient();

// 导出时区辅助函数
redisClient.getDateInTimezone = getDateInTimezone;
redisClient.getDateStringInTimezone = getDateStringInTimezone;
redisClient.getHourInTimezone = getHourInTimezone;

module.exports = redisClient;
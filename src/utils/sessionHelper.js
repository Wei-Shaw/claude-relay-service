const crypto = require('crypto');
const logger = require('./logger');

class SessionHelper {
  /**
   * 生成会话哈希，用于sticky会话保持
   * 基于Anthropic的prompt caching机制，优先使用cacheable内容
   * @param {Object} requestBody - 请求体
   * @returns {string|null} - 32字符的会话哈希，如果无法生成则返回null
   */
  generateSessionHash(requestBody) {
    if (!requestBody || typeof requestBody !== 'object') {
      return null;
    }

    let cacheableContent = '';
    const system = requestBody.system || '';
    const messages = requestBody.messages || [];

    // 1. 优先提取带有cache_control: {"type": "ephemeral"}的内容
    // 检查system中的cacheable内容
    if (Array.isArray(system)) {
      for (const part of system) {
        if (part && part.cache_control && part.cache_control.type === 'ephemeral') {
          cacheableContent += part.text || '';
        }
      }
    }

    // 检查messages中的cacheable内容
    for (const msg of messages) {
      const content = msg.content || '';
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part && part.cache_control && part.cache_control.type === 'ephemeral') {
            if (part.type === 'text') {
              cacheableContent += part.text || '';
            }
            // 其他类型（如image）不参与hash计算
          }
        }
      } else if (typeof content === 'string' && msg.cache_control && msg.cache_control.type === 'ephemeral') {
        // 罕见情况，但需要检查
        cacheableContent += content;
      }
    }

    // 2. 如果有cacheable内容，直接使用
    if (cacheableContent) {
      const hash = crypto.createHash('sha256').update(cacheableContent).digest('hex').substring(0, 32);
      logger.debug(`📋 Session hash generated from cacheable content: ${hash}`);
      return hash;
    }

    // 3. Fallback: 使用system内容
    if (system) {
      let systemText = '';
      if (typeof system === 'string') {
        systemText = system;
      } else if (Array.isArray(system)) {
        systemText = system.map(part => part.text || '').join('');
      }
      
      if (systemText) {
        const hash = crypto.createHash('sha256').update(systemText).digest('hex').substring(0, 32);
        logger.debug(`📋 Session hash generated from system content: ${hash}`);
        return hash;
      }
    }

    // 4. 最后fallback: 使用第一条消息内容
    if (messages.length > 0) {
      const firstMessage = messages[0];
      let firstMessageText = '';
      
      if (typeof firstMessage.content === 'string') {
        firstMessageText = firstMessage.content;
      } else if (Array.isArray(firstMessage.content)) {
        if (!firstMessage.content) {
          logger.error('📋 Session hash generated from first message failed: ', firstMessage);
        }

        firstMessageText = firstMessage.content
          .filter(part => part.type === 'text')
          .map(part => part.text || '')
          .join('');
      }
      
      if (firstMessageText) {
        const hash = crypto.createHash('sha256').update(firstMessageText).digest('hex').substring(0, 32);
        logger.debug(`📋 Session hash generated from first message: ${hash}`);
        return hash;
      }
    }

    // 无法生成会话哈希
    logger.debug('📋 Unable to generate session hash - no suitable content found');
    return null;
  }

  /**
   * 获取会话的Redis键名
   * @param {string} sessionHash - 会话哈希
   * @returns {string} - Redis键名
   */
  getSessionRedisKey(sessionHash) {
    return `sticky_session:${sessionHash}`;
  }

  /**
   * 验证会话哈希格式
   * @param {string} sessionHash - 会话哈希
   * @returns {boolean} - 是否有效
   */
  isValidSessionHash(sessionHash) {
    return typeof sessionHash === 'string' && 
           sessionHash.length === 32 && 
           /^[a-f0-9]{32}$/.test(sessionHash);
  }
}

module.exports = new SessionHelper();

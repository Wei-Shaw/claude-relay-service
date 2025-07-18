/**
 * 会话辅助工具
 * 生成会话哈希用于 sticky session
 */

const crypto = require('crypto');

class SessionHelper {
  // 生成会话哈希
  generateSessionHash(requestBody) {
    try {
      // 基于请求内容生成稳定的会话哈希
      const hashContent = this._extractHashContent(requestBody);
      
      if (!hashContent) {
        return null;
      }
      
      return crypto.createHash('sha256')
        .update(hashContent)
        .digest('hex')
        .substring(0, 16); // 使用前16位作为会话ID
    } catch (error) {
      console.error('生成会话哈希失败:', error);
      return null;
    }
  }

  // 提取用于哈希的内容
  _extractHashContent(requestBody) {
    if (!requestBody || !requestBody.messages) {
      return null;
    }

    try {
      // 提取第一个用户消息的内容作为会话标识
      const firstUserMessage = requestBody.messages.find(msg => msg.role === 'user');
      
      if (!firstUserMessage || !firstUserMessage.content) {
        return null;
      }

      let content = '';
      
      if (typeof firstUserMessage.content === 'string') {
        content = firstUserMessage.content;
      } else if (Array.isArray(firstUserMessage.content)) {
        // 提取文本内容
        content = firstUserMessage.content
          .filter(item => item.type === 'text')
          .map(item => item.text || '')
          .join(' ');
      }

      // 清理和标准化内容
      content = content.trim().toLowerCase();
      
      // 如果内容太短，不适合作为会话标识
      if (content.length < 10) {
        return null;
      }

      // 截取前200字符避免哈希内容过长
      return content.substring(0, 200);
    } catch (error) {
      console.error('提取哈希内容失败:', error);
      return null;
    }
  }
}

module.exports = new SessionHelper();
/**
 * metadata.user_id 统一解析/构建工具
 *
 * 兼容两种格式：
 * - 旧格式 (pre-v2.1.78): user_{deviceId}_account_{accountUuid}_session_{sessionId}
 * - 新格式 (v2.1.78+):    {"device_id":"...","account_uuid":"...","session_id":"..."}
 *
 * 纯函数，无外部依赖。
 */

const OLD_FORMAT_REGEX = /^user_([a-fA-F0-9]{64})_account_(.*?)_session_([a-f0-9-]+)$/

/**
 * 解析 metadata.user_id 字符串
 * @param {*} userId - user_id 值
 * @returns {{ deviceId: string, accountUuid: string, sessionId: string, isJsonFormat: boolean } | null}
 */
function parse(userId) {
  if (typeof userId !== 'string' || !userId) {
    return null
  }

  // 尝试 JSON 格式
  if (userId.startsWith('{')) {
    try {
      const obj = JSON.parse(userId)
      const deviceId = obj.device_id
      const sessionId = obj.session_id
      if (
        typeof deviceId !== 'string' ||
        !deviceId ||
        typeof sessionId !== 'string' ||
        !sessionId
      ) {
        return null
      }
      return {
        deviceId,
        accountUuid: typeof obj.account_uuid === 'string' ? obj.account_uuid : '',
        sessionId,
        isJsonFormat: true
      }
    } catch {
      return null
    }
  }

  // 尝试旧格式
  const match = userId.match(OLD_FORMAT_REGEX)
  if (match) {
    return {
      deviceId: match[1],
      accountUuid: match[2],
      sessionId: match[3],
      isJsonFormat: false
    }
  }

  return null
}

/**
 * 便捷方法：提取 sessionId
 * @param {*} userId - user_id 值
 * @returns {string | null}
 */
function extractSessionId(userId) {
  const parsed = parse(userId)
  return parsed ? parsed.sessionId : null
}

/**
 * 根据解析结果重建 user_id 字符串，保留原始格式
 * @param {{ deviceId: string, accountUuid: string, sessionId: string, isJsonFormat: boolean }} parts
 * @returns {string}
 */
function build(parts) {
  const { deviceId, accountUuid, sessionId, isJsonFormat } = parts

  if (isJsonFormat) {
    return JSON.stringify({
      device_id: deviceId,
      account_uuid: accountUuid || '',
      session_id: sessionId
    })
  }

  return `user_${deviceId}_account_${accountUuid || ''}_session_${sessionId}`
}

/**
 * 检查 user_id 是否为合法格式（旧格式或新 JSON 格式）
 * @param {*} userId - user_id 值
 * @returns {boolean}
 */
function isValid(userId) {
  return parse(userId) !== null
}

module.exports = { parse, extractSessionId, build, isValid }

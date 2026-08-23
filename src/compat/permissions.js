// 兼容层:API Key 权限字段旧格式兼容
//
// 来源:src/services/apiKeyService.js(收拢前位于 L73-123),函数体逐字搬迁,逻辑未改
// 收拢日期:2026-06-03
// 原始语义:permissions 历史存过多种格式——字符串 'all'、逗号分隔 "claude,openai"、
//   JSON 字符串 '["claude"]'、裸字符串、数组,统一规范化为数组(空数组=全部服务)。
// 下线条件:确认 Redis 中所有 API Key 的 permissions 均为规范 JSON 数组后,
//   可移除对 'all'/逗号分隔/裸字符串的兼容分支。

/**
 * 规范化权限数据，兼容旧格式（字符串）和新格式（数组）
 * @param {string|array} permissions - 权限数据
 * @returns {array} - 权限数组，空数组表示全部服务
 */
function normalizePermissions(permissions) {
  if (!permissions) {
    return [] // 空 = 全部服务
  }
  if (Array.isArray(permissions)) {
    return permissions
  }
  // 尝试解析 JSON 字符串（新格式存储）
  if (typeof permissions === 'string') {
    if (permissions.startsWith('[')) {
      try {
        const parsed = JSON.parse(permissions)
        if (Array.isArray(parsed)) {
          return parsed
        }
      } catch (e) {
        // 解析失败，继续处理为普通字符串
      }
    }
    // 旧格式 'all' 转为空数组
    if (permissions === 'all') {
      return []
    }
    // 兼容逗号分隔格式（修复历史错误数据，如 "claude,openai"）
    if (permissions.includes(',')) {
      return permissions
        .split(',')
        .map((p) => p.trim())
        .filter(Boolean)
    }
    // 旧单个字符串转为数组
    return [permissions]
  }
  return []
}

/**
 * 检查是否有访问特定服务的权限
 * @param {string|array} permissions - 权限数据
 * @param {string} service - 服务名称（claude/gemini/openai/droid）
 * @returns {boolean} - 是否有权限
 */
function hasPermission(permissions, service) {
  const perms = normalizePermissions(permissions)
  return perms.length === 0 || perms.includes(service) // 空数组 = 全部服务
}

module.exports = { normalizePermissions, hasPermission }

/**
 * 账户名称缓存服务
 * 用于加速绑定账号搜索，避免每次搜索都查询所有账户
 */
const logger = require('../utils/logger')

class AccountNameCacheService {
  constructor() {
    // 账户名称缓存：accountId -> { name, platform }
    this.accountCache = new Map()
    // 账户组名称缓存：groupId -> { name, platform }
    this.groupCache = new Map()
    // 缓存过期时间
    this.lastRefresh = 0
    this.refreshInterval = 5 * 60 * 1000 // 5分钟
    this.isRefreshing = false
  }

  /**
   * 刷新缓存（如果过期）
   */
  async refreshIfNeeded() {
    if (Date.now() - this.lastRefresh < this.refreshInterval) {
      return
    }
    if (this.isRefreshing) {
      // 等待正在进行的刷新完成
      let waitCount = 0
      while (this.isRefreshing && waitCount < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        waitCount++
      }
      return
    }
    await this.refresh()
  }

  /**
   * 强制刷新缓存
   */
  async refresh() {
    if (this.isRefreshing) {
      return
    }
    this.isRefreshing = true

    try {
      const newAccountCache = new Map()
      const newGroupCache = new Map()

      // 延迟加载服务，避免循环依赖
      const claudeAccountService = require('./account/claudeAccountService')
      const claudeConsoleAccountService = require('./account/claudeConsoleAccountService')
      const geminiAccountService = require('./account/geminiAccountService')
      const openaiAccountService = require('./account/openaiAccountService')
      const azureOpenaiAccountService = require('./account/azureOpenaiAccountService')
      const bedrockAccountService = require('./account/bedrockAccountService')
      const droidAccountService = require('./account/droidAccountService')
      const ccrAccountService = require('./account/ccrAccountService')
      const accountGroupService = require('./accountGroupService')

      // 可选服务（可能不存在）
      let geminiApiAccountService = null
      let openaiResponsesAccountService = null
      try {
        geminiApiAccountService = require('./account/geminiApiAccountService')
      } catch (e) {
        // 服务不存在，忽略
      }
      try {
        openaiResponsesAccountService = require('./account/openaiResponsesAccountService')
      } catch (e) {
        // 服务不存在，忽略
      }

      // 并行加载所有账户类型
      const results = await Promise.allSettled([
        claudeAccountService.getAllAccounts(),
        claudeConsoleAccountService.getAllAccounts(),
        geminiAccountService.getAllAccounts(),
        geminiApiAccountService?.getAllAccounts() || Promise.resolve([]),
        openaiAccountService.getAllAccounts(),
        openaiResponsesAccountService?.getAllAccounts() || Promise.resolve([]),
        azureOpenaiAccountService.getAllAccounts(),
        bedrockAccountService.getAllAccounts(),
        droidAccountService.getAllAccounts(),
        ccrAccountService.getAllAccounts(),
        accountGroupService.getAllGroups()
      ])

      // 提取结果
      const claudeAccounts = results[0].status === 'fulfilled' ? results[0].value : []
      const claudeConsoleAccounts = results[1].status === 'fulfilled' ? results[1].value : []
      const geminiAccounts = results[2].status === 'fulfilled' ? results[2].value : []
      const geminiApiAccounts = results[3].status === 'fulfilled' ? results[3].value : []
      const openaiAccounts = results[4].status === 'fulfilled' ? results[4].value : []
      const openaiResponsesAccounts = results[5].status === 'fulfilled' ? results[5].value : []
      const azureOpenaiAccounts = results[6].status === 'fulfilled' ? results[6].value : []
      const bedrockResult = results[7].status === 'fulfilled' ? results[7].value : { accounts: [] }
      const droidAccounts = results[8].status === 'fulfilled' ? results[8].value : []
      const ccrAccounts = results[9].status === 'fulfilled' ? results[9].value : []
      const groups = results[10].status === 'fulfilled' ? results[10].value : []

      // Bedrock 返回格式特殊处理
      const bedrockAccounts = Array.isArray(bedrockResult)
        ? bedrockResult
        : bedrockResult.accounts || []

      // 填充账户缓存的辅助函数
      const addAccounts = (accounts, platform, prefix = '') => {
        if (!Array.isArray(accounts)) {
          return
        }
        for (const acc of accounts) {
          if (acc && acc.id && acc.name) {
            const key = prefix ? `${prefix}${acc.id}` : acc.id
            newAccountCache.set(key, { name: acc.name, platform })
            // 同时存储不带前缀的版本，方便查找
            if (prefix) {
              newAccountCache.set(acc.id, { name: acc.name, platform })
            }
          }
        }
      }

      addAccounts(claudeAccounts, 'claude')
      addAccounts(claudeConsoleAccounts, 'claude-console')
      addAccounts(geminiAccounts, 'gemini')
      addAccounts(geminiApiAccounts, 'gemini-api', 'api:')
      addAccounts(openaiAccounts, 'openai')
      addAccounts(openaiResponsesAccounts, 'openai-responses', 'responses:')
      addAccounts(azureOpenaiAccounts, 'azure-openai')
      addAccounts(bedrockAccounts, 'bedrock')
      addAccounts(droidAccounts, 'droid')
      addAccounts(ccrAccounts, 'ccr')

      // 填充账户组缓存
      if (Array.isArray(groups)) {
        for (const group of groups) {
          if (group && group.id && group.name) {
            newGroupCache.set(group.id, { name: group.name, platform: group.platform })
          }
        }
      }

      this.accountCache = newAccountCache
      this.groupCache = newGroupCache
      this.lastRefresh = Date.now()

      logger.debug(
        `账户名称缓存已刷新: ${newAccountCache.size} 个账户, ${newGroupCache.size} 个分组`
      )
    } catch (error) {
      logger.error('刷新账户名称缓存失败:', error)
    } finally {
      this.isRefreshing = false
    }
  }

  /**
   * 获取账户显示名称
   * @param {string} accountId - 账户ID（可能带前缀）
   * @param {string} _fieldName - 字段名（如 claudeAccountId），保留用于将来扩展
   * @returns {string} 显示名称
   */
  getAccountDisplayName(accountId, _fieldName) {
    if (!accountId) {
      return null
    }

    // 处理账户组
    if (accountId.startsWith('group:')) {
      const groupId = accountId.substring(6)
      const group = this.groupCache.get(groupId)
      if (group) {
        return `分组-${group.name}`
      }
      return `分组-${groupId.substring(0, 8)}`
    }

    // 直接查找（包括带前缀的 api:xxx, responses:xxx）
    const cached = this.accountCache.get(accountId)
    if (cached) {
      return cached.name
    }

    // 尝试去掉前缀查找
    let realId = accountId
    if (accountId.startsWith('api:')) {
      realId = accountId.substring(4)
    } else if (accountId.startsWith('responses:')) {
      realId = accountId.substring(10)
    }

    if (realId !== accountId) {
      const cached2 = this.accountCache.get(realId)
      if (cached2) {
        return cached2.name
      }
    }

    // 未找到，返回 ID 前缀
    return `${accountId.substring(0, 8)}...`
  }

  /**
   * 获取 API Key 的所有绑定账户显示名称
   * @param {Object} apiKey - API Key 对象
   * @returns {Array<{field: string, platform: string, name: string, accountId: string}>}
   */
  getBindingDisplayNames(apiKey) {
    const bindings = []

    const bindingFields = [
      { field: 'claudeAccountId', platform: 'Claude' },
      { field: 'claudeConsoleAccountId', platform: 'Claude Console' },
      { field: 'geminiAccountId', platform: 'Gemini' },
      { field: 'openaiAccountId', platform: 'OpenAI' },
      { field: 'azureOpenaiAccountId', platform: 'Azure OpenAI' },
      { field: 'bedrockAccountId', platform: 'Bedrock' },
      { field: 'droidAccountId', platform: 'Droid' },
      { field: 'ccrAccountId', platform: 'CCR' }
    ]

    for (const { field, platform } of bindingFields) {
      const accountId = apiKey[field]
      if (accountId) {
        const name = this.getAccountDisplayName(accountId, field)
        bindings.push({ field, platform, name, accountId })
      }
    }

    return bindings
  }

  /**
   * 搜索绑定账号
   * @param {Array} apiKeys - API Key 列表
   * @param {string} keyword - 搜索关键词
   * @returns {Array} 匹配的 API Key 列表
   */
  searchByBindingAccount(apiKeys, keyword) {
    const lowerKeyword = keyword.toLowerCase().trim()
    if (!lowerKeyword) {
      return apiKeys
    }

    return apiKeys.filter((key) => {
      const bindings = this.getBindingDisplayNames(key)

      // 无绑定时，匹配"共享池"
      if (bindings.length === 0) {
        return '共享池'.includes(lowerKeyword) || 'shared'.includes(lowerKeyword)
      }

      // 匹配任一绑定账户
      return bindings.some((binding) => {
        // 匹配账户名称
        if (binding.name && binding.name.toLowerCase().includes(lowerKeyword)) {
          return true
        }
        // 匹配平台名称
        if (binding.platform.toLowerCase().includes(lowerKeyword)) {
          return true
        }
        // 匹配账户 ID
        if (binding.accountId.toLowerCase().includes(lowerKeyword)) {
          return true
        }
        return false
      })
    })
  }

  /**
   * 清除缓存（用于测试或强制刷新）
   */
  clearCache() {
    this.accountCache.clear()
    this.groupCache.clear()
    this.lastRefresh = 0
  }
}

// 单例导出
module.exports = new AccountNameCacheService()

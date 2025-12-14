const { v4: uuidv4 } = require('uuid')
const logger = require('../utils/logger')
const redis = require('../models/redis')
const ProxyHelper = require('../utils/proxyHelper')

class AccountGroupService {
  constructor() {
    this.GROUPS_KEY = 'account_groups'
    this.GROUP_PREFIX = 'account_group:'
    this.GROUP_MEMBERS_PREFIX = 'account_group_members:'
    this._groupsSnapshotCache = null
  }

  _clearGroupsSnapshotCache() {
    this._groupsSnapshotCache = null
  }

  async _getGroupsSnapshot(cacheTtlMs = 2000) {
    const now = Date.now()
    const cached = this._groupsSnapshotCache
    if (cached && cached.expiresAt > now && cached.data) {
      return cached.data
    }

    const client = redis.getClientSafe()
    const groupIds = await client.smembers(this.GROUPS_KEY)

    if (!groupIds || groupIds.length === 0) {
      const data = {
        groupIds: [],
        groupDataById: {},
        membersById: {}
      }
      this._groupsSnapshotCache = { expiresAt: now + cacheTtlMs, data }
      return data
    }

    const pipeline = client.pipeline()
    for (const groupId of groupIds) {
      pipeline.hgetall(`${this.GROUP_PREFIX}${groupId}`)
      pipeline.smembers(`${this.GROUP_MEMBERS_PREFIX}${groupId}`)
    }
    const results = await pipeline.exec()

    const groupDataById = {}
    const membersById = {}
    for (let i = 0; i < groupIds.length; i++) {
      const groupId = groupIds[i]
      groupDataById[groupId] = results?.[i * 2]?.[1] || {}
      membersById[groupId] = results?.[i * 2 + 1]?.[1] || []
    }

    const data = { groupIds, groupDataById, membersById }
    this._groupsSnapshotCache = { expiresAt: now + cacheTtlMs, data }
    return data
  }

  /**
   * 创建账户分组
   * @param {Object} groupData - 分组数据
   * @param {string} groupData.name - 分组名称
   * @param {string} groupData.platform - 平台类型 (claude/gemini/openai)
   * @param {string} groupData.description - 分组描述
   * @param {Object|null} groupData.proxy - 分组代理配置（可选，JSON）
   * @param {number|string|null} groupData.proxyPriority - 分组代理优先级（可选，数字越小优先级越高）
   * @returns {Object} 创建的分组
   */
  async createGroup(groupData) {
    try {
      const { name, platform, description = '', proxy = null, proxyPriority = null } = groupData

      // 验证必填字段
      if (!name || !platform) {
        throw new Error('分组名称和平台类型为必填项')
      }

      // 验证平台类型
      if (!['claude', 'gemini', 'openai', 'droid'].includes(platform)) {
        throw new Error('平台类型必须是 claude、gemini、openai 或 droid')
      }

      const client = redis.getClientSafe()
      const groupId = uuidv4()
      const now = new Date().toISOString()

      // 验证代理配置（可选）
      let normalizedProxy = null
      if (proxy !== null && proxy !== undefined && proxy !== '') {
        if (!ProxyHelper.validateProxyConfig(proxy)) {
          throw new Error(
            '代理配置无效（需要包含 type/host/port 且 type 必须为 socks5/http/https）'
          )
        }
        normalizedProxy = typeof proxy === 'string' ? JSON.parse(proxy) : proxy
      }

      // 解析代理优先级（可选）
      let normalizedProxyPriority = null
      if (proxyPriority !== null && proxyPriority !== undefined && proxyPriority !== '') {
        const parsed = Number.parseInt(proxyPriority, 10)
        if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
          throw new Error('proxyPriority 必须是 1-100 的整数（数字越小优先级越高）')
        }
        normalizedProxyPriority = parsed
      }

      const group = {
        id: groupId,
        name,
        platform,
        description,
        proxy: normalizedProxy ? JSON.stringify(normalizedProxy) : '',
        proxyPriority: normalizedProxyPriority !== null ? normalizedProxyPriority.toString() : '',
        createdAt: now,
        updatedAt: now
      }

      // 保存分组数据
      await client.hmset(`${this.GROUP_PREFIX}${groupId}`, group)

      // 添加到分组集合
      await client.sadd(this.GROUPS_KEY, groupId)

      this._clearGroupsSnapshotCache()
      logger.success(`✅ 创建账户分组成功: ${name} (${platform})`)

      return this._formatGroupData(group)
    } catch (error) {
      logger.error('❌ 创建账户分组失败:', error)
      throw error
    }
  }

  /**
   * 更新分组信息
   * @param {string} groupId - 分组ID
   * @param {Object} updates - 更新的字段
   * @returns {Object} 更新后的分组
   */
  async updateGroup(groupId, updates) {
    try {
      const client = redis.getClientSafe()
      const groupKey = `${this.GROUP_PREFIX}${groupId}`

      // 检查分组是否存在
      const exists = await client.exists(groupKey)
      if (!exists) {
        throw new Error('分组不存在')
      }

      // 获取现有分组数据
      const existingGroup = await client.hgetall(groupKey)

      // 不允许修改平台类型
      if (updates.platform && updates.platform !== existingGroup.platform) {
        throw new Error('不能修改分组的平台类型')
      }

      // 准备更新数据
      const updateData = {
        ...updates,
        updatedAt: new Date().toISOString()
      }

      // 处理 proxy 字段：对象 -> JSON；null/空字符串 -> 清空
      if (Object.prototype.hasOwnProperty.call(updateData, 'proxy')) {
        const incoming = updateData.proxy
        if (incoming === null || incoming === undefined || incoming === '') {
          updateData.proxy = ''
        } else {
          if (!ProxyHelper.validateProxyConfig(incoming)) {
            throw new Error(
              '代理配置无效（需要包含 type/host/port 且 type 必须为 socks5/http/https）'
            )
          }
          const normalized = typeof incoming === 'string' ? JSON.parse(incoming) : incoming
          updateData.proxy = JSON.stringify(normalized)
        }
      }

      // 处理 proxyPriority 字段：允许 1-100；null/空字符串 -> 清空
      if (Object.prototype.hasOwnProperty.call(updateData, 'proxyPriority')) {
        const incoming = updateData.proxyPriority
        if (incoming === null || incoming === undefined || incoming === '') {
          updateData.proxyPriority = ''
        } else {
          const parsed = Number.parseInt(incoming, 10)
          if (!Number.isFinite(parsed) || parsed < 1 || parsed > 100) {
            throw new Error('proxyPriority 必须是 1-100 的整数（数字越小优先级越高）')
          }
          updateData.proxyPriority = parsed.toString()
        }
      }

      // 移除不允许修改的字段
      delete updateData.id
      delete updateData.platform
      delete updateData.createdAt

      // 更新分组
      await client.hmset(groupKey, updateData)

      // 返回更新后的完整数据
      const updatedGroup = await client.hgetall(groupKey)

      this._clearGroupsSnapshotCache()
      logger.success(`✅ 更新账户分组成功: ${updatedGroup.name}`)

      return this._formatGroupData(updatedGroup)
    } catch (error) {
      logger.error('❌ 更新账户分组失败:', error)
      throw error
    }
  }

  /**
   * 删除分组
   * @param {string} groupId - 分组ID
   */
  async deleteGroup(groupId) {
    try {
      const client = redis.getClientSafe()

      // 检查分组是否存在
      const group = await this.getGroup(groupId)
      if (!group) {
        throw new Error('分组不存在')
      }

      // 检查分组是否为空
      const members = await this.getGroupMembers(groupId)
      if (members.length > 0) {
        throw new Error('分组内还有账户，无法删除')
      }

      // 检查是否有API Key绑定此分组
      const boundApiKeys = await this.getApiKeysUsingGroup(groupId)
      if (boundApiKeys.length > 0) {
        throw new Error('还有API Key使用此分组，无法删除')
      }

      // 删除分组数据
      await client.del(`${this.GROUP_PREFIX}${groupId}`)
      await client.del(`${this.GROUP_MEMBERS_PREFIX}${groupId}`)

      // 从分组集合中移除
      await client.srem(this.GROUPS_KEY, groupId)

      this._clearGroupsSnapshotCache()
      logger.success(`✅ 删除账户分组成功: ${group.name}`)
    } catch (error) {
      logger.error('❌ 删除账户分组失败:', error)
      throw error
    }
  }

  /**
   * 获取分组详情
   * @param {string} groupId - 分组ID
   * @returns {Object|null} 分组信息
   */
  async getGroup(groupId) {
    try {
      const client = redis.getClientSafe()
      const groupData = await client.hgetall(`${this.GROUP_PREFIX}${groupId}`)

      if (!groupData || Object.keys(groupData).length === 0) {
        return null
      }

      // 获取成员数量
      const memberCount = await client.scard(`${this.GROUP_MEMBERS_PREFIX}${groupId}`)

      return {
        ...this._formatGroupData(groupData),
        memberCount: memberCount || 0
      }
    } catch (error) {
      logger.error('❌ 获取分组详情失败:', error)
      throw error
    }
  }

  /**
   * 获取所有分组
   * @param {string} platform - 平台筛选 (可选)
   * @returns {Array} 分组列表
   */
  async getAllGroups(platform = null) {
    try {
      const client = redis.getClientSafe()
      const groupIds = await client.smembers(this.GROUPS_KEY)

      if (!groupIds || groupIds.length === 0) {
        return []
      }

      const pipeline = client.pipeline()
      for (const groupId of groupIds) {
        pipeline.hgetall(`${this.GROUP_PREFIX}${groupId}`)
        pipeline.scard(`${this.GROUP_MEMBERS_PREFIX}${groupId}`)
      }
      const results = await pipeline.exec()

      const groups = []
      for (let i = 0; i < groupIds.length; i++) {
        const groupData = results?.[i * 2]?.[1]
        const memberCount = results?.[i * 2 + 1]?.[1]

        if (!groupData || Object.keys(groupData).length === 0) {
          continue
        }

        const group = {
          ...this._formatGroupData(groupData),
          memberCount: memberCount || 0
        }

        // 如果指定了平台，进行筛选
        if (!platform || group.platform === platform) {
          groups.push(group)
        }
      }

      // 按创建时间倒序排序
      groups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      return groups
    } catch (error) {
      logger.error('❌ 获取分组列表失败:', error)
      throw error
    }
  }

  /**
   * 添加账户到分组
   * @param {string} accountId - 账户ID
   * @param {string} groupId - 分组ID
   * @param {string} accountPlatform - 账户平台
   */
  async addAccountToGroup(accountId, groupId, accountPlatform) {
    try {
      const client = redis.getClientSafe()

      // 获取分组信息
      const group = await this.getGroup(groupId)
      if (!group) {
        throw new Error('分组不存在')
      }

      // 验证平台一致性 (Claude和Claude Console视为同一平台)
      const normalizedAccountPlatform =
        accountPlatform === 'claude-console' ? 'claude' : accountPlatform
      if (normalizedAccountPlatform !== group.platform) {
        throw new Error('账户平台与分组平台不匹配')
      }

      // 添加到分组成员集合
      await client.sadd(`${this.GROUP_MEMBERS_PREFIX}${groupId}`, accountId)

      this._clearGroupsSnapshotCache()
      logger.success(`✅ 添加账户到分组成功: ${accountId} -> ${group.name}`)
    } catch (error) {
      logger.error('❌ 添加账户到分组失败:', error)
      throw error
    }
  }

  /**
   * 从分组移除账户
   * @param {string} accountId - 账户ID
   * @param {string} groupId - 分组ID
   */
  async removeAccountFromGroup(accountId, groupId) {
    try {
      const client = redis.getClientSafe()

      // 从分组成员集合中移除
      await client.srem(`${this.GROUP_MEMBERS_PREFIX}${groupId}`, accountId)

      this._clearGroupsSnapshotCache()
      logger.success(`✅ 从分组移除账户成功: ${accountId}`)
    } catch (error) {
      logger.error('❌ 从分组移除账户失败:', error)
      throw error
    }
  }

  /**
   * 获取分组成员
   * @param {string} groupId - 分组ID
   * @returns {Array} 成员ID列表
   */
  async getGroupMembers(groupId) {
    try {
      const client = redis.getClientSafe()
      const members = await client.smembers(`${this.GROUP_MEMBERS_PREFIX}${groupId}`)
      return members || []
    } catch (error) {
      logger.error('❌ 获取分组成员失败:', error)
      throw error
    }
  }

  /**
   * 检查分组是否为空
   * @param {string} groupId - 分组ID
   * @returns {boolean} 是否为空
   */
  async isGroupEmpty(groupId) {
    try {
      const members = await this.getGroupMembers(groupId)
      return members.length === 0
    } catch (error) {
      logger.error('❌ 检查分组是否为空失败:', error)
      throw error
    }
  }

  /**
   * 获取使用指定分组的API Key列表
   * @param {string} groupId - 分组ID
   * @returns {Array} API Key列表
   */
  async getApiKeysUsingGroup(groupId) {
    try {
      const client = redis.getClientSafe()
      const groupKey = `group:${groupId}`

      // 获取所有API Key
      const apiKeyIds = await client.smembers('api_keys')
      const boundApiKeys = []

      for (const keyId of apiKeyIds) {
        const keyData = await client.hgetall(`api_key:${keyId}`)
        if (
          keyData &&
          (keyData.claudeAccountId === groupKey ||
            keyData.geminiAccountId === groupKey ||
            keyData.openaiAccountId === groupKey ||
            keyData.droidAccountId === groupKey)
        ) {
          boundApiKeys.push({
            id: keyId,
            name: keyData.name
          })
        }
      }

      return boundApiKeys
    } catch (error) {
      logger.error('❌ 获取使用分组的API Key失败:', error)
      throw error
    }
  }

  /**
   * 根据账户ID获取其所属的分组（兼容性方法，返回单个分组）
   * @param {string} accountId - 账户ID
   * @returns {Object|null} 分组信息
   */
  async getAccountGroup(accountId) {
    try {
      const client = redis.getClientSafe()
      const allGroupIds = await client.smembers(this.GROUPS_KEY)

      for (const groupId of allGroupIds) {
        const isMember = await client.sismember(`${this.GROUP_MEMBERS_PREFIX}${groupId}`, accountId)
        if (isMember) {
          return await this.getGroup(groupId)
        }
      }

      return null
    } catch (error) {
      logger.error('❌ 获取账户所属分组失败:', error)
      throw error
    }
  }

  /**
   * 根据账户ID获取其所属的所有分组
   * @param {string} accountId - 账户ID
   * @returns {Array} 分组信息数组
   */
  async getAccountGroups(accountId) {
    try {
      const client = redis.getClientSafe()
      const allGroupIds = await client.smembers(this.GROUPS_KEY)
      const memberGroups = []

      for (const groupId of allGroupIds) {
        const isMember = await client.sismember(`${this.GROUP_MEMBERS_PREFIX}${groupId}`, accountId)
        if (isMember) {
          const group = await this.getGroup(groupId)
          if (group) {
            memberGroups.push(group)
          }
        }
      }

      // 按创建时间倒序排序
      memberGroups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

      return memberGroups
    } catch (error) {
      logger.error('❌ 获取账户所属分组列表失败:', error)
      throw error
    }
  }

  /**
   * 批量获取多个账户所属的分组信息（用于列表页性能优化）
   * @param {Array<string>} accountIds - 账户ID列表
   * @param {string|null} platform - 平台筛选 (可选)
   * @returns {Object} accountId -> groups[]
   */
  async getAccountGroupsMap(accountIds = [], platform = null) {
    try {
      const uniqueAccountIds = [...new Set((accountIds || []).filter(Boolean))]
      const resultMap = Object.fromEntries(uniqueAccountIds.map((id) => [id, []]))

      if (uniqueAccountIds.length === 0) {
        return resultMap
      }

      const snapshot = await this._getGroupsSnapshot()
      const allGroupIds = snapshot.groupIds

      if (!allGroupIds || allGroupIds.length === 0) {
        return resultMap
      }

      const accountIdSet = new Set(uniqueAccountIds)

      for (const groupId of allGroupIds) {
        const groupData = snapshot.groupDataById?.[groupId]
        const members = snapshot.membersById?.[groupId] || []

        if (!groupData || Object.keys(groupData).length === 0) {
          continue
        }

        if (platform && groupData.platform !== platform) {
          continue
        }

        const group = {
          ...this._formatGroupData(groupData),
          memberCount: Array.isArray(members) ? members.length : 0
        }

        for (const memberId of members) {
          if (!accountIdSet.has(memberId)) {
            continue
          }
          resultMap[memberId].push(group)
        }
      }

      // 按创建时间倒序排序
      for (const groups of Object.values(resultMap)) {
        groups.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      }

      return resultMap
    } catch (error) {
      logger.error('❌ 批量获取账户所属分组列表失败:', error)
      throw error
    }
  }

  /**
   * 批量设置账户的分组
   * @param {string} accountId - 账户ID
   * @param {Array} groupIds - 分组ID数组
   * @param {string} accountPlatform - 账户平台
   */
  async setAccountGroups(accountId, groupIds, accountPlatform) {
    try {
      // 首先移除账户的所有现有分组
      await this.removeAccountFromAllGroups(accountId)

      // 然后添加到新的分组中
      for (const groupId of groupIds) {
        await this.addAccountToGroup(accountId, groupId, accountPlatform)
      }

      logger.success(`✅ 批量设置账户分组成功: ${accountId} -> [${groupIds.join(', ')}]`)
    } catch (error) {
      logger.error('❌ 批量设置账户分组失败:', error)
      throw error
    }
  }

  /**
   * 从所有分组中移除账户
   * @param {string} accountId - 账户ID
   */
  async removeAccountFromAllGroups(accountId) {
    try {
      const client = redis.getClientSafe()
      const allGroupIds = await client.smembers(this.GROUPS_KEY)

      for (const groupId of allGroupIds) {
        await client.srem(`${this.GROUP_MEMBERS_PREFIX}${groupId}`, accountId)
      }

      this._clearGroupsSnapshotCache()
      logger.success(`✅ 从所有分组移除账户成功: ${accountId}`)
    } catch (error) {
      logger.error('❌ 从所有分组移除账户失败:', error)
      throw error
    }
  }

  _formatGroupData(groupData) {
    if (!groupData || typeof groupData !== 'object') {
      return groupData
    }

    let parsedProxy = null
    if (groupData.proxy) {
      try {
        parsedProxy =
          typeof groupData.proxy === 'string' ? JSON.parse(groupData.proxy) : groupData.proxy
      } catch (e) {
        parsedProxy = null
      }
    }

    const formatted = {
      ...groupData,
      proxy: parsedProxy
    }

    return formatted
  }
}

module.exports = new AccountGroupService()
